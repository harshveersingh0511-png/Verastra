/* ──────────────────────────────────────────────────────────────────────
   Cutshort adapter (light)

   Tech/startup specialist. Public listing pages.

   URL pattern:
     https://cutshort.io/search?role=<slug>&location=<city>
   ────────────────────────────────────────────────────────────────────── */

import { getText, slug } from '../util/http.js';
import { extractJsonLd, jsonLdJobPostings } from '../util/html.js';
import { validateAdapter } from './_base.js';

const QUERIES = [
  'Software Engineer', 'Data Scientist', 'Product Manager', 'Data Analyst',
];

const adapter = {
  id: 'cutshort',
  kind: 'specialist',
  v1_status: 'light',
  async fetch(ctx) {
    const all = [];
    const t0 = Date.now();
    for (const q of QUERIES) {
      if (Date.now() - t0 > ctx.timeBudgetMs) break;
      const url = `https://cutshort.io/jobs/${slug(q)}-jobs`;
      try {
        const html = await getText(url, { timeoutMs: 8000, retries: 1 });
        const blocks = extractJsonLd(html);
        const postings = jsonLdJobPostings(blocks);
        for (const p of postings) {
          all.push({
            title: p.title,
            company: p.company,
            location: p.location || 'India',
            description: p.description,
            source: 'cutshort',
            source_url: p.source_url || url,
            posted_ts: p.posted_ts,
            salary_raw: p.salary_raw,
            meta: { seed_query: q },
          });
        }
      } catch (err) {
        ctx.logger.debug(`[cutshort] ${url}: ${err.message}`);
      }
    }
    ctx.logger.info(`[cutshort] collected ${all.length} postings`);
    return all;
  },
};

export default validateAdapter(adapter);
