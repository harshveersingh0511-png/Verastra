/* ──────────────────────────────────────────────────────────────────────
   path-comparison-overlay.js — overlay column for the Path Comparison tool.

   Adds a "Live market signal" cell to each path being compared. The
   cell shows demand intensity + momentum + a benchmark_comparable
   marker. When the cell is silent (THIN/STALE/missing), nothing is
   rendered for that path — the cohort-driven comparison rows are
   unaffected.

   Path Comparison currently takes a destination city (or "anywhere")
   per path. The overlay is fetched for that (cluster, path, city)
   triple — if the user has not specified a city, the overlay column
   falls back to silence rather than guessing a city.

   Integration: path-comparison.js calls

       import { getOverlayForPathRow } from './path-comparison-overlay.js';
       const overlay = await getOverlayForPathRow(cluster, path, city);
       if (overlay) renderInto(overlayCell, overlay);

   ────────────────────────────────────────────────────────────────────── */

import { getRoleCityOverlay, shouldRender } from '../data/market-overlay.js';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

/* ── Public: getOverlayForPathRow ───────────────────────────────────── */

/**
 * Returns a small structured object for the caller to render, or null
 * to indicate "render nothing for this path".
 */
export async function getOverlayForPathRow(clusterKey, pathKey, cityKey) {
  if (!clusterKey || !pathKey || !cityKey) return null;
  const result = await getRoleCityOverlay(clusterKey, pathKey, cityKey);
  if (!result || !shouldRender(result.interpretation)) return null;

  const doc = result.doc;
  const interp = result.interpretation;

  const intensityLabel = (() => {
    const w = doc.demand?.weighted_evidence || 0;
    if (w >= 25) return 'material';
    if (w >= 10) return 'moderate';
    if (w >  0)  return 'thin';
    return 'none';
  })();

  const momentumLabel = (() => {
    const d = doc.momentum?.direction;
    if (d === 'accelerating') return 'rising';
    if (d === 'cooling')      return 'falling';
    if (d === 'stable')       return 'flat';
    return null;
  })();

  return {
    intensity: intensityLabel,
    momentum: momentumLabel,
    confidence_tier: interp.confidence_tier,
    benchmark_comparable: interp.benchmark_comparable,
    can_make_comparative_claim: interp.can_make_comparative_claim,
    snapshot_ts: interp.snapshot_ts,
  };
}

/* ── Public: renderOverlayCell ──────────────────────────────────────── */

/**
 * Render the structured overlay into a target table cell. Path
 * Comparison can also choose to render its own way using the
 * structured payload from getOverlayForPathRow().
 */
export function renderOverlayCell(target, overlay) {
  if (!target) return;
  if (!overlay) {
    target.replaceChildren(el('span', { class: 'pco-empty' }, '—'));
    return;
  }

  target.replaceChildren(
    el('div', { class: 'pco-cell' },
      el('div', { class: 'pco-line pco-line--demand' },
        el('span', { class: 'pco-label' }, 'demand'),
        el('span', { class: `pco-value pco-value--${overlay.intensity}` }, overlay.intensity),
      ),
      overlay.momentum && el('div', { class: 'pco-line pco-line--momentum' },
        el('span', { class: 'pco-label' }, 'trend'),
        el('span', { class: `pco-value pco-value--${overlay.momentum}` }, overlay.momentum),
      ),
      el('div', { class: 'pco-line pco-line--meta' },
        el('span', { class: `pco-tier pco-tier--${overlay.confidence_tier.toLowerCase()}` }, overlay.confidence_tier),
        el('span', {
          class: overlay.benchmark_comparable ? 'pco-flag pco-flag--comparable' : 'pco-flag pco-flag--overlay-only',
          title: overlay.benchmark_comparable
            ? 'Benchmark cohort exists — overlay can be cross-read against benchmark.'
            : 'No benchmark cell for this path in V1 — overlay signal stands alone.',
        }, overlay.benchmark_comparable ? 'comparable' : 'overlay-only'),
      ),
    )
  );
}
