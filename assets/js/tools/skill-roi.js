/* ──────────────────────────────────────────────────────────────────────
   SKILL ROI ENGINE  ·  SST core engine

   Phase 5 refactor: full skill universe from skill_premiums_cross_cluster.
   ~25 skills across 5 categories (finance, tech, product, consulting, universal).
   Each carries low/median/high premium + tier from the dataset.

   Learning hours come from skill_learning_hours_to_proficiency where available.
   Converted to months at the user-set weekly study load.

   Also surfaces the `model_hooks.tool_6_skill_alpha` formula directly:
     alpha = (premium · current_salary · (1 − automation_risk)) / learning_hours
   This is the dataset designer's preferred ROI metric, alongside NHV.

   What is benchmark-driven:
     - skill universe (~25 skills)
     - premium per skill (median, with low/high spread)
     - learning hours per skill (where dataset has them)
     - tier badging

   What remains heuristic:
     - Cost in ₹ (direct outlay) — user input, dataset doesn't expose this
     - Decay rate — modelling parameter
     - Weekly study hours — user input
   ────────────────────────────────────────────────────────────────────── */

import {
  getAllSkills, getLearningHours,
  getRoleAutomationRisk, roleDescriptor,
  CLUSTER_MAP, ROLE_MAP,
} from '../data/benchmarks.js';

export const meta = {
  framework: 'SST',
  formula: 'NHV = Σ premium · decay^m − cost  ·  α = premium · C · (1−auto) / hrs',
};

export const context = {
  when: 'Before any deliberate skill investment — credential, intensive course, fellowship, side project. Returns horizon ROI and the dataset\'s α formula.',
  returns: 'Net horizon value over the evaluation window, payback month, annualized ROI, and the model_hooks-compliant α score (premium-weighted, automation-discounted, per learning-hour).',
  limits: 'Cost is user-set since the dataset doesn\'t expose direct outlay. For complementary stacking, the multi-skill Stacking Engine ships later.',
};

const skillOptions = () => {
  return getAllSkills().map(s => ({
    value: `${s.category}::${s.key}`,
    label: `${s.label}  ·  ${s.category.replace('_skills', '')}`,
  }));
};

function lookupSkill(skillId) {
  if (!skillId) return null;
  const [cat, key] = skillId.split('::');
  return getAllSkills().find(s => s.category === cat && s.key === key) || null;
}

// Approximate cost defaults per skill category (₹L, total outlay incl. opportunity cost)
const CATEGORY_DEFAULT_COST = {
  finance_skills: 3,        // CFA / CPA / FRM — mid-range
  tech_skills: 1.2,
  product_skills: 0.8,
  consulting_skills: 5,    // MBA-adjacent
  universal_skills: 0.5,
};

export const schema = [
  {
    key: 'currentComp',
    label: 'Current annual compensation',
    kind: 'range',
    min: 4, max: 200, step: 0.5,
    format: v => `₹${v.toFixed(1)} L`,
    hint: 'Premium is computed as a percentage of this.',
  },
  {
    key: 'cluster',
    label: 'Profession (for automation discount)',
    kind: 'select',
    options: Object.entries(CLUSTER_MAP).map(([k, v]) => ({ value: k, label: v.label })),
    hint: 'Sets the automation-risk discount in the α formula.',
  },
  {
    key: 'role',
    label: 'Role (for automation discount)',
    kind: 'select',
    dependsOn: 'cluster',
    getOptions: (state) => {
      const rolesObj = ROLE_MAP[state.cluster] || {};
      return Object.entries(rolesObj).map(([k, v]) => ({ value: k, label: v.label }));
    },
  },
  {
    key: 'skillId',
    label: 'Skill or credential',
    kind: 'select',
    getOptions: skillOptions,
    onChange(state) {
      const sk = lookupSkill(state.skillId);
      if (sk) {
        state.premiumPct = sk.premiumMedian * 100;
        // Try learning hours
        const hrs = getLearningHours(sk.category, sk.key);
        if (hrs) {
          state._learningHours = hrs;
          state.ttp = Math.max(1, Math.round(hrs / (state.weeklyHours * 4.3)));
        } else {
          state._learningHours = null;
          // No data — keep current TTP or default
          if (!state.ttp) state.ttp = 12;
        }
        state.cost = CATEGORY_DEFAULT_COST[sk.category] || 1;
      }
    },
  },
  {
    key: 'cost',
    label: 'Total acquisition cost',
    kind: 'range',
    min: 0.1, max: 80, step: 0.1,
    format: v => `₹${v.toFixed(1)} L`,
    hint: 'Includes direct outlay + opportunity cost during acquisition.',
  },
  {
    key: 'weeklyHours',
    label: 'Weekly study hours',
    kind: 'range',
    min: 4, max: 40, step: 2,
    format: v => `${v} hrs/wk`,
    hint: 'Used to convert benchmark learning hours into months-to-proficiency.',
    onChange(state) {
      if (state._learningHours) {
        state.ttp = Math.max(1, Math.round(state._learningHours / (state.weeklyHours * 4.3)));
      }
    },
  },
  {
    key: 'ttp',
    label: 'Time to proficiency',
    kind: 'range',
    min: 1, max: 60, step: 1,
    format: v => `${v} mo`,
    hint: 'Auto-set from benchmark hours where available; override-able.',
  },
  {
    key: 'premiumPct',
    label: 'Compensation premium',
    kind: 'range',
    min: 0, max: 100, step: 0.5,
    format: v => `${v.toFixed(1)}%`,
    hint: 'Annualized comp uplift once proficient. Default from skill_premiums_cross_cluster median.',
  },
  {
    key: 'decayPctYr',
    label: 'Premium decay',
    kind: 'range',
    min: 0, max: 20, step: 0.5,
    format: v => `${v.toFixed(1)}% /yr`,
    hint: 'Annual erosion. Tech-adjacent skills typically 8-12%.',
  },
  {
    key: 'horizonMonths',
    label: 'Evaluation horizon',
    kind: 'range',
    min: 24, max: 180, step: 6,
    format: v => `${v / 12} yr`,
  },
];

export function defaults(profile) {
  const clusterKey = (profile && CLUSTER_MAP[profile.cluster]) ? profile.cluster : 'finance';
  const roleKey = profile?.role || 'tp';
  const catPreferred = clusterKey === 'finance' ? 'finance_skills'
                     : clusterKey === 'technology' ? 'tech_skills'
                     : clusterKey === 'product_design' ? 'product_skills'
                     : clusterKey === 'consulting' ? 'consulting_skills'
                     : 'universal_skills';
  const allSkills = getAllSkills();
  const firstInCat = allSkills.find(s => s.category === catPreferred) || allSkills[0] || null;
  const skillId = firstInCat ? `${firstInCat.category}::${firstInCat.key}` : '';
  const hrs = firstInCat ? getLearningHours(firstInCat.category, firstInCat.key) : null;
  const weeklyHours = 12;
  return {
    currentComp: profile?.currentComp ?? 16,
    cluster: clusterKey,
    role: roleKey,
    skillId,
    cost: CATEGORY_DEFAULT_COST[catPreferred] || 1,
    weeklyHours,
    ttp: hrs ? Math.max(1, Math.round(hrs / (weeklyHours * 4.3))) : 12,
    premiumPct: firstInCat ? firstInCat.premiumMedian * 100 : 15,
    decayPctYr: 5,
    horizonMonths: 60,
    _learningHours: hrs,
  };
}

export function compute(state) {
  const { currentComp, cost, ttp, premiumPct, decayPctYr, horizonMonths } = state;

  const annualPremium = currentComp * (premiumPct / 100);
  const monthlyPremium = annualPremium / 12;
  const monthlyDecay = Math.pow(1 - decayPctYr / 100, 1 / 12);

  let cumulative = 0;
  let paybackMonth = null;
  const months = [];
  const cumValues = [];

  for (let m = 1; m <= horizonMonths; m++) {
    const premium = m > ttp ? monthlyPremium * Math.pow(monthlyDecay, m - ttp) : 0;
    cumulative += premium;
    const net = cumulative - cost;
    months.push(m);
    cumValues.push(net);
    if (paybackMonth === null && net >= 0) paybackMonth = m;
  }

  const nhv = cumulative - cost;
  const totalReturn = cost > 0 ? cumulative / cost : 0;
  const annualizedROI = cost > 0 ? Math.pow(cumulative / cost, 12 / horizonMonths) - 1 : 0;

  // Alpha formula from model_hooks.tool_6_skill_alpha:
  //   alpha = (premium * current_salary * (1 - automation_risk)) / learning_hours
  // We use ttp*weeklyHours*4.3 as the learning_hours proxy when data is missing.
  const autoRisk = getRoleAutomationRisk(state.cluster, state.role);
  const autoRiskFrac = autoRisk ? autoRisk.value / 100 : 0.3;
  const totalHours = state._learningHours || (ttp * state.weeklyHours * 4.3);
  const alpha = totalHours > 0
    ? ((premiumPct / 100) * currentComp * (1 - autoRiskFrac)) / totalHours
    : 0;

  // Premium spread for context
  const sk = lookupSkill(state.skillId);

  return {
    nhv, paybackMonth, totalReturn, annualizedROI, alpha,
    months, cumValues, autoRiskFrac, totalHours, sk,

    headline: {
      label: 'Net Horizon Value',
      value: nhv,
      formatted: nhv.toFixed(2),
      formatter: v => v.toFixed(2),
      unit: '₹ L',
      sub: [
        { label: 'Payback',          value: paybackMonth ? `M${paybackMonth}` : 'Beyond horizon' },
        { label: 'Annualized ROI',   value: `${(annualizedROI * 100).toFixed(1)}%` },
        { label: 'α (model_hooks)',  value: alpha.toFixed(4) },
        { label: 'Source',           value: sk ? `Tier ${sk.tier}` : '—' },
      ],
    },

    chart: {
      type: 'line',
      title: 'Cumulative net value vs time',
      years: months,
      yFormatter: v => `₹${v.toFixed(0)}L`,
      series: [
        { label: 'Net value',  color: 'var(--accent)',       values: cumValues,                 width: 2.5, fill: true },
        { label: 'Break-even', color: 'var(--ink-tertiary)', values: months.map(() => 0),       width: 1,   fill: false, dashed: true },
      ],
    },

    rail: [
      { label: 'Payback',           value: paybackMonth ? `M${paybackMonth}` : 'Beyond', sub: 'months to break even' },
      { label: 'Net horizon value', value: `${nhv >= 0 ? '+' : ''}₹${nhv.toFixed(1)}L`,  sub: `over ${horizonMonths} mo` },
      { label: 'Annualized ROI',    value: `${(annualizedROI * 100).toFixed(1)}%`,        sub: 'on invested cost' },
      { label: 'Skill α',           value: alpha.toFixed(4),                              sub: `auto ${(autoRiskFrac * 100).toFixed(0)}% · ${Math.round(totalHours)} hrs` },
    ],
  };
}

export function interpret(result, state) {
  const { nhv, paybackMonth, annualizedROI, alpha, sk, autoRiskFrac } = result;
  const skillName = sk ? sk.label : 'this skill';
  const premiumSpread = sk ? `${(sk.premiumLow * 100).toFixed(0)}–${(sk.premiumHigh * 100).toFixed(0)}%` : 'unknown';

  let what;
  if (nhv > 0 && paybackMonth) {
    what = `Acquiring <strong>${skillName}</strong> generates <strong>₹${nhv.toFixed(1)}L</strong> of net value over
        ${state.horizonMonths} months, paying back by month <strong>${paybackMonth}</strong>. Annualized ROI is
        <strong>${(annualizedROI * 100).toFixed(1)}%</strong>. The dataset publishes this skill's premium band as
        ${premiumSpread} ${sk ? `(tier ${sk.tier})` : ''} — you're modeling at the
        ${state.premiumPct.toFixed(1)}% point.`;
  } else if (nhv > 0) {
    what = `<strong>${skillName}</strong> generates ₹${nhv.toFixed(1)}L over ${state.horizonMonths} months but does not
        pay back within the window. Extend the horizon, raise the premium toward the high end of the published band
        (${premiumSpread}), or check whether cost is overstated.`;
  } else {
    what = `Under stated assumptions, <strong>${skillName}</strong> is value-destructive: NHV <strong>−₹${Math.abs(nhv).toFixed(1)}L</strong>.
        The published premium band is ${premiumSpread} — if your role can capture the high end, re-run; otherwise
        the case is signaling/optionality, not financial.`;
  }

  const how = `Two outputs to read. <strong>NHV</strong> is the lifetime cash value (decayed monthly premiums minus cost).
      <strong>α</strong> is the dataset designer's preferred metric from
      <em>model_hooks.tool_6_skill_alpha</em>: α = (premium × C × (1 − automation_risk)) / learning_hours.
      Your α is ${alpha.toFixed(4)}. The automation discount (${(autoRiskFrac * 100).toFixed(0)}%) pulls α down when
      the role being upskilled is itself automation-exposed — that's the dataset saying "don't invest in skills
      whose underlying role is going to be replaced".`;

  let next;
  if (alpha > 0.01 && nhv > 0) {
    next = `Strong α and positive NHV — both signals align. Move next to <a href="#/tools/path-comparison">Path Comparison</a>
        to test whether this skill enables a cluster pivot (largest non-linear returns sit there).`;
  } else if (nhv > 0 && alpha < 0.005) {
    next = `Positive NHV but low α — the skill compounds for you specifically, but the dataset's automation discount
        suggests the underlying role itself is fragile. Consider whether a cluster shift (modeled in
        <a href="#/tools/path-comparison">Path Comparison</a>) would be a higher-leverage move.`;
  } else if (nhv < 0) {
    next = `Negative NHV. The premium band published for this skill is ${premiumSpread} — your input of
        ${state.premiumPct.toFixed(1)}% sits ${state.premiumPct/100 < (sk?.premiumMedian ?? 0.15) ? 'below' : 'above'}
        the median. If your specific role can credibly capture the upper end, the case improves. Else consider
        alternates from the same category.`;
  } else {
    next = `Mixed signal. Re-run with a different decay rate or extend the horizon to see how robust the case is.`;
  }

  return [
    { label: 'What this means',  body: what },
    { label: 'How to read this', body: how },
    { label: 'What to do next',  body: next },
  ];
}

export const related = [
  { slug: 'professional-capital-value', name: 'Professional Capital Value' },
  { slug: 'career-volatility-index',    name: 'Career Volatility Index' },
  { slug: 'path-comparison',            name: 'Path Comparison Engine' },
  { slug: 'cohort-benchmark',           name: 'Cohort Benchmark' },
];

export const related_methodology = [
  { name: 'SST · Premium and decay' },
  { name: 'model_hooks · tool_6_skill_alpha' },
];
