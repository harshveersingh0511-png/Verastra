/* ──────────────────────────────────────────────────────────────────────
   Naukri adapter

   Strategy:
     - Build search URLs from cluster-search-seeds × city
     - Fetch HTML, extract JSON-LD JobPosting blocks (Naukri serves these)
     - HTML structure may drift; on JSON-LD miss, log to debug_runs and
       continue with next query

   URL pattern:
     https://www.naukri.com/<role-slug>-jobs-in-<city-slug>?k=<role>&l=<city>
   ────────────────────────────────────────────────────────────────────── */

import { getText, slug } from '../util/http.js';
import { extractJsonLd, jsonLdJobPostings } from '../util/html.js';
import { validateAdapter } from './_base.js';
import { CITIES } from '../../../../assets/js/data/paths.js';

/* Bundler-inlined seeds. esbuild reads cluster-search-seeds.json at
   bundle time and embeds the value here — no runtime fs.readFile or
   import.meta.url. Works under both ESM and CJS bundle output. */
import SEEDS from '../../../../assets/js/data/cluster-search-seeds.json' with { type: 'json' };

const MAX_QUERIES_PER_CLUSTER = 6;
const MAX_CITIES_PER_CLUSTER = 6;

function buildUrl(query, cityKey) {
  const cityLabel = CITIES[cityKey]?.label || cityKey;
  return `https://www.naukri.com/${slug(query)}-jobs-in-${slug(cityLabel)}`;
}

const adapter = {
  id: 'naukri',
  kind: 'broad',
  v1_status: 'live',
  async fetch(ctx) {
    const seeds = SEEDS || {};
    const all = [];
    const startedAt = Date.now();
    const budget = ctx.timeBudgetMs;

    for (const [cluster_key, conf] of Object.entries(seeds)) {
      if (cluster_key.startsWith('_')) continue;
      const queries = (conf.broad_queries || []).slice(0, MAX_QUERIES_PER_CLUSTER);
      const cities  = (conf.city_keys || []).slice(0, MAX_CITIES_PER_CLUSTER);
      if (!queries.length || !cities.length) continue;

      for (const q of queries) {
        for (const c of cities) {
          if (Date.now() - startedAt > budget) {
            ctx.logger.warn('[naukri] time budget exceeded, stopping');
            return all;
          }
          const url = buildUrl(q, c);
          try {
            const html = await getText(url, { timeoutMs: 10000, retries: 1 });
            const blocks = extractJsonLd(html);
            const postings = jsonLdJobPostings(blocks);
            for (const p of postings) {
              all.push({
                title: p.title,
                company: p.company,
                location: p.location || CITIES[c]?.label || c,
                description: p.description,
                source: 'naukri',
                source_url: p.source_url || url,
                posted_ts: p.posted_ts,
                salary_raw: p.salary_raw,
                meta: { seed_cluster: cluster_key, seed_query: q, seed_city: c },
              });
            }
          } catch (err) {
            ctx.logger.debug(`[naukri] fetch failed ${url}: ${err.message}`);
          }
        }
      }
    }
    ctx.logger.info(`[naukri] collected ${all.length} postings`);
    return all;
  },
};

export default validateAdapter(adapter);
