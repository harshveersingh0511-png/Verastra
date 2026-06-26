/* ──────────────────────────────────────────────────────────────────────
   MOMENTUM SCORING

   Computes direction (accelerating | stable | cooling | unknown) and
   delta_vs_prev against the previous snapshot's evidence for the same
   cell. First observation → snapshots_compared: 1, direction: 'unknown'.
   ────────────────────────────────────────────────────────────────────── */

const STABLE_BAND = 0.05;

/**
 * @param {number} current  normalized score [0..1]
 * @param {number|null} previous
 * @returns {{direction:string, delta_vs_prev:number|null, snapshots_compared:number, sign:string|null}}
 */
export function scoreMomentum(current, previous) {
  if (previous === null || previous === undefined) {
    return { direction: 'unknown', delta_vs_prev: null, snapshots_compared: 1, sign: null };
  }
  const delta = current - previous;
  let direction = 'stable', sign = '0';
  if (delta > STABLE_BAND)      { direction = 'accelerating'; sign = '+'; }
  else if (delta < -STABLE_BAND){ direction = 'cooling';      sign = '-'; }
  return { direction, delta_vs_prev: delta, snapshots_compared: 2, sign };
}

/* Normalize raw weighted_evidence to a 0..1 score per cluster for momentum
   comparability. Phase 2 may swap this for a percentile against the
   distribution of cells in the same cluster. */
export function normalizeEvidence(weightedEvidence, clusterMaxEvidence) {
  if (!clusterMaxEvidence || clusterMaxEvidence <= 0) return 0;
  return Math.max(0, Math.min(1, weightedEvidence / clusterMaxEvidence));
}
