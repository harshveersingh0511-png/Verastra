/* ──────────────────────────────────────────────────────────────────────
   AGGREGATION — Phase 2 full implementation

   Inputs from the orchestrator:
     normalized = { full: [...], cluster_usable: [...], drop: n }
     prevSnapshot = { roleCityByKey: Map, roleSkillByKey: Map }
     applicability = source-applicability.json contents
     ctx          = { now, runId, logger }

   Produces:
     - roleCityDocs[]      → role_city_market
     - roleSkillDocs[]     → role_skill_market
     - dashboardPulse      → overlay_derived/dashboard_pulse
     - terminalSnippets    → overlay_derived/terminal_snippets
     - cityPulseDocs[]     → overlay_derived/city_pulse__<city>
     - clusterCoverageHealth (computed inline in pulse / snippets)
   ────────────────────────────────────────────────────────────────────── */

import { scoreConfidence } from '../scoring/confidence.js';
import { scoreMomentum, normalizeEvidence } from '../scoring/momentum.js';
import {
  assertCanonicalPathKey, assertCanonicalCityKey,
  PATHS, CITIES, isBenchmarkComparable,
} from '../../../../assets/js/data/paths.js';
import {
  assertCanonicalClusterKey, CLUSTERS,
} from '../../../../assets/js/data/clusters.js';
import { OVERLAY_VERSION } from '../overlay-version.js';

const SALARY_BAND_CAPTURE_FLOOR = 3;

/* ── helpers ─────────────────────────────────────────────────────────── */

function influenceWeight(applicability, sourceId, clusterKey) {
  const s = applicability?.[sourceId];
  if (!s || !s.influence_weight) return 0;
  return s.influence_weight[clusterKey] ?? 0;
}

function sourceTier(applicability, sourceId) {
  return applicability?.[sourceId]?.source_tier || null;
}

function salaryCaptureAllowed(applicability, sourceId) {
  return !!applicability?.[sourceId]?.salary_clue_capture;
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/* ── role_city aggregation ──────────────────────────────────────────── */

export function aggregateRoleCity(normalized, prevSnapshot, applicability, ctx) {
  const fullPostings = normalized.full || [];
  const snapshotTs = ctx.now.toISOString();
  const docs = [];

  // Cross-source dedup at the cell level: within each cell, count unique
  // (company|title) tuples per source, but the source-weight contribution
  // is computed per source on the full source count (gives sources
  // appropriate evidence credit).
  const byCell = groupBy(fullPostings, p => `${p.cluster_key}__${p.path_key}__${p.city_key}`);

  // Compute per-cluster max weighted evidence for momentum normalization
  const clusterMaxRaw = new Map();
  for (const [key, postings] of byCell) {
    const clusterKey = postings[0].cluster_key;
    const weighted = postings.reduce((sum, p) => sum + influenceWeight(applicability, p.source, clusterKey), 0);
    clusterMaxRaw.set(clusterKey, Math.max(clusterMaxRaw.get(clusterKey) || 0, weighted));
  }

  for (const [, postings] of byCell) {
    if (!postings.length) continue;
    try {
      assertCanonicalClusterKey(postings[0].cluster_key);
      assertCanonicalPathKey(postings[0].path_key);
      assertCanonicalCityKey(postings[0].city_key);
    } catch (e) {
      ctx.logger.warn(`[aggregate.role_city] dropped non-canonical cell: ${e.message}`);
      continue;
    }
    const { cluster_key, path_key, city_key } = postings[0];

    // Per-source breakdown with influence weights
    const bySource = groupBy(postings, p => p.source);
    const sourcesContributing = [];
    let weightedEvidence = 0;
    let t1 = 0, t2 = 0;
    for (const [src, list] of bySource) {
      const w = influenceWeight(applicability, src, cluster_key);
      const count = list.length;
      const tier = sourceTier(applicability, src);
      weightedEvidence += count * w;
      if (tier === 'T1') t1++;
      else if (tier === 'T2') t2++;
      sourcesContributing.push({ source: src, count, weight_for_cluster: w });
    }

    // Salary clue (advisory-only, approved-source only, floor n=3)
    const bandedPostings = postings.filter(p =>
      p.salary_band_inr && salaryCaptureAllowed(applicability, p.source)
    );
    let salary_clue = null;
    if (bandedPostings.length >= SALARY_BAND_CAPTURE_FLOOR) {
      const mids = bandedPostings.map(p => (p.salary_band_inr.min + p.salary_band_inr.max) / 2);
      salary_clue = {
        present: true,
        n_postings_with_band: bandedPostings.length,
        approved_sources: [...new Set(bandedPostings.map(p => p.source))],
        parsed_band_inr_lpa: {
          min: Math.min(...bandedPostings.map(p => p.salary_band_inr.min)),
          median_of_medians: median(mids),
          max: Math.max(...bandedPostings.map(p => p.salary_band_inr.max)),
        },
        raw_band_examples: bandedPostings.slice(0, 3).map(p => p.salary_band_inr.raw_match),
        advisory_only: true,
        must_not_alter_benchmark: true,
      };
    }

    // Seniority mix
    const seniorityBuckets = { junior: 0, mid: 0, senior: 0, lead_plus: 0 };
    for (const p of postings) {
      const b = (p.seniority_band || 'unknown').toLowerCase();
      if (b === 'junior') seniorityBuckets.junior++;
      else if (b === 'mid') seniorityBuckets.mid++;
      else if (b === 'senior') seniorityBuckets.senior++;
      else if (b === 'lead+') seniorityBuckets.lead_plus++;
    }
    const totSen = Object.values(seniorityBuckets).reduce((a, b) => a + b, 0) || 1;
    const seniority_mix = {
      junior: +(seniorityBuckets.junior / totSen).toFixed(2),
      mid: +(seniorityBuckets.mid / totSen).toFixed(2),
      senior: +(seniorityBuckets.senior / totSen).toFixed(2),
      lead_plus: +(seniorityBuckets.lead_plus / totSen).toFixed(2),
    };

    // Momentum vs previous snapshot
    const prevKey = `${cluster_key}__${path_key}__${city_key}`;
    const prevDoc = prevSnapshot.roleCityByKey?.get(prevKey);
    const clusterMax = clusterMaxRaw.get(cluster_key) || 1;
    const currentNorm = normalizeEvidence(weightedEvidence, clusterMax);
    const prevNorm = prevDoc ? normalizeEvidence(prevDoc.demand?.weighted_evidence || 0, clusterMax) : null;
    const mom = scoreMomentum(currentNorm, prevNorm);

    // Confidence
    const confidence = scoreConfidence({
      cluster_key,
      weighted_evidence: weightedEvidence,
      t1_source_count: t1,
      t2_source_count: t2,
      momentum_agreement: mom.direction !== 'unknown',
      snapshot_ts: snapshotTs,
    }, ctx.now.getTime());

    docs.push({
      cluster_key,
      path_key,
      role_family_label: PATHS[path_key]?.label || path_key,
      city_key,
      city_label: CITIES[city_key]?.label || city_key,

      overlay_version: OVERLAY_VERSION,

      demand: {
        weighted_evidence: +weightedEvidence.toFixed(2),
        posting_count_raw: postings.length,
        sources_contributing: sourcesContributing,
      },

      momentum: {
        direction: mom.direction,
        delta_vs_prev: mom.delta_vs_prev,
        snapshots_compared: mom.snapshots_compared,
        prev_snapshot_ts: prevDoc?.freshness?.snapshot_ts || null,
      },

      salary_clue,
      seniority_mix,

      confidence,

      benchmark_comparable: isBenchmarkComparable(path_key),

      freshness: {
        snapshot_ts: snapshotTs,
        run_id: ctx.runId,
      },
    });
  }
  return docs;
}

/* ── role_skill aggregation ─────────────────────────────────────────── */

export function aggregateRoleSkill(normalized, prevSnapshot, applicability, ctx) {
  const fullPostings = normalized.full || [];
  const snapshotTs = ctx.now.toISOString();
  const docs = [];

  // First compute (cluster, path) universes
  const universeByPath = new Map();
  for (const p of fullPostings) {
    const key = `${p.cluster_key}__${p.path_key}`;
    universeByPath.set(key, (universeByPath.get(key) || 0) + 1);
  }

  // Now flatten skill mentions
  const skillRows = [];
  for (const p of fullPostings) {
    for (const skill of (p.skills || [])) {
      skillRows.push({ cluster_key: p.cluster_key, path_key: p.path_key, skill_key: skill, source: p.source });
    }
  }
  const bySkillCell = groupBy(skillRows, r => `${r.cluster_key}__${r.path_key}__${r.skill_key}`);

  for (const [, rows] of bySkillCell) {
    const { cluster_key, path_key, skill_key } = rows[0];
    try {
      assertCanonicalClusterKey(cluster_key);
      assertCanonicalPathKey(path_key);
    } catch (e) {
      ctx.logger.warn(`[aggregate.role_skill] dropped: ${e.message}`);
      continue;
    }
    const universe = universeByPath.get(`${cluster_key}__${path_key}`) || 1;
    const mentions = rows.length;

    const bySource = groupBy(rows, r => r.source);
    let weighted = 0;
    let t1 = 0, t2 = 0;
    const sources = [];
    for (const [src, list] of bySource) {
      const w = influenceWeight(applicability, src, cluster_key);
      weighted += list.length * w;
      const tier = sourceTier(applicability, src);
      if (tier === 'T1') t1++;
      else if (tier === 'T2') t2++;
      sources.push(src);
    }

    // Momentum on frequency
    const freq = mentions / universe;
    const prevKey = `${cluster_key}__${path_key}__${skill_key}`;
    const prevDoc = prevSnapshot.roleSkillByKey?.get(prevKey);
    const prevFreq = prevDoc?.demand?.frequency ?? null;
    const mom = scoreMomentum(freq, prevFreq);

    const confidence = scoreConfidence({
      cluster_key,
      weighted_evidence: weighted,
      t1_source_count: t1,
      t2_source_count: t2,
      momentum_agreement: mom.direction !== 'unknown',
      snapshot_ts: snapshotTs,
    }, ctx.now.getTime());

    docs.push({
      cluster_key,
      path_key,
      skill_key,
      skill_label: skill_key.replace(/_/g, ' '),

      overlay_version: OVERLAY_VERSION,

      demand: {
        frequency: +freq.toFixed(3),
        posting_mentions: mentions,
        posting_universe: universe,
        weighted_evidence: +weighted.toFixed(2),
        sources_contributing: sources,
      },

      momentum: {
        direction: mom.direction,
        delta_vs_prev: mom.delta_vs_prev,
        snapshots_compared: mom.snapshots_compared,
      },

      confidence,

      benchmark_comparable: isBenchmarkComparable(path_key),

      freshness: { snapshot_ts: snapshotTs, run_id: ctx.runId },
    });
  }
  return docs;
}

/* ── cluster coverage health (§2.3 formula) ─────────────────────────── */

function clusterCoverageHealth(normalized, applicability, ctx) {
  const health = {};
  for (const clusterKey of Object.keys(CLUSTERS)) {
    let weighted = 0;
    const full = (normalized.full || []).filter(p => p.cluster_key === clusterKey);
    const usable = (normalized.cluster_usable || []).filter(p => p.cluster_key === clusterKey);
    for (const p of full) {
      weighted += influenceWeight(applicability, p.source, clusterKey);
    }
    for (const p of usable) {
      weighted += 0.40 * influenceWeight(applicability, p.source, clusterKey);
    }
    const tier = scoreConfidence({
      cluster_key: clusterKey,
      weighted_evidence: weighted,
      t1_source_count: 1, // best-effort; cluster-level health is coarse
      t2_source_count: 0,
      momentum_agreement: true,
      snapshot_ts: ctx.now.toISOString(),
    }, ctx.now.getTime()).tier;
    health[clusterKey] = { tier, weighted_evidence: +weighted.toFixed(2) };
  }
  return health;
}

/* ── dashboard pulse ────────────────────────────────────────────────── */

export function buildDashboardPulse(roleCityDocs, roleSkillDocs, normalized, applicability, ctx) {
  const topAccels = roleCityDocs
    .filter(d => d.momentum?.direction === 'accelerating' && (d.confidence?.tier === 'HIGH' || d.confidence?.tier === 'MEDIUM'))
    .sort((a, b) => (b.momentum.delta_vs_prev || 0) - (a.momentum.delta_vs_prev || 0))
    .slice(0, 6)
    .map(d => ({
      cluster_key: d.cluster_key, path_key: d.path_key, city_key: d.city_key,
      headline: `${d.role_family_label} demand in ${d.city_label} is accelerating`,
      confidence_tier: d.confidence.tier, delta: d.momentum.delta_vs_prev,
      benchmark_comparable: d.benchmark_comparable,
    }));

  const topCoolings = roleCityDocs
    .filter(d => d.momentum?.direction === 'cooling' && (d.confidence?.tier === 'HIGH' || d.confidence?.tier === 'MEDIUM'))
    .sort((a, b) => (a.momentum.delta_vs_prev || 0) - (b.momentum.delta_vs_prev || 0))
    .slice(0, 4)
    .map(d => ({
      cluster_key: d.cluster_key, path_key: d.path_key, city_key: d.city_key,
      headline: `${d.role_family_label} hiring in ${d.city_label} is cooling`,
      confidence_tier: d.confidence.tier, delta: d.momentum.delta_vs_prev,
      benchmark_comparable: d.benchmark_comparable,
    }));

  const skillAccels = roleSkillDocs
    .filter(d => d.momentum?.direction === 'accelerating' && (d.confidence?.tier === 'HIGH' || d.confidence?.tier === 'MEDIUM'))
    .sort((a, b) => (b.momentum.delta_vs_prev || 0) - (a.momentum.delta_vs_prev || 0))
    .slice(0, 5)
    .map(d => ({
      cluster_key: d.cluster_key, path_key: d.path_key, skill_key: d.skill_key,
      headline: `${d.skill_label} demand inside ${PATHS[d.path_key]?.label || d.path_key} is rising`,
      confidence_tier: d.confidence.tier, delta: d.momentum.delta_vs_prev,
      benchmark_comparable: d.benchmark_comparable,
    }));

  return {
    overlay_version: OVERLAY_VERSION,
    generated_ts: ctx.now.toISOString(),
    run_id: ctx.runId,
    top_accelerations: topAccels,
    top_coolings: topCoolings,
    skill_accelerations: skillAccels,
    cluster_coverage_health: clusterCoverageHealth(normalized, applicability, ctx),
  };
}

/* ── terminal snippets (§4 — structured, not prose) ─────────────────── */

function intensity(weighted, depthTier) {
  // crude bands aligned with §3 thresholds
  const T = { S: 40, A: 25, B: 15 }[depthTier] || 25;
  if (weighted >= T) return 'material';
  if (weighted >= T * 0.5) return 'moderate';
  if (weighted > 0) return 'slight';
  return 'none';
}

function phraseFragments(doc, skillDocs) {
  if (doc.confidence.tier === 'THIN') {
    return { demand: null, momentum: null, skills: null, salary: null, coverage: 'live overlay coverage is thin' };
  }
  const roleCity = `${doc.role_family_label} demand in ${doc.city_label}`;
  let momPhrase = null;
  if (doc.momentum.direction === 'accelerating') momPhrase = 'accelerating vs last snapshot';
  else if (doc.momentum.direction === 'cooling') momPhrase = 'cooling vs last snapshot';
  else if (doc.momentum.direction === 'stable')   momPhrase = 'stable vs last snapshot';
  const rising = skillDocs
    .filter(s => s.cluster_key === doc.cluster_key && s.path_key === doc.path_key && s.momentum.direction === 'accelerating')
    .map(s => s.skill_label)
    .slice(0, 2);
  const skillPhrase = rising.length ? `${rising.join(' and ')} rising` : null;
  return {
    demand: roleCity,
    momentum: momPhrase,
    skills: skillPhrase,
    salary: doc.salary_clue?.present ? 'posting bands present (advisory)' : null,
    coverage: null,
  };
}

export function buildTerminalSnippets(roleCityDocs, roleSkillDocs, ctx) {
  const snippets = {};
  for (const doc of roleCityDocs) {
    const depth = CLUSTERS[doc.cluster_key]?.v1_depth_tier || 'A';
    const key = `${doc.cluster_key}__${doc.path_key}__${doc.city_key}`;

    const topSkills = roleSkillDocs
      .filter(s => s.cluster_key === doc.cluster_key && s.path_key === doc.path_key)
      .sort((a, b) => b.demand.weighted_evidence - a.demand.weighted_evidence)
      .slice(0, 3)
      .map(s => s.skill_key);
    const risingSkills = roleSkillDocs
      .filter(s => s.cluster_key === doc.cluster_key && s.path_key === doc.path_key && s.momentum.direction === 'accelerating')
      .slice(0, 3)
      .map(s => s.skill_key);

    snippets[key] = {
      cluster_key: doc.cluster_key,
      path_key: doc.path_key,
      city_key: doc.city_key,
      confidence_tier: doc.confidence.tier,
      freshness_factor: doc.confidence.freshness_factor,
      benchmark_comparable: doc.benchmark_comparable,
      demand: {
        direction: doc.momentum.direction === 'unknown' ? 'unknown' : 'present',
        intensity: intensity(doc.demand.weighted_evidence, depth),
        weighted_evidence: doc.demand.weighted_evidence,
      },
      momentum: {
        sign: doc.momentum.direction === 'accelerating' ? '+'
          : doc.momentum.direction === 'cooling' ? '-'
          : doc.momentum.direction === 'stable' ? '0' : null,
        delta: doc.momentum.delta_vs_prev,
        snapshots_compared: doc.momentum.snapshots_compared,
      },
      skills: { top: topSkills, rising: risingSkills },
      salary_clue: doc.salary_clue ? {
        present: true,
        band_inr_lpa: doc.salary_clue.parsed_band_inr_lpa,
        advisory_only: true,
      } : null,
      phrase_fragments: phraseFragments(doc, roleCityDocs.length ? roleSkillDocs : []),
    };
  }
  return {
    overlay_version: OVERLAY_VERSION,
    generated_ts: ctx.now.toISOString(),
    run_id: ctx.runId,
    snippets,
  };
}

/* ── city pulse (per canonical city) ────────────────────────────────── */

export function buildCityPulse(cityKey, roleCityDocs, roleSkillDocs, ctx) {
  const cityDocs = roleCityDocs.filter(d => d.city_key === cityKey);
  if (!cityDocs.length) return null;

  // Strongest clusters in this city by weighted_evidence
  const byCluster = groupBy(cityDocs, d => d.cluster_key);
  const strongestClusters = [...byCluster.entries()]
    .map(([ck, docs]) => ({
      cluster_key: ck,
      headline: `${CLUSTERS[ck]?.label || ck} hiring is active`,
      tier: docs[0].confidence.tier,
      weighted_evidence: docs.reduce((s, d) => s + d.demand.weighted_evidence, 0),
    }))
    .sort((a, b) => b.weighted_evidence - a.weighted_evidence)
    .slice(0, 3);

  const strongestPaths = cityDocs
    .sort((a, b) => b.demand.weighted_evidence - a.demand.weighted_evidence)
    .slice(0, 3)
    .map(d => ({
      cluster_key: d.cluster_key,
      path_key: d.path_key,
      headline: `${d.role_family_label} is one of the strongest segments`,
      tier: d.confidence.tier,
      benchmark_comparable: d.benchmark_comparable,
    }));

  const cityPaths = new Set(cityDocs.map(d => `${d.cluster_key}__${d.path_key}`));
  const strongestSkills = roleSkillDocs
    .filter(s => cityPaths.has(`${s.cluster_key}__${s.path_key}`))
    .sort((a, b) => b.demand.weighted_evidence - a.demand.weighted_evidence)
    .slice(0, 5)
    .map(s => ({ skill_key: s.skill_key, headline: `${s.skill_label} is in demand`, tier: s.confidence.tier }));

  const accelerating = cityDocs.filter(d => d.momentum.direction === 'accelerating').length;
  const cooling = cityDocs.filter(d => d.momentum.direction === 'cooling').length;
  const momentum_summary = accelerating > cooling
    ? 'Hiring momentum tilts positive across multiple segments.'
    : cooling > accelerating
    ? 'Hiring momentum tilts negative across multiple segments.'
    : 'Hiring is broadly stable across segments.';

  return {
    overlay_version: OVERLAY_VERSION,
    city_key: cityKey,
    city_label: CITIES[cityKey]?.label || cityKey,
    generated_ts: ctx.now.toISOString(),
    run_id: ctx.runId,
    strongest_clusters: strongestClusters,
    strongest_paths: strongestPaths,
    strongest_skills: strongestSkills,
    momentum_summary,
    confidence_tier: strongestClusters[0]?.tier || 'THIN',
  };
}

/* ── canonical-key assertion helper (also exported for writers) ─────── */

export function assertCanonicalKeys(doc) {
  if (doc.cluster_key) assertCanonicalClusterKey(doc.cluster_key);
  if (doc.path_key) assertCanonicalPathKey(doc.path_key);
  if (doc.city_key) assertCanonicalCityKey(doc.city_key);
  return doc;
}

export { scoreConfidence };
