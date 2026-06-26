/* Workday parser (light Phase 2).
   Workday tenants vary in URL shape; we try JSON-LD on the careers page
   first, then fall back to empty. Full Workday GraphQL is Phase 3. */

import { getText } from '../../../util/http.js';
import { extractJsonLd, jsonLdJobPostings } from '../../../util/html.js';

export async function parseWorkday(ctx, employer) {
  if (!employer.careers_url) return [];
  try {
    const html = await getText(employer.careers_url, { timeoutMs: 9000, retries: 1 });
    const blocks = extractJsonLd(html);
    const jobs = jsonLdJobPostings(blocks);
    return jobs.map(p => ({
      title: p.title,
      company: employer.name,
      location: p.location || 'India',
      description: p.description,
      source: 'employer_careers',
      source_url: p.source_url || employer.careers_url,
      posted_ts: p.posted_ts,
      salary_raw: p.salary_raw,
      meta: { parser: 'workday', employer: employer.name, default_paths_hint: employer.default_paths_hint },
    }));
  } catch (err) {
    ctx.logger.debug(`[workday] ${employer.name}: ${err.message}`);
    return [];
  }
}
