import { NextResponse } from "next/server";

const GREENHOUSE_COMPANIES = [
  "stripe",
  "grab",
  "cloudflare",
  "figma",
  "databricks",
  "coinbase",
];
const LEVER_COMPANIES = ["canva", "nium", "shopback"];

const TARGET_ROLES = [
  "product",
  "project",
  "sales",
  "business development",
  "consulting",
  "solutions",
  "analyst",
  "associate",
  "operations",
];
const EXCLUDE_SENIORITY = [
  "senior",
  "sr.",
  "principal",
  "director",
  "head of",
  "vp",
  "lead",
  "staff",
];

// Filter configurations
const MAX_DAYS_OLD = 7; // Only jobs posted/updated in the last week
const MAX_ALLOWED_YOE = 5; // Reject if required experience strictly exceeds 5 years

function isWithinDateWindow(dateStr: string, maxDays: number): boolean {
  if (!dateStr) return false;
  const postedDate = new Date(dateStr).getTime();
  const cutoffDate = Date.now() - maxDays * 24 * 60 * 60 * 1000;
  return postedDate >= cutoffDate;
}

function parseExperienceYears(descriptionText: string): {
  maxRequired: number;
  suitable: boolean;
} {
  const cleanText = descriptionText.toLowerCase();

  // If the listing explicitly targets early careers or graduates, approve immediately
  if (
    cleanText.includes("fresh grad") ||
    cleanText.includes("recent graduate") ||
    cleanText.includes("no prior experience") ||
    cleanText.includes("entry level") ||
    cleanText.includes("0-2 years") ||
    cleanText.includes("0-3 years")
  ) {
    return { maxRequired: 2, suitable: true };
  }

  // Regex matches: "X-Y years of experience", "X+ years experience", "X to Y yrs exp"
  const yoeRegex =
    /(\d+)\s*(?:-|to|\+)?\s*(\d+)?\s*(?:years?|yrs?)(?:\s*of)?\s*(?:relevant|work|professional)?\s*(?:experience|exp)/gi;

  const matches = [...cleanText.matchAll(yoeRegex)];
  if (matches.length === 0) {
    // If no years are mentioned, it's typically early-career friendly or open
    return { maxRequired: 0, suitable: true };
  }

  let minYoE = 0;
  for (const match of matches) {
    const lowerBound = parseInt(match[1], 10);
    // Discard false positives like "company with 10 years experience" or "over 20 years"
    if (lowerBound > 0 && lowerBound < 15) {
      minYoE = Math.max(minYoE, lowerBound);
    }
  }

  return {
    maxRequired: minYoE,
    suitable: minYoE <= MAX_ALLOWED_YOE,
  };
}

async function fetchGreenhouseJobs(company: string) {
  try {
    // ?content=true includes the full HTML description in the response
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`
    );
    if (!res.ok) return [];
    const data = await res.json();

    return data.jobs.map((job: any) => ({
      id: job.id.toString(),
      title: job.title,
      company: company.charAt(0).toUpperCase() + company.slice(1),
      link: job.absolute_url,
      location: job.location?.name || "",
      datePosted: job.updated_at || "",
      description: job.content || "",
    }));
  } catch {
    return [];
  }
}

async function fetchLeverJobs(company: string) {
  try {
    const res = await fetch(
      `https://api.lever.co/v0/postings/${company}?mode=json`
    );
    if (!res.ok) return [];
    const data = await res.json();

    return data.map((job: any) => ({
      id: job.id,
      title: job.text,
      company: company.charAt(0).toUpperCase() + company.slice(1),
      link: job.hostedUrl,
      location: job.categories?.location || "",
      datePosted: new Date(job.createdAt).toISOString(),
      description: job.descriptionPlain || job.description || "",
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    const [ghResults, leverResults] = await Promise.all([
      Promise.all(GREENHOUSE_COMPANIES.map(fetchGreenhouseJobs)),
      Promise.all(LEVER_COMPANIES.map(fetchLeverJobs)),
    ]);

    const allJobs = [...ghResults.flat(), ...leverResults.flat()];
    const filteredJobs: any[] = [];

    for (const job of allJobs) {
      const titleLower = job.title.toLowerCase();
      const locationLower = job.location.toLowerCase();

      // 1. Must be in Singapore
      if (!locationLower.includes("singapore") && !locationLower.includes("sg"))
        continue;

      // 2. Freshness filter (within last MAX_DAYS_OLD days)
      if (!isWithinDateWindow(job.datePosted, MAX_DAYS_OLD)) continue;

      // 3. Exclude Senior / Lead / Principal titles
      if (
        EXCLUDE_SENIORITY.some((seniorWord) => titleLower.includes(seniorWord))
      )
        continue;

      // 4. Must match target role keywords
      const matchesTargetRole = TARGET_ROLES.some((role) =>
        titleLower.includes(role)
      );
      if (!matchesTargetRole) continue;

      // 5. Check Years of Experience in Job Description
      const { suitable, maxRequired } = parseExperienceYears(job.description);
      if (!suitable) continue;

      // Assign Category
      let category = "Consulting & Strategy";
      if (titleLower.includes("product") || titleLower.includes("project")) {
        category = "Product & Project";
      } else if (
        titleLower.includes("sales") ||
        titleLower.includes("business development") ||
        titleLower.includes("bdr")
      ) {
        category = "Tech Sales";
      }

      filteredJobs.push({
        id: job.id,
        title: job.title,
        company: job.company,
        link: job.link,
        category,
        datePosted: job.datePosted,
        experienceRequired:
          maxRequired > 0
            ? `${maxRequired} yrs exp`
            : "Early Career / Fresh Grad",
      });
    }

    // Sort: Newest postings first
    filteredJobs.sort(
      (a, b) =>
        new Date(b.datePosted).getTime() - new Date(a.datePosted).getTime()
    );

    return NextResponse.json({ jobs: filteredJobs.slice(0, 15) });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to scrape filtered jobs" },
      { status: 500 }
    );
  }
}
