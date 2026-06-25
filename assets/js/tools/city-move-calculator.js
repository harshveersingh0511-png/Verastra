/* ──────────────────────────────────────────────────────────────────────
   CITY MOVE CALCULATOR  ·  GPF core engine

   Phase 5 refactor: full 28-city coverage from city_cost_of_living.cities
   in benchmarks_master.json. Dataset's own documented formula:

       real_salary_equivalent = nominal × (mumbai_col_plus_rent / target_col_plus_rent)

   Tier S, Numbeo India June 2026 (31,363 entries from 2,720 contributors).

   What is benchmark-driven:
     - city universe (28 Indian cities, all tier S)
     - col_plus_rent (Numbeo composite)
     - ct_multiplier (purchasing-power adjuster)
     - mumbai baseline col_plus_rent = 22.3 (from _baseline_col_plus_rent)
     - real_salary formula (dataset's documented formula)

   What remains heuristic:
     - Tax rate at 30% — dataset doesn't surface effective rates by city
       (Indian tax is national; flat assumption is conservative).
     - International cities are out of scope here. They live in the
       International Premium Map engine (in build).
   ────────────────────────────────────────────────────────────────────── */

import { getAllCities, getCity, mumbaiBaseline } from '../data/benchmarks.js';

export const meta = {
  framework: 'GPF',
  formula: 'Real = Nominal × (Mumbai_CPR / Target_CPR)',
};

export const context = {
  when: 'Before any intra-India city move, before accepting a relocation offer, or when comparing real wealth between two Indian metros. Reveals the actual delta after the city consumes its share via cost of living and rent.',
  returns: 'Real compensation equivalent in each city using the dataset\'s documented Numbeo-based formula, delta in ₹, and a decomposition of where the new nominal is consumed.',
  limits: 'Indian cities only. International moves are handled by the International Premium Map engine (in build). Within-metro variance (e.g. South Mumbai vs Navi Mumbai) is partially modeled — Navi Mumbai is its own row.',
};

const cityOptions = () => {
  const cities = getAllCities();
  return cities.map(c => ({ value: c.key, label: c.label }));
};

const ASSUMED_TAX_RATE = 0.30; // flat — see "limits" above

export const schema = [
  {
    key: 'fromCity',
    label: 'From city',
    kind: 'select',
    getOptions: cityOptions,
    hint: 'Your current city. 28 Indian metros covered (Numbeo Jun 2026, tier S).',
  },
  {
    key: 'fromComp',
    label: 'Current compensation (current city)',
    kind: 'range',
    min: 4, max: 200, step: 0.5,
    format: v => `₹${v.toFixed(1)} L`,
    hint: 'Total fixed + variable, in INR.',
  },
  {
    key: 'toCity',
    label: 'To city',
    kind: 'select',
    getOptions: cityOptions,
  },
  {
    key: 'toComp',
    label: 'Offered compensation (new city)',
    kind: 'range',
    min: 4, max: 400, step: 0.5,
    format: v => `₹${v.toFixed(1)} L`,
    hint: 'Total in INR.',
  },
];

export function defaults(profile) {
  // Profile city may be UI-side (e.g., "mumbai" lowercase); benchmark keys are TitleCase.
  // Try direct match first, else normalize.
  const cities = getAllCities();
  let fromCity = profile?.city;
  if (fromCity) {
    const found = cities.find(c => c.key.toLowerCase() === fromCity.toLowerCase());
    fromCity = found ? found.key : 'Mumbai';
  } else {
    fromCity = 'Mumbai';
  }
  const fromComp = (profile && typeof profile.currentComp === 'number') ? profile.currentComp : 16;
  // Default destination: contrast with a different tier
  const toCity = fromCity === 'Bangalore' ? 'Hyderabad'
               : fromCity === 'Mumbai' ? 'Bangalore'
               : 'Mumbai';
  return {
    fromCity,
    fromComp,
    toCity,
    toComp: fromComp * 1.25,
  };
}

export function compute(state) {
  const from = getCity(state.fromCity);
  const to = getCity(state.toCity);
  const mumbaiCPR = mumbaiBaseline(); // 22.3

  if (!from || !to) {
    return { error: 'City not found in benchmark dataset.', headline: { label: 'Error', value: '—', formatted: '—' } };
  }

  // Dataset's documented formula:
  //   real_salary_equivalent = nominal × (mumbai_col_plus_rent / target_col_plus_rent)
  // This normalizes purchasing power to Mumbai. Higher target CPR → less real comp.
  const fromReal = state.fromComp * (mumbaiCPR / from.colPlusRent);
  const toReal = state.toComp * (mumbaiCPR / to.colPlusRent);
  const deltaReal = toReal - fromReal;
  const deltaNominal = state.toComp - state.fromComp;
  const nominalRaisePct = deltaNominal / state.fromComp;
  const realRaisePct = fromReal > 0 ? (deltaReal / fromReal) : 0;

  // Decomposition of where nominal goes (illustrative)
  const newAfterTax = state.toComp * (1 - ASSUMED_TAX_RATE);
  const newTaxConsumed = state.toComp - newAfterTax;
  // Rent share derived from rent / col_plus_rent ratio
  const rentShare = to.rent / to.colPlusRent;
  const colShare = to.col / to.colPlusRent;
  const newRentConsumed = newAfterTax * rentShare * (to.colPlusRent / mumbaiCPR);
  const newColConsumed = newAfterTax * colShare * Math.max(0, (to.colPlusRent / mumbaiCPR) - 1);
  const retained = Math.max(0, toReal);

  // Purchasing power comparison
  const fromPP = from.purchasingPower;
  const toPP = to.purchasingPower;
  const ppDelta = toPP - fromPP;

  return {
    fromReal, toReal, deltaReal, deltaNominal, nominalRaisePct, realRaisePct,
    newTaxConsumed, newRentConsumed, newColConsumed, retained,
    fromPP, toPP, ppDelta,
    fromCity: from, toCity: to, mumbaiCPR,

    headline: {
      label: `Real wealth change · ${from.label} → ${to.label}`,
      value: deltaReal,
      formatted: `${deltaReal >= 0 ? '+' : ''}${deltaReal.toFixed(1)}`,
      formatter: v => `${v >= 0 ? '+' : ''}${v.toFixed(1)}`,
      unit: '₹ L /yr',
      sub: [
        { label: 'Nominal raise', value: `${nominalRaisePct >= 0 ? '+' : ''}${(nominalRaisePct * 100).toFixed(0)}%` },
        { label: 'Real raise',    value: `${realRaisePct >= 0 ? '+' : ''}${(realRaisePct * 100).toFixed(0)}%` },
        { label: 'New city CPR',  value: `${to.colPlusRent.toFixed(1)}` },
        { label: 'PP delta',      value: `${ppDelta >= 0 ? '+' : ''}${ppDelta.toFixed(1)}` },
      ],
    },

    chart: {
      type: 'bar',
      title: `Decomposition · how ₹${state.toComp.toFixed(0)}L in ${to.label} resolves`,
      barMax: state.toComp,
      bars: [
        { label: 'Tax consumed',         value: newTaxConsumed,            display: `₹${newTaxConsumed.toFixed(1)}L`,           color: 'var(--data-coral)' },
        { label: 'Rent consumed',        value: newRentConsumed,           display: `₹${newRentConsumed.toFixed(1)}L`,          color: 'var(--data-blue)'  },
        { label: 'CoL premium consumed', value: Math.max(0, newColConsumed), display: `₹${Math.max(0, newColConsumed).toFixed(1)}L`, color: 'var(--data-amber)' },
        { label: 'Real wealth retained', value: retained,                  display: `₹${retained.toFixed(1)}L`,                 color: 'var(--accent)'     },
      ],
    },

    rail: [
      { label: `Real · ${from.label}`,  value: `₹${fromReal.toFixed(1)}L`, sub: `CPR ${from.colPlusRent.toFixed(1)} · PP ${from.purchasingPower}` },
      { label: `Real · ${to.label}`,    value: `₹${toReal.toFixed(1)}L`,   sub: `CPR ${to.colPlusRent.toFixed(1)} · PP ${to.purchasingPower}` },
      { label: 'Mumbai baseline CPR',   value: mumbaiCPR.toFixed(1),       sub: 'col_plus_rent index' },
      { label: 'Source',                value: 'Numbeo Jun 2026',          sub: 'tier S · 28 cities' },
    ],
  };
}

export function interpret(result, state) {
  if (result.error) return [{ label: 'Error', body: result.error }];
  const { fromReal, toReal, deltaReal, deltaNominal, nominalRaisePct, realRaisePct, fromCity: from, toCity: to, ppDelta } = result;

  let what;
  if (deltaReal > 0 && realRaisePct > nominalRaisePct) {
    what = `The ${from.label} → ${to.label} move is a real-wealth gain of <strong>+₹${deltaReal.toFixed(1)}L/year</strong>.
        Even better, the real raise (${(realRaisePct * 100).toFixed(0)}%) <em>exceeds</em> the nominal raise
        (${(nominalRaisePct * 100).toFixed(0)}%) — meaning ${to.label} has a more favorable CPR
        (${to.colPlusRent.toFixed(1)} vs ${from.colPlusRent.toFixed(1)} for ${from.label}).
        Purchasing power index also moves ${ppDelta >= 0 ? '+' : ''}${ppDelta.toFixed(1)} points.`;
  } else if (deltaReal > 0) {
    what = `The move is positive in real terms (<strong>+₹${deltaReal.toFixed(1)}L/year</strong>), but ${to.label}'s
        higher CPR (${to.colPlusRent.toFixed(1)} vs ${from.colPlusRent.toFixed(1)}) compresses the headline raise.
        The ${(nominalRaisePct * 100).toFixed(0)}% nominal raise translates to only
        <strong>${(realRaisePct * 100).toFixed(0)}%</strong> in real wealth.`;
  } else {
    what = `The move is value-destructive in real terms: <strong>−₹${Math.abs(deltaReal).toFixed(1)}L/year</strong>.
        Despite a ${(nominalRaisePct * 100).toFixed(0)}% nominal raise, ${to.label}'s higher CPR
        (${to.colPlusRent.toFixed(1)} vs ${from.colPlusRent.toFixed(1)}) consumes more than the increase.
        <strong>Don't take this offer for the money</strong>.`;
  }

  const how = `The dataset's documented formula is
      <em>real_salary_equivalent = nominal × (mumbai_col_plus_rent / target_col_plus_rent)</em>.
      With Mumbai's CPR fixed at ${result.mumbaiCPR.toFixed(1)} as the baseline, every other city's real comp
      is reweighted by the inverse of its own CPR. ${to.label}'s CPR is ${to.colPlusRent.toFixed(1)}
      (${to.colPlusRent > result.mumbaiCPR ? 'higher' : 'lower'} than Mumbai), so ₹${state.toComp.toFixed(0)}L nominal
      becomes ₹${toReal.toFixed(1)}L Mumbai-equivalent. Numbeo June 2026, tier S, 31,363 entries from 2,720 contributors.`;

  let next;
  if (deltaReal < 0) {
    next = `If the non-financial case is strong, see <a href="#/tools/professional-capital-value">PCV</a> with the
        destination city's CoL multiplier applied — sometimes a lower-real-wage move in a higher-growth cluster wins
        over a 5-year horizon. Otherwise, this move is purely about lifestyle and family.`;
  } else if (realRaisePct < 0.10) {
    next = `Modest real raise. <a href="#/tools/path-comparison">Path Comparison</a> can test whether staying in
        ${from.label} with a different role move dominates this geography arbitrage. Often the answer is yes
        when the destination CPR is close to the origin's.`;
  } else {
    next = `Strong real raise. Lock in the offer. After moving, re-benchmark with
        <a href="#/tools/cohort-benchmark">Cohort Benchmark</a> against the destination city's cohort
        — sometimes the same role pays differently in different metros.`;
  }

  return [
    { label: 'What this means',  body: what },
    { label: 'How to read this', body: how },
    { label: 'What to do next',  body: next },
  ];
}

export const related = [
  { slug: 'professional-capital-value', name: 'Professional Capital Value' },
  { slug: 'cohort-benchmark',           name: 'Cohort Benchmark' },
  { slug: 'path-comparison',            name: 'Path Comparison Engine' },
];

export const related_methodology = [
  { name: 'GPF · Real wealth construction' },
  { name: 'Numbeo CPR composite methodology' },
];
