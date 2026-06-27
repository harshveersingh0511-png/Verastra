/* ──────────────────────────────────────────────────────────────────────
   CONFIDENCE + FRESHNESS SCORING (checkpoint §3, §6.1)

   Confidence tier is min(evidence_tier, freshness_cap_tier).
   Tiers: HIGH | MEDIUM | LOW | THIN.

   Thresholds vary by cluster v1_depth_tier (S/A/B).
   ────────────────────────────────────────────────────────────────────── */

import { CLUSTERS } from '../../../../assets/js/data/clusters.js';

const THRESHOLDS_BY_DEPTH = {
  S: { high: 40, mid: 15, low: 5 },
  A: { high: 25, mid: 10, low: 4 },
  B: { high: 15, mid: 6,  low: 3 },
};

/* freshness_factor decays linearly from age 10d → 30d, then 0. */
export function freshnessFactor(snapshotTs, now = Date.now()) {
  if (!snapshotTs) return 0;
  const ageDays = (now - new Date(snapshotTs).getTime()) / 86400000;
  if (ageDays <= 10) return 1.0;
  if (ageDays <= 30) return Math.max(0, 1.0 - 0.05 * (ageDays - 10));
  return 0;
}

export function freshnessCapTier(snapshotTs, now = Date.now()) {
  if (!snapshotTs) return 'THIN';
  const ageDays = (now - new Date(snapshotTs).getTime()) / 86400000;
  if (ageDays <= 10) return 'HIGH';
  if (ageDays <= 20) return 'MEDIUM';
  if (ageDays <= 30) return 'LOW';
  return 'THIN';
}

function evidenceTier(weightedEvidence, t1Count, t2Count, momentumAgreement, depthTier) {
  const T = THRESHOLDS_BY_DEPTH[depthTier] || THRESHOLDS_BY_DEPTH.A;
  if (weightedEvidence >= T.high && t1Count >= 2 && momentumAgreement) return 'HIGH';
  if (weightedEvidence >= T.mid && (t1Count >= 1 || t2Count >= 2))      return 'MEDIUM';
  if (weightedEvidence >= T.low)                                        return 'LOW';
  return 'THIN';
}

const TIER_RANK = { HIGH: 3, MEDIUM: 2, LOW: 1, THIN: 0 };
const RANK_TIER = ['THIN', 'LOW', 'MEDIUM', 'HIGH'];

/**
 * @param {{
 *   cluster_key: string,
 *   weighted_evidence: number,
 *   t1_source_count: number,
 *   t2_source_count: number,
 *   momentum_agreement: boolean,
 *   snapshot_ts: string,
 * }} input
 * @param {number} now
 * @returns {Object} confidence object matching §6.1 schema
 */
export function scoreConfidence(input, now = Date.now()) {
  const cluster = CLUSTERS[input.cluster_key];
  const depth = (cluster && cluster.v1_depth_tier) || 'A';

  const f = freshnessFactor(input.snapshot_ts, now);
  const effective = input.weighted_evidence * f;

  const evTier = evidenceTier(effective, input.t1_source_count, input.t2_source_count,
                              input.momentum_agreement, depth);
  const freshCap = freshnessCapTier(input.snapshot_ts, now);

  const finalRank = Math.min(TIER_RANK[evTier], TIER_RANK[freshCap]);
  const tier = RANK_TIER[finalRank];

  return {
    tier,
    weighted_evidence: input.weighted_evidence,
    effective_evidence: effective,
    freshness_factor: f,
    freshness_cap_tier: freshCap,
    evidence_tier: evTier,
    t1_source_count: input.t1_source_count,
    t2_source_count: input.t2_source_count,
    momentum_agreement: input.momentum_agreement,
    rationale: evTier !== tier
      ? `Evidence supports ${evTier}; freshness caps at ${freshCap}.`
      : `${tier} per cluster-${depth} thresholds (evidence ${effective.toFixed(1)}, t1=${input.t1_source_count}).`,
  };
}
