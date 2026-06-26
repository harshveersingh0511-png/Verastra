/* ──────────────────────────────────────────────────────────────────────
   PSU official portals adapter (light)

   The only adapter weighted into govt_psu_public_sector. PSU portals
   vary in structure; V1 ships a small curated list and best-effort
   parsing of careers/notifications pages.

   For each portal we try JSON-LD first, then fall back to a generic
   listing-page parse (heading + nearby links).
   ────────────────────────────────────────────────────────────────────── */

import { getText } from '../util/http.js';
import { extractJsonLd, jsonLdJobPostings, stripHtml } from '../util/html.js';
import { validateAdapter } from './_base.js';

const PORTALS = [
  { name: 'ONGC',           careers_url: 'https://www.ongcindia.com/web/eng/career/recruitment-notification' },
  { name: 'NTPC',           careers_url: 'https://careers.ntpc.co.in/' },
  { name: 'GAIL',           careers_url: 'https://gailonline.com/CARRecruitment.html' },
  { name: 'BHEL',           careers_url: 'https://careers.bhel.in/' },
  { name: 'SBI',            careers_url: 'https://sbi.co.in/web/careers' },
  { name: 'RBI',            careers_url: 'https://opportunities.rbi.org.in/Scripts/Vacancies.aspx' },
];

const adapter = {
  id: 'psu_official_portals',
  kind: 'specialist',
  v1_status: 'light',
  async fetch(ctx) {
    const all = [];
    const t0 = Date.now();
    for (const portal of PORTALS) {
      if (Date.now() - t0 > ctx.timeBudgetMs) break;
      try {
        const html = await getText(portal.careers_url, { timeoutMs: 8000, retries: 1 });
        const blocks = extractJsonLd(html);
        const jobs = jsonLdJobPostings(blocks);
        if (jobs.length > 0) {
          for (const p of jobs) {
            all.push({
              title: p.title,
              company: portal.name,
              location: p.location || 'India',
              description: p.description,
              source: 'psu_official_portals',
              source_url: p.source_url || portal.careers_url,
              posted_ts: p.posted_ts,
              salary_raw: null,
              meta: { portal: portal.name },
            });
          }
        } else {
          // Fallback: mine the page for headlines containing recruit/officer/grade
          const text = stripHtml(html);
          const lines = text.split(/[•·\n\r]/).map(s => s.trim()).filter(Boolean);
          const candidates = lines.filter(l =>
            /\b(recruit|notification|officer|grade|engineer|trainee|management\s+trainee)\b/i.test(l)
            && l.length > 12 && l.length < 200
          ).slice(0, 8);
          for (const title of candidates) {
            all.push({
              title,
              company: portal.name,
              location: 'India',
              description: title,
              source: 'psu_official_portals',
              source_url: portal.careers_url,
              posted_ts: null,
              salary_raw: null,
              meta: { portal: portal.name, fallback: 'listing_text' },
            });
          }
        }
      } catch (err) {
        ctx.logger.debug(`[psu_official_portals] ${portal.name}: ${err.message}`);
      }
    }
    ctx.logger.info(`[psu_official_portals] collected ${all.length} postings`);
    return all;
  },
};

export default validateAdapter(adapter);
