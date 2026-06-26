/* ──────────────────────────────────────────────────────────────────────
   PATH COMPARISON ENGINE  ·  PCC core engine
   Compare two professional trajectories side by side. PCV, percentile,
   risk-adjusted return — which path wins, and by how much?
   ────────────────────────────────────────────────────────────────────── */

import { CLUSTERS, ROLES, rolePrior, rolesForCluster } from './professional-capital-value.js';
import { getDiscountRate, discountPathFor } from '../data/benchmarks.js';
import { getRoleCityOverlayByBenchmark, shouldRender } from '../data/market-overlay.js';
import { renderOverlayCell } from './path-comparison-overlay.js';

export const meta = {
  framework: 'PCC',
  formula: 'ΔPCV = PCV_B − PCV_A',
};

export const context = {
  when: 'Before any decision between two clearly defined trajectories — stay vs go, current cluster vs target cluster, two competing offers, two firm tiers. Returns the PCV delta and a risk-adjusted view.',
  returns: 'PCV for each path, delta in ₹ Cr, risk-adjusted comparison, and the assumption breakdown that drives the difference.',
  limits: 'Two paths only — for three or more, run pairwise. Comparison assumes both paths are reachable; the entry probability question lives in Founder EV (in build).',
};

export const schema = [
  {
    key: 'pathAComp',
    label: 'Path A · current compensation',
    kind: 'range',
    min: 4, max: 200, step: 0.5,
    format: v => `₹${v.toFixed(1)} L`,
    hint: 'Starting compensation in Path A.',
  },
  {
    key: 'pathACluster',
    label: 'Path A · profession',
    kind: 'select',
    options: CLUSTERS,
    onChange(state) {
      const list = ROLES[state.pathACluster];
      state.pathARole = list ? list[0].value : null;
      const p = rolePrior(state.pathACluster, state.pathARole);
      if (p) { state.pathAGrowth = p.growth; state.pathAVol = p.vol; }
    },
  },
  {
    key: 'pathARole',
    label: 'Path A · role',
    kind: 'select',
    dependsOn: 'pathACluster',
    getOptions: (state) => rolesForCluster(state.pathACluster),
    onChange(state) {
      const p = rolePrior(state.pathACluster, state.pathARole);
      if (p) { state.pathAGrowth = p.growth; state.pathAVol = p.vol; }
    },
  },
  {
    key: 'pathAGrowth',
    label: 'Path A · growth rate',
    kind: 'range',
    min: 4, max: 22, step: 0.5,
    format: v => `${v.toFixed(1)}%`,
  },
  {
    key: 'pathAVol',
    label: 'Path A · volatility',
    kind: 'range',
    min: 0, max: 1, step: 0.05,
    format: v => v.toFixed(2),
  },

  {
    key: 'pathBComp',
    label: 'Path B · starting compensation',
    kind: 'range',
    min: 4, max: 200, step: 0.5,
    format: v => `₹${v.toFixed(1)} L`,
    hint: 'Starting compensation in Path B.',
  },
  {
    key: 'pathBCluster',
    label: 'Path B · profession',
    kind: 'select',
    options: CLUSTERS,
    onChange(state) {
      const list = ROLES[state.pathBCluster];
      state.pathBRole = list ? list[0].value : null;
      const p = rolePrior(state.pathBCluster, state.pathBRole);
      if (p) { state.pathBGrowth = p.growth; state.pathBVol = p.vol; }
    },
  },
  {
    key: 'pathBRole',
    label: 'Path B · role',
    kind: 'select',
    dependsOn: 'pathBCluster',
    getOptions: (state) => rolesForCluster(state.pathBCluster),
    onChange(state) {
      const p = rolePrior(state.pathBCluster, state.pathBRole);
      if (p) { state.pathBGrowth = p.growth; state.pathBVol = p.vol; }
    },
  },
  {
    key: 'pathBGrowth',
    label: 'Path B · growth rate',
    kind: 'range',
    min: 4, max: 22, step: 0.5,
    format: v => `${v.toFixed(1)}%`,
  },
  {
    key: 'pathBVol',
    label: 'Path B · volatility',
    kind: 'range',
    min: 0, max: 1, step: 0.05,
    format: v => v.toFixed(2),
  },

  {
    key: 'discountRate',
    label: 'Discount rate',
    kind: 'range',
    min: 4, max: 15, step: 0.5,
    format: v => `${v.toFixed(1)}%`,
  },
  {
    key: 'horizonYears',
    label: 'Horizon',
    kind: 'range',
    min: 10, max: 40, step: 1,
    format: v => `${v} years`,
  },
];

export function defaults(profile) {
  const clusterA = (profile && ROLES[profile.cluster]) ? profile.cluster : 'finance';
  const roleA = (profile && rolePrior(clusterA, profile.role)) ? profile.role : ROLES[clusterA][0].value;
  const pA = rolePrior(clusterA, roleA);

  // Choose a sensible Path B contrast — adjacent higher-growth cluster
  const clusterB = clusterA === 'finance' ? 'consulting'
                 : clusterA === 'consulting' ? 'technology'
                 : clusterA === 'technology' ? 'product_design'
                 : 'finance';
  const roleB = ROLES[clusterB][Math.floor(ROLES[clusterB].length / 2)].value;
  const pB = rolePrior(clusterB, roleB);

  const compA = (profile && typeof profile.currentComp === 'number') ? profile.currentComp : pA.median;
  // Path-specific discount rates: each path's career risk premium maps to a different discount.
  // We surface both and use the average as the single user-facing rate (overridable).
  const pathADiscountPath = discountPathFor(clusterA, roleA);
  const pathBDiscountPath = discountPathFor(clusterB, roleB);
  const dA = getDiscountRate(pathADiscountPath) * 100;
  const dB = getDiscountRate(pathBDiscountPath) * 100;
  const dAvg = Math.round(((dA + dB) / 2) * 100) / 100;
  return {
    pathAComp: compA,
    pathACluster: clusterA,
    pathARole: roleA,
    pathAGrowth: pA.growth,
    pathAVol: pA.vol,
    pathBComp: Math.round(pB.median),
    pathBCluster: clusterB,
    pathBRole: roleB,
    pathBGrowth: pB.growth,
    pathBVol: pB.vol,
    discountRate: dAvg,
    horizonYears: 30,
    _pathADiscount: dA, _pathBDiscount: dB,
    _pathADiscountPath: pathADiscountPath, _pathBDiscountPath: pathBDiscountPath,
    /* Profile city captured for the market-overlay column. Not used by
       any compute() math; passed through to interpret() so the overlay
       lookup can resolve a city_key. Null is acceptable — overlay
       column silently omits when no city resolves. */
    _profileCity: profile?.city || null,
  };
}

function projectPCV(comp, growth, vol, discount, horizon) {
  const g = growth / 100, d = discount / 100;
  const haircut = 0.3 * vol;
  let pv = 0, nominal = 0;
  const expected = [], discounted = [];
  for (let t = 0; t < horizon; t++) {
    const e = comp * Math.pow(1 + g, t) * (1 - haircut);
    const pvT = e / Math.pow(1 + d, t);
    expected.push(e);
    discounted.push(pvT);
    pv += pvT;
    nominal += e;
  }
  return { pv, nominal, expected, discounted };
}

export function compute(state) {
  // Each path uses its own path-specific discount rate, sourced from
  // common_drivers.discount_rate.career_risk_premium_by_path. The user-set
  // discountRate slider is treated as a delta applied to both.
  const dAvgDefault = ((state._pathADiscount || state.discountRate) + (state._pathBDiscount || state.discountRate)) / 2;
  const userDelta = state.discountRate - dAvgDefault;
  const dA = (state._pathADiscount || state.discountRate) + userDelta;
  const dB = (state._pathBDiscount || state.discountRate) + userDelta;
  const pathA = projectPCV(state.pathAComp, state.pathAGrowth, state.pathAVol, dA, state.horizonYears);
  const pathB = projectPCV(state.pathBComp, state.pathBGrowth, state.pathBVol, dB, state.horizonYears);

  const pvACr = pathA.pv / 100;
  const pvBCr = pathB.pv / 100;
  const deltaCr = pvBCr - pvACr;
  const deltaPct = pvACr > 0 ? (deltaCr / pvACr) : 0;

  // Find breakeven year — when cumulative B catches up to cumulative A
  let cumA = 0, cumB = 0, breakeven = null;
  for (let t = 0; t < state.horizonYears; t++) {
    cumA += pathA.discounted[t];
    cumB += pathB.discounted[t];
    if (breakeven === null && cumB >= cumA && state.pathBComp <= state.pathAComp) breakeven = t;
  }

  const winner = deltaCr > 0 ? 'B' : 'A';
  const winnerCluster = state.pathBCluster.replace(/_/g, ' ');
  const loserCluster = state.pathACluster.replace(/_/g, ' ');

  const years = Array.from({ length: state.horizonYears }, (_, i) => 2026 + i);

  return {
    pvACr, pvBCr, deltaCr, deltaPct, breakeven, winner,

    headline: {
      label: `Path Comparison · ΔPCV`,
      value: Math.abs(deltaCr),
      formatted: `${deltaCr >= 0 ? '+' : '−'}${Math.abs(deltaCr).toFixed(2)}`,
      formatter: v => `${deltaCr >= 0 ? '+' : '−'}${Math.abs(v).toFixed(2)}`,
      unit: '₹ Cr',
      sub: [
        { label: 'Path A · PCV',  value: `₹${pvACr.toFixed(2)} Cr` },
        { label: 'Path B · PCV',  value: `₹${pvBCr.toFixed(2)} Cr` },
        { label: 'Winner',        value: `Path ${winner}` },
        { label: 'Lift',          value: `${deltaCr >= 0 ? '+' : ''}${(deltaPct * 100).toFixed(0)}%` },
      ],
    },

    chart: {
      type: 'line',
      title: 'Annual compensation · two paths',
      years,
      yFormatter: v => `₹${v.toFixed(0)}L`,
      series: [
        { label: 'Path A', color: 'var(--data-blue)', values: pathA.expected, width: 2, fill: false },
        { label: 'Path B', color: 'var(--accent)',    values: pathB.expected, width: 2.5, fill: true },
      ],
    },

    rail: [
      { label: 'Path A · PCV',  value: `₹${pvACr.toFixed(2)} Cr`, sub: `${state.pathAGrowth}% growth · vol ${state.pathAVol.toFixed(2)}` },
      { label: 'Path B · PCV',  value: `₹${pvBCr.toFixed(2)} Cr`, sub: `${state.pathBGrowth}% growth · vol ${state.pathBVol.toFixed(2)}` },
      { label: 'Delta',         value: `${deltaCr >= 0 ? '+' : ''}₹${deltaCr.toFixed(2)} Cr`, sub: 'in favor of Path ' + winner },
      { label: breakeven !== null ? 'Breakeven' : 'Risk-adjusted',
        value: breakeven !== null ? `Y${breakeven}` : `${state.pathAVol < state.pathBVol ? 'A' : 'B'} less risky`,
        sub: breakeven !== null ? 'Path B overtakes A' : 'lower volatility wins' },
    ],
  };
}

export function interpret(result, state) {
  const { pvACr, pvBCr, deltaCr, deltaPct, breakeven, winner } = result;

  let what;
  if (Math.abs(deltaCr) < 0.5) {
    what = `The two paths are essentially equivalent in PCV terms — Path A: ₹${pvACr.toFixed(2)} Cr, Path B: ₹${pvBCr.toFixed(2)} Cr.
        A <strong>${(Math.abs(deltaPct) * 100).toFixed(0)}%</strong> gap is below the noise floor of these assumptions.
        Decide on non-financial grounds — interest, optionality, identity, energy.`;
  } else if (winner === 'B') {
    what = `Path B wins by <strong>+₹${deltaCr.toFixed(2)} Cr</strong> over the horizon — a
        <strong>${(deltaPct * 100).toFixed(0)}%</strong> lift. ${breakeven !== null
          ? `Even with a lower starting compensation, Path B's higher growth lets it overtake Path A by year ${breakeven}.`
          : `Path B's combination of starting compensation and growth dominates.`}`;
  } else {
    what = `Path A wins by <strong>+₹${Math.abs(deltaCr).toFixed(2)} Cr</strong> over the horizon —
        <strong>${(Math.abs(deltaPct) * 100).toFixed(0)}%</strong> higher. The grass is not greener.
        Path B's headline growth doesn't survive the volatility haircut and discounting.`;
  }

  const how = `Three drivers determine the outcome: starting compensation, growth rate, and volatility. A higher growth rate
      can overcome a lower starting compensation given enough horizon — but only if the volatility haircut doesn't eat
      the gain. Path A volatility ${state.pathAVol.toFixed(2)} produces a ${(0.3 * state.pathAVol * 100).toFixed(0)}% haircut;
      Path B volatility ${state.pathBVol.toFixed(2)} produces a ${(0.3 * state.pathBVol * 100).toFixed(0)}% haircut.
      The chart shows the haircut-adjusted curves — the area under each is the nominal PCV contribution.`;

  let next;
  if (Math.abs(deltaCr) < 0.5) {
    next = `Paths are close. Differentiate on optionality: run <a href="#/tools/trajectory-engine">Trajectory Engine</a>
        on each to see which has more upside under a future inflection. Or compare cohort positions via
        <a href="#/tools/cohort-benchmark">Cohort Benchmark</a> — sometimes the lower-PCV path puts you in a
        better-positioned cohort.`;
  } else if (winner === 'B' && state.pathBVol > 0.5) {
    next = `Path B wins on expected PCV but carries higher volatility. <a href="#/tools/career-volatility-index">CVI</a>
        on the Path B role will decompose where that risk lives. If automation or sector compression is the dominant driver,
        Path B's PCV advantage may not survive a 2008-scale stress test (Recession Stress Test in build).`;
  } else {
    next = `Strong winner. Lock the decision. Then re-run <a href="#/tools/professional-capital-value">PCV</a> on the
        chosen path with refined assumptions, and <a href="#/tools/cohort-benchmark">Cohort Benchmark</a> the entry
        compensation against the cohort to confirm you're not underpriced on entry.`;
  }

  return [
    { label: 'What this means',  body: what },
    { label: 'How to read this', body: how },
    { label: 'What to do next',  body: next },
    /* ─ Live market overlay row — Phase 3 ─────────────────────────────
       This block carries two mount placeholders (one per path). A
       module-level MutationObserver below detects them entering the
       DOM and fills them via the shared overlay service. The block
       quietly disappears (mount returns null) when the overlay is
       absent, stale, or silent. Comparison math is untouched. */
    {
      label: 'Live market signal',
      body: _renderOverlayBlock(state),
    },
  ];
}

/* ══════════════════════════════════════════════════════════════════
   MARKET OVERLAY MOUNTING (Phase 3)

   interpret() embeds two `[data-pco-mount]` placeholders into the
   "Live market signal" block (one per path). When the tool shell
   renders this HTML, a module-level MutationObserver detects new
   placeholders and asynchronously mounts overlay content via the
   shared overlay service. All gating + benchmark-comparability live
   in market-overlay.js — this file only mounts.

   If profile.city was unavailable, or any leg of the overlay lookup
   returns null, the placeholder renders an em-dash and the comparison
   table stands on its benchmark math alone.
   ══════════════════════════════════════════════════════════════════ */

function _renderOverlayBlock(state) {
  const city = state._profileCity || '';
  if (!city) {
    return `<div class="pco-host pco-host--no-city">
      <div class="pco-empty-note">
        Live market signal is unavailable — no city resolved from your profile.
        Set a city in your profile to enable demand and momentum data.
      </div>
    </div>`;
  }
  // Build two mount placeholders. Observer below fills each.
  const cityAttr = String(city).replace(/"/g, '&quot;');
  return `<div class="pco-host">
    <div class="pco-pair">
      <div class="pco-side">
        <div class="pco-side__h">Path A · ${escapeAttr(state.pathARole)}</div>
        <div data-pco-mount
             data-bench-cluster="${escapeAttr(state.pathACluster)}"
             data-bench-role="${escapeAttr(state.pathARole)}"
             data-city="${cityAttr}">
          <span class="pco-loading">Loading market signal…</span>
        </div>
      </div>
      <div class="pco-side">
        <div class="pco-side__h">Path B · ${escapeAttr(state.pathBRole)}</div>
        <div data-pco-mount
             data-bench-cluster="${escapeAttr(state.pathBCluster)}"
             data-bench-role="${escapeAttr(state.pathBRole)}"
             data-city="${cityAttr}">
          <span class="pco-loading">Loading market signal…</span>
        </div>
      </div>
    </div>
  </div>`;
}

function escapeAttr(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined' && !window.__verastraPathCompOverlayInstalled) {
  window.__verastraPathCompOverlayInstalled = true;
  _installPathComparisonOverlayObserver();
}

function _installPathComparisonOverlayObserver() {
  const fillMount = async (el) => {
    if (el.dataset.pcoMounted === '1') return;
    el.dataset.pcoMounted = '1';
    const benchCluster = el.dataset.benchCluster;
    const benchRole = el.dataset.benchRole;
    const city = el.dataset.city;
    let overlay = null;
    try {
      const result = await getRoleCityOverlayByBenchmark(benchCluster, benchRole, city);
      if (result && shouldRender(result.interpretation)) {
        const doc = result.doc;
        const interp = result.interpretation;
        const w = doc.demand?.weighted_evidence || 0;
        const intensityLabel = w >= 25 ? 'material' : w >= 10 ? 'moderate' : w > 0 ? 'thin' : 'none';
        const dDir = doc.momentum?.direction;
        const momentumLabel = dDir === 'accelerating' ? 'rising'
                            : dDir === 'cooling' ? 'falling'
                            : dDir === 'stable' ? 'flat' : null;
        overlay = {
          intensity: intensityLabel,
          momentum: momentumLabel,
          confidence_tier: interp.confidence_tier,
          benchmark_comparable: interp.benchmark_comparable,
          can_make_comparative_claim: interp.can_make_comparative_claim,
          snapshot_ts: interp.snapshot_ts,
        };
      }
    } catch (err) {
      console.warn('[path-comparison] overlay mount failed:', err);
    }
    if (!el.isConnected) return;
    // Use the shared renderer from path-comparison-overlay.js
    renderOverlayCell(el, overlay);
  };

  const scanAndFill = (root) => {
    root.querySelectorAll('[data-pco-mount]').forEach(fillMount);
  };

  const observer = new MutationObserver(muts => {
    for (const m of muts) {
      for (const node of m.addedNodes) {
        if (node.nodeType !== 1) continue;
        if (node.matches?.('[data-pco-mount]')) fillMount(node);
        else if (node.querySelectorAll) scanAndFill(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  // Scan once in case interpret() has already rendered before observer attached
  scanAndFill(document);
}

export const related = [
  { slug: 'professional-capital-value', name: 'Professional Capital Value' },
  { slug: 'trajectory-engine',          name: 'Trajectory Engine' },
  { slug: 'career-volatility-index',    name: 'Career Volatility Index' },
  { slug: 'cohort-benchmark',           name: 'Cohort Benchmark' },
];

export const related_methodology = [
  { name: 'PCC · Pairwise comparison' },
  { name: 'Volatility haircut interaction' },
];
