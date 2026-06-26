/* ──────────────────────────────────────────────────────────────────────
   TERMINAL · query classifier

   Maps an extracted entity bag + raw query into one of 12 query classes,
   with confidence scoring and alternates. Pure rules-based; no LLM.

   Confidence is the sum of weighted signals minus a penalty for entity
   mismatch with the dominant class.
   ────────────────────────────────────────────────────────────────────── */

export const QUERY_CLASSES = [
  'CAPITAL_VALUATION',
  'CITY_MOVE',
  'OFFER_EVALUATION',
  'CLUSTER_PIVOT',
  'SKILL_INVESTMENT',
  'VOLATILITY_READ',
  'COHORT_POSITION',
  'PROMOTION_SCENARIO',
  'FOUNDER_TRACK',
  'TRAJECTORY_PROJECTION',
  'PATH_COMPARISON',
  'BENCHMARK_LOOKUP',
];

const PHRASE_PATTERNS = [
  // CAPITAL_VALUATION
  { class: 'CAPITAL_VALUATION', weight: 0.6, patterns: [/what.*(?:my )?career worth/, /lifetime (?:earnings|value|comp)/, /pcv/, /capital value/, /how much.*(?:i|will i)? (?:earn|make).*(?:lifetime|career|over)/, /present value of my career/] },
  { class: 'CAPITAL_VALUATION', weight: 0.3, patterns: [/discount/, /horizon/] },

  // CITY_MOVE — needs at least 1 city, ideally 2
  { class: 'CITY_MOVE', weight: 0.7, patterns: [/move (?:to|from)/, /relocat/, /shift.*(?:to|from)/, /(?:transfer|posting) (?:to|from)/, /real (?:wealth|comp|salary) (?:in|after)/] },
  { class: 'CITY_MOVE', weight: 0.4, patterns: [/cost of living/, /(?:purchasing power|ppp)/, /city (?:premium|adjustment)/] },

  // OFFER_EVALUATION — needs a comp number + (firm or "offer")
  { class: 'OFFER_EVALUATION', weight: 0.7, patterns: [/(?:is|was|got|received|have).*(?:offer|package|ctc|comp)/, /should i (?:accept|take|join)/, /evaluate.*offer/, /how good.*offer/, /worth.*₹?\d/] },
  { class: 'OFFER_EVALUATION', weight: 0.4, patterns: [/negotiat/, /counter offer/, /what.*ask/] },

  // CLUSTER_PIVOT — needs role/cluster transition signal
  { class: 'CLUSTER_PIVOT', weight: 0.7, patterns: [/switch (?:to|from|into)/, /move (?:to|from|into) (?:tp|tax|ib|pe|consulting|tech|product|founder|sales|marketing|hr|operations|law)/, /pivot (?:to|into)/, /transition.*(?:to|into|career)/, /(?:from|leave) .* to .* career/] },

  // SKILL_INVESTMENT — needs a skill name
  { class: 'SKILL_INVESTMENT', weight: 0.7, patterns: [/(?:worth|payback|roi).*(?:cfa|cpa|frm|mba|certification|course|cert)/, /should i (?:do|take|pursue|enroll|study)/, /is .* (?:worth it|worthwhile)/] },
  { class: 'SKILL_INVESTMENT', weight: 0.5, patterns: [/(?:credential|certification|charter)/, /upskill/] },

  // VOLATILITY_READ
  { class: 'VOLATILITY_READ', weight: 0.7, patterns: [/(?:how )?risky/, /volatil(?:e|ity)/, /career risk/, /attrition/, /layoff (?:risk|prob)/, /stability/, /how stable/, /career beta/] },
  { class: 'VOLATILITY_READ', weight: 0.5, patterns: [/automation risk/, /will my (?:role|job) be automated/, /ai risk/] },

  // COHORT_POSITION
  { class: 'COHORT_POSITION', weight: 0.7, patterns: [/where do i (?:stand|sit|rank)/, /(?:my )?percentile/, /vs (?:my )?(?:peers|cohort|colleagues|batch|class)/, /am i (?:underpaid|overpaid|paid (?:well|fairly))/, /how (?:do i )?compare/, /benchmark me/, /(?:my|i am) (?:underpaid|overpaid)/] },

  // PROMOTION_SCENARIO
  { class: 'PROMOTION_SCENARIO', weight: 0.7, patterns: [/promot(?:ed|ion)/, /(?:make|become) (?:manager|senior|partner|director|vp|md)/, /next level/, /what if i (?:get|am) promoted/] },

  // FOUNDER_TRACK
  { class: 'FOUNDER_TRACK', weight: 0.8, patterns: [/(?:start(?:up|ing) (?:a|my own)|found(?:ing)? (?:a )?(?:startup|company)|become a founder|quit.*start)/, /entrepreneur/, /raise.*(?:seed|series a|series b)/] },

  // TRAJECTORY_PROJECTION
  { class: 'TRAJECTORY_PROJECTION', weight: 0.6, patterns: [/(?:show|project|plot).*(?:next|trajectory|curve|earnings)/, /career path/, /salary curve/, /over the next \d+ (?:years|yr)/, /\d{2}.year (?:earnings|trajectory)/] },

  // PATH_COMPARISON
  { class: 'PATH_COMPARISON', weight: 0.7, patterns: [/(.+) vs (.+)/, /compare.*(?:vs|versus|against)/, /(?:big 4|mbb|ib).+(?:vs|or).+(?:industry|mnc|in-house|pe|product)/, /which (?:is )?better/, /difference between .+ and .+/, /how does .+ compare/] },

  // BENCHMARK_LOOKUP
  { class: 'BENCHMARK_LOOKUP', weight: 0.6, patterns: [/what (?:do|does) .* (?:make|earn|get paid)/, /what's the (?:median|salary|pay|comp)/, /how much (?:do|does) .* (?:earn|make)/, /typical (?:salary|comp|package)/, /benchmark for/] },
];

// Boost: certain entity combinations strongly suggest a class
function entityBoost(cls, ent) {
  switch (cls) {
    case 'CITY_MOVE':           return ent.cities.length >= 2 ? 0.5 : ent.cities.length === 1 ? 0.15 : 0;
    case 'OFFER_EVALUATION':    return ent.comps.length >= 1 ? 0.3 : 0;
    case 'CLUSTER_PIVOT':       return (ent.role && (ent.raw.match(/ to | from | into /gi) || []).length >= 1) ? 0.3 : 0;
    case 'SKILL_INVESTMENT':    return ent.skills.length >= 1 ? 0.5 : 0;
    case 'COHORT_POSITION':     return (ent.comps.length >= 1 && ent.role) ? 0.2 : 0;
    case 'PROMOTION_SCENARIO':  return ent.years.length >= 1 ? 0.2 : 0;
    case 'TRAJECTORY_PROJECTION': return ent.years.length >= 1 ? 0.2 : 0;
    case 'BENCHMARK_LOOKUP':    return ent.role ? 0.2 : 0;
    default: return 0;
  }
}

export function classify(query, ent) {
  const q = query.toLowerCase();
  const scores = Object.fromEntries(QUERY_CLASSES.map(c => [c, 0]));

  for (const sig of PHRASE_PATTERNS) {
    for (const pat of sig.patterns) {
      if (pat.test(q)) {
        scores[sig.class] += sig.weight;
        break; // count each signal once
      }
    }
  }

  for (const cls of QUERY_CLASSES) {
    scores[cls] += entityBoost(cls, ent);
  }

  const sorted = QUERY_CLASSES.map(c => ({ class: c, score: scores[c] }))
                              .sort((a, b) => b.score - a.score);

  const top = sorted[0];
  // Normalize confidence into 0..1 (cap at 1.4 raw → 100%)
  const confidence = Math.min(1, top.score / 1.4);

  // If everything is zero, fall back to CAPITAL_VALUATION as the safest default.
  // This is consistent with the dataset's primary engine.
  if (top.score < 0.3) {
    return {
      class: 'CAPITAL_VALUATION',
      confidence: 0.15,
      alternates: sorted.slice(0, 3).filter(s => s.score > 0),
      fallback: true,
      reason: 'Query did not match strong signals for any class. Falling back to Capital Valuation as the safest default.',
    };
  }

  return {
    class: top.class,
    confidence,
    alternates: sorted.slice(1, 4).filter(s => s.score > 0).map(s => ({ class: s.class, score: s.score })),
    fallback: false,
  };
}
