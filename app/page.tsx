'use client';

import { useState, useEffect } from 'react';
import { RefreshCw, ExternalLink, Briefcase, CheckCircle, Clock, Database, DollarSign } from 'lucide-react';

type Job = {
  id: string;
  title: string;
  company: string;
  link: string;
  category: string;
  source: string;
  salary?: string;
  datePosted: string;
  experienceRequired: string;
};

export default function JobDashboard() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('All');
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    const savedJobs = localStorage.getItem('scrapedJobs');
    const savedApplied = localStorage.getItem('appliedJobs');
    if (savedJobs) setJobs(JSON.parse(savedJobs));
    if (savedApplied) setAppliedIds(new Set(JSON.parse(savedApplied)));
  }, []);

  const handleScrape = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/scrape');
      const data = await response.json();
      
      if (data.jobs) {
        setJobs(prevJobs => {
          const existingIds = new Set(prevJobs.map(j => j.id));
          const newJobs = data.jobs.filter((j: Job) => !existingIds.has(j.id));
          const combined = [...newJobs, ...prevJobs].sort((a, b) => 
            new Date(b.datePosted).getTime() - new Date(a.datePosted).getTime()
          ).slice(0, 40);
          
          localStorage.setItem('scrapedJobs', JSON.stringify(combined));
          return combined;
        });
      }
    } catch (error) {
      console.error("Scraping failed", error);
    }
    setLoading(false);
  };

  const toggleApplied = (id: string) => {
    const nextApplied = new Set(appliedIds);
    if (nextApplied.has(id)) nextApplied.delete(id);
    else nextApplied.add(id);
    
    setAppliedIds(nextApplied);
    localStorage.setItem('appliedJobs', JSON.stringify(Array.from(nextApplied)));
  };

  const categories = ['All', 'Product & Project', 'Consulting & Strategy', 'Tech Sales'];
  const filteredJobs = filter === 'All' ? jobs : jobs.filter(j => j.category === filter);

  const formatDate = (isoString: string) => {
    const date = new Date(isoString);
    return date.toLocaleDateString('en-SG', { month: 'short', day: 'numeric' });
  };

  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900 font-sans p-6 md:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        
        <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-neutral-200 pb-6">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Briefcase className="w-8 h-8 text-blue-600" />
              Early Career Radar: SG
            </h1>
            <p className="text-neutral-500 mt-2">Live scraping high-pay Big Tech & MyCareersFuture roles.</p>
          </div>
          
          <button 
            onClick={handleScrape} 
            disabled={loading}
            className="flex items-center gap-2 bg-black text-white px-5 py-2.5 rounded-lg font-medium hover:bg-neutral-800 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Fetching Live Data...' : 'Scrape New Jobs'}
          </button>
        </header>

        <div className="flex gap-2 flex-wrap">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setFilter(cat)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-colors ${
                filter === cat 
                  ? "bg-blue-600 text-white shadow-md" 
                  : "bg-white text-neutral-600 border border-neutral-200 hover:bg-neutral-100"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="grid gap-4">
          {filteredJobs.length === 0 ? (
            <div className="text-center py-12 text-neutral-400 bg-white border border-neutral-200 rounded-xl border-dashed">
              No jobs found yet. Click "Scrape New Jobs" to pull live postings.
            </div>
          ) : (
            filteredJobs.map(job => (
              <div key={job.id} className="bg-white p-5 rounded-xl border border-neutral-200 shadow-sm flex flex-col md:flex-row gap-4 items-start hover:shadow-md transition-shadow relative overflow-hidden">
                
                <div className="flex-1 space-y-3 z-10">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-neutral-900 leading-tight">{job.title}</h2>
                      {appliedIds.has(job.id) && <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-3 text-sm flex-wrap">
                    <span className="font-extrabold text-neutral-800">{job.company}</span>
                    <span className="text-neutral-300">•</span>
                    <span className="text-blue-700 font-semibold bg-blue-50 px-2 py-0.5 rounded border border-blue-100">{job.category}</span>
                    <span className="text-neutral-300">•</span>
                    <span className="text-neutral-600 font-medium">{job.experienceRequired}</span>
                  </div>

                  <div className="flex items-center gap-4 text-xs font-medium pt-2">
                    <span className="flex items-center gap-1.5 text-purple-700 bg-purple-50 px-2.5 py-1 rounded-md border border-purple-100">
                      <Database className="w-3.5 h-3.5" />
                      {job.source}
                    </span>
                    
                    {job.salary && (
                      <span className="flex items-center gap-1 text-green-700 bg-green-50 px-2 py-1 rounded-md border border-green-100">
                        <DollarSign className="w-3.5 h-3.5" />
                        {job.salary} / mth
                      </span>
                    )}
                    
                    <span className="flex items-center gap-1 text-neutral-500 ml-auto">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDate(job.datePosted)}
                    </span>
                  </div>
                </div>
                
                <div className="flex flex-col items-stretch gap-2 w-full md:w-36 mt-2 md:mt-0 z-10">
                  <a 
                    href={job.link}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded-lg transition-colors"
                  >
                    Apply <ExternalLink className="w-4 h-4" />
                  </a>
                  <button 
                    onClick={() => toggleApplied(job.id)}
                    className={`text-xs font-semibold px-4 py-2 rounded-lg border transition-colors ${
                      appliedIds.has(job.id) ? 'bg-green-50 text-green-700 border-green-200' : 'bg-white text-neutral-600 border-neutral-200 hover:bg-neutral-50'
                    }`}
                  >
                    {appliedIds.has(job.id) ? 'Applied' : 'Mark Applied'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
