/* ──────────────────────────────────────────────────────────────────────
   market-overlay.js — shared overlay service.

   This is the ONLY frontend module that reads overlay documents from
   Firestore. Every consumer surface (Terminal, Dashboard, Path
   Comparison, City Move) imports from here and never speaks to
   Firestore directly.

   Responsibilities encapsulated here (and nowhere else):

     • Firestore reads (delegated to _firestore-rest.js)
     • benchmark_comparable gating
     • confidence-tier gating (HIGH / MEDIUM / LOW / THIN)
     • freshness handling (stale snapshots → treated as absent)
     • fallback behavior (overlay docs missing → return null cleanly)
     • in-memory caching to prevent duplicate reads within a page session
     • interpretation packaging — returns a `regime` string that consumer
       surfaces switch on; consumers compose prose, the service decides
       what's permitted to be said

   Public API (everything else is implementation detail):

     getDashboardPulse()                       → { doc, interpretation } | null
     getCityPulse(cityKey)                     → { doc, interpretation } | null
     getRoleCityOverlay(cluster, path, city)   → { doc, interpretation } | null
     getTerminalOverlay(cluster, path, city)   → { snippet, interpretation } | null
     getSkillOverlay(cluster, path, skill?)    → { docs, interpretation } | null
     getRoleSkillsForPath(cluster, path)       → { docs, interpretation } | null
     warmup()                                  → preload dashboard + snippets
     clearCache()                              → for testing / forced refresh

   Interpretation object shape:

     {
       regime: 'HIGH_COMPARABLE' | 'HIGH_OVERLAY_ONLY' |
               'MEDIUM_COMPARABLE' | 'MEDIUM_OVERLAY_ONLY' |
               'LOW_HEDGED' | 'THIN_SILENT' | 'STALE_SILENT',
       confidence_tier: 'HIGH' | 'MEDIUM' | 'LOW' | 'THIN',
       benchmark_comparable: boolean,
       is_stale: boolean,
       can_make_comparative_claim: boolean,
       can_quote_demand: boolean,
       can_quote_momentum: boolean,
       freshness_factor: number,         // 0..1
       snapshot_ts: string|null,
       run_id: string|null,
     }

   Consumer rule: if regime === 'THIN_SILENT' or 'STALE_SILENT', do not
   render an overlay statement at all. For LOW_HEDGED, hedge the language.
   ────────────────────────────────────────────────────────────────────── */

import { getDoc, runQuery } from './_firestore-rest.js';
import { isBenchmarkComparable, PATHS, CITIES } from './paths.js';
import { CLUSTERS } from './clusters.js';

/* ── Constants ───────────────────────────────────────────────────────── */

const STALE_THRESHOLD_DAYS = 30;

/* Cache TTL — overlay backend refreshes weekly (Sundays 02:30 IST), so a
   long TTL is safe. 12 hours strikes a balance: a continuously open tab
   re-fetches twice a day, catching the Sunday refresh on the next visit
   without forcing redundant reads during normal use. */
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

/* Overlay document schema versioning.

   Every overlay document (role_city_market, role_skill_market,
   overlay_derived/*, market_snapshots) carries `overlay_version`,
   stamped by the backend aggregator at write time.

   SUPPORTED_VERSIONS declares the exact versions this frontend
   understands. Documents whose overlay_version is missing or not in
   this list are rejected at the service layer — the caller receives
   null and the consumer surface falls back to its no-overlay state,
   identical to the behavior when the document is missing entirely.

   Rollout discipline:
     - On a MINOR schema bump (1.0 → 1.1): extend SUPPORTED_VERSIONS to
       include both, deploy frontend first, then deploy backend.
     - On a MAJOR schema bump (1.x → 2.0): drop the old major from
       SUPPORTED_VERSIONS in the same release that adds the new major,
       coordinate the deploy so old docs are not orphaned for users.

   Mismatched-version rejection is logged via console.warn so deploy
   skew is visible during operation. The benchmark-driven experience
   continues unaffected — version mismatch never throws and never
   blocks rendering of non-overlay content. */
const SUPPORTED_VERSIONS = Object.freeze(['1.0']);

const COLLECTIONS = Object.freeze({
  role_city_market:   'role_city_market',
  role_skill_market:  'role_skill_market',
  overlay_derived:    'overlay_derived',
});

/* ── In-memory cache ─────────────────────────────────────────────────── */

const _cache = new Map(); // key → { value, expires_at }

function cacheGet(key) {
  const entry = _cache.get(key);
  if (!entry) return undefined;
  if (entry.expires_at < Date.now()) { _cache.delete(key); return undefined; }
  return entry.value;
}
function cacheSet(key, value) {
  _cache.set(key, { value, expires_at: Date.now() + CACHE_TTL_MS });
}
export function clearCache() { _cache.clear(); }

/* ── Internal: version validation ────────────────────────────────────── */

/**
 * Returns true iff the document carries a recognized overlay_version.
 * On mismatch, logs once per doc shape via a Set guard so we do not
 * flood the console when the same doc is fetched repeatedly.
 *
 * Rejection cases:
 *   - Document is null/undefined (caller already short-circuits, but
 *     defensive here too)
 *   - Document lacks overlay_version field (likely written by a
 *     backend older than this frontend)
 *   - overlay_version not present in SUPPORTED_VERSIONS (deploy skew
 *     or schema break)
 */
const _versionWarnings = new Set();

function validateVersion(doc, contextLabel) {
  if (!doc) return false;
  const v = doc.overlay_version;
  if (!v) {
    if (!_versionWarnings.has(`missing:${contextLabel}`)) {
      _versionWarnings.add(`missing:${contextLabel}`);
      console.warn(
        `[market-overlay] ${contextLabel} document is missing overlay_version. ` +
        `Treating as unsupported and returning null. Backend may be out of sync ` +
        `with the frontend's SUPPORTED_VERSIONS = ${JSON.stringify(SUPPORTED_VERSIONS)}.`
      );
    }
    return false;
  }
  if (!SUPPORTED_VERSIONS.includes(v)) {
    if (!_versionWarnings.has(`mismatch:${contextLabel}:${v}`)) {
      _versionWarnings.add(`mismatch:${contextLabel}:${v}`);
      console.warn(
        `[market-overlay] ${contextLabel} document carries overlay_version "${v}", ` +
        `which is not in SUPPORTED_VERSIONS = ${JSON.stringify(SUPPORTED_VERSIONS)}. ` +
        `Treating as unsupported and returning null. Frontend may be behind a backend ` +
        `schema bump — verify deploy ordering.`
      );
    }
    return false;
  }
  return true;
}

/* ── Internal: interpretation packaging ──────────────────────────────── */

function snapshotAgeDays(snapshotTs) {
  if (!snapshotTs) return Infinity;
  return (Date.now() - new Date(snapshotTs).getTime()) / 86400000;
}

/**
 * Build the interpretation object that gates consumer behavior.
 * Inputs are pulled from the overlay doc itself; consumers never need
 * to know the schema beyond what this function exposes.
 */
function buildInterpretation({ confidence, benchmark_comparable, snapshot_ts, run_id }) {
  const tier = confidence?.tier || 'THIN';
  const freshnessFactor = confidence?.freshness_factor ?? 0;
  const ageDays = snapshotAgeDays(snapshot_ts);
  const isStale = ageDays > STALE_THRESHOLD_DAYS || freshnessFactor === 0;
  const benchComparable = !!benchmark_comparable;

  let regime;
  if (isStale) regime = 'STALE_SILENT';
  else if (tier === 'THIN') regime = 'THIN_SILENT';
  else if (tier === 'LOW') regime = 'LOW_HEDGED';
  else if (tier === 'MEDIUM') regime = benchComparable ? 'MEDIUM_COMPARABLE' : 'MEDIUM_OVERLAY_ONLY';
  else /* HIGH */            regime = benchComparable ? 'HIGH_COMPARABLE' : 'HIGH_OVERLAY_ONLY';

  const silent = regime === 'STALE_SILENT' || regime === 'THIN_SILENT';

  return {
    regime,
    confidence_tier: tier,
    benchmark_comparable: benchComparable,
    is_stale: isStale,
    can_make_comparative_claim: benchComparable && !silent && tier !== 'LOW',
    can_quote_demand: !silent,
    can_quote_momentum: !silent && (confidence?.momentum_agreement ?? false),
    freshness_factor: freshnessFactor,
    snapshot_ts: snapshot_ts || null,
    run_id: run_id || null,
  };
}

/* ── Public: getDashboardPulse ───────────────────────────────────────── */

/**
 * Fetch the dashboard_pulse derived doc.
 *
 * Returns { doc, interpretation } or null when the document is absent
 * or the entire run is stale. The interpretation here applies to the
 * pulse as a whole; individual items inside (top_accelerations,
 * top_coolings, skill_accelerations) carry their OWN per-item
 * confidence_tier and benchmark_comparable that the dashboard renderer
 * must check item-by-item.
 */
export async function getDashboardPulse() {
  const cached = cacheGet('dashboard_pulse');
  if (cached !== undefined) return cached;

  const doc = await getDoc(COLLECTIONS.overlay_derived, 'dashboard_pulse');
  if (!doc) { cacheSet('dashboard_pulse', null); return null; }
  if (!validateVersion(doc, 'dashboard_pulse')) { cacheSet('dashboard_pulse', null); return null; }

  const ageDays = snapshotAgeDays(doc.generated_ts);
  const isStale = ageDays > STALE_THRESHOLD_DAYS;

  const result = {
    doc,
    interpretation: {
      regime: isStale ? 'STALE_SILENT' : 'HIGH_OVERLAY_ONLY',
      is_stale: isStale,
      snapshot_ts: doc.generated_ts || null,
      run_id: doc.run_id || null,
      ageDays,
    },
  };
  cacheSet('dashboard_pulse', result);
  return result;
}

/* ── Public: getCityPulse ─────────────────────────────────────────────── */

export async function getCityPulse(cityKey) {
  if (!cityKey) return null;
  const cacheKey = `city_pulse__${cityKey}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const doc = await getDoc(COLLECTIONS.overlay_derived, `city_pulse__${cityKey}`);
  if (!doc) { cacheSet(cacheKey, null); return null; }
  if (!validateVersion(doc, `city_pulse__${cityKey}`)) { cacheSet(cacheKey, null); return null; }

  const ageDays = snapshotAgeDays(doc.generated_ts);
  const isStale = ageDays > STALE_THRESHOLD_DAYS;
  const topTier = doc.confidence_tier || 'THIN';

  let regime;
  if (isStale) regime = 'STALE_SILENT';
  else if (topTier === 'THIN') regime = 'THIN_SILENT';
  else if (topTier === 'LOW') regime = 'LOW_HEDGED';
  else if (topTier === 'MEDIUM') regime = 'MEDIUM_OVERLAY_ONLY';
  else regime = 'HIGH_OVERLAY_ONLY';

  const result = {
    doc,
    interpretation: {
      regime,
      confidence_tier: topTier,
      is_stale: isStale,
      can_quote_demand: regime !== 'STALE_SILENT' && regime !== 'THIN_SILENT',
      snapshot_ts: doc.generated_ts || null,
      run_id: doc.run_id || null,
    },
  };
  cacheSet(cacheKey, result);
  return result;
}

/* ── Public: getRoleCityOverlay ──────────────────────────────────────── */

export async function getRoleCityOverlay(clusterKey, pathKey, cityKey) {
  if (!clusterKey || !pathKey || !cityKey) return null;
  const docId = `${clusterKey}__${pathKey}__${cityKey}`;
  const cacheKey = `role_city__${docId}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const doc = await getDoc(COLLECTIONS.role_city_market, docId);
  if (!doc) { cacheSet(cacheKey, null); return null; }
  if (!validateVersion(doc, `role_city_market/${docId}`)) { cacheSet(cacheKey, null); return null; }

  const interp = buildInterpretation({
    confidence: doc.confidence,
    benchmark_comparable: doc.benchmark_comparable,
    snapshot_ts: doc.freshness?.snapshot_ts,
    run_id: doc.freshness?.run_id,
  });

  const result = { doc, interpretation: interp };
  cacheSet(cacheKey, result);
  return result;
}

/* ── Public: getTerminalOverlay ──────────────────────────────────────── */

/**
 * Fetch the precomputed terminal snippet for (cluster, path, city).
 * The aggregator built these during the Phase 2 refresh; this getter
 * just looks up by key and applies the gating + freshness wrapper.
 */
export async function getTerminalOverlay(clusterKey, pathKey, cityKey) {
  if (!clusterKey || !pathKey || !cityKey) return null;
  const key = `${clusterKey}__${pathKey}__${cityKey}`;
  const cacheKey = `terminal_snippet__${key}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  // Load the whole terminal_snippets doc once; cache it.
  let snippetDoc = cacheGet('terminal_snippets__all');
  if (snippetDoc === undefined) {
    snippetDoc = await getDoc(COLLECTIONS.overlay_derived, 'terminal_snippets');
    // Version-validate the envelope; on rejection, cache null so we
    // don't re-fetch and re-warn on every snippet lookup.
    if (snippetDoc && !validateVersion(snippetDoc, 'terminal_snippets')) {
      snippetDoc = null;
    }
    cacheSet('terminal_snippets__all', snippetDoc);
  }
  if (!snippetDoc || !snippetDoc.snippets || !snippetDoc.snippets[key]) {
    cacheSet(cacheKey, null);
    return null;
  }

  const snippet = snippetDoc.snippets[key];

  // Re-derive benchmark_comparable defensively (snippets carry it but
  // we don't want to trust upstream alone).
  const benchComparable = snippet.benchmark_comparable ?? isBenchmarkComparable(snippet.path_key);

  // Synthesize a confidence-shaped object for buildInterpretation.
  const interp = buildInterpretation({
    confidence: {
      tier: snippet.confidence_tier,
      freshness_factor: snippet.freshness_factor,
      momentum_agreement: snippet.momentum?.sign !== null,
    },
    benchmark_comparable: benchComparable,
    snapshot_ts: snippetDoc.generated_ts,
    run_id: snippetDoc.run_id,
  });

  const result = { snippet, interpretation: interp };
  cacheSet(cacheKey, result);
  return result;
}

/* ── Public: getSkillOverlay (single skill) ──────────────────────────── */

export async function getSkillOverlay(clusterKey, pathKey, skillKey) {
  if (!clusterKey || !pathKey || !skillKey) return null;
  const docId = `${clusterKey}__${pathKey}__${skillKey}`;
  const cacheKey = `role_skill__${docId}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const doc = await getDoc(COLLECTIONS.role_skill_market, docId);
  if (!doc) { cacheSet(cacheKey, null); return null; }
  if (!validateVersion(doc, `role_skill_market/${docId}`)) { cacheSet(cacheKey, null); return null; }

  const interp = buildInterpretation({
    confidence: doc.confidence,
    benchmark_comparable: doc.benchmark_comparable,
    snapshot_ts: doc.freshness?.snapshot_ts,
    run_id: doc.freshness?.run_id,
  });

  const result = { docs: [doc], interpretation: interp };
  cacheSet(cacheKey, result);
  return result;
}

/* ── Public: getRoleSkillsForPath (list all skills for a path) ───────── */

/**
 * Returns all role_skill_market docs for (cluster, path), sorted by
 * weighted_evidence desc. Uses runQuery — slower than direct doc
 * fetch; consumers should cache the result themselves when iterating
 * many paths.
 */
export async function getRoleSkillsForPath(clusterKey, pathKey) {
  if (!clusterKey || !pathKey) return null;
  const cacheKey = `role_skills_for_path__${clusterKey}__${pathKey}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const rawDocs = await runQuery(COLLECTIONS.role_skill_market, {
    cluster_key: clusterKey,
    path_key: pathKey,
  }, { limit: 30 });

  // Filter out docs with unsupported overlay_version
  const docs = rawDocs.filter(d => validateVersion(d, `role_skill_market[query ${clusterKey}/${pathKey}]`));

  if (!docs.length) { cacheSet(cacheKey, null); return null; }

  docs.sort((a, b) => (b.demand?.weighted_evidence || 0) - (a.demand?.weighted_evidence || 0));

  // Aggregate interpretation across the set: take the strongest tier
  const tiers = docs.map(d => d.confidence?.tier || 'THIN');
  const tierRank = { HIGH: 3, MEDIUM: 2, LOW: 1, THIN: 0 };
  const bestTier = tiers.reduce((acc, t) => tierRank[t] > tierRank[acc] ? t : acc, 'THIN');
  const benchComparable = isBenchmarkComparable(pathKey);
  const snapshotTs = docs[0]?.freshness?.snapshot_ts;
  const runId = docs[0]?.freshness?.run_id;

  const interp = buildInterpretation({
    confidence: { tier: bestTier, freshness_factor: 1, momentum_agreement: true },
    benchmark_comparable: benchComparable,
    snapshot_ts: snapshotTs,
    run_id: runId,
  });

  const result = { docs, interpretation: interp };
  cacheSet(cacheKey, result);
  return result;
}

/* ── Public: warmup ──────────────────────────────────────────────────── */

/**
 * Preload the most likely first reads to reduce perceived latency on
 * dashboard render. Safe to call multiple times.
 */
export async function warmup() {
  await Promise.all([
    getDashboardPulse(),
    // terminal_snippets is fetched lazily by first getTerminalOverlay call
  ]);
}

/* ── Public: helpers consumers may need ──────────────────────────────── */

/**
 * Tiny convenience: should the consumer render an overlay statement at
 * all? Covers stale + thin in one call.
 */
export function shouldRender(interpretation) {
  if (!interpretation) return false;
  return interpretation.regime !== 'STALE_SILENT' && interpretation.regime !== 'THIN_SILENT';
}

/**
 * Hedge token for the LOW_HEDGED regime ("tentatively", "early signal
 * suggests", etc). Consumers reach for this when they need uniform
 * hedge language without each surface inventing its own.
 */
export function hedgePhrase(interpretation) {
  if (!interpretation) return '';
  switch (interpretation.regime) {
    case 'HIGH_COMPARABLE':
    case 'HIGH_OVERLAY_ONLY':
      return 'The live market overlay shows';
    case 'MEDIUM_COMPARABLE':
    case 'MEDIUM_OVERLAY_ONLY':
      return 'Recent overlay signal suggests';
    case 'LOW_HEDGED':
      return 'Early overlay signal tentatively suggests';
    default:
      return '';
  }
}

/**
 * The exact overlay schema versions this frontend understands. Exported
 * so build tooling / health checks can compare against the backend's
 * OVERLAY_VERSION constant.
 */
export { SUPPORTED_VERSIONS };

/* ──────────────────────────────────────────────────────────────────────
   BENCHMARK-VOCABULARY BRIDGE

   The rest of the Verastra app uses benchmark vocabulary
   (cluster='finance', role='chartered_accountant', city='Mumbai').
   Overlay documents use overlay vocabulary
   (cluster_key='fin_acct_tax', path_key='transfer_pricing', city_key='mumbai').

   These bridge getters accept benchmark inputs, translate to overlay
   vocabulary via the paths/clusters registries, and delegate to the
   canonical getters. Consumer surfaces (recipes, tools, dashboard
   helpers) call these — they never translate vocabulary themselves.

   Translation rules:
     - benchmark cluster (e.g. 'finance') → overlay cluster_key, by
       scanning CLUSTERS for the one whose benchmark_keys includes the
       benchmark cluster, OR by scanning PATHS for any path whose
       benchmark_path_ref.cluster_node equals the benchmark cluster's
       data-source key. The CLUSTERS registry is the authoritative path
       when both signals are available.
     - benchmark role → overlay path_key, by scanning PATHS for the
       first path whose benchmark_path_ref.path_node matches. Multiple
       overlay paths may map to the same benchmark cell (e.g. several
       Finance overlay paths all map to finance.chartered_accountant);
       in that case the first match wins. This is intentional V1
       behavior and aligns with the 59/90 benchmark-mapped + 31/90
       null-ref policy from Phase 1.
     - city name (any case) → city_key, via the CITIES alias table.

   When any leg of the translation fails, returns null. Consumer
   surfaces interpret null as "no overlay available, render
   benchmark-only state".
   ────────────────────────────────────────────────────────────────────── */

const _bridgeCache = { clusters: null, cities: null };

function _benchmarkClusterToOverlayKey(benchCluster) {
  if (!benchCluster) return null;
  if (!_bridgeCache.clusters) {
    /* First-claim-wins: when multiple overlay clusters list the same
       benchmark key (e.g. both fin_acct_tax and
       research_analytics_knowledge list 'finance', the latter for the
       equity_research cross-cluster bridge), the FIRST cluster to
       claim it is treated as the primary mapping. Cross-cluster
       aliases registered later do not overwrite. */
    const m = new Map();
    for (const c of Object.values(CLUSTERS || {})) {
      for (const bk of (c.benchmark_keys || [])) {
        if (!m.has(bk)) m.set(bk, c.cluster_key);
      }
    }
    _bridgeCache.clusters = m;
  }
  return _bridgeCache.clusters.get(benchCluster) || null;
}

function _benchmarkRoleToPathKey(benchCluster, benchRole, overlayClusterKey) {
  if (!benchRole) return null;
  for (const p of Object.values(PATHS || {})) {
    if (overlayClusterKey && p.cluster_key !== overlayClusterKey) continue;
    const ref = p.benchmark_path_ref;
    if (!ref) continue;
    if (ref.path_node === benchRole) return p.path_key;
  }
  return null;
}

function _cityNameToKey(cityName) {
  if (!cityName) return null;
  if (!_bridgeCache.cities) {
    const m = new Map();
    for (const c of Object.values(CITIES || {})) {
      for (const alias of (c.aliases || [])) m.set(alias.toLowerCase(), c.key);
      m.set(c.key.toLowerCase(), c.key);
      if (c.label) m.set(c.label.toLowerCase(), c.key);
    }
    _bridgeCache.cities = m;
  }
  return _bridgeCache.cities.get(String(cityName).toLowerCase().trim()) || null;
}

/**
 * @returns {{cluster_key, path_key, city_key}} with null for any leg that
 * failed to translate.
 */
function _bridge(benchCluster, benchRole, cityName) {
  const clusterKey = _benchmarkClusterToOverlayKey(benchCluster);
  const pathKey = _benchmarkRoleToPathKey(benchCluster, benchRole, clusterKey);
  const cityKey = _cityNameToKey(cityName);
  return { cluster_key: clusterKey, path_key: pathKey, city_key: cityKey };
}

/**
 * Benchmark-vocabulary convenience wrapper around getRoleCityOverlay.
 * Returns null when any vocabulary leg fails, the doc is missing,
 * stale, or version-mismatched.
 */
export async function getRoleCityOverlayByBenchmark(benchCluster, benchRole, cityName) {
  const { cluster_key, path_key, city_key } = _bridge(benchCluster, benchRole, cityName);
  if (!cluster_key || !path_key || !city_key) return null;
  return getRoleCityOverlay(cluster_key, path_key, city_key);
}

/**
 * Benchmark-vocabulary convenience wrapper around getTerminalOverlay.
 */
export async function getTerminalOverlayByBenchmark(benchCluster, benchRole, cityName) {
  const { cluster_key, path_key, city_key } = _bridge(benchCluster, benchRole, cityName);
  if (!cluster_key || !path_key || !city_key) return null;
  return getTerminalOverlay(cluster_key, path_key, city_key);
}

/**
 * Benchmark-vocabulary convenience wrapper around getCityPulse.
 * Accepts a city name in any case ('Bangalore', 'bangalore', 'BLR'…)
 * and normalizes via the CITIES alias table.
 */
export async function getCityPulseByName(cityName) {
  const city_key = _cityNameToKey(cityName);
  if (!city_key) return null;
  return getCityPulse(city_key);
}
