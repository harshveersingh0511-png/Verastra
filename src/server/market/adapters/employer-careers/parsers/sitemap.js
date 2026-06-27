/* Sitemap parser — pull job URLs from sitemap.xml then JSON-LD fetch each.
   Cap to 30 URLs per employer in V1. */

import { getText } from '../../../util/http.js';
import { extractJsonLd, jsonLdJobPostings } from '../../../util/html.js';

const MAX_URLS = 30;

export async function parseSitemap(ctx, employer) {
  if (!employer.sitemap_url) return [];
  try {
    const xml = await getText(employer.sitemap_url, { timeoutMs: 8000, retries: 1 });
    const urls = [...xml.matchAll(/<loc>\s*([^<]+)\s*<\/loc>/gi)]
      .map(m => m[1])
      .filter(u => /(career|job|opening|opportunity)/i.test(u))
      .slice(0, MAX_URLS);
    const out = [];
    for (const u of urls) {
      try {
        const html = await getText(u, { timeoutMs: 6000, retries: 0 });
        const blocks = extractJsonLd(html);
        const jobs = jsonLdJobPostings(blocks);
        for (const p of jobs) {
          out.push({
            title: p.title,
            company: employer.name,
            location: p.location || 'India',
            description: p.description,
            source: 'employer_careers',
            source_url: u,
            posted_ts: p.posted_ts,
            salary_raw: p.salary_raw,
            meta: { parser: 'sitemap', employer: employer.name, default_paths_hint: employer.default_paths_hint },
          });
        }
      } catch (_e) { /* skip individual URL */ }
    }
    return out;
  } catch (err) {
    ctx.logger.debug(`[sitemap] ${employer.name}: ${err.message}`);
    return [];
  }
}
