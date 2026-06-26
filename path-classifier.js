/* ──────────────────────────────────────────────────────────────────────
   PATH CLASSIFIER (Phase 1 skeleton)

   Resolves a raw posting to a canonical Verastra path_key WITHIN an
   already-resolved cluster_key. Uses the title_patterns from the
   canonical path registry — NO parallel pattern table is maintained.

   This enforces the §5 doctrine: overlay path classification is
   benchmark-aligned, not job-market-native.
   ────────────────────────────────────────────────────────────────────── */

import { PATHS } from '../../../../assets/js/data/paths.js';

/**
 * @param {string} clusterKey
 * @param {string} title
 * @returns {{path_key:string|null, label:string|null}}
 */
export function classifyPath(clusterKey, title = '') {
  if (!clusterKey || !title) return { path_key: null, label: null };
  const candidates = Object.values(PATHS).filter(p => p.cluster_key === clusterKey);
  for (const p of candidates) {
    for (const rx of (p.title_patterns || [])) {
      if (rx.test(title)) {
        return { path_key: p.path_key, label: p.label };
      }
    }
  }
  return { path_key: null, label: null };
}
