/* ──────────────────────────────────────────────────────────────────────
   Wellfound (India) adapter

   Tech / product / data specialist.
   Wellfound's public pages have been restructured multiple times; this
   adapter scrapes the public discovery pages and tolerates failure.

   URL pattern (current):
     https://wellfound.com/jobs?role=<slug>&location=India
   ────────────────────────────────────────────────────────────────────── */

import { getText } from '../util/http.js';
import { extractJsonLd, jsonLdJobPostings } from '../util/html.js';
import { validateAdapter } from './_base.js';

const QUERIES = [
  'Software Engineer', 'Data Scientist', 'Data Engineer', 'Product Manager',
  'Machine Learning Engineer', 'Data Analyst', 'BI Engineer', 'DevOps Engineer',
];

const adapter = {
  id: 'wellfound_in',
  kind: 'specialist',
  v1_status: 'live',
  async fetch(ctx) {
    const all = [];
    const t0 = Date.now();
    for (const q of QUERIES) {
      if (Date.now() - t0 > ctx.timeBudgetMs) break;
      const url = `https://wellfound.com/role/${encodeURIComponent(q.toLowerCase().replace(/\s+/g, '-'))}/india`;
      try {
        const html = await getText(url, { timeoutMs: 10000, retries: 1 });
        const blocks = extractJsonLd(html);
        const postings = jsonLdJobPostings(blocks);
        for (const p of postings) {
          all.push({
            title: p.title,
            company: p.company,
            location: p.location || 'India',
            description: p.description,
            source: 'wellfound_in',
            source_url: p.source_url || url,
            posted_ts: p.posted_ts,
            salary_raw: p.salary_raw,
            meta: { seed_query: q },
          });
        }
      } catch (err) {
        ctx.logger.debug(`[wellfound_in] ${url}: ${err.message}`);
      }
    }
    ctx.logger.info(`[wellfound_in] collected ${all.length} postings`);
    return all;
  },
};

export default validateAdapter(adapter);
