/* Generic listing-page parser — JSON-LD-first fallback. */

import { getText } from '../../../util/http.js';
import { extractJsonLd, jsonLdJobPostings } from '../../../util/html.js';

export async function parseListingPage(ctx, employer) {
  if (!employer.careers_url) return [];
  try {
    const html = await getText(employer.careers_url, { timeoutMs: 8000, retries: 1 });
    const jobs = jsonLdJobPostings(extractJsonLd(html));
    return jobs.map(p => ({
      title: p.title,
      company: employer.name,
      location: p.location || 'India',
      description: p.description,
      source: 'employer_careers',
      source_url: p.source_url || employer.careers_url,
      posted_ts: p.posted_ts,
      salary_raw: p.salary_raw,
      meta: { parser: 'listing-page', employer: employer.name, default_paths_hint: employer.default_paths_hint },
    }));
  } catch (err) {
    ctx.logger.debug(`[listing-page] ${employer.name}: ${err.message}`);
    return [];
  }
}
