/* ──────────────────────────────────────────────────────────────────────
   overlay-composer.js — Terminal recipe overlay composition.

   Lives at the boundary between `terminal/recipes.js` and the shared
   market-overlay service. Recipes call composeOverlayParagraph() and
   slot the returned prose into their memo at the appropriate point;
   recipes do NOT read Firestore, do NOT check confidence tiers, do NOT
   inspect benchmark_comparable. All of that is hidden behind the
   service's `regime` switch.

   Each recipe family that wants an overlay paragraph imports one of:

     composeRoleCityOverlayParagraph(clusterKey, pathKey, cityKey)
     composeCityPulseOverlayParagraph(cityKey)
     composeDashboardPulseSummaryParagraph()   // rare; mostly for status memos

   Each returns a Promise<string|null>. Null means the regime says be
   silent — the recipe should append nothing.
   ────────────────────────────────────────────────────────────────────── */

import {
  getRoleCityOverlay,
  getTerminalOverlay,
  getCityPulse,
  getDashboardPulse,
  getRoleCityOverlayByBenchmark,
  getTerminalOverlayByBenchmark,
  getCityPulseByName,
  hedgePhrase,
} from '../data/market-overlay.js';

import { PATHS, CITIES } from '../data/paths.js';
import { CLUSTERS } from '../data/clusters.js';

/* ── Internal: directional verbs by momentum sign ────────────────────── */

function directionPhrase(sign) {
  if (sign === '+') return 'accelerating';
  if (sign === '-') return 'cooling';
  if (sign === '0') return 'roughly flat';
  return null;
}

function intensityPhrase(intensity) {
  switch (intensity) {
    case 'material': return 'meaningful demand';
    case 'moderate': return 'moderate demand';
    case 'slight':   return 'a thin but nonzero demand signal';
    default:         return null;
  }
}

/* ── composeRoleCityOverlayParagraph ─────────────────────────────────── */

/**
 * Compose a single paragraph describing live market overlay for a
 * (cluster, path, city) cell. Returned text is plain prose, ready to
 * be appended to a memo. Returns null when the regime is silent.
 *
 * Output style:
 *   - HIGH_COMPARABLE: "The live overlay shows X at Y; this aligns with
 *     / diverges from the benchmark cell for Z."
 *   - HIGH_OVERLAY_ONLY: "The live overlay shows X at Y. This path has
 *     no benchmark cell, so no benchmark comparison is made."
 *   - MEDIUM_*: same shape, softer verbs
 *   - LOW_HEDGED: "Early overlay signal tentatively suggests X..."
 *   - STALE_SILENT / THIN_SILENT: null
 */
export async function composeRoleCityOverlayParagraph(clusterKey, pathKey, cityKey) {
  const overlay = await getTerminalOverlay(clusterKey, pathKey, cityKey);
  if (!overlay) return null;
  const { snippet, interpretation } = overlay;
  if (!interpretation.can_quote_demand) return null;

  const path = PATHS[pathKey];
  const city = CITIES[cityKey];
  const pathLabel = path?.label || pathKey;
  const cityLabel = city?.label || cityKey;

  const intensity = intensityPhrase(snippet.demand?.intensity);
  const direction = directionPhrase(snippet.momentum?.sign);
  const lede = hedgePhrase(interpretation);

  const parts = [];

  // Demand clause
  if (intensity) {
    parts.push(`${lede} ${intensity} for ${pathLabel} in ${cityLabel}`);
  } else {
    parts.push(`${lede} live hiring activity for ${pathLabel} in ${cityLabel}`);
  }

  // Momentum clause (only if confidence permits and we have a second snapshot)
  if (interpretation.can_quote_momentum && direction && direction !== 'roughly flat') {
    parts.push(`with ${direction} momentum vs the last snapshot`);
  } else if (interpretation.can_quote_momentum && direction === 'roughly flat') {
    parts.push('with momentum broadly flat vs the last snapshot');
  }

  // Skill clause
  const rising = (snippet.skills?.rising || []).map(s => s.replace(/_/g, ' '));
  let skillSentence = '';
  if (rising.length > 0) {
    skillSentence = ` Skills trending up include ${rising.slice(0, 2).join(' and ')}.`;
  }

  // Benchmark-comparability clause — this is the line that prevents the
  // overlay from making implied benchmark comparisons on null-ref paths.
  let benchClause = '';
  if (interpretation.can_make_comparative_claim) {
    benchClause = ' This signal sits alongside benchmark cohort data for the same path, so it is suitable for benchmark-overlay comparison.';
  } else if (!interpretation.benchmark_comparable) {
    benchClause = ' This path has no benchmark cohort cell in V1, so no benchmark comparison is offered — only the market signal.';
  }

  return parts.join(', ') + '.' + skillSentence + benchClause;
}

/* ── composeCityPulseOverlayParagraph ────────────────────────────────── */

/**
 * Used by CITY_MOVE recipe and the City Move Calculator. Summarizes
 * the destination city's hiring posture in 1-2 sentences. Returns null
 * when the city has no overlay pulse or the pulse is stale.
 */
export async function composeCityPulseOverlayParagraph(cityKey) {
  const pulse = await getCityPulse(cityKey);
  if (!pulse) return null;
  const { doc, interpretation } = pulse;
  if (!interpretation.can_quote_demand) return null;

  const cityLabel = CITIES[cityKey]?.label || cityKey;
  const lede = hedgePhrase(interpretation);
  const parts = [];

  const topClusters = (doc.strongest_clusters || [])
    .slice(0, 2)
    .map(c => CLUSTERS[c.cluster_key]?.label || c.cluster_key);
  if (topClusters.length > 0) {
    parts.push(`${lede} ${cityLabel} hiring is currently strongest in ${topClusters.join(' and ')}`);
  }

  if (doc.momentum_summary) {
    // momentum_summary may or may not end with a period; strip and re-add
    const clean = doc.momentum_summary.replace(/[.\s]+$/, '');
    parts.push(clean);
  }

  if (parts.length === 0) return null;
  return parts.join('. ') + '.';
}

/* ── composeDashboardPulseSummaryParagraph ───────────────────────────── */

/**
 * One-paragraph status of the overlay system as a whole. Useful for
 * BENCHMARK_LOOKUP-style recipes that want to mention what the overlay
 * can and cannot say. Returns null if dashboard_pulse is missing or
 * stale.
 */
export async function composeDashboardPulseSummaryParagraph() {
  const pulse = await getDashboardPulse();
  if (!pulse || pulse.interpretation.is_stale) return null;

  const accels = (pulse.doc.top_accelerations || []).length;
  const coolings = (pulse.doc.top_coolings || []).length;
  const skillAccels = (pulse.doc.skill_accelerations || []).length;

  if (accels + coolings + skillAccels === 0) {
    return 'The live market overlay completed its most recent refresh but did not surface notable accelerations or coolings this week.';
  }

  return `The live market overlay flags ${accels} role-city accelerations, ${coolings} coolings, and ${skillAccels} skill-demand shifts in this week's snapshot. The dashboard market pulse zone carries the full breakdown.`;
}

/* ── composeOverlayParagraph — the generic entrypoint ────────────────── */

/**
 * Single entrypoint used by `recipes.js`. Selects the appropriate
 * composer based on which keys the recipe has resolved.
 *
 * Usage in a recipe:
 *
 *   import { composeOverlayParagraph } from './overlay-composer.js';
 *   ...
 *   const overlay = await composeOverlayParagraph({
 *     cluster_key, path_key, city_key
 *   });
 *   if (overlay) memo.append(overlay);
 *
 * The recipe does not need to know which composer fired — the service
 * layer figures it out from which keys are present.
 */
export async function composeOverlayParagraph({ cluster_key, path_key, city_key } = {}) {
  if (cluster_key && path_key && city_key) {
    return composeRoleCityOverlayParagraph(cluster_key, path_key, city_key);
  }
  if (city_key) {
    return composeCityPulseOverlayParagraph(city_key);
  }
  return composeDashboardPulseSummaryParagraph();
}

/* ── composeOverlayParagraphByBenchmark — benchmark-vocab entrypoint ──
   Used by recipes.js and any consumer that thinks in benchmark
   vocabulary (cluster='finance', role='chartered_accountant',
   city='Mumbai'). Delegates to the shared service's benchmark bridge,
   then routes to the appropriate sub-composer.

   - When (benchCluster + benchRole + cityName) all translate → role-city paragraph
   - When only cityName translates → city-pulse paragraph
   - When nothing translates (or all args omitted) → dashboard-pulse summary
   - Returns null whenever the underlying overlay is silent, stale, or
     absent — caller appends nothing.
   ────────────────────────────────────────────────────────────────────── */

export async function composeOverlayParagraphByBenchmark(benchCluster, benchRole, cityName) {
  // Role-city composition: try the by-benchmark terminal overlay first.
  if (benchCluster && benchRole && cityName) {
    const overlay = await getTerminalOverlayByBenchmark(benchCluster, benchRole, cityName);
    if (overlay && overlay.interpretation.can_quote_demand) {
      const { snippet, interpretation } = overlay;
      const pathLabel = snippet.path_key ? snippet.path_key.replace(/_/g, ' ') : 'this path';
      const cityLabel = cityName;
      const intensity = intensityPhrase(snippet.demand?.intensity);
      const direction = directionPhrase(snippet.momentum?.sign);
      const lede = hedgePhrase(interpretation);

      const parts = [];
      if (intensity) parts.push(`${lede} ${intensity} for ${pathLabel} in ${cityLabel}`);
      else           parts.push(`${lede} live hiring activity for ${pathLabel} in ${cityLabel}`);

      if (interpretation.can_quote_momentum && direction && direction !== 'roughly flat') {
        parts.push(`with ${direction} momentum vs the last snapshot`);
      } else if (interpretation.can_quote_momentum && direction === 'roughly flat') {
        parts.push('with momentum broadly flat vs the last snapshot');
      }

      const rising = (snippet.skills?.rising || []).map(s => s.replace(/_/g, ' '));
      let skillSentence = '';
      if (rising.length > 0) {
        skillSentence = ` Skills trending up include ${rising.slice(0, 2).join(' and ')}.`;
      }

      let benchClause = '';
      if (interpretation.can_make_comparative_claim) {
        benchClause = ' This signal sits alongside benchmark cohort data for the same path, so it is suitable for benchmark-overlay comparison.';
      } else if (!interpretation.benchmark_comparable) {
        benchClause = ' This path has no benchmark cohort cell in V1, so no benchmark comparison is offered — only the market signal.';
      }
      return parts.join(', ') + '.' + skillSentence + benchClause;
    }
    // Fall through to city-only composition if role-city is silent
  }

  // City-only composition: useful for CITY_MOVE-style recipes.
  if (cityName) {
    const pulse = await getCityPulseByName(cityName);
    if (pulse && pulse.interpretation.can_quote_demand) {
      const { doc, interpretation } = pulse;
      const lede = hedgePhrase(interpretation);
      const parts = [];
      const topClusters = (doc.strongest_clusters || []).slice(0, 2)
        .map(c => c.headline ? c.headline.replace(/ hiring is active$/, '') : c.cluster_key);
      if (topClusters.length > 0) {
        parts.push(`${lede} ${cityName} hiring is currently strongest in ${topClusters.join(' and ')}`);
      }
      if (doc.momentum_summary) {
        parts.push(doc.momentum_summary.replace(/[.\s]+$/, ''));
      }
      if (parts.length > 0) return parts.join('. ') + '.';
    }
  }

  // Final fallback: dashboard pulse system summary.
  return composeDashboardPulseSummaryParagraph();
}

/* ── composeOverlayForRecipe — single-arg recipe dispatcher ──────────
   Terminal.js calls this with the context object that recipes.js
   attaches to the memo (`memo._overlayContext`). Returns the composed
   paragraph string, or null when:

   - ctx is null (recipe declared itself benchmark-only)
   - the underlying overlay is absent, stale, version-mismatched, or
     THIN-tier (gated entirely inside the shared service)

   Terminal.js receives only the resolved string and does NOT decide
   whether or how to render it — that knowledge lives here.
   ────────────────────────────────────────────────────────────────────── */

export async function composeOverlayForRecipe(ctx) {
  if (!ctx) return null;
  try {
    if (ctx.kind === 'role_city') {
      return composeOverlayParagraphByBenchmark(ctx.benchCluster, ctx.benchRole, ctx.cityName);
    }
    if (ctx.kind === 'city') {
      return composeOverlayParagraphByBenchmark(null, null, ctx.cityName);
    }
    if (ctx.kind === 'system') {
      return composeOverlayParagraphByBenchmark();
    }
  } catch (_err) {
    // Defensive: any failure inside the composer → silent fallback.
  }
  return null;
}
