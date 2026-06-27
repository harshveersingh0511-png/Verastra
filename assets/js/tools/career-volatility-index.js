/* ──────────────────────────────────────────────────────────────────────
   CAREER VOLATILITY INDEX  ·  CVI core engine

   Dataset's published formula (career_volatility_index_extended._formula):
     CVI = 0.40·norm_attrition + 0.30·norm_salary_spread
           + 0.20·norm_layoff_freq + 0.10·economic_sensitivity

   Output sits on the dataset's 0.0–3.0 scale where Mumbai Big-4 audit = 1.0
   is the baseline.

   Phase 5 refactor: every component sources from the benchmark layer.
   The hand-typed ROLE_COMPONENTS table is gone.

   Sources:
     - attrition       ← sector_attrition_aon_2024_25 (cluster-mapped)
     - salary_spread   ← (high − low) / median from role's compensation cells
     - layoff_freq     ← monte_carlo_event_probabilities_annual.layoff_*
     - econ_sens       ← demand_growth_yoy_naukri_jobspeak_2025_26 (signed)
     - published CVI   ← career_volatility_index_extended.{cluster}.{role}
                          (surfaced for triangulation)

   What remains heuristic:
     - Normalization constants (attrition_high, spread_high, layoff_high)
       calibrated against dataset's spread of values
     - econ_sensitivity polarity convention (negative demand → high sensitivity)
   ────────────────────────────────────────────────────────────────────── */

import {
  listClusters, listRoles, roleDescriptor,
  getCompensationCells, getRoleCVI,
  getAttritionForCluster, getMcEventProb, getDemandGrowth,
  CLUSTER_MAP, ROLE_MAP,
} from '../data/benchmarks.js';

export const meta = {
  framework: 'CVI',
  formula: 'CVI = 0.40·attrition + 0.30·spread + 0.20·layoff + 0.10·econ',
};

export const context = {
  when: 'Before any move into a higher-volatility role, before founder transitions, or annually as a stability check. Returns the dataset\'s published 0.0–3.0 composite, with the Mumbai Big-4 audit = 1.0 baseline.',
  returns: 'Composite CVI on 0.0–3.0 scale, decomposition of its 4 components, plus a side-by-side comparison with the published CVI value for the same role.',
  limits: 'CVI is a snapshot. Tail risks (2008-scale recessions, regulatory shocks) are not in CVI by construction — see Recession Stress Test (in build).',
};

const WEIGHTS = { attrition: 0.40, spread: 0.30, layoff: 0.20, econ: 0.10 };

// Sector mapping for layoff probability lookup
const CLUSTER_LAYOFF_KEY = {
  finance:                'layoff_financial_services',
  consulting:             'layoff_financial_services',
  technology:             'layoff_product_unicorn',
  product_design:         'layoff_product_unicorn',
  sales:                  'layoff_it_services',
  marketing:              'layoff_it_services',
  operator_founder:       'layoff_product_unicorn',
  law:                    'layoff_financial_services',
  operations:             'layoff_it_services',
  hr:                     'layoff_it_services',
  healthcare:             null, // less applicable
  engineering_non_software: 'layoff_it_services',
  creative_media:         'layoff_product_unicorn',
  academia_research:      null,
  government_psu:         null,
};

// Demand-growth mapping (used for economic sensitivity)
const CLUSTER_DEMAND_KEY = {
  finance:                'accounting_finance',
  consulting:             'consulting_demand_proxy',
  technology:             'specialised_tech',
  product_design:         'product_management_proxy',
  sales:                  'bfs_unicorns',
  marketing:              'bfs_unicorns',
  operator_founder:       'bfs_unicorns',
  law:                    'accounting_finance',
  operations:             'it_services_broad',
  hr:                     'it_services_broad',
  healthcare:             null,
  engineering_non_software: 'it_services_broad',
  creative_media:         'ui_ux_design',
  academia_research:      'education_sector',
  government_psu:         null,
};

const CLUSTER_OPTIONS = listClusters();

export const schema = [
  {
    key: 'cluster',
    label: 'Profession',
    kind: 'select',
    options: CLUSTER_OPTIONS,
    onChange(state) {
      const list = listRoles(state.cluster);
      state.role = list[0]?.value || null;
      seedComponents(state);
    },
  },
  {
    key: 'role',
    label: 'Role',
    kind: 'select',
    dependsOn: 'cluster',
    getOptions: (state) => listRoles(state.cluster),
    hint: 'Sources benchmark data for all four components below.',
    onChange(state) { seedComponents(state); },
  },
  // Component sliders — seeded from benchmark, user can override
  {
    key: 'attrition',
    label: 'Sector attrition (Aon 2024-25)',
    kind: 'range',
    min: 0, max: 0.4, step: 0.005,
    format: v => `${(v * 100).toFixed(1)}%`,
    hint: '5-year cohort exit rate. Default from sector_attrition_aon_2024_25.',
  },
  {
    key: 'salarySpread',
    label: 'Salary spread (high−low)/median',
    kind: 'range',
    min: 0, max: 2.5, step: 0.05,
    format: v => v.toFixed(2),
    hint: 'From compensation_lpa cells of this role.',
  },
  {
    key: 'layoffFreq',
    label: 'Annual layoff probability',
    kind: 'range',
    min: 0, max: 0.15, step: 0.005,
    format: v => `${(v * 100).toFixed(1)}%`,
    hint: 'From monte_carlo_event_probabilities_annual.',
  },
  {
    key: 'econSensitivity',
    label: 'Economic sensitivity',
    kind: 'range',
    min: 0, max: 1, step: 0.05,
    format: v => v.toFixed(2),
    hint: 'From demand_growth_yoy (negative growth → high sensitivity).',
  },
];

function seedComponents(state) {
  // Attrition
  state.attrition = getAttritionForCluster(state.cluster) ?? 0.17;

  // Salary spread
  const cells = getCompensationCells(state.cluster, state.role);
  if (cells && cells.length > 0) {
    const rd = roleDescriptor(state.cluster, state.role);
    const preferred = rd?.cell ? cells.find(c => c.cell === rd.cell || c.cell.endsWith('.' + rd.cell)) : null;
    const pick = preferred || cells[Math.floor((cells.length - 1) / 2)];
    if (pick && pick.median > 0 && pick.high != null && pick.low != null) {
      state.salarySpread = Math.max(0, (pick.high - pick.low) / pick.median);
    } else {
      state.salarySpread = 0.5;
    }
  } else {
    state.salarySpread = 0.5;
  }

  // Layoff frequency
  const layoffKey = CLUSTER_LAYOFF_KEY[state.cluster];
  state.layoffFreq = layoffKey ? (getMcEventProb(layoffKey) ?? 0.05) : 0.02;

  // Economic sensitivity from demand growth — negative demand → high sensitivity
  const demandKey = CLUSTER_DEMAND_KEY[state.cluster];
  const demand = demandKey ? getDemandGrowth(demandKey) : null;
  if (demand == null) {
    state.econSensitivity = 0.5;
  } else {
    // demand ranges roughly -0.14 to +0.60; map to 0..1 with 0 demand → 0.5
    state.econSensitivity = clamp(0.5 - demand, 0, 1);
  }

  // Published CVI for side-by-side display
  const pub = getRoleCVI(state.cluster, state.role);
  state._publishedCVI = pub ? pub.value : null;
  state._publishedCVISource = pub ? pub.source : null;
}

export function defaults(profile) {
  const clusterKey = (profile && CLUSTER_MAP[profile.cluster]) ? profile.cluster : 'finance';
  const rolesList = listRoles(clusterKey);
  let roleKey = profile?.role;
  if (!roleKey || !roleDescriptor(clusterKey, roleKey)) {
    roleKey = rolesList[0]?.value;
  }
  const state = { cluster: clusterKey, role: roleKey };
  seedComponents(state);
  return state;
}

export function compute(state) {
  // Normalize each component into a 0..3 contribution domain.
  // Calibration anchors (Mumbai Big-4 audit = baseline = ~1.0):
  //   attrition 0.17 (national avg) → 1.0
  //   salarySpread 0.5              → 1.0
  //   layoffFreq 0.04               → 1.0
  //   econSensitivity 0.5           → 1.0

  const normAttrition = clamp(state.attrition / 0.17, 0, 3) * 3;
  const normSpread    = clamp(state.salarySpread / 0.5, 0, 3) * 3;
  const normLayoff    = clamp(state.layoffFreq / 0.04, 0, 3) * 3;
  const normEcon      = state.econSensitivity * 3; // already 0-1

  const cvi = clamp(
    WEIGHTS.attrition * normAttrition / 3 +
    WEIGHTS.spread    * normSpread / 3 +
    WEIGHTS.layoff    * normLayoff / 3 +
    WEIGHTS.econ      * normEcon / 3,
    0, 3
  );

  const level = cvi < 0.5  ? 'Low'
              : cvi < 1.25 ? 'Moderate'
              : cvi < 2.0  ? 'Elevated'
                           : 'High';
  const levelColor = cvi < 0.5  ? 'var(--data-teal)'
                   : cvi < 1.25 ? 'var(--accent)'
                   : cvi < 2.0  ? 'var(--data-amber)'
                                : 'var(--data-coral)';

  // Component contributions to CVI
  const contribs = [
    { label: 'Attrition (0.40w)',  raw: state.attrition,       weight: WEIGHTS.attrition, contribution: WEIGHTS.attrition * normAttrition / 3, color: 'var(--data-coral)' },
    { label: 'Salary spread (0.30w)', raw: state.salarySpread,  weight: WEIGHTS.spread,    contribution: WEIGHTS.spread * normSpread / 3,       color: 'var(--accent)' },
    { label: 'Layoff freq (0.20w)', raw: state.layoffFreq,      weight: WEIGHTS.layoff,    contribution: WEIGHTS.layoff * normLayoff / 3,       color: 'var(--data-amber)' },
    { label: 'Econ sens (0.10w)',  raw: state.econSensitivity,  weight: WEIGHTS.econ,      contribution: WEIGHTS.econ * normEcon / 3,           color: 'var(--data-blue)' },
  ];

  const topDriver = [...contribs].sort((a, b) => b.contribution - a.contribution)[0];
  const haircutPct = clamp(0.3 * cvi / 3, 0, 0.3); // PCV-style haircut applied to 0-1 scale

  return {
    cvi, level, levelColor, contribs, topDriver, haircutPct,

    headline: {
      label: 'Career Volatility Index',
      value: cvi,
      formatted: cvi.toFixed(2),
      formatter: v => v.toFixed(2),
      unit: level,
      sub: [
        { label: 'Published',     value: state._publishedCVI != null ? state._publishedCVI.toFixed(2) : '—' },
        { label: 'Mumbai Big-4',  value: '1.00 baseline' },
        { label: 'Top driver',    value: topDriver ? topDriver.label.split(' (')[0] : '—' },
        { label: 'HCAM haircut',  value: `${(haircutPct * 100).toFixed(0)}%` },
      ],
    },

    chart: {
      type: 'bar',
      title: 'Component decomposition · contributions on 0.0–3.0 scale',
      barMax: 1.2,
      bars: contribs.map(c => ({
        label: c.label,
        value: c.contribution * 3,
        display: `+${(c.contribution * 3).toFixed(3)}`,
        color: c.color,
      })),
    },

    rail: [
      { label: 'CVI level',     value: level,                  sub: '0-0.5 L · 0.5-1.25 M · 1.25-2 E · 2+ H' },
      { label: 'Published CVI', value: state._publishedCVI != null ? state._publishedCVI.toFixed(2) : '—', sub: state._publishedCVISource || 'unmapped' },
      { label: 'Top driver',    value: topDriver ? topDriver.label.split(' (')[0] : '—',  sub: `+${topDriver ? (topDriver.contribution * 3).toFixed(3) : '—'}` },
      { label: 'HCAM haircut',  value: `${(haircutPct * 100).toFixed(0)}%`, sub: 'applied to PCV' },
    ],
  };
}

export function interpret(result, state) {
  const { cvi, level, topDriver, haircutPct } = result;
  const published = state._publishedCVI;
  const delta = published != null ? cvi - published : null;

  let what = `Computed CVI for this role is <strong>${cvi.toFixed(2)}</strong> on the 0.0–3.0 scale —
      a <strong>${level}</strong> volatility profile (Mumbai Big-4 audit = 1.0 baseline).`;
  if (published != null) {
    if (Math.abs(delta) < 0.15) {
      what += ` This aligns closely with the dataset's published CVI of ${published.toFixed(2)} for the same role
          (delta ${delta >= 0 ? '+' : ''}${delta.toFixed(2)}) — the components triangulate well.`;
    } else if (delta > 0) {
      what += ` The dataset publishes a CVI of ${published.toFixed(2)} for this role — your computed value is
          <em>${delta.toFixed(2)} higher</em>. That divergence usually comes from a component-level input that's
          atypical for the cohort.`;
    } else {
      what += ` The dataset publishes a CVI of ${published.toFixed(2)} — your computed value is
          <em>${Math.abs(delta).toFixed(2)} lower</em>. The components are reading more benign than the
          published value suggests.`;
    }
  }
  what += ` The dominant driver is <strong>${topDriver ? topDriver.label.split(' (')[0] : 'none'}</strong>.`;

  const how = `The formula is the dataset's own published composition:
      <em>CVI = 0.40·attrition + 0.30·salary_spread + 0.20·layoff_freq + 0.10·econ_sensitivity</em>.
      Each component is normalized so that Mumbai Big-4 audit hits CVI ≈ 1.0 — values above 1.0 indicate
      above-baseline volatility, values above 2.0 indicate roles that materially deviate from norms
      (founder, crypto/web3, top creator paths). This CVI is consumed by HCAM as a linear haircut on the
      expected compensation curve: at the current value, the PCV haircut is
      <strong>${(haircutPct * 100).toFixed(0)}%</strong>.`;

  let next;
  const driverLabel = topDriver ? topDriver.label.split(' (')[0] : '';
  if (driverLabel === 'Attrition') {
    next = `Attrition is the dominant risk. Cross-cluster mobility is the standard mitigation — modeled in
        <a href="#/tools/path-comparison">Path Comparison</a>. Sector Mobility Index (in build) will offer
        a direct sizing of exit options.`;
  } else if (driverLabel === 'Salary spread') {
    next = `Wide salary spread means the role has high variance across cells — outcome is sensitive to firm tier,
        specialization, and tenure. <a href="#/tools/cohort-benchmark">Cohort Benchmark</a> with explicit
        firm-type and experience selection will sharpen the position read.`;
  } else if (driverLabel === 'Layoff freq') {
    next = `Layoff frequency drives the composite. This is sector-structural, not individual. The mitigation is
        either firm-tier upgrade (Firm Tier Classifier in build) or sector diversification via a portfolio of
        income sources (Portfolio Analyzer in build).`;
  } else if (driverLabel === 'Econ sens') {
    next = `Economic sensitivity dominates — the cluster's demand signal is the trigger. Watch
        <em>demand_growth_yoy</em> publishes quarterly; this CVI will move with it. For now, optionality investments
        are the right hedge — see the <a href="#/methodology">OT framework</a>.`;
  } else {
    next = `Components are roughly balanced. Re-run with realistic best-case inputs to see your floor CVI, and
        worst-case to see your ceiling. Then compare against PCV to see how the volatility haircut shapes lifetime
        capital.`;
  }

  return [
    { label: 'What this means',  body: what },
    { label: 'How to read this', body: how },
    { label: 'What to do next',  body: next },
  ];
}

export const related = [
  { slug: 'professional-capital-value', name: 'Professional Capital Value' },
  { slug: 'skill-roi',                  name: 'Skill ROI Engine' },
  { slug: 'path-comparison',            name: 'Path Comparison Engine' },
  { slug: 'cohort-benchmark',           name: 'Cohort Benchmark' },
];

export const related_methodology = [
  { name: 'CVI · Composite construction' },
  { name: 'Normalization & weights' },
];

function clamp(x, lo, hi) { return Math.max(lo, Math.min(hi, x)); }
