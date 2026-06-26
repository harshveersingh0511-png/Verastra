/* ──────────────────────────────────────────────────────────────────────
   COHORT BENCHMARK  ·  GPF / PCC adjacent engine

   Phase 5 refactor: dual lookup mode.
     Default mode  : aggregate role compensation cells (covers all roles)
     Matrix mode   : 4-axis compensation_matrix_v2 cell lookup
                     (domain × firm_type × experience × career_level)
                     — only applies to finance-domain roles (93 cells)

   When matrix mode resolves to a real cell, the percentile is computed
   against THAT cell's spread, which is meaningfully sharper than the
   role aggregate.
   ────────────────────────────────────────────────────────────────────── */

import {
  listClusters, listRoles, roleDescriptor,
  getRoleCompensation, getMatrixCell,
  getDomains, getFirmTypes, getExperienceBands, getCareerLevels,
  CLUSTER_MAP, ROLE_MAP, DOMAIN_MAP,
} from '../data/benchmarks.js';

export const meta = {
  framework: 'GPF',
  formula: 'percentile = Φ((C − μ) / σ)',
};

export const context = {
  when: 'Before negotiation, before evaluating an offer, after a raise, or when you need to know exactly where you sit against your peer cohort.',
  returns: 'Percentile against the role-calibrated distribution. Optional 4-axis matrix lookup for finance-domain roles uses the comp_matrix_v2 cell directly (sharper percentile).',
  limits: 'Matrix v2 covers finance-domain roles only (93 cells across 12 domains × 10 firm types × 5 experience bands × 7 career levels). Other roles fall back to the aggregate role-level distribution.',
};

const CLUSTER_OPTIONS = listClusters();
const domainOptions = () => {
  const opts = [{ value: 'auto', label: 'Auto (from role)' }];
  for (const d of getDomains()) opts.push({ value: d.value, label: d.label });
  return opts;
};
const firmOptions = () => {
  const opts = [{ value: 'auto', label: 'Auto' }];
  for (const f of getFirmTypes()) opts.push({ value: f.value, label: f.label });
  return opts;
};
const experienceOptions = () => {
  const opts = [{ value: 'auto', label: 'Auto (from years)' }];
  for (const e of getExperienceBands()) opts.push({ value: e.value, label: e.label });
  return opts;
};
const levelOptions = () => {
  const opts = [{ value: 'auto', label: 'Auto (from exp + role)' }];
  for (const l of getCareerLevels()) opts.push({ value: l.value, label: l.label });
  return opts;
};

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
      const list = listRoles(state.cluster);
      state.role = list[0]?.value || null;
    },
  },
  {
    key: 'role',
    label: 'Role',
    kind: 'select',
    dependsOn: 'cluster',
    getOptions: (state) => listRoles(state.cluster),
  },
  {
    key: 'yearsExp',
    label: 'Years of experience',
    kind: 'range',
    min: 0, max: 30, step: 1,
    format: v => `${v} yr`,
  },
  // Optional 4-axis matrix overrides (finance only)
  {
    key: 'domain',
    label: 'Domain (matrix)',
    kind: 'select',
    getOptions: domainOptions,
    hint: 'Compensation matrix v2 covers finance-domain roles only (93 cells). For non-finance roles the cohort falls back to the role aggregate — the source tier shows in the rail.',
  },
  {
    key: 'firmType',
    label: 'Firm type (matrix)',
    kind: 'select',
    getOptions: firmOptions,
    hint: 'Only used when the role maps to a finance domain.',
  },
  {
    key: 'expBand',
    label: 'Experience band (matrix)',
    kind: 'select',
    getOptions: experienceOptions,
    hint: 'Only used when the role maps to a finance domain. Auto derives from years.',
  },
  {
    key: 'careerLevel',
    label: 'Career level (matrix)',
    kind: 'select',
    getOptions: levelOptions,
    hint: 'Only used when the role maps to a finance domain. Auto derives from years + role.',
  },
];

export function defaults(profile) {
  const clusterKey = (profile && CLUSTER_MAP[profile.cluster]) ? profile.cluster : 'finance';
  const rolesList = listRoles(clusterKey);
  let roleKey = profile?.role;
  if (!roleKey || !roleDescriptor(clusterKey, roleKey)) {
    roleKey = rolesList[0]?.value;
  }
  return {
    currentComp: (profile && typeof profile.currentComp === 'number') ? profile.currentComp : 14,
    cluster: clusterKey,
    role: roleKey,
    yearsExp: profile?.yearsExp ?? 3,
    domain: 'auto', firmType: 'auto', expBand: 'auto', careerLevel: 'auto',
  };
}

function resolveExperienceBand(yrs) {
  if (yrs < 3)  return '0_2';
  if (yrs < 6)  return '3_5';
  if (yrs < 10) return '6_9';
  if (yrs < 15) return '10_14';
  return '15_plus';
}

function resolveCareerLevel(yrs) {
  if (yrs < 3)  return 'associate';
  if (yrs < 6)  return 'senior_associate';
  if (yrs < 10) return 'manager';
  if (yrs < 15) return 'senior_manager';
  if (yrs < 20) return 'director_vp';
  return 'partner_md';
}

export function compute(state) {
  // Resolve matrix axes
  const domain = state.domain === 'auto'
    ? (DOMAIN_MAP[state.cluster]?.[state.role] || null)
    : state.domain;
  const firmType = state.firmType === 'auto' ? 'big4' : state.firmType;
  const expBand = state.expBand === 'auto' ? resolveExperienceBand(state.yearsExp) : state.expBand;
  const careerLevel = state.careerLevel === 'auto' ? resolveCareerLevel(state.yearsExp) : state.careerLevel;

  // Try matrix cell first
  let benchmark = null;
  let benchmarkSource = null;
  if (domain) {
    const cell = getMatrixCell(domain, firmType, expBand, careerLevel);
    if (cell) {
      benchmark = { low: cell.low, median: cell.median, high: cell.high, tier: cell.tier };
      benchmarkSource = `matrix · ${domain}|${firmType}|${expBand}|${careerLevel}`;
    }
  }

  // Fallback to role aggregate
  if (!benchmark) {
    const comp = getRoleCompensation(state.cluster, state.role);
    if (comp) {
      benchmark = { low: comp.low, median: comp.median, high: comp.high, tier: comp.tier };
      benchmarkSource = `aggregate · ${comp.source}`;
    }
  }

  if (!benchmark) {
    return {
      error: 'No benchmark data found for this role.',
      headline: { label: 'No benchmark', value: '—', formatted: '—' },
    };
  }

  // Use sigma = (high - low) / 2 as approximation
  const sigma = Math.max(1, (benchmark.high - benchmark.low) / 2);
  const z = (state.currentComp - benchmark.median) / sigma;
  const percentile = Math.max(1, Math.min(99, Math.round(100 * normalCdf(z))));

  // Comp at standard percentiles (using same sigma approximation)
  const compAtPct = pct => benchmark.median + zForPct(pct) * sigma;
  const comp25 = compAtPct(25);
  const comp50 = benchmark.median;
  const comp75 = compAtPct(75);
  const comp90 = compAtPct(90);

  const gapToMedian = state.currentComp - comp50;
  const gapTo75 = state.currentComp - comp75;

  return {
    percentile, z, gapToMedian, gapTo75, comp25, comp50, comp75, comp90,
    benchmark, benchmarkSource, domain, firmType, expBand, careerLevel,

    headline: {
      label: 'Cohort Percentile',
      value: percentile,
      formatted: String(percentile),
      formatter: v => String(Math.round(v)),
      unit: 'th',
      sub: [
        { label: 'Cohort median',  value: `₹${comp50.toFixed(0)}L` },
        { label: 'Gap to median',  value: `${gapToMedian >= 0 ? '+' : ''}₹${gapToMedian.toFixed(0)}L` },
        { label: 'Gap to 75th',    value: `${gapTo75 >= 0 ? '+' : ''}₹${gapTo75.toFixed(0)}L` },
        { label: 'Source',         value: `Tier ${benchmark.tier || 'B'}` },
      ],
    },

    chart: {
      type: 'distribution',
      title: 'Compensation distribution · your position',
      markerZ: z,
      markerLabel: `${percentile}th`,
      series: [
        { label: 'Cohort distribution', color: 'var(--accent)' },
        { label: 'You', color: 'var(--data-blue)' },
      ],
    },

    rail: [
      { label: '25th percentile', value: `₹${comp25.toFixed(0)}L`, sub: 'lower quartile' },
      { label: 'Median (50th)',   value: `₹${comp50.toFixed(0)}L`, sub: 'cohort median' },
      { label: '75th percentile', value: `₹${comp75.toFixed(0)}L`, sub: 'upper quartile' },
      { label: 'Source',          value: benchmarkSource || '—',    sub: `tier ${benchmark.tier || 'B'}` },
    ],
  };
}

export function interpret(result, state) {
  if (result.error) return [{ label: 'Error', body: result.error }];
  const { percentile, gapToMedian, gapTo75, benchmarkSource, comp50, comp75 } = result;
  const rd = roleDescriptor(state.cluster, state.role);
  const role = rd ? rd.label.replace(/\s*\([^)]*\)\s*$/, '') : 'this role';

  const positionPhrase = percentile >= 85 ? `<strong>top-decile</strong> — comfortably above the 75th`
                       : percentile >= 75 ? `<strong>top-quartile</strong> — at or above the 75th`
                       : percentile >= 50 ? `<strong>above-median</strong> — between the 50th and 75th`
                       : percentile >= 25 ? `<strong>below-median</strong> — between the 25th and 50th`
                                          : `<strong>bottom-quartile</strong> — at or below the 25th`;

  const what = `Against the ${role} cohort, you sit at the ${positionPhrase}. The benchmark median is
      ₹${comp50.toFixed(0)}L; you are ${gapToMedian >= 0 ? 'above' : 'below'} it by
      <strong>₹${Math.abs(gapToMedian).toFixed(0)}L</strong>. The 75th percentile sits at ₹${comp75.toFixed(0)}L —
      a ${gapTo75 >= 0 ? 'gap you have already closed' : `target ₹${Math.abs(gapTo75).toFixed(0)}L above you`}.
      Source: ${benchmarkSource}.`;

  const how = `When the matrix lookup resolves a cell, the comparison uses tier-S/A data with sharp granularity
      across firm type and experience. When it falls back to the role aggregate, the median is taken across
      all publishable cells for the role. Either way, percentile is approximated via normal CDF with
      σ = (high − low)/2 — a reasonable proxy when full distributions aren't published.`;

  let next;
  if (percentile >= 80) {
    next = `Well-positioned. Focus next on convexity — <a href="#/tools/path-comparison">Path Comparison</a> to
        stress-test against alternates, or read the OT framework to size strategic options. Comp optimization
        at this percentile has diminishing returns.`;
  } else if (percentile >= 50) {
    next = `Above median with room to the 75th (₹${Math.abs(gapTo75).toFixed(0)}L gap).
        <a href="#/tools/skill-roi">Skill ROI Engine</a> sizes which skill investment most efficiently closes
        the gap. Or test a geography shift via <a href="#/tools/city-move-calculator">City Move</a>.`;
  } else {
    next = `Below median by ₹${Math.abs(gapToMedian).toFixed(0)}L. Diagnose the dominant driver:
        firm tier (matrix lookup with different firm_type), experience tier (try a higher career_level),
        or cluster pivot (<a href="#/tools/path-comparison">Path Comparison</a>).`;
  }

  return [
    { label: 'What this means',  body: what },
    { label: 'How to read this', body: how },
    { label: 'What to do next',  body: next },
  ];
}

export const related = [
  { slug: 'professional-capital-value', name: 'Professional Capital Value' },
  { slug: 'city-move-calculator',       name: 'City Move Calculator' },
  { slug: 'skill-roi',                  name: 'Skill ROI Engine' },
  { slug: 'path-comparison',            name: 'Path Comparison Engine' },
];

export const related_methodology = [
  { name: 'GPF · Cohort distributions' },
  { name: 'Comp matrix v2 · 4-axis lookup' },
];

function normalCdf(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z));
  const dd = 0.3989423 * Math.exp(-z * z / 2);
  let p = dd * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  if (z > 0) p = 1 - p;
  return p;
}

function zForPct(pct) {
  const a = [-3.969683028665376e+1, 2.209460984245205e+2, -2.759285104469687e+2, 1.383577518672690e+2, -3.066479806614716e+1, 2.506628277459239];
  const b = [-5.447609879822406e+1, 1.615858368580409e+2, -1.556989798598866e+2, 6.680131188771972e+1, -1.328068155288572e+1];
  const pp = pct / 100;
  const q = pp - 0.5;
  if (Math.abs(q) <= 0.425) {
    const r = q * q;
    return q * (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5]) /
               (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }
  return 0;
}
