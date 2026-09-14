import { NextResponse } from "next/server";

// Top-paying tech companies using Greenhouse and Lever
const GREENHOUSE_COMPANIES = [
  "stripe",
  "grab",
  "cloudflare",
  "figma",
  "databricks",
  "coinbase",
  "paloaltonetworks",
];
const LEVER_COMPANIES = ["canva", "nium", "shopback"];

// The "Algo": Filter for Junior/Grad AND Product/Sales/Consulting
const EARLY_CAREER_KEYWORDS = [
  "grad",
  "associate",
  "junior",
  "trainee",
  "analyst",
  "bdr",
  "sdr",
  "early",
  "entry",
];
const ROLE_KEYWORDS = [
  "product",
  "project",
  "sales",
  "business development",
  "consulting",
  "solutions",
  "success",
  "strategy",
];

async function fetchGreenhouse(company: string) {
  try {
    const res = await fetch(
      `https://boards-api.greenhouse.io/v1/boards/${company}/jobs`
    );
    if (!res.ok) return [];
    const data = await res.json();
    return data.jobs.map((job: any) => ({
      id: job.id.toString(),
      title: job.title,
      company: company.charAt(0).toUpperCase() + company.slice(1),
      link: job.absolute_url,
      location: job.location?.name || "",
      datePosted: job.updated_at || new Date().toISOString(),
    }));
  } catch {
    return [];
  }
}

async function fetchLever(company: string) {
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
    }));
  } catch {
    return [];
  }
}

export async function GET() {
  try {
    // 1. Fetch all job APIs concurrently (super fast)
    const allResults = await Promise.all([
      ...GREENHOUSE_COMPANIES.map(fetchGreenhouse),
      ...LEVER_COMPANIES.map(fetchLever),
    ]);

    const flatJobs = allResults.flat();
    const scrapedJobs: any[] = [];

    // 2. The Matching Algorithm
    flatJobs.forEach((job) => {
      const loc = job.location.toLowerCase();
      const title = job.title.toLowerCase();

      // Must be in Singapore
      if (!loc.includes("singapore") && !loc.includes("sg")) return;

      // Check keywords
      const isEarlyCareer = EARLY_CAREER_KEYWORDS.some((k) =>
        title.includes(k)
      );
      const isTargetRole = ROLE_KEYWORDS.some((k) => title.includes(k));

      // We include it if it's explicitly an early career role OR a target tech role
      if (isEarlyCareer || isTargetRole) {
        let category = "Other";
        if (title.includes("product") || title.includes("project"))
          category = "Product & Project";
        else if (
          title.includes("sales") ||
          title.includes("bdr") ||
          title.includes("sdr") ||
          title.includes("business development")
        )
          category = "Tech Sales";
        else if (
          title.includes("consulting") ||
          title.includes("analyst") ||
          title.includes("solutions")
        )
          category = "Consulting";

        scrapedJobs.push({
          ...job,
          category,
        });
      }
    });

    // 3. Sort by most recent first and return top 15
    scrapedJobs.sort(
      (a, b) =>
        new Date(b.datePosted).getTime() - new Date(a.datePosted).getTime()
    );
    const recentJobs = scrapedJobs.slice(0, 15);

    return NextResponse.json({ jobs: recentJobs });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to scrape jobs" },
      { status: 500 }
    );
  }
}
