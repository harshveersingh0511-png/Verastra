/* ──────────────────────────────────────────────────────────────────────
   Foundit (formerly Monster India) adapter

   URL pattern:
     https://www.foundit.in/search/<role-slug>-jobs-in-<city-slug>
   ────────────────────────────────────────────────────────────────────── */

import { getText, slug } from '../util/http.js';
import { extractJsonLd, jsonLdJobPostings } from '../util/html.js';
import { validateAdapter } from './_base.js';
import { CITIES } from '../../../../assets/js/data/paths.js';

/* Bundler-inlined; see naukri.js for rationale. */
import SEEDS from '../../../../assets/js/data/cluster-search-seeds.json' with { type: 'json' };

const MAX_QUERIES_PER_CLUSTER = 4;
const MAX_CITIES_PER_CLUSTER  = 4;

const adapter = {
  id: 'foundit',
  kind: 'broad',
  v1_status: 'live',
  async fetch(ctx) {
    const seeds = SEEDS || {};
    const all = [];
    const t0 = Date.now();

    for (const [cluster_key, conf] of Object.entries(seeds)) {
      if (cluster_key.startsWith('_')) continue;
      const queries = (conf.broad_queries || []).slice(0, MAX_QUERIES_PER_CLUSTER);
      const cities  = (conf.city_keys || []).slice(0, MAX_CITIES_PER_CLUSTER);

      for (const q of queries) {
        for (const c of cities) {
          if (Date.now() - t0 > ctx.timeBudgetMs) {
            ctx.logger.warn('[foundit] time budget exceeded');
            return all;
          }
          const cityLabel = CITIES[c]?.label || c;
          const url = `https://www.foundit.in/search/${slug(q)}-jobs-in-${slug(cityLabel)}`;
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
                source: 'foundit',
                source_url: p.source_url || url,
                posted_ts: p.posted_ts,
                salary_raw: p.salary_raw,
                meta: { seed_cluster: cluster_key, seed_query: q, seed_city: c },
              });
            }
          } catch (err) {
            ctx.logger.debug(`[foundit] ${url}: ${err.message}`);
          }
        }
      }
    }
    ctx.logger.info(`[foundit] collected ${all.length} postings`);
    return all;
  },
};

export default validateAdapter(adapter);
