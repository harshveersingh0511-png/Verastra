/* Greenhouse parser — public JSON API. */

import { getJson } from '../../../util/http.js';
import { stripHtml } from '../../../util/html.js';

export async function parseGreenhouse(ctx, employer) {
  if (!employer.board_token) {
    ctx.logger.debug(`[greenhouse] ${employer.name}: missing board_token`);
    return [];
  }
  const url = `https://boards-api.greenhouse.io/v1/boards/${employer.board_token}/jobs?content=true`;
  try {
    const data = await getJson(url, { timeoutMs: 9000, retries: 1 });
    const jobs = data.jobs || [];
    const out = [];
    for (const j of jobs) {
      const loc = j.location?.name || '';
      if (!/india|mumbai|bangalore|bengaluru|delhi|gurgaon|gurugram|noida|chennai|hyderabad|pune|kolkata|ahmedabad|chandigarh|kochi|jaipur|coimbatore|navi mumbai|thane/i.test(loc)) continue;
      out.push({
        title: j.title || '',
        company: employer.name,
        location: loc,
        description: stripHtml(j.content || ''),
        source: 'employer_careers',
        source_url: j.absolute_url || url,
        posted_ts: j.updated_at || j.created_at || null,
        salary_raw: null,
        meta: {
          parser: 'greenhouse',
          employer: employer.name,
          board_token: employer.board_token,
          default_paths_hint: employer.default_paths_hint,
        },
      });
    }
    return out;
  } catch (err) {
    ctx.logger.debug(`[greenhouse] ${employer.name}: ${err.message}`);
    return [];
  }
}
