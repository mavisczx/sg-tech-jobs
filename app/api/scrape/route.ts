import { NextResponse } from "next/server";

// 1. CRUCIAL FIX: Prevents Next.js from caching the results forever
export const dynamic = "force-dynamic";

const GREENHOUSE_COMPANIES = ["stripe", "grab", "cloudflare", "figma", "databricks", "coinbase", "airbnb"];
const LEVER_COMPANIES = ["canva", "nium", "shopback", "spotify"];
const ASHBY_COMPANIES = ["linear", "notion", "revenuecat", "ramp", "retool", "supabase"];

const TARGET_ROLES = [
  "product manager", "product owner", "project manager", "engineering project manager", 
  "technology analyst", "systems analyst", "business development", "tech sales", 
  "solutions", "graduate", "2026"
];

const EXCLUDE_SENIORITY = ["senior", "sr.", "principal", "director", "head", "vp", "lead", "manager"];
const MAX_DAYS_OLD = 7; 
const MAX_ALLOWED_YOE = 3; 

function isWithinDateWindow(dateStr: string, maxDays: number): boolean {
  if (!dateStr) return false;
  const postedDate = new Date(dateStr).getTime();
  if (isNaN(postedDate)) return true; // Fail-safe if date is missing
  const cutoffDate = Date.now() - maxDays * 24 * 60 * 60 * 1000;
  return postedDate >= cutoffDate;
}

function parseExperienceYears(title: string, descriptionHTML: string): { maxRequired: number; suitable: boolean } {
  const titleLower = (title || "").toLowerCase();
  
  // 2. CRUCIAL FIX: Added (descriptionHTML || "") to prevent fatal app crashes if an employer leaves the description blank
  const cleanText = (descriptionHTML || "").replace(/<[^>]*>?/gm, ' ').toLowerCase();

  const isExplicitlyJuniorTitle = /associate|graduate|junior|trainee|apm|analyst|product owner|project manager/i.test(titleLower);

  if (cleanText.includes("fresh grad") || cleanText.includes("recent graduate") || cleanText.includes("0-2 years")) {
    return { maxRequired: 1, suitable: true };
  }

  const yoeRegex = /(\d+)\s*(?:-|to|\+)?\s*(\d+)?\s*(?:years?|yrs?)(?:\s*of)?\s*(?:relevant|work|professional)?\s*(?:experience|exp)/gi;
  const matches = [...cleanText.matchAll(yoeRegex)];
  
  if (matches.length === 0) {
    return { maxRequired: 0, suitable: isExplicitlyJuniorTitle };
  }

  let minYoE = 0;
  for (const match of matches) {
    const lowerBound = parseInt(match[1], 10);
    if (lowerBound > 0 && lowerBound < 15) minYoE = Math.max(minYoE, lowerBound);
  }

  return { maxRequired: minYoE, suitable: minYoE <= MAX_ALLOWED_YOE };
}

// ---------------- ATS FETCHERS ----------------
// (Fetchers remain exactly the same as your code)

async function fetchGreenhouseJobs(company: string) {
  try {
    const res = await fetch(`https://boards-api.greenhouse.io/v1/boards/${company}/jobs?content=true`);
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
      source: `Greenhouse (${company})`
    }));
  } catch { return []; }
}

async function fetchLeverJobs(company: string) {
  try {
    const res = await fetch(`https://api.lever.co/v0/postings/${company}?mode=json`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.map((job: any) => ({
      id: job.id,
      title: job.text,
      company: company.charAt(0).toUpperCase() + company.slice(1),
      link: job.hostedUrl,
      location: job.categories?.location || "",
      datePosted: new Date(job.createdAt).toISOString(),
      description: job.descriptionPlain || "",
      source: `Lever (${company})`
    }));
  } catch { return []; }
}

async function fetchAshbyJobs(company: string) {
  try {
    const res = await fetch(`https://api.ashbyhq.com/posting-api/job-board/${company}`);
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs.map((job: any) => ({
      id: job.id,
      title: job.title,
      company: company.charAt(0).toUpperCase() + company.slice(1),
      link: job.jobUrl,
      location: job.location || "",
      datePosted: job.publishedAt || new Date().toISOString(),
      description: job.descriptionHtml || "",
      source: `Ashby (${company})`
    }));
  } catch { return []; }
}

async function fetchMyCareersFuture() {
  try {
    const res = await fetch("https://api.mycareersfuture.gov.sg/v2/jobs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        searchQuery: "Product OR Analyst OR Data OR Sales",
        positionLevels: [1, 3], 
        maxItems: 50
      })
    });
    
    if (!res.ok) return [];
    const data = await res.json();
    
    return data.results.map((job: any) => ({
      id: job.uuid || job.job_id,
      title: job.title,
      company: job.postedCompany?.name || job.employer_name || "Unknown Company",
      link: job.jobDetailsUrl || `https://www.mycareersfuture.gov.sg/job/${job.uuid}`,
      location: "Singapore",
      datePosted: job.metadata?.updatedAt || job.posted_date || new Date().toISOString(),
      description: job.description || "",
      source: "MyCareersFuture",
      salary: job.salary_min_sgd && job.salary_max_sgd ? `S$${job.salary_min_sgd} - S$${job.salary_max_sgd}` : null,
      mcfExperience: job.min_experience_years || 0
    }));
  } catch { return []; }
}

// ---------------- MAIN API ROUTE ----------------

export async function GET() {
  try {
    // 3. CRUCIAL FIX: Wrap the fetches in an 8-second timeout. 
    // If an API is slow, Vercel will kill the app at 10s. This ensures we return whatever data we gathered in 8s.
    const fetchPromises = Promise.all([
      Promise.all(GREENHOUSE_COMPANIES.map(fetchGreenhouseJobs)),
      Promise.all(LEVER_COMPANIES.map(fetchLeverJobs)),
      Promise.all(ASHBY_COMPANIES.map(fetchAshbyJobs)),
      fetchMyCareersFuture()
    ]);

    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve([[], [], [], []]), 8000));
    
    // Whichever finishes first: the data fetch, or the 8-second safety timer
    const results = await Promise.race([fetchPromises, timeoutPromise]) as any[];
    
    const [gh, lever, ashby, mcf] = results;
    const allJobs = [...(gh || []).flat(), ...(lever || []).flat(), ...(ashby || []).flat(), ...(mcf || [])];
    const filteredJobs: any[] = [];

    for (const job of allJobs) {
      if (!job) continue;
      const titleLower = (job.title || "").toLowerCase();
      const locationLower = (job.location || "").toLowerCase();

      if (!locationLower.includes("singapore") && !locationLower.includes("sg")) continue;
      if (!isWithinDateWindow(job.datePosted, MAX_DAYS_OLD)) continue;
      
      const hasSeniorTitle = EXCLUDE_SENIORITY.some((word) => titleLower.includes(word));
      const hasJuniorTitle = /associate|graduate|junior|trainee|apm|analyst|product manager|product owner|project manager/.test(titleLower);
      if (hasSeniorTitle && !hasJuniorTitle) continue;

      const matchesTargetRole = TARGET_ROLES.some((role) => titleLower.includes(role));
      if (!matchesTargetRole) continue;

      let finalYoE = "Early Career / Fresh Grad";
      if (job.source === "MyCareersFuture") {
        if (job.mcfExperience > MAX_ALLOWED_YOE) continue; 
        if (job.mcfExperience > 0) finalYoE = `${job.mcfExperience} yrs exp (Verified)`;
      } else {
        const { suitable, maxRequired } = parseExperienceYears(job.title, job.description);
        if (!suitable) continue;
        if (maxRequired > 0) finalYoE = `${maxRequired} yrs exp`;
      }

      let category = "Consulting & Strategy";
      if (titleLower.includes("product") || titleLower.includes("project") || titleLower.includes("owner")) category = "Product & Project";
      else if (titleLower.includes("sales") || titleLower.includes("business development") || titleLower.includes("solutions") || titleLower.includes("bdr")) category = "Tech Sales";

      filteredJobs.push({
        id: job.id,
        title: job.title,
        company: job.company,
        link: job.link,
        category,
        source: job.source,
        salary: job.salary,
        datePosted: job.datePosted,
        experienceRequired: finalYoE,
      });
    }

    // Safely sort dates
    filteredJobs.sort((a, b) => {
      const timeA = new Date(a.datePosted).getTime() || 0;
      const timeB = new Date(b.datePosted).getTime() || 0;
      return timeB - timeA;
    });

    return NextResponse.json({ jobs: filteredJobs.slice(0, 20) });
    
  } catch (error) {
    return NextResponse.json({ error: "Failed to scrape filtered jobs" }, { status: 500 });
  }
}
