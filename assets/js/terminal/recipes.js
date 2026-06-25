/* ──────────────────────────────────────────────────────────────────────
   TERMINAL · recipes  (Phase 7 — full composition across all 12 classes)

   One recipe per query class. Recipes orchestrate engine modules,
   resolve missing parameters against the profile, and compose memo
   sections from real engine output. Pure functions. Same input → same
   memo. No LLM, no randomness, no fabrication.

   Recipe contract:
     run(query, ent, profile) → {
       headline:  string,
       value:     primary number | null,
       valueUnit: string,
       evidence:  [{label, value, source}],
       what:      string,
       next:      [{label, slug}],
       provenance:[{label, source, tier}],
       engine:    { slug, route, state } | null
     }
   ────────────────────────────────────────────────────────────────────── */

import * as B from '../data/benchmarks.js';
import * as PCV from '../tools/professional-capital-value.js';
import * as CITY from '../tools/city-move-calculator.js';
import * as COHORT from '../tools/cohort-benchmark.js';
import * as CVI from '../tools/career-volatility-index.js';
import * as SKILL from '../tools/skill-roi.js';
import * as TRAJ from '../tools/trajectory-engine.js';
import * as PATH from '../tools/path-comparison.js';

/* ── Helpers ─────────────────────────────────────────────────────── */

function resolveProfileWithEnt(profile, ent) {
  const out = { ...(profile || {}) };
  if (ent.cluster) out.cluster = ent.cluster;
  if (ent.role) out.role = ent.role;
  if (ent.comps.length > 0) out.currentComp = ent.comps[0].value;
  if (ent.cities.length > 0) out.city = ent.cities[0].key;
  if (ent.years.length > 0) out.yearsExp = ent.years[0].value;
  return out;
}

function clusterLabel(key) { return B.clusterDescriptor(key)?.label || key; }
function roleLabel(cluster, role) {
  const rd = B.roleDescriptor(cluster, role);
  return rd ? rd.label.replace(/\s*\([^)]*\)\s*$/, '') : role;
}

/* ══════════════════════════════════════════════════════════════════
   1) CAPITAL_VALUATION
   ══════════════════════════════════════════════════════════════════ */

function runCapitalValuation(query, ent, profile) {
  const p = resolveProfileWithEnt(profile, ent);
  const state = PCV.defaults(p);
  const result = PCV.compute(state);

  return {
    headline: `Capital value: ₹${result.pcvCr.toFixed(2)} Cr at the ${result.percentile}th percentile of the ${roleLabel(state.cluster, state.role)} cohort.`,
    value: result.pcvCr,
    valueUnit: '₹ Cr',
    evidence: [
      { label: 'Compensation', value: `₹${state.currentComp.toFixed(1)}L`, source: state._compSpread?.source ? `cell · ${state._compSpread.source}` : 'user input' },
      { label: 'Growth rate', value: `${state.growthRate}%`, source: `career stage ${state._growthStage?.replace(/_/g, ' ') || '—'}` },
      { label: 'Discount rate', value: `${state.discountRate.toFixed(2)}%`, source: `path · ${state._discountPath}` },
      { label: 'Volatility', value: state.volatility.toFixed(2), source: `CVI ${state._publishedCVI?.toFixed(2) || '—'} · 0-3 scale` },
      { label: 'Cohort median', value: `₹${(state._compSpread?.median || 0).toFixed(0)}L`, source: `tier ${state._compSpread?.tier || '—'}` },
    ],
    what: result.percentile >= 75
      ? `Top-quartile position. The path-specific discount of ${state.discountRate.toFixed(2)}% and the published CVI ${state._publishedCVI?.toFixed(2) || '—'} together produce a moderate haircut on lifetime value.`
      : result.percentile >= 50
      ? `Above the cohort median. Closing the gap to the 75th percentile sits as the highest-leverage move.`
      : `Below the cohort median. PCV is highly sensitive to entry comp — closing the ₹${Math.abs(state.currentComp - (state._compSpread?.median || 0)).toFixed(0)}L gap is the dominant lever.`,
    next: [
      { label: 'Decompose volatility', slug: 'career-volatility-index' },
      { label: 'Tighten the cohort read', slug: 'cohort-benchmark' },
      { label: 'Test a path shift', slug: 'path-comparison' },
    ],
    provenance: [
      { label: 'Compensation cells', source: 'compensation_lpa cells', tier: state._compSpread?.tier || 'B' },
      { label: 'Growth curve',       source: 'common_drivers.salary_growth_rate.by_career_stage', tier: 'S' },
      { label: 'Discount premium',   source: 'common_drivers.discount_rate.career_risk_premium_by_path', tier: 'S' },
      { label: 'CVI',                source: 'career_volatility_index_extended', tier: state._cviSource === 'role_annotation' ? 'A' : 'B' },
    ],
    engine: { slug: 'professional-capital-value', route: '#/tools/professional-capital-value', state },
  };
}

/* ══════════════════════════════════════════════════════════════════
   2) CITY_MOVE
   ══════════════════════════════════════════════════════════════════ */

function runCityMove(query, ent, profile) {
  const p = resolveProfileWithEnt(profile, ent);
  let fromCity, toCity;
  if (ent.cities.length >= 2) {
    [fromCity, toCity] = [ent.cities[0].key, ent.cities[1].key];
  } else if (ent.cities.length === 1) {
    fromCity = p.city || 'Mumbai';
    toCity = ent.cities[0].key;
    if (fromCity === toCity) fromCity = (toCity === 'Mumbai' ? 'Bangalore' : 'Mumbai');
  } else {
    fromCity = p.city || 'Mumbai';
    toCity = (fromCity === 'Bangalore') ? 'Hyderabad' : 'Bangalore';
  }
  const state = CITY.defaults({ ...p, city: fromCity });
  state.fromCity = fromCity;
  state.toCity = toCity;
  if (ent.comps.length >= 1) state.fromComp = ent.comps[0].value;
  if (ent.comps.length >= 2) state.toComp = ent.comps[1].value;
  else state.toComp = state.fromComp * 1.25;
  const result = CITY.compute(state);
  if (result.error) return runCapitalValuation(query, ent, profile);

  const fromObj = result.fromCity, toObj = result.toCity;
  return {
    headline: result.deltaReal >= 0
      ? `Real wealth gain ${fromObj.label} → ${toObj.label}: +₹${result.deltaReal.toFixed(1)}L/year.`
      : `Real wealth LOSS ${fromObj.label} → ${toObj.label}: −₹${Math.abs(result.deltaReal).toFixed(1)}L/year.`,
    value: result.deltaReal,
    valueUnit: '₹ L /yr (real)',
    evidence: [
      { label: `${fromObj.label} real`, value: `₹${result.fromReal.toFixed(1)}L`, source: `CPR ${fromObj.colPlusRent.toFixed(1)} · PP ${fromObj.purchasingPower}` },
      { label: `${toObj.label} real`,   value: `₹${result.toReal.toFixed(1)}L`,   source: `CPR ${toObj.colPlusRent.toFixed(1)} · PP ${toObj.purchasingPower}` },
      { label: 'Nominal raise',         value: `${(result.nominalRaisePct * 100).toFixed(0)}%`, source: 'Δ on input' },
      { label: 'Real raise',            value: `${(result.realRaisePct * 100).toFixed(0)}%`,    source: 'after CPR rebase' },
      { label: 'Mumbai baseline',       value: result.mumbaiCPR.toFixed(1), source: '_baseline_col_plus_rent' },
    ],
    what: result.deltaReal >= 0 && result.realRaisePct > result.nominalRaisePct
      ? `Even better, the real raise (${(result.realRaisePct * 100).toFixed(0)}%) exceeds the nominal raise (${(result.nominalRaisePct * 100).toFixed(0)}%) — ${toObj.label}'s CPR is more favorable.`
      : result.deltaReal >= 0
      ? `${toObj.label}'s higher CPR (${toObj.colPlusRent.toFixed(1)} vs ${fromObj.colPlusRent.toFixed(1)}) compresses the headline raise — ${(result.nominalRaisePct * 100).toFixed(0)}% nominal becomes ${(result.realRaisePct * 100).toFixed(0)}% real.`
      : `${toObj.label}'s higher CPR consumes more than the nominal increase. Don't take this for the money alone.`,
    next: [
      { label: 'Open City Move', slug: 'city-move-calculator' },
      { label: 'Recompute PCV at new city', slug: 'professional-capital-value' },
    ],
    provenance: [
      { label: 'CPR composite', source: 'city_cost_of_living.cities · Numbeo Jun 2026', tier: 'S' },
      { label: 'Formula',       source: 'city_cost_of_living._formula', tier: 'S' },
    ],
    engine: { slug: 'city-move-calculator', route: '#/tools/city-move-calculator', state },
  };
}

/* ══════════════════════════════════════════════════════════════════
   3) OFFER_EVALUATION
   ══════════════════════════════════════════════════════════════════ */

function runOfferEvaluation(query, ent, profile) {
  const p = resolveProfileWithEnt(profile, ent);
  const offerComp = ent.comps.length >= 1 ? ent.comps[0].value : (p.currentComp || 16);

  const cohortState = COHORT.defaults({ ...p, currentComp: offerComp });
  if (ent.firmType) cohortState.firmType = ent.firmType;
  const cohortResult = COHORT.compute(cohortState);

  const pcvState = PCV.defaults({ ...p, currentComp: offerComp });
  pcvState.currentComp = offerComp;
  const pcvResult = PCV.compute(pcvState);

  let cityNote = '';
  if (ent.cities.length >= 1) {
    const c = B.getCity(ent.cities[0].key);
    if (c) {
      const real = offerComp * (B.mumbaiBaseline() / c.colPlusRent);
      cityNote = ` Real comp in ${c.label} ≈ ₹${real.toFixed(1)}L (CPR ${c.colPlusRent.toFixed(1)}).`;
    }
  }

  const verdict = cohortResult.percentile >= 75 ? 'strong'
                : cohortResult.percentile >= 50 ? 'fair'
                : cohortResult.percentile >= 25 ? 'below market'
                                                : 'weak';

  return {
    headline: `Offer ₹${offerComp.toFixed(1)}L lands at the ${cohortResult.percentile}th percentile — a ${verdict} offer for this cohort.`,
    value: cohortResult.percentile,
    valueUnit: 'th percentile',
    evidence: [
      { label: 'Cohort median',  value: `₹${cohortResult.comp50.toFixed(0)}L`, source: cohortResult.benchmarkSource || '—' },
      { label: '75th percentile', value: `₹${cohortResult.comp75.toFixed(0)}L`, source: 'normal CDF approx' },
      { label: 'Gap to median',  value: `${cohortResult.gapToMedian >= 0 ? '+' : ''}₹${cohortResult.gapToMedian.toFixed(0)}L`, source: '—' },
      { label: 'PCV at offer',   value: `₹${pcvResult.pcvCr.toFixed(2)} Cr`, source: 'PCV recomputed' },
    ],
    what: cohortResult.percentile >= 75
      ? `This offer puts you in the upper quartile. PCV at this comp resolves to ₹${pcvResult.pcvCr.toFixed(2)} Cr lifetime value.${cityNote}`
      : cohortResult.percentile >= 50
      ? `Above the median by ₹${cohortResult.gapToMedian.toFixed(0)}L but ₹${(cohortResult.comp75 - offerComp).toFixed(0)}L below the 75th. Negotiation room toward the upper quartile.${cityNote}`
      : `Below the cohort median by ₹${Math.abs(cohortResult.gapToMedian).toFixed(0)}L. Either the matched cell is wrong for this role (try a different firm tier in cohort matrix), or the offer is genuinely weak.${cityNote}`,
    next: [
      { label: 'Tighten cohort matrix', slug: 'cohort-benchmark' },
      { label: 'Real comp by city', slug: 'city-move-calculator' },
      { label: 'PCV at offer', slug: 'professional-capital-value' },
    ],
    provenance: [
      { label: 'Comp matrix v2', source: 'compensation_matrix_v2.cells', tier: 'S/A' },
      { label: 'Distribution',   source: 'normal CDF approximation over (low, high)', tier: 'B' },
    ],
    engine: { slug: 'cohort-benchmark', route: '#/tools/cohort-benchmark', state: cohortState },
  };
}

/* ══════════════════════════════════════════════════════════════════
   4) COHORT_POSITION
   ══════════════════════════════════════════════════════════════════ */

function runCohortPosition(query, ent, profile) {
  const p = resolveProfileWithEnt(profile, ent);
  const state = COHORT.defaults(p);
  if (ent.firmType) state.firmType = ent.firmType;
  const result = COHORT.compute(state);
  if (result.error) return runCapitalValuation(query, ent, profile);

  return {
    headline: `${result.percentile}th percentile against the ${roleLabel(state.cluster, state.role)} cohort.`,
    value: result.percentile,
    valueUnit: 'th percentile',
    evidence: [
      { label: 'Your comp',      value: `₹${state.currentComp.toFixed(1)}L`, source: '—' },
      { label: '25th percentile', value: `₹${result.comp25.toFixed(0)}L`, source: '—' },
      { label: 'Median',         value: `₹${result.comp50.toFixed(0)}L`, source: result.benchmarkSource?.startsWith('matrix') ? 'matrix v2' : 'role aggregate' },
      { label: '75th percentile', value: `₹${result.comp75.toFixed(0)}L`, source: '—' },
      { label: '90th percentile', value: `₹${result.comp90.toFixed(0)}L`, source: '—' },
    ],
    what: `Source: ${result.benchmarkSource} (tier ${result.benchmark.tier || 'B'}). Gap to 75th is ${result.gapTo75 >= 0 ? 'closed' : `₹${Math.abs(result.gapTo75).toFixed(0)}L`}.`,
    next: [
      { label: 'Open Cohort Benchmark', slug: 'cohort-benchmark' },
      { label: 'Plan skill investment to close gap', slug: 'skill-roi' },
    ],
    provenance: [
      { label: 'Matrix or aggregate', source: result.benchmarkSource || '—', tier: result.benchmark.tier || 'B' },
    ],
    engine: { slug: 'cohort-benchmark', route: '#/tools/cohort-benchmark', state },
  };
}

/* ══════════════════════════════════════════════════════════════════
   5) CLUSTER_PIVOT
   ══════════════════════════════════════════════════════════════════ */

function runClusterPivot(query, ent, profile) {
  // Path A = profile, Path B = the detected cluster/role in the query
  const aCluster = profile?.cluster || 'finance';
  const aRole = profile?.role || B.listRoles(aCluster)[0]?.value;
  // Find the target: prefer ent.roles entries that differ from profile
  let bCluster, bRole;
  const altRoles = (ent.roles || []).filter(r => r.cluster !== aCluster);
  if (altRoles.length > 0) {
    bCluster = altRoles[0].cluster;
    bRole = altRoles[0].role;
  } else if ((ent.clusters || []).some(c => c.cluster !== aCluster)) {
    const c = ent.clusters.find(c => c.cluster !== aCluster);
    bCluster = c.cluster;
    bRole = B.listRoles(bCluster)[0]?.value;
  } else if (ent.cluster && ent.cluster !== aCluster) {
    bCluster = ent.cluster;
    bRole = ent.role || B.listRoles(bCluster)[0]?.value;
  } else {
    // Sensible adjacent default
    bCluster = aCluster === 'finance' ? 'consulting' : aCluster === 'consulting' ? 'technology' : 'finance';
    bRole = B.listRoles(bCluster)[0]?.value;
  }

  // Build Path Comparison state directly
  const pathState = PATH.defaults({ cluster: aCluster, role: aRole, currentComp: profile?.currentComp, yearsExp: profile?.yearsExp });
  // Override Path B with detected target
  pathState.pathBCluster = bCluster;
  pathState.pathBRole = bRole;
  const bComp = B.getRoleCompensation(bCluster, bRole);
  const bCvi = B.getRoleCVI(bCluster, bRole);
  const bGrowth = B.careerStageGrowth(B.careerStageForExperience(profile?.yearsExp ?? 3));
  pathState.pathBComp = bComp ? Math.round(bComp.median) : pathState.pathBComp;
  pathState.pathBVol = bCvi ? Math.min(1, bCvi.value / 3) : pathState.pathBVol;
  pathState.pathBGrowth = bGrowth ? Math.round(bGrowth.median * 1000) / 10 : pathState.pathBGrowth;
  pathState._pathBDiscount = B.getDiscountRate(B.discountPathFor(bCluster, bRole)) * 100;
  pathState._pathBDiscountPath = B.discountPathFor(bCluster, bRole);
  pathState.discountRate = (pathState._pathADiscount + pathState._pathBDiscount) / 2;

  const result = PATH.compute(pathState);
  const deltaCr = result.pvBCr - result.pvACr;
  const winner = deltaCr >= 0 ? 'B' : 'A';

  return {
    headline: winner === 'B'
      ? `Pivot to ${clusterLabel(bCluster)} adds ₹${deltaCr.toFixed(2)} Cr in PCV vs staying in ${clusterLabel(aCluster)}.`
      : `Stay in ${clusterLabel(aCluster)} — pivot to ${clusterLabel(bCluster)} costs ₹${Math.abs(deltaCr).toFixed(2)} Cr in PCV.`,
    value: deltaCr,
    valueUnit: '₹ Cr Δ',
    evidence: [
      { label: `Stay (${roleLabel(aCluster, aRole)})`, value: `₹${result.pvACr.toFixed(2)} Cr`, source: `disc ${pathState._pathADiscount.toFixed(2)}% · ${pathState._pathADiscountPath}` },
      { label: `Pivot (${roleLabel(bCluster, bRole)})`, value: `₹${result.pvBCr.toFixed(2)} Cr`, source: `disc ${pathState._pathBDiscount.toFixed(2)}% · ${pathState._pathBDiscountPath}` },
      { label: 'Comp entry — stay', value: `₹${pathState.pathAComp.toFixed(0)}L`, source: `${roleLabel(aCluster, aRole)}` },
      { label: 'Comp entry — pivot', value: `₹${pathState.pathBComp.toFixed(0)}L`, source: `${roleLabel(bCluster, bRole)}` },
      { label: 'Vol — stay vs pivot', value: `${pathState.pathAVol.toFixed(2)} vs ${pathState.pathBVol.toFixed(2)}`, source: 'CVI/3 on 0-1 scale' },
    ],
    what: winner === 'B'
      ? `The pivot wins by ₹${deltaCr.toFixed(2)} Cr. But beware: this is a raw PCV delta; pivots have transition costs (lost tenure, ramp-up year, unbenchmarked overlap) that are not in this number. Treat ${(Math.abs(deltaCr) / (result.pvACr || 1) * 100).toFixed(0)}% as the data layer's case for the move and adjust subjectively.`
      : `Staying wins by ₹${Math.abs(deltaCr).toFixed(2)} Cr. The ${clusterLabel(bCluster)} path has either lower entry comp, higher vol, or a steeper discount premium that pulls its PV below your current trajectory's. Optionality value (which PCV doesn't capture) may still justify exploring the pivot.`,
    next: [
      { label: 'Open Path Comparison', slug: 'path-comparison' },
      { label: 'Risk-decompose target role', slug: 'career-volatility-index' },
      { label: 'Skill investment for transition', slug: 'skill-roi' },
    ],
    provenance: [
      { label: 'Path comp + vol', source: 'compensation_lpa + career_volatility_index_extended', tier: 'A/B' },
      { label: 'Path-specific discount', source: 'common_drivers.discount_rate.career_risk_premium_by_path', tier: 'S' },
    ],
    engine: { slug: 'path-comparison', route: '#/tools/path-comparison', state: pathState },
  };
}

/* ══════════════════════════════════════════════════════════════════
   6) SKILL_INVESTMENT
   ══════════════════════════════════════════════════════════════════ */

function runSkillInvestment(query, ent, profile) {
  const p = resolveProfileWithEnt(profile, ent);
  const state = SKILL.defaults(p);
  // If the user named a skill, swap the SKILL_ROI state to it.
  if (ent.skills.length > 0) {
    const allSkills = B.getAllSkills();
    const target = allSkills.find(s => s.key === ent.skills[0].key);
    if (target) {
      state.skillId = `${target.category}::${target.key}`;
      state.premiumPct = target.premiumMedian * 100;
      const hrs = B.getLearningHours(target.category, target.key);
      state._learningHours = hrs || null;
      if (hrs) state.ttp = Math.max(1, Math.round(hrs / (state.weeklyHours * 4.3)));
      // Default cost by category
      const catCost = { finance_skills: 3, tech_skills: 1.2, product_skills: 0.8, consulting_skills: 5, universal_skills: 0.5 };
      state.cost = catCost[target.category] || 1;
      state._skillObj = target;
    }
  }
  const result = SKILL.compute(state);
  const sk = result.sk;
  const skillName = sk ? sk.label : 'the selected skill';
  const premiumBand = sk ? `${(sk.premiumLow * 100).toFixed(0)}–${(sk.premiumHigh * 100).toFixed(0)}%` : '?';

  const verdict = result.nhv > 0 && result.paybackMonth ? 'positive'
                : result.nhv > 0 ? 'positive but late payback'
                : 'negative';

  return {
    headline: result.nhv > 0
      ? `${skillName}: NHV +₹${result.nhv.toFixed(1)}L over ${state.horizonMonths}mo, ${result.paybackMonth ? `payback M${result.paybackMonth}` : 'payback beyond horizon'}.`
      : `${skillName}: NHV −₹${Math.abs(result.nhv).toFixed(1)}L over ${state.horizonMonths}mo — under stated assumptions, value-destructive.`,
    value: result.nhv,
    valueUnit: '₹ L (NHV)',
    evidence: [
      { label: 'Premium',          value: `${state.premiumPct.toFixed(1)}%`, source: sk ? `band ${premiumBand}, median, tier ${sk.tier}` : 'user' },
      { label: 'Learning hours',   value: `${Math.round(result.totalHours)} hrs`, source: state._learningHours ? 'skill_learning_hours' : 'derived (ttp × weekly)' },
      { label: 'Cost',             value: `₹${state.cost.toFixed(1)}L`, source: 'category default' },
      { label: 'Time to proficiency', value: `${state.ttp} mo`, source: `at ${state.weeklyHours} hrs/wk` },
      { label: 'Automation risk',  value: `${(result.autoRiskFrac * 100).toFixed(0)}%`, source: 'role-mapped, discounts α' },
      { label: 'Skill α (model_hooks)', value: result.alpha.toFixed(4), source: 'premium × C × (1−auto) / hrs' },
      { label: 'Annualized ROI',   value: `${(result.annualizedROI * 100).toFixed(1)}%`, source: 'on invested cost' },
    ],
    what: verdict === 'positive'
      ? `Both metrics align: NHV is +₹${result.nhv.toFixed(1)}L and the dataset's α (${result.alpha.toFixed(4)}) is positive. The published premium band ${premiumBand} ${sk?.tier === 'S' ? 'is tier S — high confidence' : 'is tier A/B — moderate confidence'}. Annualized ROI of ${(result.annualizedROI * 100).toFixed(1)}% on the ₹${state.cost.toFixed(1)}L outlay.`
      : verdict === 'positive but late payback'
      ? `NHV is positive but payback exceeds the ${state.horizonMonths}-month window. Either extend the horizon, capture the upper end of the published band (${premiumBand}), or check cost assumptions.`
      : `Under your inputs the case doesn't close. The published premium band is ${premiumBand}; you're at ${state.premiumPct.toFixed(1)}%. If your specific role can credibly capture the upper end, re-run. Else this is a signaling/optionality investment, not a financial one.`,
    next: [
      { label: 'Open Skill ROI', slug: 'skill-roi' },
      { label: 'Path Comparison if skill enables cluster shift', slug: 'path-comparison' },
    ],
    provenance: [
      { label: 'Skill premium',  source: 'skill_premiums_cross_cluster', tier: sk?.tier || 'B' },
      { label: 'Learning hours', source: 'skill_learning_hours_to_proficiency', tier: 'B' },
      { label: 'α formula',      source: 'model_hooks.tool_6_skill_alpha', tier: 'S' },
    ],
    engine: { slug: 'skill-roi', route: '#/tools/skill-roi', state },
  };
}

/* ══════════════════════════════════════════════════════════════════
   7) VOLATILITY_READ
   ══════════════════════════════════════════════════════════════════ */

function runVolatilityRead(query, ent, profile) {
  const p = resolveProfileWithEnt(profile, ent);
  const state = CVI.defaults(p);
  const result = CVI.compute(state);
  const published = state._publishedCVI;
  const computed = result.cvi;
  const driver = result.topDriver?.label.split(' (')[0] || 'mixed';

  return {
    headline: `CVI ${computed.toFixed(2)} (${result.level}) — top driver: ${driver}. Published: ${published?.toFixed(2) ?? '—'}.`,
    value: computed,
    valueUnit: 'CVI (0-3)',
    evidence: [
      { label: 'Attrition (0.40w)',     value: `${(state.attrition * 100).toFixed(1)}%`, source: 'sector_attrition_aon_2024_25' },
      { label: 'Salary spread (0.30w)', value: state.salarySpread.toFixed(2), source: '(high − low) / median from cells' },
      { label: 'Layoff freq (0.20w)',   value: `${(state.layoffFreq * 100).toFixed(1)}%`, source: 'monte_carlo_event_probabilities_annual' },
      { label: 'Econ sensitivity (0.10w)', value: state.econSensitivity.toFixed(2), source: 'demand_growth_yoy (negated)' },
      { label: 'Published CVI',         value: published != null ? published.toFixed(2) : '—', source: state._publishedCVISource || 'unmapped' },
      { label: 'PCV haircut',           value: `${(result.haircutPct * 100).toFixed(0)}%`, source: 'mapped onto 0-1 vol input' },
    ],
    what: (() => {
      const cd = published != null ? computed - published : null;
      const cdNote = cd == null ? '' :
        Math.abs(cd) < 0.15 ? ` Computed and published align (Δ ${cd >= 0 ? '+' : ''}${cd.toFixed(2)}).`
                            : ` Computed and published diverge by ${cd.toFixed(2)} — components are reading ${cd > 0 ? 'higher' : 'lower'} than the published cohort norm.`;
      if (driver === 'Attrition')        return `Cluster-level attrition is the dominant risk. Mitigation: firm-tier upgrade or sector diversification.${cdNote}`;
      if (driver === 'Salary spread')    return `Wide salary spread across cells — outcome is sensitive to firm tier and specialization. Cohort matrix with explicit firm-type selection sharpens the read.${cdNote}`;
      if (driver === 'Layoff freq')      return `Sector-structural layoff frequency dominates. This is not individually controllable; the right hedge is income-source diversification.${cdNote}`;
      if (driver === 'Econ sens')        return `Economic sensitivity dominates. The cluster's demand signal is the trigger; CVI moves with it quarterly.${cdNote}`;
      return `Drivers are roughly balanced.${cdNote}`;
    })(),
    next: [
      { label: 'Open CVI engine', slug: 'career-volatility-index' },
      { label: 'See PCV with this volatility applied', slug: 'professional-capital-value' },
      { label: 'Cluster pivot if vol is unacceptable', slug: 'path-comparison' },
    ],
    provenance: [
      { label: 'CVI formula',  source: 'career_volatility_index_extended._formula', tier: 'S' },
      { label: 'Attrition',    source: 'sector_attrition_aon_2024_25', tier: 'S' },
      { label: 'Layoff prob',  source: 'monte_carlo_event_probabilities_annual', tier: 'S/B' },
      { label: 'Demand growth', source: 'demand_growth_yoy_naukri_jobspeak_2025_26', tier: 'S' },
    ],
    engine: { slug: 'career-volatility-index', route: '#/tools/career-volatility-index', state },
  };
}

/* ══════════════════════════════════════════════════════════════════
   8) PROMOTION_SCENARIO
   ══════════════════════════════════════════════════════════════════ */

function runPromotionScenario(query, ent, profile) {
  const p = resolveProfileWithEnt(profile, ent);
  // Promotion lands at the years extracted from the query, else 4 years
  const inflectionYear = ent.years.length > 0 ? Math.min(20, ent.years[0].value) : 4;
  const state = TRAJ.defaults(p);
  state.inflectionYear = inflectionYear;
  // Comp bump default: 35% (typical promotion step); slightly higher when promoting earlier
  state.compBump = inflectionYear <= 3 ? 40 : inflectionYear <= 6 ? 35 : 28;
  const result = TRAJ.compute(state);
  // Trajectory engine computes its own no-inflection baseline; deltaCr is the gain
  const gain = result.deltaCr;

  return {
    headline: gain >= 0
      ? `Getting promoted in Y${inflectionYear} adds ₹${gain.toFixed(2)} Cr to lifetime PCV vs no-promotion baseline.`
      : `Promotion in Y${inflectionYear} costs ₹${Math.abs(gain).toFixed(2)} Cr vs baseline (post-promotion growth assumption is below pre).`,
    value: gain,
    valueUnit: '₹ Cr Δ vs baseline',
    evidence: [
      { label: 'Inflection year',     value: `Y${inflectionYear}`, source: ent.years.length ? 'query' : 'default' },
      { label: 'Comp bump',           value: `+${state.compBump}%`, source: 'promotion step heuristic' },
      { label: 'Pre-growth',          value: `${state.preGrowth}%/yr`, source: `stage ${state._preStage?.replace(/_/g, ' ') || '—'}` },
      { label: 'Post-growth',         value: `${state.postGrowth}%/yr`, source: `stage ${state._postStage?.replace(/_/g, ' ') || '—'}` },
      { label: 'Path PCV (with promo)',    value: `₹${result.pcvCr.toFixed(2)} Cr`, source: 'Trajectory output' },
      { label: 'Baseline PCV (no promo)',  value: `₹${result.baselineCr.toFixed(2)} Cr`, source: 'engine counterfactual' },
      { label: 'Discount',            value: `${state.discountRate.toFixed(2)}%`, source: `path · ${state._discountPath}` },
    ],
    what: gain >= 0
      ? `The Y${inflectionYear} promotion is worth ₹${gain.toFixed(2)} Cr over the ${state.horizonYears}-year horizon — ${(gain / result.baselineCr * 100).toFixed(0)}% lift on baseline. The biggest driver isn't the comp bump itself; it's the post-promotion growth rate compounding off the higher base.`
      : `The post-promotion growth defaults (${state.postGrowth}%) sit below pre (${state.preGrowth}%) — typical for late-career compression. If post-promotion growth is held at pre-growth pace, the promotion is value-additive.`,
    next: [
      { label: 'Open Trajectory Engine', slug: 'trajectory-engine' },
      { label: 'Cross-check with PCV at boosted comp', slug: 'professional-capital-value' },
    ],
    provenance: [
      { label: 'Career-stage growth', source: 'common_drivers.salary_growth_rate.by_career_stage', tier: 'S' },
      { label: 'Discount premium',    source: 'common_drivers.discount_rate.career_risk_premium_by_path', tier: 'S' },
    ],
    engine: { slug: 'trajectory-engine', route: '#/tools/trajectory-engine', state },
  };
}

/* ══════════════════════════════════════════════════════════════════
   9) FOUNDER_TRACK
   ══════════════════════════════════════════════════════════════════ */

function runFounderTrack(query, ent, profile) {
  // Path A = profile. Path B = founder track (default seed unless ent specifies).
  const aCluster = profile?.cluster || 'finance';
  const aRole = profile?.role || B.listRoles(aCluster)[0]?.value;
  let founderRole = 'founder-seed';
  if (/series\s*a/i.test(ent.raw)) founderRole = 'founder-a';
  else if (/series\s*b/i.test(ent.raw)) founderRole = 'founder-b';
  else if (/series\s*c|pre.?ipo/i.test(ent.raw)) founderRole = 'founder-c';
  else if (/bootstrap/i.test(ent.raw)) founderRole = 'founder-boots';
  else if (/pre.?seed/i.test(ent.raw)) founderRole = 'pre-seed';

  // Build pivot to founder track
  const pathState = PATH.defaults({ cluster: aCluster, role: aRole, currentComp: profile?.currentComp, yearsExp: profile?.yearsExp });
  pathState.pathBCluster = 'operator_founder';
  pathState.pathBRole = founderRole;
  const bComp = B.getRoleCompensation('operator_founder', founderRole);
  const bCvi = B.getRoleCVI('operator_founder', founderRole);
  pathState.pathBComp = bComp ? Math.round(bComp.median) : pathState.pathBComp;
  pathState.pathBVol = bCvi ? Math.min(1, bCvi.value / 3) : pathState.pathBVol;
  pathState.pathBGrowth = 25; // typical founder upside growth assumption
  pathState._pathBDiscount = B.getDiscountRate('founder') * 100;
  pathState._pathBDiscountPath = 'founder';
  pathState.discountRate = (pathState._pathADiscount + pathState._pathBDiscount) / 2;

  const result = PATH.compute(pathState);
  const deltaCr = result.pvBCr - result.pvACr;

  const founderDescriptor = B.roleDescriptor('operator_founder', founderRole)?.label || founderRole;

  return {
    headline: deltaCr >= 0
      ? `Founder track (${founderDescriptor}) edges ahead by ₹${deltaCr.toFixed(2)} Cr in pure PCV — but read the caveats.`
      : `Founder track (${founderDescriptor}) costs ₹${Math.abs(deltaCr).toFixed(2)} Cr in PCV. The data layer says: stay on the salaried path on financial grounds alone.`,
    value: deltaCr,
    valueUnit: '₹ Cr Δ',
    evidence: [
      { label: 'Stay PCV',          value: `₹${result.pvACr.toFixed(2)} Cr`, source: `${roleLabel(aCluster, aRole)} · disc ${pathState._pathADiscount.toFixed(2)}%` },
      { label: 'Founder PCV',       value: `₹${result.pvBCr.toFixed(2)} Cr`, source: `${founderDescriptor} · disc ${pathState._pathBDiscount.toFixed(2)}%` },
      { label: 'Founder entry comp', value: `₹${pathState.pathBComp.toFixed(0)}L`, source: 'founder_salary_lpa_india_adjusted' },
      { label: 'Founder CVI',       value: `${(bCvi?.value || 0).toFixed(2)}`, source: 'role_annotation (3.0 = max)' },
      { label: 'Founder discount',  value: `${pathState._pathBDiscount.toFixed(2)}%`, source: 'career_risk_premium_by_path.founder = 15%' },
    ],
    what: `The founder discount in the dataset is 15% — the highest of any path. Combined with maximum CVI (3.0 for funded founders), the haircut on expected comp is severe. ${deltaCr < 0 ? `PCV says stay.` : `PCV says marginal advantage.`} But PCV is a financial number only — it cannot price equity tail outcomes, control premium, or learning curve compression. Read this as the data layer's "starting point", not the answer.`,
    next: [
      { label: 'Open Path Comparison', slug: 'path-comparison' },
      { label: 'Volatility decomposition', slug: 'career-volatility-index' },
      { label: 'Trajectory with founder inflection', slug: 'trajectory-engine' },
    ],
    provenance: [
      { label: 'Founder comp',     source: 'entrepreneurship_founder.founder_by_funding_stage.founder_salary_lpa_india_adjusted', tier: 'B' },
      { label: 'Founder CVI',      source: 'career_volatility_index_extended (3.0)', tier: 'A' },
      { label: 'Founder discount', source: 'common_drivers.discount_rate.career_risk_premium_by_path.founder', tier: 'S' },
    ],
    engine: { slug: 'path-comparison', route: '#/tools/path-comparison', state: pathState },
  };
}

/* ══════════════════════════════════════════════════════════════════
   10) TRAJECTORY_PROJECTION
   ══════════════════════════════════════════════════════════════════ */

function runTrajectoryProjection(query, ent, profile) {
  const p = resolveProfileWithEnt(profile, ent);
  const state = TRAJ.defaults(p);
  // Use horizon from query if specified
  if (ent.years.length > 0) state.horizonYears = Math.max(10, Math.min(40, ent.years[0].value));
  const result = TRAJ.compute(state);
  const expected = result.chart?.series?.[0]?.values || [];

  // Published salary_curve_lpa_median for triangulation if available
  const publishedCurve = B.getSalaryCurve(state.cluster, state.role);
  const yearTComp = expected[Math.min(expected.length - 1, state.horizonYears - 1)] || state.currentComp;
  const cumulativeNominal = expected.reduce((a, b) => a + b, 0);

  return {
    headline: `Projected ${state.horizonYears}-year path: ₹${result.pcvCr.toFixed(2)} Cr discounted, ₹${(cumulativeNominal / 100).toFixed(2)} Cr nominal cumulative.`,
    value: result.pcvCr,
    valueUnit: '₹ Cr PV',
    evidence: [
      { label: 'Horizon',           value: `${state.horizonYears} years`, source: ent.years.length ? 'query' : 'default' },
      { label: 'Year-1 comp',       value: `₹${state.currentComp.toFixed(1)}L`, source: 'benchmark cell · ' + (profile?.currentComp ? 'user override' : 'role default') },
      { label: `Year-${state.horizonYears} comp`, value: `₹${yearTComp.toFixed(1)}L`, source: 'projected at growth + haircut' },
      { label: 'Pre-inflection growth',  value: `${state.preGrowth}%/yr`, source: `stage ${state._preStage?.replace(/_/g, ' ') || '—'}` },
      { label: 'Post-inflection growth', value: `${state.postGrowth}%/yr`, source: `stage ${state._postStage?.replace(/_/g, ' ') || '—'}` },
      { label: 'Inflection',        value: `Y${state.inflectionYear} (+${state.compBump}%)`, source: 'promotion step default' },
      { label: 'Published baseline curve', value: publishedCurve ? `${publishedCurve[0]} → ${publishedCurve[publishedCurve.length - 1]}L` : 'unmapped', source: publishedCurve ? 'salary_curve_lpa_median (14yr)' : '—' },
    ],
    what: publishedCurve
      ? `The dataset publishes a 14-year median curve for this role from ${publishedCurve[0]}L → ${publishedCurve[publishedCurve.length - 1]}L. Open the engine to overlay it on your modeled trajectory and triangulate. Discount rate ${state.discountRate.toFixed(2)}% via path ${state._discountPath}.`
      : `No published curve for this role; the trajectory is reconstructed from career-stage growth defaults. Discount rate ${state.discountRate.toFixed(2)}% via path ${state._discountPath}.`,
    next: [
      { label: 'Open Trajectory Engine', slug: 'trajectory-engine' },
      { label: 'PCV at Y0', slug: 'professional-capital-value' },
    ],
    provenance: [
      { label: 'Career-stage growth', source: 'common_drivers.salary_growth_rate.by_career_stage', tier: 'S' },
      publishedCurve ? { label: 'Published curve', source: `${state.cluster}.${state.role}.salary_curve_lpa_median`, tier: 'A' } : null,
      { label: 'Discount premium',    source: 'common_drivers.discount_rate.career_risk_premium_by_path', tier: 'S' },
    ].filter(Boolean),
    engine: { slug: 'trajectory-engine', route: '#/tools/trajectory-engine', state },
  };
}

/* ══════════════════════════════════════════════════════════════════
   11) PATH_COMPARISON
   ══════════════════════════════════════════════════════════════════ */

function runPathComparison(query, ent, profile) {
  // Try to pull two paths from the query (two roles, two clusters, or one of each)
  let aSpec, bSpec;
  const rolesList = ent.roles || [];
  if (rolesList.length >= 2) {
    aSpec = rolesList[0];
    bSpec = rolesList[1];
  } else if (rolesList.length === 1 && (ent.clusters || []).length >= 1) {
    aSpec = rolesList[0];
    const otherC = (ent.clusters || []).find(c => c.cluster !== aSpec.cluster);
    if (otherC) bSpec = { cluster: otherC.cluster, role: B.listRoles(otherC.cluster)[0]?.value };
  } else if ((ent.clusters || []).length >= 2) {
    aSpec = { cluster: ent.clusters[0].cluster, role: B.listRoles(ent.clusters[0].cluster)[0]?.value };
    bSpec = { cluster: ent.clusters[1].cluster, role: B.listRoles(ent.clusters[1].cluster)[0]?.value };
  }
  // Fallback: use profile + adjacent
  if (!aSpec || !bSpec) {
    return runClusterPivot(query, ent, profile);
  }

  const pathState = PATH.defaults({ cluster: aSpec.cluster, role: aSpec.role, currentComp: profile?.currentComp, yearsExp: profile?.yearsExp });
  // Override Path B
  pathState.pathBCluster = bSpec.cluster;
  pathState.pathBRole = bSpec.role;
  const bComp = B.getRoleCompensation(bSpec.cluster, bSpec.role);
  const bCvi = B.getRoleCVI(bSpec.cluster, bSpec.role);
  const bGrowth = B.careerStageGrowth(B.careerStageForExperience(profile?.yearsExp ?? 3));
  pathState.pathBComp = bComp ? Math.round(bComp.median) : pathState.pathBComp;
  pathState.pathBVol = bCvi ? Math.min(1, bCvi.value / 3) : pathState.pathBVol;
  pathState.pathBGrowth = bGrowth ? Math.round(bGrowth.median * 1000) / 10 : pathState.pathBGrowth;
  pathState._pathBDiscount = B.getDiscountRate(B.discountPathFor(bSpec.cluster, bSpec.role)) * 100;
  pathState._pathBDiscountPath = B.discountPathFor(bSpec.cluster, bSpec.role);
  pathState.discountRate = (pathState._pathADiscount + pathState._pathBDiscount) / 2;

  const result = PATH.compute(pathState);
  const deltaCr = result.pvBCr - result.pvACr;
  const winner = deltaCr >= 0 ? 'B' : 'A';
  const winnerLabel = winner === 'B' ? roleLabel(bSpec.cluster, bSpec.role) : roleLabel(aSpec.cluster, aSpec.role);

  return {
    headline: `${winnerLabel} wins by ₹${Math.abs(deltaCr).toFixed(2)} Cr in PCV.`,
    value: deltaCr,
    valueUnit: '₹ Cr (B − A)',
    evidence: [
      { label: `Path A · ${roleLabel(aSpec.cluster, aSpec.role)}`, value: `₹${result.pvACr.toFixed(2)} Cr`, source: `disc ${pathState._pathADiscount.toFixed(2)}% · ${pathState._pathADiscountPath}` },
      { label: `Path B · ${roleLabel(bSpec.cluster, bSpec.role)}`, value: `₹${result.pvBCr.toFixed(2)} Cr`, source: `disc ${pathState._pathBDiscount.toFixed(2)}% · ${pathState._pathBDiscountPath}` },
      { label: 'Comp · A vs B',   value: `₹${pathState.pathAComp.toFixed(0)}L vs ₹${pathState.pathBComp.toFixed(0)}L`, source: 'role compensation cells' },
      { label: 'Growth · A vs B', value: `${pathState.pathAGrowth}% vs ${pathState.pathBGrowth}%`, source: 'career-stage' },
      { label: 'Vol · A vs B',    value: `${pathState.pathAVol.toFixed(2)} vs ${pathState.pathBVol.toFixed(2)}`, source: 'CVI/3' },
    ],
    what: `${winnerLabel} wins primarily because of ${comparisonDriver(pathState, result)}. Note that each path uses its own benchmark-driven discount rate (A: ${pathState._pathADiscount.toFixed(2)}% via ${pathState._pathADiscountPath}, B: ${pathState._pathBDiscount.toFixed(2)}% via ${pathState._pathBDiscountPath}) — fair comparison requires path-specific discounting.`,
    next: [
      { label: 'Open Path Comparison', slug: 'path-comparison' },
      { label: 'Drill into volatility', slug: 'career-volatility-index' },
    ],
    provenance: [
      { label: 'Role comp + CVI', source: 'compensation_lpa + career_volatility_index_extended', tier: 'A/B' },
      { label: 'Path discount',   source: 'career_risk_premium_by_path', tier: 'S' },
    ],
    engine: { slug: 'path-comparison', route: '#/tools/path-comparison', state: pathState },
  };
}

function comparisonDriver(s, r) {
  const compDiff = Math.abs(s.pathBComp - s.pathAComp) / Math.max(1, s.pathAComp);
  const volDiff = Math.abs(s.pathBVol - s.pathAVol);
  const discDiff = Math.abs(s._pathBDiscount - s._pathADiscount);
  if (compDiff > 0.3) return 'a meaningful entry-comp gap';
  if (volDiff > 0.2) return 'a volatility differential (lower-vol path retains more after haircut)';
  if (discDiff > 1) return 'a path-specific discount differential';
  return 'a combination of small advantages across comp, growth, and discount';
}

/* ══════════════════════════════════════════════════════════════════
   12) BENCHMARK_LOOKUP
   ══════════════════════════════════════════════════════════════════ */

function runBenchmarkLookup(query, ent, profile) {
  // Try matrix lookup first if we have role + firm + (experience or career level signal)
  const cluster = ent.cluster || profile?.cluster || 'finance';
  const role = ent.role || profile?.role || B.listRoles(cluster)[0]?.value;
  const years = ent.years.length > 0 ? ent.years[0].value : 4;

  // Domain inference
  const domain = B.DOMAIN_MAP[cluster]?.[role] || null;
  const firmType = ent.firmType || (cluster === 'finance' ? 'big4' : null);

  // Experience band + career level mapping
  const expBand = years < 3 ? '0_2' : years < 6 ? '3_5' : years < 10 ? '6_9' : years < 15 ? '10_14' : '15_plus';
  const careerLevel = /\b(?:partner|md|director|vp)\b/i.test(query) ? 'director_vp'
                    : /\b(?:senior manager|sr\.? manager)\b/i.test(query) ? 'senior_manager'
                    : /\b(?:manager|avp)\b/i.test(query) ? 'manager'
                    : /\b(?:senior associate|sr\.? associate|asst\.? manager)\b/i.test(query) ? 'senior_associate'
                    : /\b(?:analyst|associate|junior)\b/i.test(query) ? 'associate'
                    : (years < 3 ? 'associate' : years < 6 ? 'senior_associate' : years < 10 ? 'manager' : 'senior_manager');

  let cell = null;
  let source = '';
  if (domain && firmType) {
    cell = B.getMatrixCell(domain, firmType, expBand, careerLevel);
    if (cell) source = `matrix · ${domain}|${firmType}|${expBand}|${careerLevel}`;
  }

  let comp;
  if (cell) {
    comp = { low: cell.low, median: cell.median, high: cell.high, tier: cell.tier };
  } else {
    const agg = B.getRoleCompensation(cluster, role);
    if (agg) {
      comp = { low: agg.low, median: agg.median, high: agg.high, tier: agg.tier };
      source = `role aggregate · ${agg.source}`;
    }
  }
  if (!comp) {
    return {
      headline: `No benchmark cell or aggregate found for ${roleLabel(cluster, role)}.`,
      value: null, valueUnit: '',
      evidence: [{ label: 'Detected', value: `${cluster}/${role}`, source: 'entity extractor' }],
      what: 'The dataset does not carry a publishable cell for this exact combination. Open Cohort Benchmark and adjust the axes manually.',
      next: [{ label: 'Open Cohort Benchmark', slug: 'cohort-benchmark' }],
      provenance: [{ label: 'Lookup attempted', source: source || 'no match', tier: '—' }],
      engine: { slug: 'cohort-benchmark', route: '#/tools/cohort-benchmark', state: COHORT.defaults({ cluster, role }) },
    };
  }

  const cviObj = B.getRoleCVI(cluster, role);
  return {
    headline: `${roleLabel(cluster, role)}: median ₹${comp.median.toFixed(0)}L (low ${comp.low?.toFixed(0)} · high ${comp.high?.toFixed(0)} · tier ${comp.tier}).`,
    value: comp.median,
    valueUnit: '₹ L median',
    evidence: [
      { label: 'Low',      value: `₹${comp.low?.toFixed(0) || '—'}L`, source: source },
      { label: 'Median',   value: `₹${comp.median.toFixed(0)}L`, source: '—' },
      { label: 'High',     value: `₹${comp.high?.toFixed(0) || '—'}L`, source: '—' },
      { label: 'Source tier', value: comp.tier || 'B', source: 'data quality grade' },
      cviObj ? { label: 'Role CVI', value: cviObj.value.toFixed(2), source: '0-3 scale' } : null,
    ].filter(Boolean),
    what: `Direct lookup. ${cell ? 'Matrix cell resolved — sharpest possible read.' : 'Role aggregate used — matrix axes underspecified by the query.'} For tighter inputs, open Cohort Benchmark and specify firm type / experience / career level explicitly.`,
    next: [
      { label: 'Open Cohort Benchmark', slug: 'cohort-benchmark' },
      { label: 'PCV at this comp', slug: 'professional-capital-value' },
    ],
    provenance: [
      cell ? { label: 'Matrix cell',  source: source, tier: comp.tier } : { label: 'Aggregate', source: source, tier: comp.tier },
    ],
    engine: { slug: 'cohort-benchmark', route: '#/tools/cohort-benchmark', state: COHORT.defaults({ cluster, role }) },
  };
}

/* ── Dispatch ────────────────────────────────────────────────────── */

export function runRecipe(cls, query, ent, profile) {
  switch (cls) {
    case 'CAPITAL_VALUATION':     return runCapitalValuation(query, ent, profile);
    case 'CITY_MOVE':             return runCityMove(query, ent, profile);
    case 'OFFER_EVALUATION':      return runOfferEvaluation(query, ent, profile);
    case 'COHORT_POSITION':       return runCohortPosition(query, ent, profile);
    case 'CLUSTER_PIVOT':         return runClusterPivot(query, ent, profile);
    case 'SKILL_INVESTMENT':      return runSkillInvestment(query, ent, profile);
    case 'VOLATILITY_READ':       return runVolatilityRead(query, ent, profile);
    case 'PROMOTION_SCENARIO':    return runPromotionScenario(query, ent, profile);
    case 'FOUNDER_TRACK':         return runFounderTrack(query, ent, profile);
    case 'TRAJECTORY_PROJECTION': return runTrajectoryProjection(query, ent, profile);
    case 'PATH_COMPARISON':       return runPathComparison(query, ent, profile);
    case 'BENCHMARK_LOOKUP':      return runBenchmarkLookup(query, ent, profile);
    default:                      return runCapitalValuation(query, ent, profile);
  }
}
