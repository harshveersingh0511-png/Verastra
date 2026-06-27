/* ──────────────────────────────────────────────────────────────────────
   TRAJECTORY ENGINE  ·  PCC core engine
   PCV with mid-path inflections — promotions, sector switches, sabbaticals.
   Lets a user model a non-linear trajectory and compute its PCV under
   the new shape.
   ────────────────────────────────────────────────────────────────────── */

import { CLUSTERS, ROLES, rolePrior, rolesForCluster } from './professional-capital-value.js';
import {
  careerStageGrowth, careerStageForExperience,
  getDiscountRate, discountPathFor,
} from '../data/benchmarks.js';

export const meta = {
  framework: 'PCC',
  formula: 'PCV_traj = Σ E[C_t | shape] / (1 + d)^t',
};

export const context = {
  when: 'When you expect a meaningful trajectory inflection — promotion to senior, switch to a higher-growth cluster, sabbatical, founder pivot. Models the kinked compensation curve PCV alone cannot represent.',
  returns: 'PCV under the inflected trajectory, contribution of each phase, and the delta vs the no-inflection baseline.',
  limits: 'Two-phase model: pre-inflection and post-inflection. For three or more inflections use Path Comparison across multiple trajectory definitions.',
};

export const schema = [
  {
    key: 'currentComp',
    label: 'Current annual compensation',
    kind: 'range',
    min: 4, max: 200, step: 0.5,
    format: v => `₹${v.toFixed(1)} L`,
    hint: 'Starting compensation at year 0.',
  },
  {
    key: 'cluster',
    label: 'Profession (current)',
    kind: 'select',
    options: CLUSTERS,
    onChange(state) {
      const list = ROLES[state.cluster];
      state.role = list ? list[0].value : null;
      const p = rolePrior(state.cluster, state.role);
      if (p) {
        state.preGrowth = p.growth;
        state.preVol = p.vol;
      }
    },
  },
  {
    key: 'role',
    label: 'Role (current)',
    kind: 'select',
    dependsOn: 'cluster',
    getOptions: (state) => rolesForCluster(state.cluster),
    onChange(state) {
      const p = rolePrior(state.cluster, state.role);
      if (p) {
        state.preGrowth = p.growth;
        state.preVol = p.vol;
      }
    },
  },
  {
    key: 'preGrowth',
    label: 'Pre-inflection growth rate',
    kind: 'range',
    min: 4, max: 22, step: 0.5,
    format: v => `${v.toFixed(1)}%`,
  },
  {
    key: 'preVol',
    label: 'Pre-inflection volatility',
    kind: 'range',
    min: 0, max: 1, step: 0.05,
    format: v => v.toFixed(2),
  },
  {
    key: 'inflectionYear',
    label: 'Inflection year',
    kind: 'range',
    min: 1, max: 25, step: 1,
    format: v => `Year ${v}`,
    hint: 'When the trajectory changes — promotion, switch, pivot.',
  },
  {
    key: 'compBump',
    label: 'Compensation step at inflection',
    kind: 'range',
    min: -50, max: 200, step: 5,
    format: v => `${v >= 0 ? '+' : ''}${v}%`,
    hint: 'One-time step change in compensation at the inflection year. Negative for founder pivots and sabbaticals.',
  },
  {
    key: 'postGrowth',
    label: 'Post-inflection growth rate',
    kind: 'range',
    min: 4, max: 22, step: 0.5,
    format: v => `${v.toFixed(1)}%`,
  },
  {
    key: 'postVol',
    label: 'Post-inflection volatility',
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
  const cluster = (profile && ROLES[profile.cluster]) ? profile.cluster : 'finance';
  const role = (profile && rolePrior(cluster, profile.role)) ? profile.role : ROLES[cluster][0].value;
  const p = rolePrior(cluster, role);
  const yearsExp = profile?.yearsExp ?? 3;
  // Pre-inflection: current career-stage growth median
  const preStage = careerStageForExperience(yearsExp);
  const preG = careerStageGrowth(preStage);
  // Post-inflection: next career-stage growth median
  const postStage = careerStageForExperience(yearsExp + 5);
  const postG = careerStageGrowth(postStage);
  // Path-specific discount
  const pathKey = discountPathFor(cluster, role);
  const discount = getDiscountRate(pathKey) * 100;
  return {
    currentComp: (profile && typeof profile.currentComp === 'number') ? profile.currentComp : p.median,
    cluster, role,
    preGrowth: preG ? Math.round(preG.median * 1000) / 10 : p.growth,
    preVol: p.vol,
    inflectionYear: 5,
    compBump: 35, // typical promotion step
    postGrowth: postG ? Math.round(postG.median * 1000) / 10 : Math.max(8, p.growth - 2),
    postVol: p.vol,
    discountRate: Math.round(discount * 100) / 100,
    horizonYears: 30,
    _preStage: preStage, _postStage: postStage, _discountPath: pathKey,
  };
}

function projectPath(currentComp, preG, preV, inflectionYear, compBump, postG, postV, discountRate, horizonYears) {
  const d = discountRate / 100;
  const preHaircut = 0.3 * preV;
  const postHaircut = 0.3 * postV;
  let pv = 0, nominal = 0;
  const years = [], expected = [], discounted = [];
  let compAtInflection = currentComp * Math.pow(1 + preG / 100, inflectionYear);
  const postBase = compAtInflection * (1 + compBump / 100);
  for (let t = 0; t < horizonYears; t++) {
    let e;
    if (t < inflectionYear) {
      e = currentComp * Math.pow(1 + preG / 100, t) * (1 - preHaircut);
    } else {
      const tau = t - inflectionYear;
      e = postBase * Math.pow(1 + postG / 100, tau) * (1 - postHaircut);
    }
    const pvT = e / Math.pow(1 + d, t);
    years.push(2026 + t);
    expected.push(e);
    discounted.push(pvT);
    pv += pvT;
    nominal += e;
  }
  return { pv, nominal, years, expected, discounted };
}

export function compute(state) {
  const traj = projectPath(
    state.currentComp, state.preGrowth, state.preVol,
    state.inflectionYear, state.compBump, state.postGrowth, state.postVol,
    state.discountRate, state.horizonYears
  );

  // Baseline: no inflection — same role priors all the way through
  const baseline = projectPath(
    state.currentComp, state.preGrowth, state.preVol,
    state.horizonYears, 0, state.preGrowth, state.preVol,
    state.discountRate, state.horizonYears
  );

  const pcvCr = traj.pv / 100;
  const baselineCr = baseline.pv / 100;
  const deltaCr = pcvCr - baselineCr;
  const deltaPct = baselineCr > 0 ? (deltaCr / baselineCr) : 0;
  const nominalCr = traj.nominal / 100;
  const drag = 1 - (traj.pv / traj.nominal);

  // Pre and post phase contributions
  let prePV = 0, postPV = 0;
  for (let i = 0; i < traj.discounted.length; i++) {
    if (i < state.inflectionYear) prePV += traj.discounted[i];
    else postPV += traj.discounted[i];
  }

  return {
    pcvCr, baselineCr, deltaCr, deltaPct, nominalCr, drag,
    prePV: prePV / 100, postPV: postPV / 100,

    headline: {
      label: 'Trajectory PCV',
      value: pcvCr,
      formatted: pcvCr.toFixed(2),
      formatter: v => v.toFixed(2),
      unit: '₹ Cr',
      sub: [
        { label: 'Baseline PCV',     value: `₹${baselineCr.toFixed(2)} Cr` },
        { label: 'Delta',            value: `${deltaCr >= 0 ? '+' : ''}₹${deltaCr.toFixed(2)} Cr` },
        { label: 'Delta %',          value: `${deltaPct >= 0 ? '+' : ''}${(deltaPct * 100).toFixed(0)}%` },
        { label: 'Framework',        value: 'PCC' },
      ],
    },

    chart: {
      type: 'line',
      title: 'Trajectory vs baseline · annual compensation',
      years: traj.years,
      yFormatter: v => `₹${v.toFixed(0)}L`,
      series: [
        { label: 'With inflection',  color: 'var(--accent)',    values: traj.expected,    width: 2.5, fill: true  },
        { label: 'Baseline (no inflection)', color: 'var(--data-blue)', values: baseline.expected, width: 1.6, fill: false, dashed: true },
      ],
    },

    rail: [
      { label: 'Pre-inflection PV',  value: `₹${(prePV / 100).toFixed(2)} Cr`,  sub: `years 0–${state.inflectionYear - 1}` },
      { label: 'Post-inflection PV', value: `₹${(postPV / 100).toFixed(2)} Cr`, sub: `years ${state.inflectionYear}–${state.horizonYears}` },
      { label: 'Total trajectory',   value: `₹${pcvCr.toFixed(2)} Cr`,          sub: `${state.horizonYears}y horizon` },
      { label: 'vs baseline',        value: `${deltaCr >= 0 ? '+' : ''}${(deltaPct * 100).toFixed(0)}%`, sub: 'inflection lift' },
    ],
  };
}

export function interpret(result, state) {
  const { pcvCr, baselineCr, deltaCr, deltaPct, postPV, prePV } = result;

  let what;
  if (deltaCr > 0.5) {
    what = `The inflection at year ${state.inflectionYear} adds <strong>+₹${deltaCr.toFixed(2)} Cr</strong> over the
        ${state.horizonYears}-year horizon — a <strong>${(deltaPct * 100).toFixed(0)}%</strong> lift versus continuing
        the current trajectory unchanged. Most of that lift compounds <em>after</em> the step.`;
  } else if (deltaCr > 0) {
    what = `The inflection is positive but modest: <strong>+₹${deltaCr.toFixed(2)} Cr</strong>
        (${(deltaPct * 100).toFixed(0)}%). Worth doing, but not transformational. The case may strengthen at a
        higher comp bump or earlier inflection year.`;
  } else {
    what = `The inflection is value-destructive in PCV terms: <strong>−₹${Math.abs(deltaCr).toFixed(2)} Cr</strong>
        vs baseline. This is the right answer for sabbaticals and founder pivots — they trade PCV for optionality.
        See Optionality Theorem (in build) for the convex-tail valuation.`;
  }

  const how = `The chart shows two compensation curves. The blue dashed line is your baseline (current role priors all the way out).
      The honey line is the trajectory with the inflection. Where the honey line jumps at year ${state.inflectionYear}
      is your comp step (${state.compBump >= 0 ? '+' : ''}${state.compBump}%). The post-inflection growth rate of
      ${state.postGrowth}% determines how the curve shapes after that. ${postPV >= prePV
      ? `Post-inflection contributes <strong>₹${postPV.toFixed(2)} Cr</strong> — more than the pre-phase, which is
        typical when the inflection happens early.`
      : `Pre-inflection contributes <strong>₹${prePV.toFixed(2)} Cr</strong> — more than the post-phase, which usually
        means the inflection is too late in the horizon.`}`;

  let next;
  if (deltaCr < 0) {
    next = `For a PCV-negative trajectory, the case lives outside HCAM. Use <a href="#/methodology">Optionality Theorem</a>
        to size what convex upside you're buying — founder paths and sabbaticals destroy PCV but can create
        non-trivial optionality value. If the optionality case is weak too, reconsider.`;
  } else if (state.inflectionYear > 10) {
    next = `The inflection is late in the horizon. Run again with an earlier inflection year to see how much PCV
        sensitivity you have to timing. Earlier inflections almost always dominate later ones at the same comp step.`;
  } else {
    next = `Test the trajectory against alternatives in <a href="#/tools/path-comparison">Path Comparison Engine</a>,
        which can compare this trajectory directly against a different cluster move. Or run
        <a href="#/tools/career-volatility-index">CVI</a> on the post-inflection role to see what the new
        risk profile looks like.`;
  }

  return [
    { label: 'What this means',  body: what },
    { label: 'How to read this', body: how },
    { label: 'What to do next',  body: next },
  ];
}

export const related = [
  { slug: 'professional-capital-value', name: 'Professional Capital Value' },
  { slug: 'path-comparison',            name: 'Path Comparison Engine' },
  { slug: 'career-volatility-index',    name: 'Career Volatility Index' },
  { slug: 'skill-roi',                  name: 'Skill ROI Engine' },
];

export const related_methodology = [
  { name: 'PCC · Trajectory inflections' },
  { name: 'Compensation step modelling' },
];
