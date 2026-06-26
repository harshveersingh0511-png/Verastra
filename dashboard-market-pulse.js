/* ──────────────────────────────────────────────────────────────────────
   dashboard-market-pulse.js — Dashboard "Live Market Overlay" zone.

   Renders the dashboard_pulse derived doc as a new zone in the
   intelligence cockpit. Mounts into any DOM container the dashboard
   chooses to give it — no global side effects.

   Integration: dashboard.js calls

       import { renderMarketPulseZone } from './dashboard-market-pulse.js';
       renderMarketPulseZone(targetElement);

   Everything else (Firestore reads, gating, freshness) is in the
   shared service.
   ────────────────────────────────────────────────────────────────────── */

import { getDashboardPulse } from '../data/market-overlay.js';
import { PATHS, CITIES } from '../data/paths.js';
import { CLUSTERS } from '../data/clusters.js';

/* ── tiny render helpers ─────────────────────────────────────────────── */

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'dataset') for (const [dk, dv] of Object.entries(v)) node.dataset[dk] = dv;
    else node.setAttribute(k, v);
  }
  for (const c of children) {
    if (c == null) continue;
    node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

function tierBadge(tier) {
  return el('span', { class: `mp-tier mp-tier--${(tier || 'thin').toLowerCase()}` }, tier || 'THIN');
}

function comparabilityFlag(benchmark_comparable) {
  if (benchmark_comparable) {
    return el('span', {
      class: 'mp-flag mp-flag--comparable',
      title: 'This path has a benchmark cohort cell. Overlay signals here can be compared against benchmark.',
    }, 'benchmark-comparable');
  }
  return el('span', {
    class: 'mp-flag mp-flag--overlay-only',
    title: 'This path has no benchmark cohort cell in V1. Overlay signal stands alone — no benchmark comparison is made.',
  }, 'overlay-only');
}

function deltaSpan(delta) {
  if (delta == null) return null;
  const sign = delta > 0 ? '+' : '';
  return el('span', { class: 'mp-delta' }, `${sign}${(delta * 100).toFixed(0)}%`);
}

function ageLabel(ageDays) {
  if (ageDays == null) return null;
  const d = Math.round(ageDays);
  if (d <= 1) return 'today';
  if (d <= 10) return `${d}d ago`;
  return `${d}d ago (decaying)`;
}

/* ── Item-level renderers ────────────────────────────────────────────── */

function renderAccelItem(item) {
  return el('li', { class: 'mp-item mp-item--accel' },
    el('div', { class: 'mp-item__lead' },
      tierBadge(item.confidence_tier),
      comparabilityFlag(item.benchmark_comparable),
      deltaSpan(item.delta),
    ),
    el('div', { class: 'mp-item__headline' }, item.headline),
  );
}

function renderCoolingItem(item) {
  return el('li', { class: 'mp-item mp-item--cooling' },
    el('div', { class: 'mp-item__lead' },
      tierBadge(item.confidence_tier),
      comparabilityFlag(item.benchmark_comparable),
      deltaSpan(item.delta),
    ),
    el('div', { class: 'mp-item__headline' }, item.headline),
  );
}

function renderSkillItem(item) {
  return el('li', { class: 'mp-item mp-item--skill' },
    el('div', { class: 'mp-item__lead' },
      tierBadge(item.confidence_tier),
      comparabilityFlag(item.benchmark_comparable),
      deltaSpan(item.delta),
    ),
    el('div', { class: 'mp-item__headline' }, item.headline),
  );
}

/* ── Coverage matrix ─────────────────────────────────────────────────── */

function renderClusterCoverage(coverageMap) {
  const wrap = el('div', { class: 'mp-coverage' });
  wrap.appendChild(el('div', { class: 'mp-coverage__caption' }, 'Cluster coverage health'));
  const grid = el('div', { class: 'mp-coverage__grid' });
  for (const [clusterKey, c] of Object.entries(coverageMap || {})) {
    grid.appendChild(el('div', { class: `mp-coverage__cell mp-coverage__cell--${(c.tier || 'thin').toLowerCase()}` },
      el('span', { class: 'mp-coverage__cluster' }, CLUSTERS[clusterKey]?.label || clusterKey),
      tierBadge(c.tier),
    ));
  }
  wrap.appendChild(grid);
  return wrap;
}

/* ── States ──────────────────────────────────────────────────────────── */

function renderEmpty(target) {
  target.replaceChildren(
    el('section', { class: 'zone-market-pulse zone-market-pulse--empty' },
      el('header', { class: 'mp-header' },
        el('h3', { class: 'mp-title' }, 'Live Market Overlay'),
        el('span', { class: 'mp-subtitle' }, 'standing by — no recent snapshot'),
      ),
      el('p', { class: 'mp-empty' },
        'The market overlay has not yet completed a refresh, or the latest snapshot is older than thirty days. Benchmark-driven cockpit content is unaffected.',
      ),
    )
  );
}

function renderStale(target, ageDays) {
  target.replaceChildren(
    el('section', { class: 'zone-market-pulse zone-market-pulse--stale' },
      el('header', { class: 'mp-header' },
        el('h3', { class: 'mp-title' }, 'Live Market Overlay'),
        el('span', { class: 'mp-subtitle' }, `last refresh ${Math.round(ageDays)} days ago — signal suppressed`),
      ),
      el('p', { class: 'mp-empty' },
        'The last overlay snapshot is too old to safely surface. The cockpit continues to operate on benchmark data alone.',
      ),
    )
  );
}

/* ── Main renderer ───────────────────────────────────────────────────── */

export async function renderMarketPulseZone(target) {
  if (!target) return;

  // Loading placeholder while we fetch
  target.replaceChildren(
    el('section', { class: 'zone-market-pulse zone-market-pulse--loading' },
      el('header', { class: 'mp-header' }, el('h3', { class: 'mp-title' }, 'Live Market Overlay')),
      el('p', { class: 'mp-loading' }, 'Loading latest snapshot…'),
    )
  );

  const pulse = await getDashboardPulse();
  if (!pulse) { renderEmpty(target); return; }
  if (pulse.interpretation.is_stale) { renderStale(target, pulse.interpretation.ageDays); return; }

  const { doc } = pulse;
  const accels = doc.top_accelerations || [];
  const coolings = doc.top_coolings || [];
  const skills = doc.skill_accelerations || [];

  const section = el('section', { class: 'zone-market-pulse' });

  // Header
  section.appendChild(el('header', { class: 'mp-header' },
    el('h3', { class: 'mp-title' }, 'Live Market Overlay'),
    el('span', { class: 'mp-subtitle' },
      `snapshot ${ageLabel(pulse.interpretation.ageDays)} · run ${doc.run_id || '—'}`,
    ),
  ));

  // Three lanes — accelerations / coolings / skills
  const lanes = el('div', { class: 'mp-lanes' });

  const accelLane = el('div', { class: 'mp-lane mp-lane--accel' },
    el('h4', { class: 'mp-lane__caption' }, `Accelerating · ${accels.length}`),
    accels.length
      ? el('ul', { class: 'mp-list' }, ...accels.map(renderAccelItem))
      : el('p', { class: 'mp-lane__empty' }, 'No accelerations cleared the confidence bar this week.'),
  );

  const coolingLane = el('div', { class: 'mp-lane mp-lane--cooling' },
    el('h4', { class: 'mp-lane__caption' }, `Cooling · ${coolings.length}`),
    coolings.length
      ? el('ul', { class: 'mp-list' }, ...coolings.map(renderCoolingItem))
      : el('p', { class: 'mp-lane__empty' }, 'No coolings cleared the confidence bar this week.'),
  );

  const skillLane = el('div', { class: 'mp-lane mp-lane--skill' },
    el('h4', { class: 'mp-lane__caption' }, `Skill demand shifts · ${skills.length}`),
    skills.length
      ? el('ul', { class: 'mp-list' }, ...skills.map(renderSkillItem))
      : el('p', { class: 'mp-lane__empty' }, 'No skill-level shifts cleared the bar this week.'),
  );

  lanes.appendChild(accelLane);
  lanes.appendChild(coolingLane);
  lanes.appendChild(skillLane);
  section.appendChild(lanes);

  // Cluster coverage strip
  section.appendChild(renderClusterCoverage(doc.cluster_coverage_health));

  // Methodology footnote
  section.appendChild(el('footer', { class: 'mp-footer' },
    el('small', {},
      'Items marked benchmark-comparable can be cross-read against the underlying cohort data. ',
      'Items marked overlay-only have no benchmark cell in V1 — the demand signal stands alone. ',
      'Confidence tier reflects evidence weight and snapshot freshness; THIN-tier signals are suppressed.',
    ),
  ));

  target.replaceChildren(section);
}
