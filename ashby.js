/* ──────────────────────────────────────────────────────────────────────
   Ashby ATS parser

   Ashby exposes a public job-board API at:
     https://api.ashbyhq.com/posting-api/job-board/<board_token>?includeCompensation=true

   Returns JSON with `apiVersion`, `jobs[]`. Each job has:
     id, title, locationName, employmentType, descriptionPlain (and
     descriptionHtml), publishedAt, jobUrl, compensation (optional),
     departmentName, teamName.

   Adopted by many India-active SaaS companies. Stable JSON shape.
   ────────────────────────────────────────────────────────────────────── */

import { getJson } from '../../../util/http.js';
import { stripHtml } from '../../../util/html.js';

const INDIA_REGEX = /india|mumbai|bangalore|bengaluru|delhi|gurgaon|gurugram|noida|chennai|hyderabad|pune|kolkata|ahmedabad|chandigarh|kochi|jaipur|coimbatore|navi mumbai|thane|remote/i;

export async function parseAshby(ctx, employer) {
  if (!employer.ashby_token) {
    ctx.logger.debug(`[ashby] ${employer.name}: missing ashby_token`);
    return [];
  }
  const url = `https://api.ashbyhq.com/posting-api/job-board/${employer.ashby_token}?includeCompensation=true`;
  try {
    const data = await getJson(url, { timeoutMs: 9000, retries: 1 });
    const jobs = Array.isArray(data?.jobs) ? data.jobs : [];
    const out = [];
    for (const j of jobs) {
      const loc = j.locationName || j.location || '';
      // India-only filter; Ashby boards often include global postings.
      if (!INDIA_REGEX.test(loc)) continue;
      out.push({
        title: j.title || '',
        company: employer.name,
        location: loc,
        description: j.descriptionPlain || stripHtml(j.descriptionHtml || ''),
        source: 'employer_careers',
        source_url: j.jobUrl || url,
        posted_ts: j.publishedAt || null,
        salary_raw: _ashbyCompensation(j),
        meta: {
          parser: 'ashby',
          employer: employer.name,
          ashby_token: employer.ashby_token,
          department: j.departmentName || null,
          team: j.teamName || null,
          employment_type: j.employmentType || null,
          default_paths_hint: employer.default_paths_hint,
        },
      });
    }
    return out;
  } catch (err) {
    ctx.logger.debug(`[ashby] ${employer.name}: ${err.message}`);
    return [];
  }
}

function _ashbyCompensation(j) {
  const c = j.compensation;
  if (!c) return null;
  // Ashby's compensation summary varies by tenant. Try common fields.
  if (typeof c.compensationTierSummary === 'string') return c.compensationTierSummary;
  if (Array.isArray(c.compensationTiers) && c.compensationTiers.length) {
    const t = c.compensationTiers[0];
    if (t.currencyCode === 'INR' && t.minValue && t.maxValue) {
      return `₹${(t.minValue/100000).toFixed(0)}-${(t.maxValue/100000).toFixed(0)} LPA`;
    }
  }
  return null;
}
