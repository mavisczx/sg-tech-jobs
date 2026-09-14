import { NextResponse } from "next/server";

// 1. CRUCIAL FIX: Prevents Next.js from caching the results forever
export const dynamic = "force-dynamic";

const GREENHOUSE_COMPANIES = ["stripe", "grab", "cloudflare", "figma", "databricks", "coinbase", "airbnb"];
const LEVER_COMPANIES = ["canva", "nium", "shopback", "spotify"];
const ASHBY_COMPANIES = ["linear", "notion", "revenuecat", "ramp", "retool", "supabase"];

const TARGET_ROLES = [
  "product", "project", "analyst", "sales", "business development", 
  "solutions", "consulting", "consultant", "associate", "graduate", 
  "bdr", "sdr", "trainee", "early career"
];

const EXCLUDE_SENIORITY = ["senior", "sr.", "principal", "director", "head", "vp", "lead", "manager"];
const MAX_DAYS_OLD = 30; 
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
  const cleanText = (descriptionHTML || "").replace(/<[^>]*>?/gm, ' ').toLowerCase();

  // If it explicitly asks for a fresh grad, pass it immediately
  if (cleanText.includes("fresh grad") || cleanText.includes("recent graduate") || cleanText.includes("0-2 years")) {
    return { maxRequired: 1, suitable: true };
  }

  const yoeRegex = /(\d+)\s*(?:-|to|\+)?\s*(\d+)?\s*(?:years?|yrs?)(?:\s*of)?\s*(?:relevant|work|professional)?\s*(?:experience|exp)/gi;
  const matches = [...cleanText.matchAll(yoeRegex)];
  
  if (matches.length === 0) {
    // CRUCIAL FIX: If the employer doesn't explicitly ask for years of experience, 
    // DO NOT auto-reject it. Let it through. (We already filter out "Senior" roles elsewhere).
    return { maxRequired: 0, suitable: true }; 
  }

  let minYoE = 0;
  for (const match of matches) {
    const lowerBound = parseInt(match[1], 10);
    if (lowerBound > 0 && lowerBound < 15) minYoE = Math.max(minYoE, lowerBound);
  }

  // Allow jobs asking for 3 years or less
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
      headers: { 
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
      },
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
    console.log("Starting scrape..."); // 1. Check if the route is even being hit

    const fetchPromises = Promise.all([
      Promise.all(GREENHOUSE_COMPANIES.map(fetchGreenhouseJobs)),
      Promise.all(LEVER_COMPANIES.map(fetchLeverJobs)),
      Promise.all(ASHBY_COMPANIES.map(fetchAshbyJobs)),
      fetchMyCareersFuture()
    ]);

    const timeoutPromise = new Promise((resolve) => setTimeout(() => resolve([[], [], [], []]), 8000));
    const results = await Promise.race([fetchPromises, timeoutPromise]) as any[];
    
    const [gh, lever, ashby, mcf] = results;
    const allJobs = [...(gh || []).flat(), ...(lever || []).flat(), ...(ashby || []).flat(), ...(mcf || [])];
    
    // 2. See how much raw data we got before filtering
    console.log(`Raw jobs fetched: ${allJobs.length}`); 

    const filteredJobs: any[] = [];
    let sgCount = 0;

    for (const job of allJobs) {
      if (!job) continue;
      const titleLower = (job.title || "").toLowerCase();
      const locationLower = (job.location || "").toLowerCase();

      // Check location
      if (!locationLower.includes("singapore") && !locationLower.includes("sg")) continue;
      sgCount++; 

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

    // 3. See exactly how many survived the filter
    console.log(`Jobs in SG: ${sgCount} | Jobs matching final strict filters: ${filteredJobs.length}`);

    filteredJobs.sort((a, b) => {
      const timeA = new Date(a.datePosted).getTime() || 0;
      const timeB = new Date(b.datePosted).getTime() || 0;
      return timeB - timeA;
    });

    return NextResponse.json({ jobs: filteredJobs.slice(0, 20) });
    
  } catch (error) {
    console.error("Backend Error:", error); // 4. Catch silent crashes
    return NextResponse.json({ error: "Failed to scrape filtered jobs" }, { status: 500 });
  }
}
