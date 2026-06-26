/* ──────────────────────────────────────────────────────────────────────
   NORMALIZE PIPELINE

   Single entrypoint: normalize(rawPosting, ctx) → normalizedPosting | drop

   Order of operations (checkpoint §7):
     1. City resolve              — unknown → drop
     2. Cluster classify          — score < 0.80 → drop or downgrade
     3. Path classify within cluster
     4. Skill extract
     5. Seniority band
     6. Salary band (approved sources only)

   Three buckets returned via `bucket` field:
     - 'full'           : aggregates into role_city_market + role_skill_market
     - 'cluster_usable' : contributes to cluster_coverage_health only
     - 'drop'           : logged to overlay_debug_runs, no public effect
   ────────────────────────────────────────────────────────────────────── */

import { classifyCluster } from './cluster-classifier.js';
import { classifyPath } from './path-classifier.js';
import { resolveCity } from './city-resolver.js';
import { extractSkills } from './skill-extractor.js';
import { classifySeniority } from './seniority-classifier.js';
import { parseSalaryBand } from './salary-parser.js';

const CLUSTER_SCORE_THRESHOLD = 0.80;

/* §2.2 — cluster-only usability gate. All five must pass. */
function isUsableClusterOnly(posting, clusterMatch) {
  const titleClean = (posting.title || '')
    .replace(/\b(urgent|hiring|wanted|required|opening|opportunity|exciting|immediate|joiners?|freshers|experienced|walk[\s-]?in|apply\s+now|job)\b/gi, '')
    .replace(/\s+/g, ' ').trim();
  if (titleClean.length < 8) return false;

  // (b) — at least one cluster-relevant token in title (checked against same
  // cluster patterns; if cluster matched on description-only, gate b fails)
  const clusterTokenRx = (() => {
    // Reuse the cluster's title pattern from the classifier — re-imported
    // here would create a circular dep; we approximate via classifyCluster
    // on the title alone.
    const t = classifyCluster(posting.title || '', '');
    return t.cluster_key === clusterMatch.cluster_key;
  })();
  if (!clusterTokenRx) return false;

  const descClean = (posting.description || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\b(equal\s+opportunity|about\s+(us|the\s+company)|company\s+overview|join\s+us|we\s+are\s+looking)\b.*?(?=\.|$)/gi, ' ')
    .replace(/\s+/g, ' ').trim();
  if (descClean.length < 80) return false;

  if (!posting.company ||
      /^(confidential|undisclosed|n\/?a|—|–|-|company)$/i.test(posting.company.trim())) {
    return false;
  }

  if (/\b(multiple\s+roles|various\s+positions?|all\s+roles?|several\s+openings?|bulk\s+hiring|mass\s+hiring)\b/i.test(posting.title || '')) {
    return false;
  }
  return true;
}

/**
 * @param {import('../adapters/_base.js').RawPosting} raw
 * @param {{logger:any, runId:string}} ctx
 * @returns {Object} normalized (with .bucket)
 */
export function normalize(raw, ctx) {
  const result = {
    bucket: 'drop',
    drop_reason: null,
    cluster_key: null,
    path_key: null,
    role_family_label: null,
    city_key: null,
    city_label: null,
    skills: [],
    seniority_band: 'unknown',
    salary_band_inr: null,
    source: raw.source,
    source_url: raw.source_url,
    posted_ts: raw.posted_ts || null,
    normalization_confidence: 'low',
  };

  // 1. City resolve
  const city = resolveCity(raw.location || '');
  if (!city.city_key) {
    result.drop_reason = 'city_unresolved';
    return result;
  }
  result.city_key = city.city_key;
  result.city_label = city.city_label;

  // 2. Cluster classify
  const cluster = classifyCluster(raw.title || '', raw.description || '');
  if (!cluster.cluster_key || cluster.score < CLUSTER_SCORE_THRESHOLD) {
    result.drop_reason = 'cluster_unresolved_or_low_score';
    return result;
  }
  result.cluster_key = cluster.cluster_key;

  // 3. Path classify
  const p = classifyPath(cluster.cluster_key, raw.title || '');
  result.path_key = p.path_key;
  result.role_family_label = p.label;

  // 4-6. Skills, seniority, salary
  result.skills = extractSkills(cluster.cluster_key, raw.title || '', raw.description || '');
  result.seniority_band = classifySeniority(raw.title || '');
  result.salary_band_inr = parseSalaryBand(
    `${raw.title || ''} ${raw.description || ''} ${raw.salary_raw || ''}`,
    raw.source,
  );

  if (p.path_key) {
    result.bucket = 'full';
    result.normalization_confidence = 'high';
  } else if (isUsableClusterOnly(raw, cluster)) {
    result.bucket = 'cluster_usable';
    result.normalization_confidence = 'medium';
  } else {
    result.bucket = 'drop';
    result.drop_reason = 'cluster_only_failed_usability_gate';
  }
  return result;
}
