/* ──────────────────────────────────────────────────────────────────────
   EMPLOYER-CAREERS — single consolidated adapter

   Loops 12 cluster-keyed allowlists. For each employer, dispatches to
   the appropriate parser strategy. Postings are tagged with the
   cluster_key of the allowlist that produced them (this is the
   employer-cluster bias used at normalization tie-break).
   ────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
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

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ALLOWLIST_DIR = path.join(__dirname, 'allowlists');

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
  const files = await fs.readdir(ALLOWLIST_DIR);
  const out = [];
  for (const f of files) {
    if (!f.endsWith('.json')) continue;
    const raw = await fs.readFile(path.join(ALLOWLIST_DIR, f), 'utf8');
    try { out.push(JSON.parse(raw)); }
    catch (_e) { /* skip malformed allowlist */ }
  }
  return out;
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
