/* ──────────────────────────────────────────────────────────────────────
   BreezyHR ATS parser

   BreezyHR exposes a public JSON endpoint per tenant:
     https://<company>.breezy.hr/json

   Returns array of positions. Each has:
     _id, name, friendly_id, location { name, country }, type, category,
     description (HTML), published_date, url.

   Smaller tenants tend to use BreezyHR — useful for niche / boutique
   employers (consulting boutiques, law firms, mid-size product cos).
   ────────────────────────────────────────────────────────────────────── */

import { getJson } from '../../../util/http.js';
import { stripHtml } from '../../../util/html.js';

const INDIA_REGEX = /\b(india|mumbai|bangalore|bengaluru|delhi|gurgaon|gurugram|noida|chennai|hyderabad|pune|kolkata|ahmedabad|chandigarh|kochi|jaipur|coimbatore|navi mumbai|thane|remote)\b/i;

export async function parseBreezyHR(ctx, employer) {
  if (!employer.breezy_subdomain) {
    ctx.logger.debug(`[breezyhr] ${employer.name}: missing breezy_subdomain`);
    return [];
  }
  const url = `https://${employer.breezy_subdomain}.breezy.hr/json`;
  try {
    const data = await getJson(url, { timeoutMs: 9000, retries: 1 });
    const positions = Array.isArray(data) ? data
                    : Array.isArray(data?.positions) ? data.positions
                    : [];
    const out = [];
    for (const p of positions) {
      const locName = p.location?.name || '';
      const country = p.location?.country?.name || '';
      const fullLoc = [locName, country].filter(Boolean).join(', ');
      if (!INDIA_REGEX.test(fullLoc)) continue;

      out.push({
        title: p.name || '',
        company: employer.name,
        location: fullLoc,
        description: stripHtml(p.description || ''),
        source: 'employer_careers',
        source_url: p.url || `https://${employer.breezy_subdomain}.breezy.hr/p/${p.friendly_id || p._id}`,
        posted_ts: p.published_date || null,
        salary_raw: null,
        meta: {
          parser: 'breezyhr',
          employer: employer.name,
          breezy_subdomain: employer.breezy_subdomain,
          type: p.type?.name || null,
          category: p.category?.name || null,
          default_paths_hint: employer.default_paths_hint,
        },
      });
    }
    return out;
  } catch (err) {
    ctx.logger.debug(`[breezyhr] ${employer.name}: ${err.message}`);
    return [];
  }
}
