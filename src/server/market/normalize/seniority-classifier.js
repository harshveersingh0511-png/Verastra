/* ──────────────────────────────────────────────────────────────────────
   SENIORITY CLASSIFIER

   Cluster-agnostic; order matters (most specific first).
   ────────────────────────────────────────────────────────────────────── */

const RULES = [
  { rx: /\b(director|vp|vice\s+president|head\s+of|cfo|cxo|chief|partner)\b/i, band: 'Lead+' },
  { rx: /\b(senior\s+manager|associate\s+director|principal)\b/i,              band: 'Senior' },
  { rx: /\b(senior|sr\.?|lead|specialist|manager)\b/i,                          band: 'Senior' },
  { rx: /\b(analyst|executive|associate)\b/i,                                   band: 'Mid' },
  { rx: /\b(intern|trainee|fresher|junior|jr\.?)\b/i,                           band: 'Junior' },
];

export function classifySeniority(title = '') {
  for (const r of RULES) if (r.rx.test(title)) return r.band;
  return 'unknown';
}
