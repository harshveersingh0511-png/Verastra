/* ──────────────────────────────────────────────────────────────────────
   city-move-overlay.js — destination momentum for City Move Calculator.

   Adds a "destination hiring posture" panel to the calculator result.
   When the destination city has no overlay pulse (or it's stale), the
   panel is silently omitted — the cost/PCV-driven calculation is
   unchanged.

   Integration: city-move-calculator.js calls

       import { getDestinationMomentum, renderDestinationMomentumPanel }
         from './city-move-overlay.js';
       const m = await getDestinationMomentum(destinationCityKey);
       if (m) renderDestinationMomentumPanel(targetEl, m);

   ────────────────────────────────────────────────────────────────────── */

import { getCityPulse, shouldRender } from '../data/market-overlay.js';
import { CLUSTERS } from '../data/clusters.js';
import { PATHS, CITIES } from '../data/paths.js';

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

/* ── Public: getDestinationMomentum ─────────────────────────────────── */

/**
 * Returns a structured destination-momentum payload or null.
 * The payload includes only what the calculator should render — no raw
 * Firestore docs leak out.
 */
export async function getDestinationMomentum(cityKey) {
  if (!cityKey) return null;
  const pulse = await getCityPulse(cityKey);
  if (!pulse || !shouldRender(pulse.interpretation)) return null;

  const doc = pulse.doc;

  const strongestClusters = (doc.strongest_clusters || []).slice(0, 3).map(c => ({
    cluster_key: c.cluster_key,
    label: CLUSTERS[c.cluster_key]?.label || c.cluster_key,
    headline: c.headline,
    tier: c.tier,
  }));

  const strongestPaths = (doc.strongest_paths || []).slice(0, 3).map(p => ({
    path_key: p.path_key,
    cluster_key: p.cluster_key,
    label: PATHS[p.path_key]?.label || p.path_key,
    headline: p.headline,
    tier: p.tier,
    benchmark_comparable: p.benchmark_comparable,
  }));

  return {
    city_key: cityKey,
    city_label: CITIES[cityKey]?.label || cityKey,
    confidence_tier: pulse.interpretation.confidence_tier,
    momentum_summary: doc.momentum_summary || null,
    strongest_clusters: strongestClusters,
    strongest_paths: strongestPaths,
    snapshot_ts: pulse.interpretation.snapshot_ts,
  };
}

/* ── Public: renderDestinationMomentumPanel ─────────────────────────── */

export function renderDestinationMomentumPanel(target, momentum) {
  if (!target || !momentum) return;

  const panel = el('section', { class: 'cmo-panel' },
    el('header', { class: 'cmo-header' },
      el('h4', { class: 'cmo-title' }, `Live market posture — ${momentum.city_label}`),
      el('span', { class: `cmo-tier cmo-tier--${momentum.confidence_tier.toLowerCase()}` }, momentum.confidence_tier),
    ),
  );

  if (momentum.momentum_summary) {
    panel.appendChild(el('p', { class: 'cmo-summary' }, momentum.momentum_summary));
  }

  if (momentum.strongest_clusters.length) {
    const list = el('div', { class: 'cmo-clusters' },
      el('div', { class: 'cmo-section-caption' }, 'Strongest clusters'),
      el('ul', { class: 'cmo-list' },
        ...momentum.strongest_clusters.map(c =>
          el('li', { class: 'cmo-item' },
            el('span', { class: 'cmo-item__label' }, c.label),
            el('span', { class: `cmo-pill cmo-pill--${c.tier.toLowerCase()}` }, c.tier),
          )
        ),
      ),
    );
    panel.appendChild(list);
  }

  if (momentum.strongest_paths.length) {
    const list = el('div', { class: 'cmo-paths' },
      el('div', { class: 'cmo-section-caption' }, 'Strongest paths'),
      el('ul', { class: 'cmo-list' },
        ...momentum.strongest_paths.map(p =>
          el('li', { class: 'cmo-item' },
            el('span', { class: 'cmo-item__label' }, p.label),
            el('span', { class: `cmo-pill cmo-pill--${p.tier.toLowerCase()}` }, p.tier),
            el('span', {
              class: p.benchmark_comparable ? 'cmo-flag cmo-flag--comparable' : 'cmo-flag cmo-flag--overlay-only',
              title: p.benchmark_comparable
                ? 'Benchmark cohort exists — comparable.'
                : 'No benchmark cell for this path in V1.',
            }, p.benchmark_comparable ? 'comparable' : 'overlay-only'),
          )
        ),
      ),
    );
    panel.appendChild(list);
  }

  panel.appendChild(el('footer', { class: 'cmo-footer' },
    el('small', {}, 'Market posture does not affect the cost-of-living, gross-up, or PCV math on this page; it is advisory context for the move decision.'),
  ));

  target.replaceChildren(panel);
}
