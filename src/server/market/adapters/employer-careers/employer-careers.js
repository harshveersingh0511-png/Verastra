/* ──────────────────────────────────────────────────────────────────────
   EMPLOYER-CAREERS — single consolidated adapter

   Loops 12 cluster-keyed allowlists. For each employer, dispatches to
   the appropriate parser strategy. Postings are tagged with the
   cluster_key of the allowlist that produced them (this is the
   employer-cluster bias used at normalization tie-break).
   ────────────────────────────────────────────────────────────────────── */

import { validateAdapter } from '../_base.js';
import { parseGreenhouse } from './parsers/greenhouse.js';
import { parseLever } from './parsers/lever.js';
import { parseWorkday } from './parsers/workday.js';
import { parseSitemap } from './parsers/sitemap.js';
import { parseListingPage } from './parsers/listing-page.js';
import { parseAshby } from './parsers/ashby.js';
import { parseSmartRecruiters } from './parsers/smartrecruiters.js';
import { parseWorkable } from './parsers/workable.js';
import { parseBreezyHR } from './parsers/breezyhr.js';

/* Bundler-inlined allowlists. esbuild embeds each JSON at bundle
   time — no runtime fs.readdir/readFile and no import.meta.url.
   Works under both ESM and CJS output formats. New cluster
   allowlists must be added to this static list to be picked up. */
import academia_education_training        from './allowlists/academia_education_training.json'        with { type: 'json' };
import consulting_strategy_deals          from './allowlists/consulting_strategy_deals.json'          with { type: 'json' };
import design_creative_media              from './allowlists/design_creative_media.json'              with { type: 'json' };
import fin_acct_tax                       from './allowlists/fin_acct_tax.json'                       with { type: 'json' };
import govt_psu_public_sector             from './allowlists/govt_psu_public_sector.json'             with { type: 'json' };
import healthcare_pharma_clinical_business from './allowlists/healthcare_pharma_clinical_business.json' with { type: 'json' };
import hr_talent_ld                       from './allowlists/hr_talent_ld.json'                       with { type: 'json' };
import legal_compliance_risk_policy       from './allowlists/legal_compliance_risk_policy.json'       with { type: 'json' };
import ops_scm_procurement                from './allowlists/ops_scm_procurement.json'                with { type: 'json' };
import product_tech_data                  from './allowlists/product_tech_data.json'                  with { type: 'json' };
import research_analytics_knowledge       from './allowlists/research_analytics_knowledge.json'       with { type: 'json' };
import sales_marketing_growth             from './allowlists/sales_marketing_growth.json'             with { type: 'json' };

const ALLOWLISTS = [
  academia_education_training, consulting_strategy_deals, design_creative_media,
  fin_acct_tax, govt_psu_public_sector, healthcare_pharma_clinical_business,
  hr_talent_ld, legal_compliance_risk_policy, ops_scm_procurement,
  product_tech_data, research_analytics_knowledge, sales_marketing_growth,
];

const PARSER_DISPATCH = {
  greenhouse:      parseGreenhouse,
  lever:           parseLever,
  workday:         parseWorkday,
  sitemap:         parseSitemap,
  'listing-page':  parseListingPage,
  ashby:           parseAshby,
  smartrecruiters: parseSmartRecruiters,
  workable:        parseWorkable,
  breezyhr:        parseBreezyHR,
};

export async function loadAllowlists() {
  /* Return the bundler-inlined allowlists. Async signature retained
     for backward compatibility with any caller awaiting it. */
  return ALLOWLISTS.filter(a => a && typeof a === 'object');
}

const adapter = {
  id: 'employer_careers',
  kind: 'specialist',
  v1_status: 'live',
  async fetch(ctx) {
    const allowlists = await loadAllowlists().catch(err => {
      ctx.logger.warn(`[employer_careers] allowlist load failed: ${err.message}`);
      return [];
    });
    const all = [];
    const t0 = Date.now();
    for (const list of allowlists) {
      if (Date.now() - t0 > ctx.timeBudgetMs) {
        ctx.logger.warn('[employer_careers] time budget exceeded');
        return all;
      }
      const employers = (list.employers || []).filter(e => e.active !== false);
      for (const e of employers) {
        if (Date.now() - t0 > ctx.timeBudgetMs) return all;
        const parserFn = PARSER_DISPATCH[e.parser];
        if (!parserFn) {
          ctx.logger.debug(`[employer_careers] no parser for "${e.parser}" on ${e.name}`);
          continue;
        }
        try {
          const postings = await parserFn(ctx, e);
          for (const p of postings) {
            // Tag with the cluster_key the allowlist belongs to
            p.meta = { ...(p.meta || {}), allowlist_cluster_key: list.cluster_key };
            all.push(p);
          }
        } catch (err) {
          ctx.logger.debug(`[employer_careers] ${e.name}: ${err.message}`);
        }
      }
    }
    ctx.logger.info(`[employer_careers] collected ${all.length} postings across ${allowlists.length} allowlists`);
    return all;
  },
};

export default validateAdapter(adapter);
