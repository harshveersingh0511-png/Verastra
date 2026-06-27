/* ──────────────────────────────────────────────────────────────────────
   Workable ATS parser

   Workable's public widget API:
     https://apply.workable.com/api/v1/widget/accounts/<workable_id>/jobs

   Returns JSON with `jobs[]`. Each job has:
     shortcode, title, country, city, location_str (combined), department,
     description (HTML), function, employment_type, created_at, url.

   Also supports a `searchable` query at:
     https://apply.workable.com/api/v3/accounts/<workable_id>/jobs?query=&filter=country__india

   We use the v1 widget endpoint because it's more stable.
   ────────────────────────────────────────────────────────────────────── */

import { getJson } from '../../../util/http.js';
import { stripHtml } from '../../../util/html.js';

const INDIA_REGEX = /^(india|in)$/i;
const INDIA_CITY_REGEX = /\b(india|mumbai|bangalore|bengaluru|delhi|gurgaon|gurugram|noida|chennai|hyderabad|pune|kolkata|ahmedabad|chandigarh|kochi|jaipur|coimbatore|navi mumbai|thane)\b/i;

export async function parseWorkable(ctx, employer) {
  if (!employer.workable_id) {
    ctx.logger.debug(`[workable] ${employer.name}: missing workable_id`);
    return [];
  }
  const url = `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(employer.workable_id)}/jobs`;
  try {
    const data = await getJson(url, { timeoutMs: 9000, retries: 1 });
    const jobs = Array.isArray(data?.jobs) ? data.jobs
                : Array.isArray(data) ? data
                : [];
    const out = [];
    for (const j of jobs) {
      // India filter: country code or any city alias
      const country = j.country || j.country_code || '';
      const city = j.city || j.location || '';
      const locStr = j.location_str || [city, country].filter(Boolean).join(', ');
      if (!INDIA_REGEX.test(country) && !INDIA_CITY_REGEX.test(locStr)) continue;

      out.push({
        title: j.title || '',
        company: employer.name,
        location: locStr,
        description: stripHtml(j.description || ''),
        source: 'employer_careers',
        source_url: j.url || j.shortlink || url,
        posted_ts: j.created_at || null,
        salary_raw: null, // Workable rarely exposes salary publicly
        meta: {
          parser: 'workable',
          employer: employer.name,
          workable_id: employer.workable_id,
          shortcode: j.shortcode || null,
          department: j.department || null,
          function: j.function || null,
          employment_type: j.employment_type || null,
          default_paths_hint: employer.default_paths_hint,
        },
      });
    }
    return out;
  } catch (err) {
    ctx.logger.debug(`[workable] ${employer.name}: ${err.message}`);
    return [];
  }
}
