/* ──────────────────────────────────────────────────────────────────────
   PROFESSIONAL CAPITAL VALUE  ·  HCAM core engine

   PCV = Σ_{t=0..T-1} [ C_0 · (1+g)^t · (1 − ν·vol) ] / (1+d)^t

   Phase 5 refactor: this engine no longer carries hand-typed priors.
   Cluster / role taxonomy, compensation medians, growth defaults,
   discount rates, and volatility readings all come from benchmarks.js,
   which reads benchmarks_master.json as its source of truth.

   What is benchmark-driven:
     - cluster / role taxonomy (15 clusters, ~60 mapped roles)
     - default median compensation per role (from compensation_lpa cells)
     - default growth rate (from common_drivers.salary_growth_rate by career stage)
     - default discount rate (from common_drivers.discount_rate by career risk path)
     - default volatility (from career_volatility_index_extended, 0.0-3.0 scale)
     - city CoL adjuster (from city_cost_of_living.ct_multiplier)

   What remains heuristic:
     - The DCF formulation itself (modelling decision)
     - The ν=0.3 volatility haircut sensitivity (Verastra calibration)
     - User overrides via sliders
   ────────────────────────────────────────────────────────────────────── */

import {
  listClusters, listRoles, roleDescriptor,
  getRoleCompensation, getRoleCVI,
  careerStageGrowth, careerStageForExperience,
  getDiscountRate, discountPathFor,
  getAllCities, getCity, mumbaiBaseline,
  CLUSTER_MAP, ROLE_MAP,
} from '../data/benchmarks.js';

export const meta = {
  framework: 'HCAM',
  formula: 'PCV = Σ E[C_t] / (1+d)^t',
};

export const context = {
  when: 'Before any major career decision — an offer, a sector move, an MBA, a city change. Returns the discounted present value of the current trajectory.',
  returns: 'A single ₹ figure plus cohort percentile, with sensitivity to growth and discount rate visible.',
  limits: 'PCV is a point estimate. For the full distribution under stochastic comp paths see Monte Carlo Trajectory (in build). Recession scenarios live in Recession Stress Test (in build).',
};

/* ── Schema ──────────────────────────────────────────────────────── */

const CLUSTER_OPTIONS = listClusters();

export const schema = [
  {
    key: 'currentComp',
    label: 'Current annual compensation',
    kind: 'range',
    min: 4, max: 200, step: 0.5,
    format: v => `₹${v.toFixed(1)} L`,
    hint: 'Total fixed + variable, gross of tax.',
  },
  {
    key: 'cluster',
    label: 'Profession',
    kind: 'select',
    options: CLUSTER_OPTIONS,
    onChange(state) {
      const rolesList = listRoles(state.cluster);
      state.role = rolesList[0]?.value || null;
      applyRoleDefaults(state);
    },
  },
  {
    key: 'role',
    label: 'Role',
    kind: 'select',
    dependsOn: 'cluster',
    getOptions: (state) => listRoles(state.cluster),
    hint: 'Sets benchmark-driven defaults for compensation, growth, discount, volatility.',
    onChange(state) { applyRoleDefaults(state); },
  },
  {
    key: 'yearsExp',
    label: 'Years of experience',
    kind: 'range',
    min: 0, max: 30, step: 1,
    format: v => `${v} yr`,
    hint: 'Sets the career-stage growth default (junior / manager / senior / leadership).',
    onChange(state) { applyGrowthDefault(state); },
  },
  {
    key: 'horizonYears',
    label: 'Horizon',
    kind: 'range',
    min: 10, max: 40, step: 1,
    format: v => `${v} years`,
  },
  {
    key: 'growthRate',
    label: 'Expected growth rate',
    kind: 'range',
    min: 4, max: 25, step: 0.5,
    format: v => `${v.toFixed(1)}%`,
    hint: 'Nominal annual compensation growth. Default from career-stage curve (Deloitte/Aon 2026).',
  },
  {
    key: 'discountRate',
    label: 'Discount rate',
    kind: 'range',
    min: 4, max: 15, step: 0.25,
    format: v => `${v.toFixed(2)}%`,
    hint: 'Risk-free (7% G-Sec 10yr) + path-specific career risk premium.',
  },
  {
    key: 'volatility',
    label: 'Volatility',
    kind: 'range',
    min: 0, max: 1, step: 0.05,
    format: v => v.toFixed(2),
    hint: 'Career volatility (0-1 scale). Converted from published CVI (0-3 scale, Mumbai Big-4 audit = 1.0 baseline).',
  },
  {
    key: 'city',
    label: 'City',
    kind: 'select',
    getOptions: () => cityOptionsForSchema(),
    hint: 'Applies ct_multiplier from Numbeo June 2026.',
  },
];

function cityOptionsForSchema() {
  const cities = getAllCities();
  const out = [{ value: 'none', label: '— no adjustment —' }];
  for (const c of cities) out.push({ value: c.key, label: c.label });
  return out;
}

/* ── Defaults ────────────────────────────────────────────────────── */

function applyRoleDefaults(state) {
  const comp = getRoleCompensation(state.cluster, state.role);
  if (comp) {
    state.currentComp = round1(comp.median);
    state._compSpread = { low: comp.low, median: comp.median, high: comp.high, tier: comp.tier, source: comp.source };
  }
  const cvi = getRoleCVI(state.cluster, state.role);
  if (cvi) {
    state.volatility = clamp(cvi.value / 3, 0, 1);
    state._publishedCVI = cvi.value;
    state._cviSource = cvi.source;
  } else {
    state.volatility = 0.33; // sensible default = CVI 1.0 baseline
    state._publishedCVI = null;
  }
  const path = discountPathFor(state.cluster, state.role);
  state.discountRate = round2(getDiscountRate(path) * 100);
  state._discountPath = path;
  applyGrowthDefault(state);
}

function applyGrowthDefault(state) {
  const stage = careerStageForExperience(state.yearsExp || 0);
  const g = careerStageGrowth(stage);
  if (g) {
    state.growthRate = round1(g.median * 100);
    state._growthStage = stage;
  }
}

export function defaults(profile) {
  const clusterKey = (profile && CLUSTER_MAP[profile.cluster]) ? profile.cluster : 'finance';
  const rolesList = listRoles(clusterKey);
  let roleKey = profile?.role;
  if (!roleKey || !roleDescriptor(clusterKey, roleKey)) {
    roleKey = rolesList[0]?.value;
  }
  const yearsExp = profile?.yearsExp ?? 3;
  const state = {
    cluster: clusterKey,
    role: roleKey,
    yearsExp,
    horizonYears: 30,
    city: profile?.city && getCity(profile.city) ? profile.city : 'none',
  };
  applyRoleDefaults(state);
  if (profile && typeof profile.currentComp === 'number') state.currentComp = profile.currentComp;
  return state;
}

/* ── Compute ─────────────────────────────────────────────────────── */

export function compute(state) {
  let comp = state.currentComp;

  // Apply city adjustment via ct_multiplier (relative purchasing power)
  let cityAdjuster = 1.0;
  let cityLabel = null;
  if (state.city && state.city !== 'none') {
    const city = getCity(state.city);
    if (city) {
      cityAdjuster = city.ctMultiplier;
      cityLabel = city.label;
    }
  }
  const effectiveComp = comp; // PCV computed on nominal; city adjuster surfaced as a side metric

  const g = state.growthRate / 100;
  const d = state.discountRate / 100;
  const nu = 0.3;
  const haircut = nu * state.volatility;
  const T = state.horizonYears;

  const years = [];
  const expected = [];
  const discounted = [];
  let pv = 0, nominal = 0;

  for (let t = 0; t < T; t++) {
    const exp = effectiveComp * Math.pow(1 + g, t) * (1 - haircut);
    const pvT = exp / Math.pow(1 + d, t);
    years.push(new Date().getFullYear() + t);
    expected.push(exp);
    discounted.push(pvT);
    pv += pvT;
    nominal += exp;
  }

  const pcvCr = pv / 100;
  const nominalCr = nominal / 100;
  const drag = 1 - (pv / nominal);

  // Cohort percentile against the role's compensation spread (if known)
  let percentile = 50;
  const spread = state._compSpread;
  if (spread && spread.median > 0) {
    const sigma = Math.max(2, (spread.high - spread.low) / 2);
    const z = (state.currentComp - spread.median) / sigma;
    percentile = Math.max(1, Math.min(99, Math.round(50 + 25 * tanh(z))));
  }

  // City real-comp side metric
  const cityRealComp = cityAdjuster !== 1.0 ? state.currentComp * cityAdjuster : null;

  return {
    pcvCr, nominalCr, drag, percentile, state,
    years, expected, discounted,
    cityAdjuster, cityLabel, cityRealComp,

    headline: {
      label: 'Professional Capital Value',
      value: pcvCr,
      formatted: pcvCr.toFixed(2),
      formatter: v => v.toFixed(2),
      unit: '₹ Cr',
      sub: [
        { label: 'Cohort percentile',  value: `${percentile}th` },
        { label: 'Nominal lifetime',   value: `₹${nominalCr.toFixed(2)} Cr` },
        { label: 'Volatility drag',    value: `${(haircut * 100).toFixed(0)}%` },
        { label: 'Time-value drag',    value: `${(drag * 100).toFixed(0)}%` },
      ],
    },

    chart: {
      type: 'line',
      title: 'Annual compensation · expected vs discounted',
      years,
      yFormatter: v => `₹${v.toFixed(0)}L`,
      series: [
        { label: 'Expected (after haircut)',  color: 'var(--accent)',    values: expected,   width: 2.5, fill: true },
        { label: 'Discounted to present',     color: 'var(--data-blue)', values: discounted, width: 1.6, fill: false, dashed: true },
      ],
    },

    rail: [
      {
        label: 'Median (cohort)',
        value: spread ? `₹${spread.median.toFixed(0)}L` : '—',
        sub: spread ? `${state.currentComp >= spread.median ? '+' : ''}${(state.currentComp - spread.median).toFixed(0)}L vs you` : 'no benchmark cell',
      },
      {
        label: 'Published CVI',
        value: state._publishedCVI != null ? state._publishedCVI.toFixed(2) : '—',
        sub: state._publishedCVI != null ? `${state._cviSource || 'extended'} · 0-3 scale` : 'unmapped',
      },
      {
        label: 'Discount path',
        value: state._discountPath || '—',
        sub: `${state.discountRate.toFixed(2)}% effective`,
      },
      cityRealComp != null ? {
        label: `Real in ${cityLabel}`,
        value: `₹${cityRealComp.toFixed(1)}L`,
        sub: `ct ${cityAdjuster.toFixed(2)}× Mumbai`,
      } : {
        label: 'City adjuster',
        value: 'Off',
        sub: 'pick a city below',
      },
    ],
  };
}

/* ── Interpretation ──────────────────────────────────────────────── */

export function interpret(result, state) {
  const { pcvCr, percentile, drag } = result;
  const cd = CLUSTER_MAP[state.cluster];
  const rd = roleDescriptor(state.cluster, state.role);
  const role = rd ? rd.label.replace(/\s*\([^)]*\)\s*$/, '') : 'this role';
  const stageLabel = humanStage(state._growthStage);

  let what;
  if (percentile >= 75) {
    what = `Your trajectory PCV is <strong>₹${pcvCr.toFixed(2)} Cr</strong> at the
        <strong>${percentile}th percentile</strong> of the ${role} cohort — top-quartile position.
        At ${state.yearsExp} years experience you sit in the <strong>${stageLabel}</strong> growth stage
        (median ${state.growthRate}%), with a path-specific discount of ${state.discountRate.toFixed(2)}%.`;
  } else if (percentile >= 50) {
    what = `Your trajectory PCV is <strong>₹${pcvCr.toFixed(2)} Cr</strong> at the
        <strong>${percentile}th percentile</strong> of the ${role} cohort. Above-median position with room above.
        Career-stage growth default (${stageLabel}, ${state.growthRate}%) and path-specific discount
        (${state.discountRate.toFixed(2)}%) both sourced from the benchmark layer.`;
  } else {
    what = `Your trajectory PCV is <strong>₹${pcvCr.toFixed(2)} Cr</strong> at the
        <strong>${percentile}th percentile</strong>. Below-median — the gap to the role's median (₹${(result.state._compSpread?.median || 0).toFixed(0)}L)
        is the first lever to pull. PCV is highly sensitive to entry comp; closing that gap typically
        produces an outsized lifetime lift.`;
  }

  const how = `Two drags shape PCV: the volatility haircut (${(0.3 * state.volatility * 100).toFixed(0)}%, from
      the role's published CVI of ${state._publishedCVI != null ? state._publishedCVI.toFixed(2) : '?'} on the 0-3 scale,
      mapped to a 0-1 vol input via vol = CVI/3) and the time-value drag (${(drag * 100).toFixed(0)}%, from
      compounding discount over ${state.horizonYears} years). The expected curve runs above the discounted curve;
      the gap between them is what compounding gives you only if you collect now and the discount rate
      doesn't eat too much. ${state.cityLabel
        ? `Your selected city ${state.cityLabel} has a Numbeo ct_multiplier of ${state.cityAdjuster.toFixed(2)} —
           real comp in ${state.cityLabel} ≈ ₹${result.cityRealComp.toFixed(1)}L on your nominal ₹${state.currentComp.toFixed(1)}L.`
        : 'No city adjuster applied; select one to see real comp.'}`;

  let next;
  if (state.volatility > 0.5) {
    next = `Your role's published CVI is on the high side (${state._publishedCVI?.toFixed(2)}). Decompose risk
        via <a href="#/tools/career-volatility-index">Career Volatility Index</a> — it surfaces whether
        attrition, automation, sector compression, or layoff frequency dominates, which tells you which
        mitigation to invest in first.`;
  } else if (percentile < 50) {
    next = `Closing the gap to median ₹${(state._compSpread?.median || 0).toFixed(0)}L is the highest-leverage
        move at this position. Compare cluster pivots via <a href="#/tools/path-comparison">Path Comparison</a>
        or test specific skill investments via <a href="#/tools/skill-roi">Skill ROI Engine</a> — both use
        the same benchmark layer that drives this PCV.`;
  } else {
    next = `Solid position. Three productive next moves: <a href="#/tools/cohort-benchmark">Cohort Benchmark</a>
        for a tighter position read using the comp_matrix cells; <a href="#/tools/trajectory-engine">Trajectory Engine</a>
        for a promotion or sector-switch scenario; or <a href="#/tools/city-move-calculator">City Move</a>
        for a geography arbitrage test against all 28 Indian cities.`;
  }

  return [
    { label: 'What this means',  body: what },
    { label: 'How to read this', body: how },
    { label: 'What to do next',  body: next },
  ];
}

export const related = [
  { slug: 'career-volatility-index', name: 'Career Volatility Index' },
  { slug: 'cohort-benchmark',        name: 'Cohort Benchmark' },
  { slug: 'trajectory-engine',       name: 'Trajectory Engine' },
  { slug: 'path-comparison',         name: 'Path Comparison Engine' },
];

export const related_methodology = [
  { name: 'HCAM · DCF construction' },
  { name: 'Career-stage growth curve' },
  { name: 'Path-specific discount rates' },
];

/* ── Backward-compat shims so existing tools that import from this
   module keep working until they switch to benchmarks.js directly.       */

export const CLUSTERS = CLUSTER_OPTIONS;
export const ROLES = (() => {
  const out = {};
  for (const cKey of Object.keys(CLUSTER_MAP)) out[cKey] = listRoles(cKey);
  return out;
})();
export function rolePrior(cluster, role) {
  const comp = getRoleCompensation(cluster, role);
  const cvi = getRoleCVI(cluster, role);
  const stage = careerStageForExperience(3);
  const g = careerStageGrowth(stage);
  const rd = roleDescriptor(cluster, role);
  if (!rd) return null;
  return {
    label: rd.label,
    median: comp?.median || 12,
    sigma: comp ? Math.max(2, (comp.high - comp.low) / 2) : 4,
    growth: g ? g.median * 100 : 10,
    vol: cvi ? clamp(cvi.value / 3, 0, 1) : 0.33,
  };
}
export function rolesForCluster(cluster) { return listRoles(cluster); }

/* ── Helpers ─────────────────────────────────────────────────────── */

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
function round1(x) { return Math.round(x * 10) / 10; }
function round2(x) { return Math.round(x * 100) / 100; }
function tanh(x) { return (Math.exp(x) - Math.exp(-x)) / (Math.exp(x) + Math.exp(-x)); }
function humanStage(s) {
  if (!s) return 'mid-career';
  if (s === 'junior_year_1_to_3') return 'junior (Y1-3)';
  if (s === 'manager_year_4_to_7') return 'manager (Y4-7)';
  if (s === 'senior_year_8_to_15') return 'senior (Y8-15)';
  return 'leadership (Y15+)';
}
