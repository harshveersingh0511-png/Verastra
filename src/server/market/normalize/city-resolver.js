/* ──────────────────────────────────────────────────────────────────────
   CITY RESOLVER

   Maps raw location strings to a canonical city_key from the 28-city
   benchmark vocabulary (CITIES in paths.js). Postings whose location
   does not resolve are dropped at aggregation — never written under a
   new ad-hoc city_key.
   ────────────────────────────────────────────────────────────────────── */

import { CITIES } from '../../../../assets/js/data/paths.js';

// Build a lookup of every alias → city_key. Aliases come from CITIES
// in paths.js and are matched case-insensitively as whole tokens.
const ALIAS_LOOKUP = (() => {
  const m = new Map();
  for (const city of Object.values(CITIES)) {
    for (const alias of city.aliases) {
      m.set(alias.toLowerCase(), city.key);
    }
  }
  return m;
})();

/**
 * @param {string} rawLocation
 * @returns {{city_key:string|null, city_label:string|null}}
 */
export function resolveCity(rawLocation = '') {
  if (!rawLocation) return { city_key: null, city_label: null };
  const cleaned = rawLocation.toLowerCase().trim();

  // Direct exact-alias match
  if (ALIAS_LOOKUP.has(cleaned)) {
    const key = ALIAS_LOOKUP.get(cleaned);
    return { city_key: key, city_label: CITIES[key].label };
  }

  // Token-wise substring scan
  for (const [alias, key] of ALIAS_LOOKUP.entries()) {
    const rx = new RegExp(`\\b${alias.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\b`, 'i');
    if (rx.test(rawLocation)) {
      return { city_key: key, city_label: CITIES[key].label };
    }
  }
  return { city_key: null, city_label: null };
}
