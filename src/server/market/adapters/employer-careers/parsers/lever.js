/* Lever parser — public JSON API:
     https://api.lever.co/v0/postings/<company>?mode=json
*/

import { getJson } from '../../../util/http.js';
import { stripHtml } from '../../../util/html.js';

export async function parseLever(ctx, employer) {
  if (!employer.lever_token) {
    ctx.logger.debug(`[lever] ${employer.name}: missing lever_token`);
    return [];
  }
  const url = `https://api.lever.co/v0/postings/${employer.lever_token}?mode=json`;
  try {
    const data = await getJson(url, { timeoutMs: 9000, retries: 1 });
    const out = [];
    for (const j of (Array.isArray(data) ? data : [])) {
      const loc = j.categories?.location || '';
      if (!/india|mumbai|bangalore|bengaluru|delhi|gurgaon|gurugram|noida|chennai|hyderabad|pune|kolkata|ahmedabad|navi mumbai|thane/i.test(loc)) continue;
      out.push({
        title: j.text || '',
        company: employer.name,
        location: loc,
        description: stripHtml(j.descriptionPlain || j.description || ''),
        source: 'employer_careers',
        source_url: j.hostedUrl || url,
        posted_ts: j.createdAt ? new Date(j.createdAt).toISOString() : null,
        salary_raw: null,
        meta: { parser: 'lever', employer: employer.name, default_paths_hint: employer.default_paths_hint },
      });
    }
    return out;
  } catch (err) {
    ctx.logger.debug(`[lever] ${employer.name}: ${err.message}`);
    return [];
  }
}
