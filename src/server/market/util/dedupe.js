/* ──────────────────────────────────────────────────────────────────────
   Deduplication helpers.

   Two-pass dedup:
     1. Within a single source: exact URL match.
     2. Cross-source: (normalized_company + normalized_title + city) hash.
        Cross-source duplicates are KEPT in raw_ingest (separate adapter
        evidence) but the aggregator collapses them when computing
        posting_count_raw to prevent double-counting.
   ────────────────────────────────────────────────────────────────────── */

function normalize(s) {
  return String(s || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function dedupKey(posting) {
  return `${normalize(posting.company)}|${normalize(posting.title)}|${posting.city_key || normalize(posting.location)}`;
}

export function dedupeWithinSource(postings) {
  const seen = new Set();
  const out = [];
  for (const p of postings) {
    const k = p.source_url || `${p.source}|${dedupKey(p)}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(p);
  }
  return out;
}

/* Returns a Map: dedupKey -> Array<sources that contributed this posting>.
   Used by the aggregator to compute posting_count_raw without
   double-counting cross-source duplicates. */
export function crossSourceContributorMap(normalizedPostings) {
  const map = new Map();
  for (const p of normalizedPostings) {
    const k = dedupKey(p);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(p.source);
  }
  return map;
}
