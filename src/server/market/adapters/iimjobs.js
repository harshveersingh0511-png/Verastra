/* ──────────────────────────────────────────────────────────────────────
   iimjobs adapter

   Specialist source for Finance, Consulting/Strategy, Research clusters.
   iimjobs HTML carries JSON-LD JobPosting on job-detail pages and
   semi-structured listings on search pages.

   URL pattern:
     https://www.iimjobs.com/search?keywords=<q>&location=<city>
   ────────────────────────────────────────────────────────────────────── */

import { getText, slug } from '../util/http.js';
import { extractJsonLd, jsonLdJobPostings } from '../util/html.js';
import { validateAdapter } from './_base.js';
import { CITIES } from '../../../../assets/js/data/paths.js';

// iimjobs is high-signal for Finance/Consulting/Research; narrow query set
const QUERIES = [
  // Finance, Accounting & Tax
  'FP&A', 'Transfer Pricing', 'Corporate Finance', 'Investor Relations', 'Internal Audit', 'Controllership',
  // Consulting / Strategy
  'Management Consultant', 'Corporate Strategy', 'M&A', 'Transaction Advisory',
  // Research
  'Equity Research', 'Investment Research', 'Market Research',
];
const CITY_KEYS = ['mumbai', 'bangalore', 'delhi', 'gurgaon', 'hyderabad', 'pune'];

const adapter = {
  id: 'iimjobs',
  kind: 'specialist',
  v1_status: 'live',
  async fetch(ctx) {
    const all = [];
    const t0 = Date.now();
    for (const q of QUERIES) {
      for (const c of CITY_KEYS) {
        if (Date.now() - t0 > ctx.timeBudgetMs) {
          ctx.logger.warn('[iimjobs] time budget exceeded');
          return all;
        }
        const cityLabel = CITIES[c]?.label || c;
        const url = `https://www.iimjobs.com/search/${slug(q)}-jobs-in-${slug(cityLabel)}`;
        try {
          const html = await getText(url, { timeoutMs: 10000, retries: 1 });
          const blocks = extractJsonLd(html);
          const postings = jsonLdJobPostings(blocks);
          for (const p of postings) {
            all.push({
              title: p.title,
              company: p.company,
              location: p.location || cityLabel,
              description: p.description,
              source: 'iimjobs',
              source_url: p.source_url || url,
              posted_ts: p.posted_ts,
              salary_raw: p.salary_raw,
              meta: { seed_query: q, seed_city: c },
            });
          }
        } catch (err) {
          ctx.logger.debug(`[iimjobs] ${url}: ${err.message}`);
        }
      }
    }
    ctx.logger.info(`[iimjobs] collected ${all.length} postings`);
    return all;
  },
};

export default validateAdapter(adapter);
