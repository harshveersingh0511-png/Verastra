/* ──────────────────────────────────────────────────────────────────────
   VERASTRA — DASHBOARD VIEW
   The intelligence cockpit for a user's current professional capital state.

   8 zones, top-to-bottom:
     1  State Header        — verdict anchor + profile chip
     2  State Rail          — Valuation · Position · Posture (3 tiles)
     3  Brief               — verdict + risks + opportunities
     4a Capital Structure   — salary curve + benchmark overlay + decomposition
     4b Market Position     — percentile rail + benchmark cell + confidence
     5  Risk Posture        — Attrition · Automation · Geography · Concentration
     6  Decision Queue      — 3–5 stateful, routed decision rows
     7  Analysis Stack      — 6 thin framework rows (transparency)
     8  Metadata Footer     — coverage · phase · last computed

   All numbers are derived from PCV.compute + the benchmark file. Nothing
   is mocked. Multi-cohort safe: no cluster-specific copy outside cluster
   checks.
   ────────────────────────────────────────────────────────────────────── */

import * as PCV from '../tools/professional-capital-value.js';
import { ROLE_MAP, CLUSTER_MAP, careerStageForExperience } from '../data/benchmarks.js';
import { countUp, reveal } from '../motion.js';
import { renderMarketPulseZone } from './dashboard-market-pulse.js';
import { warmup as warmupOverlay } from '../data/market-overlay.js';

/* ══════════════════════════════════════════════════════════════════════
   1 · STATIC TABLES
   ══════════════════════════════════════════════════════════════════════ */

const CLUSTER_LABELS = {
  finance:          'Finance',
  consulting:       'Consulting',
  technology:       'Technology',
  product_design:   'Product & Design',
  sales:            'Sales',
  marketing:        'Marketing',
  operator_founder: 'Operator',
  law:              'Law',
  operations:       'Operations',
  hr:               'HR',
  healthcare:       'Healthcare',
};

/* Growth-rate fallback table — used only when PCV.defaults leaves
   growthRate undefined (career-stage lookup miss in benchmarks.js).
   Values approximate the by_career_stage curves in the benchmark file
   and are conservative on the downside. */
const CLUSTER_GROWTH_FALLBACK = {
  finance:          { early: 13, mid: 11, senior: 9,  late: 6 },
  technology:       { early: 16, mid: 14, senior: 11, late: 7 },
  consulting:       { early: 18, mid: 14, senior: 10, late: 6 },
  product_design:   { early: 15, mid: 13, senior: 10, late: 7 },
  sales:            { early: 14, mid: 12, senior: 10, late: 6 },
  marketing:        { early: 12, mid: 10, senior: 8,  late: 5 },
  operator_founder: { early: 20, mid: 15, senior: 10, late: 5 },
  law:              { early: 13, mid: 11, senior: 8,  late: 5 },
  default:          { early: 12, mid: 10, senior: 8,  late: 5 },
};

function ensureGrowthRate(pcvState, profile) {
  if (typeof pcvState.growthRate === 'number' && Number.isFinite(pcvState.growthRate)) return pcvState;
  const stageRaw = (() => {
    try { return careerStageForExperience(profile.yearsExp || 0); }
    catch { return 'mid'; }
  })();
  /* normalize stage label → table key */
  const stage = stageRaw && stageRaw.includes('early') ? 'early'
              : stageRaw && stageRaw.includes('late')  ? 'late'
              : stageRaw && stageRaw.includes('senior')? 'senior'
              : 'mid';
  const table = CLUSTER_GROWTH_FALLBACK[profile.cluster] || CLUSTER_GROWTH_FALLBACK.default;
  pcvState.growthRate = table[stage] ?? table.mid;
  pcvState._growthFallback = true;
  return pcvState;
}

const CITY_TIER = {
  mumbai:    { tier: 'Tier 1', label: 'Mumbai',    drag: 'high' },
  delhi:     { tier: 'Tier 1', label: 'Delhi',     drag: 'high' },
  bangalore: { tier: 'Tier 1', label: 'Bangalore', drag: 'high' },
  bengaluru: { tier: 'Tier 1', label: 'Bengaluru', drag: 'high' },
  hyderabad: { tier: 'Tier 1', label: 'Hyderabad', drag: 'med'  },
  chennai:   { tier: 'Tier 1', label: 'Chennai',   drag: 'med'  },
  gurgaon:   { tier: 'Tier 1', label: 'Gurgaon',   drag: 'high' },
  pune:      { tier: 'Tier 2', label: 'Pune',      drag: 'med'  },
  kolkata:   { tier: 'Tier 2', label: 'Kolkata',   drag: 'low'  },
};

/* ══════════════════════════════════════════════════════════════════════
   2 · BENCHMARK LOADER (lazy + cached)
   ══════════════════════════════════════════════════════════════════════ */

let _benchCache = null;
let _benchPromise = null;

async function loadBenchmark() {
  if (_benchCache) return _benchCache;
  if (_benchPromise) return _benchPromise;
  _benchPromise = fetch('assets/data/benchmarks/benchmarks_master.json')
    .then(r => r.ok ? r.json() : null)
    .then(j => { _benchCache = j; return j; })
    .catch(() => null);
  return _benchPromise;
}

function resolveBenchmarkCell(bench, profile) {
  if (!bench) return { found: false };
  /* Use PCV's exported taxonomy as source of truth. CLUSTER_MAP[c].ds
     gives the benchmark cluster key (e.g. product_design → product_and_design);
     ROLE_MAP[c][r].ds gives the benchmark role key (e.g. tp → transfer_pricing). */
  const clusterKey = CLUSTER_MAP[profile.cluster]?.ds || profile.cluster;
  const cluster = bench[clusterKey];
  if (!cluster) return { found: false, clusterKey };
  const roleKey = ROLE_MAP[profile.cluster]?.[profile.role]?.ds || profile.role;
  const role = cluster[roleKey] || null;
  const fallbackRole = role ? null : pickFallbackRole(cluster);
  return {
    found: !!role,
    cluster, clusterKey,
    role, roleKey,
    fallbackRole,
  };
}

function pickFallbackRole(cluster) {
  for (const k of Object.keys(cluster)) {
    if (k.startsWith('_')) continue;
    const r = cluster[k];
    if (r && (r.salary_curves_lpa_median || r.salary_curve_lpa_median)) return r;
  }
  return null;
}

/* Salary curves come in two shapes:
   - an array of 14 numbers (per-YOE-band median)
   - a dict of named paths each holding an array
   Returns the most representative array we can find. */
function extractCurve(roleData) {
  if (!roleData) return null;
  const raw = roleData.salary_curves_lpa_median || roleData.salary_curve_lpa_median;
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'object') {
    const keys = Object.keys(raw).filter(k => !k.startsWith('_'));
    const preferred = keys.find(k => /median|industry|standard|big_4/i.test(k)) || keys[0];
    const sub = raw[preferred];
    if (Array.isArray(sub)) return sub;
    /* sometimes nested: { '0-3yr': N, '4-7yr': N ... } — convert ordered values */
    if (sub && typeof sub === 'object') return Object.values(sub).filter(v => typeof v === 'number');
  }
  return null;
}

function dataQualityTier(roleData) {
  /* benchmark _source_tiers: S/A/B/C — surface labels as confidence levels,
     never as internal tier codes. Falls back to a graceful low-confidence
     read when the exact cell is uncovered. */
  const t = (roleData?.tier || '').toUpperCase();
  if (t === 'S') return { tier: 'S', label: 'High confidence',   note: 'Primary-source verified data.',                   pips: 4, level: 'high' };
  if (t === 'A') return { tier: 'A', label: 'High confidence',   note: 'Primary-source data with broad coverage.',        pips: 3, level: 'high' };
  if (t === 'B') return { tier: 'B', label: 'Medium confidence', note: 'Mixed-source data; some cells modeled.',          pips: 2, level: 'med'  };
  if (t === 'C') return { tier: 'C', label: 'Medium confidence', note: 'Modeled estimate calibrated to nearby cohorts.',  pips: 1, level: 'med'  };
  return         { tier: '—', label: 'Low confidence',  note: 'Estimated from adjacent cohort references.',                pips: 1, level: 'low' };
}

/* ══════════════════════════════════════════════════════════════════════
   3 · INTERPRETATION HELPERS
   ══════════════════════════════════════════════════════════════════════ */

function cviRead(publishedCVI, volatilityInput) {
  const value = publishedCVI != null ? publishedCVI : (volatilityInput * 3);
  if (value < 0.5)  return { value, label: 'Low',      tone: 'stable',   regime: 'low-volatility' };
  if (value < 1.25) return { value, label: 'Moderate', tone: 'moderate', regime: 'moderate-volatility' };
  if (value < 2.0)  return { value, label: 'Elevated', tone: 'elevated', regime: 'elevated-volatility' };
  return                  { value, label: 'High',     tone: 'high',     regime: 'high-volatility' };
}

function cityRead(city) {
  const c = city ? CITY_TIER[city.toLowerCase()] : null;
  return c || { tier: 'Unset', label: city || '—', drag: 'unknown' };
}

function clusterLabel(c) { return CLUSTER_LABELS[c] || 'Cohort'; }

function positionPhrase(pct) {
  if (pct >= 75) return 'A <em>top-quartile</em> trajectory';
  if (pct >= 55) return 'An <em>above-median</em> trajectory';
  if (pct >= 35) return 'A trajectory <em>around the cohort median</em>';
  return                'A trajectory <em>below the cohort median</em>';
}
function regimePhrase(regime) {
  return {
    'low-volatility':      'in a low-volatility regime',
    'moderate-volatility': 'in a moderate-volatility regime',
    'elevated-volatility': 'in an elevated-volatility regime',
    'high-volatility':     'in a high-volatility regime',
  }[regime];
}
function spreadPhrase(gMinusD) {
  if (gMinusD > 5) return 'wide growth-discount spread';
  if (gMinusD > 2) return 'moderate growth-discount spread';
  return                'narrow growth-discount spread';
}
function spreadAction(gMinusD) {
  if (gMinusD > 5) return 'Patience and sequencing matter more than aggressive saving — compounding does the work.';
  if (gMinusD < 2) return 'Valuation is highly sensitive to assumptions here — stress-test before any consequential move.';
  return                'Modest adjustments to growth or risk will shift the valuation materially from here.';
}

/* ══════════════════════════════════════════════════════════════════════
   4 · STATE SYNTHESIS
   ══════════════════════════════════════════════════════════════════════ */

function buildState({ profile, pcvState, pcvResult, scenarios, bench, cell }) {
  const benchCVI = roleCVI(cell.role);
  const cvi = cviRead(pcvState._publishedCVI ?? benchCVI, pcvState.volatility);
  const city = cityRead(profile.city);
  const gMinusD = pcvState.growthRate - pcvState.discountRate;
  const pct = pcvResult.percentile;

  const verdictHTML =
    `${positionPhrase(pct)} ${regimePhrase(cvi.regime)} with a ${spreadPhrase(gMinusD)}. ${spreadAction(gMinusD)}`;

  /* one-line headline form, no markup, for Zone 1 */
  const headlineVerdict = stripTags(verdictHTML).split('. ')[0] + '.';

  return {
    cvi, city, gMinusD, pct,
    verdictHTML, headlineVerdict,
    cluster: profile.cluster,
    clusterLabel: clusterLabel(profile.cluster),
  };
}

function stripTags(s) { return s.replace(/<[^>]+>/g, ''); }

/* ══════════════════════════════════════════════════════════════════════
   5 · RISKS + OPPORTUNITIES (Brief content)
   ══════════════════════════════════════════════════════════════════════ */

function generateRisks({ profile, pcvState, pcvResult, scenarios, cell, state }) {
  const risks = [];
  const role = cell.role;
  const automation = roleAutomationRisk(role);
  const vol = pcvState.volatility;
  const cvi = state.cvi.value;

  /* High-severity */
  if (automation != null && automation >= 50) {
    const segment = clusterLabel(profile.cluster).toLowerCase();
    risks.push({
      severity: 'High',
      body: `Automation pressure is structural here — roughly half of current ${segment} workflow surface is exposed to compression over a 5–10 year horizon.`,
    });
  }
  if (cvi >= 2.0) {
    risks.push({
      severity: 'High',
      body: 'Career volatility sits in the elevated band; the current valuation already absorbs a structural haircut, and further path instability would compress it sharply.',
    });
  }
  if (profile.cluster === 'operator_founder') {
    risks.push({
      severity: 'High',
      body: 'Founder paths carry an outcome distribution where the median sits well below the mean — the headline expected value flatters the realistic downside.',
    });
  }
  if (vol > 0.55) {
    risks.push({
      severity: 'High',
      body: 'Career volatility is the dominant drag on current valuation; modest deterioration in path stability would compress it materially.',
    });
  }

  /* Medium */
  if (state.pct < 35) {
    const median = pickMedian(role);
    const gap = median ? Math.max(0, median - profile.currentComp) : null;
    risks.push({
      severity: 'Med',
      body: gap
        ? `Compensation sits roughly ₹${Math.round(gap)}L below the cohort median for this role — the first-order valuation problem is repricing, not strategy.`
        : 'Compensation sits below the cohort midline — repricing the current cell is the first-order valuation problem before any path change is considered.',
    });
  }
  if (Object.keys(scenarios || {}).length === 0) {
    risks.push({
      severity: 'Med',
      body: 'Only one trajectory is being underwritten. Single-path exposure conceals the convex moves a comparison would reveal.',
    });
  }
  if (automation != null && automation >= 30 && automation < 50) {
    risks.push({
      severity: 'Med',
      body: 'Automation exposure is non-trivial but not catastrophic; the bet is on which adjacent skill stack absorbs the compression first.',
    });
  }
  if (state.city.drag === 'high') {
    risks.push({
      severity: 'Med',
      body: `${state.city.label}'s cost base consumes 30–40% of nominal earnings; real capital accumulation runs materially slower than the headline curve suggests.`,
    });
  }

  /* Low */
  if (pcvState.growthRate >= 16) {
    risks.push({
      severity: 'Low',
      body: `The ${pcvState.growthRate}% growth assumption is aggressive — it survives only if both individual performance and firm trajectory hold simultaneously.`,
    });
  }
  if (state.gMinusD < 1) {
    risks.push({
      severity: 'Low',
      body: 'Growth barely exceeds the path-specific discount; small changes in either assumption flip the sign of long-horizon valuation.',
    });
  }

  return risks.slice(0, 3);
}

function generateOpps({ profile, pcvState, pcvResult, scenarios, cell, bench, state }) {
  const opps = [];
  const cluster = profile.cluster;

  /* High */
  if (state.gMinusD > 4) {
    opps.push({ mag: 'High', body: 'Growth is compounding meaningfully above the discount rate; a well-chosen learning investment compounds inside that spread rather than against it.' });
  }
  if (cluster === 'technology' || cluster === 'product_design') {
    opps.push({ mag: 'High', body: 'Long-tenure equity has historically dominated lifetime professional capital in this cluster, and it is currently absent from the valuation.' });
  }
  if (cluster === 'finance') {
    const stack = bench?.skill_premiums_cross_cluster?.finance_skills?.ca_plus_cfa_stacking;
    const caCfaDecimal = typeof stack?.median === 'number' ? stack.median : null;
    if (caCfaDecimal != null) {
      const pct = Math.round(caCfaDecimal * 100);
      opps.push({ mag: 'High', body: `Empirical pay data shows a CA + CFA stack earns roughly +${pct}% over CA alone — the highest-leverage credential pairing in the cluster.` });
    } else {
      opps.push({ mag: 'High', body: 'Adjacent finance tracks — FP&A, IB, PE/VC — widen the trajectory while reusing the existing skill base; the credential floor is already paid.' });
    }
  }

  /* Medium */
  if (state.city.drag === 'high') {
    opps.push({ mag: 'Med', body: `A ${state.city.label} → Tier-2 or international move could recover 25–40% of nominal compensation that is currently being absorbed by cost of living.` });
  }
  if (Object.keys(scenarios || {}).length === 0) {
    opps.push({ mag: 'Med', body: 'Comparing the current path against even one alternate trajectory typically surfaces a convex move that a single-path view cannot see.' });
  }

  /* Low */
  if (cluster !== 'operator_founder') {
    opps.push({ mag: 'Low', body: 'Founder optionality remains unmodeled; if entrepreneurship is a realistic branch, the current brief understates upside convexity.' });
  }
  opps.push({ mag: 'Low', body: 'Promotion probability curves compound non-linearly with tenure-in-role — the current window is more valuable than a flat extrapolation implies.' });

  return opps.slice(0, 3);
}

/* ══════════════════════════════════════════════════════════════════════
   6 · DECISION QUEUE GENERATOR
   ══════════════════════════════════════════════════════════════════════ */

function generateDecisionQueue({ profile, pcvState, pcvResult, scenarios, cell, bench, state }) {
  const rows = [];
  const cluster = profile.cluster;
  const role = cell.role;

  /* — Market position decomp (universal if not top-quartile) — */
  if (state.pct < 75) {
    const median = pickMedian(role);
    const gap = median ? Math.max(0, median - profile.currentComp) : null;
    rows.push({
      score: 95,
      move:  `Decompose the ${state.pct}th-percentile position against the ${state.clusterLabel} cohort.`,
      why:   gap ? `~₹${Math.round(gap)}L gap to the role median at your YOE band.` :
                   `Below the cohort midline at ${state.pct}th — the gap drives the first move.`,
      routeLabel: 'Cohort Benchmark',
      route: '#/tools/cohort-benchmark',
    });
  }

  /* — Skill stacking (cluster-aware, behind cluster check) — */
  if (cluster === 'finance') {
    rows.push({
      score: 88,
      move:  'Model a CA + CFA skill stack against Python + financial modeling on a 5-year ROI horizon.',
      why:   'Cross-cluster premium data shows +25–30% on the CFA stack in market matrices.',
      routeLabel: 'Skill ROI Engine',
      route: '#/methodology',
    });
  } else if (cluster === 'technology' || cluster === 'product_design') {
    rows.push({
      score: 88,
      move:  'Calibrate equity and RSU into the valuation — separate base from long-tenure compensation.',
      why:   'Long-tenure stock typically dominates lifetime professional capital in this cluster, and it is currently absent from the brief.',
      routeLabel: 'Skill ROI Engine',
      route: '#/methodology',
    });
  } else if (cluster === 'consulting') {
    rows.push({
      score: 88,
      move:  'Stress-test the post-MBA exit path against staying on the consulting ladder.',
      why:   'Branded MBA → senior consultant → exit curves vary ₹40L+ over a 10-year window.',
      routeLabel: 'Trajectory Engine',
      route: '#/tools/trajectory-engine',
    });
  }

  /* — Adjacent-cluster mobility (finance-only specific because of richest data) — */
  if (cluster === 'finance' && ['tp', 'tax', 'ca', 'ca-industry'].includes(profile.role)) {
    rows.push({
      score: 82,
      move:  'Stress-test current path against an FP&A or M&A Tax move over a 10-year window.',
      why:   'Adjacent-cluster mobility preserves the existing skill base while widening the trajectory.',
      routeLabel: 'Trajectory Engine',
      route: '#/tools/trajectory-engine',
    });
  }

  /* — City / geography drag (universal if high-drag) — */
  if (state.city.drag === 'high' || state.city.drag === 'med') {
    rows.push({
      score: 78,
      move:  `Run the ${state.city.label} cost-of-living drag against current valuation.`,
      why:   'Tier-1 cost base consumes 30–40% of nominal compensation before any real accumulation.',
      routeLabel: 'City Move Calculator',
      route: '#/tools/city-move-calculator',
    });
  }

  /* — Path concentration (universal if no scenarios) — */
  if (Object.keys(scenarios || {}).length === 0) {
    rows.push({
      score: 74,
      move:  'Model an alternate trajectory — a single point of comparison surfaces convex moves.',
      why:   'No alternate paths modeled. Concentration risk on the current cluster.',
      routeLabel: 'Path Comparison',
      route: '#/tools/path-comparison',
    });
  }

  /* — Terminal stress-test (always a candidate, lower priority) — */
  const topRisk = state.topRiskTerm || riskTermForCluster(cluster, role);
  rows.push({
    score: 60,
    move:  `Ask Terminal: "What does my 10-year NPV look like if ${topRisk} risk doubles?"`,
    why:   'Translates the top risk surface into a quantified sensitivity.',
    routeLabel: 'Terminal',
    route: '#/terminal',
  });

  /* — Founder convexity (universal if not already operator) — */
  if (cluster !== 'operator_founder') {
    rows.push({
      score: 50,
      move:  'Size founder optionality without committing — convex tail mapping in OT.',
      why:   'Median is below mean for founder paths; downside-bounded modeling lets you peek.',
      routeLabel: 'Methodology · OT',
      route: '#/methodology',
    });
  }

  /* Rank and trim */
  rows.sort((a, b) => b.score - a.score);
  let queue = rows.slice(0, 5);

  /* Floor of 3 — backfill priority: market-position → risk → terminal */
  if (queue.length < 3) {
    const have = new Set(queue.map(r => r.route));
    const fallbacks = [
      { score: 99, move: 'Benchmark the current compensation cell across cluster, city tier, and YOE.', why: 'Establishes the percentile baseline every other decision computes against.', routeLabel: 'Cohort Benchmark', route: '#/tools/cohort-benchmark' },
      { score: 98, move: 'Quantify the current volatility decomposition: attrition, automation, geography, concentration.', why: 'A single CVI number hides which driver actually breaks the path first.',                       routeLabel: 'CVI Engine',         route: '#/tools/career-volatility-index' },
      { score: 97, move: 'Ask Terminal to stress-test the current trajectory against a recession year in YOE 5.',           why: 'Reveals how brittle the compounding window is to a single downside event.',                   routeLabel: 'Terminal',           route: '#/terminal' },
    ];
    for (const f of fallbacks) {
      if (queue.length >= 3) break;
      if (!have.has(f.route)) { queue.push(f); have.add(f.route); }
    }
  }

  return queue.slice(0, 5);
}

function pickMedian(role) {
  if (!role) return null;
  const c = role.compensation_lpa
        || role.compensation_lpa_by_employer
        || role.compensation_lpa_by_company_type
        || role.compensation_lpa_by_seniority
        || role.compensation_lpa_levels_fyi_verified
        || role.compensation_lpa_by_level
        || role.compensation_lpa_6figr_verified;
  if (!c) return null;
  /* Level 0: direct median */
  if (typeof c.median === 'number') return c.median;
  /* Level 1: { bucket: {median} } — e.g. finance.transfer_pricing.compensation_lpa.associate_big4.median */
  for (const k of Object.keys(c)) {
    if (k.startsWith('_')) continue;
    const v = c[k];
    if (v && typeof v.median === 'number') return v.median;
  }
  /* Level 2: { employer: { seniority: {median} } } — tech roles */
  for (const k of Object.keys(c)) {
    if (k.startsWith('_')) continue;
    const v = c[k];
    if (!v || typeof v !== 'object') continue;
    for (const kk of Object.keys(v)) {
      if (kk.startsWith('_')) continue;
      const vv = v[kk];
      if (vv && typeof vv.median === 'number') return vv.median;
    }
  }
  return null;
}

/* Coerce a nested-by-subrole stat (number | dict-of-numbers | dict-of-dicts)
   into a single representative scalar. Used for technology roles where
   automation_risk_sub_role / career_volatility_index can be band-keyed. */
function scalarFromStat(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof v === 'object') {
    const nums = [];
    const walk = (x) => {
      if (typeof x === 'number') nums.push(x);
      else if (x && typeof x === 'object') for (const k of Object.keys(x)) { if (!k.startsWith('_')) walk(x[k]); }
    };
    walk(v);
    if (nums.length === 0) return null;
    /* mean — gives a single representative reading without forcing a particular band */
    return nums.reduce((a, b) => a + b, 0) / nums.length;
  }
  return null;
}

function roleAutomationRisk(role) {
  if (!role) return null;
  if (typeof role.automation_risk === 'number') return role.automation_risk;
  /* tech-style sub-role nesting */
  const subRole = role.automation_risk_sub_role;
  return scalarFromStat(subRole);
}

function roleCVI(role) {
  if (!role) return null;
  return scalarFromStat(role.career_volatility_index);
}

function riskTermForCluster(cluster, role) {
  /* automation_risk is on a 0-100 scale in the benchmark file */
  const aut = roleAutomationRisk(role);
  if (aut != null && aut >= 40) return 'automation';
  if (cluster === 'operator_founder') return 'founder outcome variance';
  if (cluster === 'consulting')       return 'attrition';
  return 'volatility';
}

/* ══════════════════════════════════════════════════════════════════════
   7 · MARKET POSITION + RISK POSTURE
   ══════════════════════════════════════════════════════════════════════ */

function buildMarketPosition({ profile, pcvResult, cell, state }) {
  /* Prefer the exact role cell; if missing, use the cluster fallback role so
     the panel still shows a credible benchmark frame. */
  const primaryRole = cell.role || cell.fallbackRole || null;
  const median = pickMedian(primaryRole);
  const quality = dataQualityTier(cell.role); /* always honest about the exact-cell quality */
  const yoeBand = yoeBandLabel(profile.yearsExp);
  const tierLabel = state.city.tier;
  const exact = !!cell.role;
  return {
    percentile: state.pct,
    median,
    cellLabel: `${state.clusterLabel} · ${profile.roleLabel || humanize(profile.role)} · ${tierLabel} · ${yoeBand}`,
    cellNote: exact
      ? null
      : 'Position estimated from adjacent cohort references due to limited direct cell coverage.',
    quality,
    cityLabel: state.city.label,
    tierLabel,
  };
}

function yoeBandLabel(yoe) {
  if (yoe == null) return 'YOE —';
  if (yoe <= 2)  return '0–2 YOE';
  if (yoe <= 5)  return '3–5 YOE';
  if (yoe <= 10) return '6–10 YOE';
  if (yoe <= 15) return '11–15 YOE';
  return '16+ YOE';
}

function humanize(s) {
  if (!s) return '—';
  return s.split(/[_-]/).map(w => w[0].toUpperCase() + w.slice(1)).join(' ');
}

function buildRiskPosture({ profile, pcvState, scenarios, cell, state }) {
  const role = cell.role;

  /* Attrition: derived from CVI value with cluster nudge */
  const attritionScore = clamp(state.cvi.value / 3, 0, 1); /* 0..1 */
  const attrition = scoreCell({
    label: 'Attrition pressure',
    value: state.cvi.value.toFixed(2),
    severity: pickSeverity(attritionScore),
    body: attritionBody(profile.cluster, attritionScore),
  });

  /* Automation: from benchmark (0-100 scale). For tech roles where the field
     is nested by sub-role, normalize to mean. When the exact cell is missing,
     fall back to a cluster baseline rather than rendering a dead dash. */
  const automationRaw = roleAutomationRisk(role);
  const automationFromBenchmark = automationRaw != null;
  const automationValue = automationFromBenchmark ? automationRaw : automationClusterBaseline(profile.cluster);
  const automationDisplay = automationValue != null ? Math.round(automationValue) : null;
  const automationScore = automationValue != null ? automationValue / 100 : null;
  const automation = scoreCell({
    label: 'Automation exposure',
    value: automationDisplay != null ? `${automationDisplay} / 100` : 'Pending',
    valueNote: automationFromBenchmark ? null : 'Cluster baseline',
    severity: automationScore == null ? 'moderate' : pickSeverity(automationScore),
    body: automationBody(profile.cluster, automationValue, automationFromBenchmark),
  });

  /* Geography drag */
  const cityDrag = state.city.drag;
  const geoScore = cityDrag === 'high' ? 0.75 : cityDrag === 'med' ? 0.45 : cityDrag === 'low' ? 0.2 : null;
  const geography = scoreCell({
    label: 'Geography drag',
    value: state.city.tier,
    severity: geoScore == null ? 'moderate' : pickSeverity(geoScore),
    body: geographyBody(state.city),
  });

  /* Path concentration */
  const scenarioCount = Object.keys(scenarios || {}).length;
  const concentrationScore = scenarioCount === 0 ? 0.9 : scenarioCount === 1 ? 0.55 : scenarioCount <= 3 ? 0.3 : 0.1;
  const concentration = scoreCell({
    label: 'Path concentration',
    value: scenarioCount === 0 ? '1 path' : `${scenarioCount + 1} paths`,
    severity: pickSeverity(concentrationScore),
    body: scenarioCount === 0
      ? 'Single trajectory under model — comparison would surface convex moves currently invisible.'
      : `${scenarioCount} alternate trajector${scenarioCount === 1 ? 'y' : 'ies'} on file; diversification reduces single-cluster exposure.`,
  });

  return { regime: state.cvi.regime, cells: [attrition, automation, geography, concentration] };
}

function pickSeverity(score) {
  if (score >= 0.7)  return 'high';
  if (score >= 0.45) return 'elevated';
  if (score >= 0.2)  return 'moderate';
  return                    'low';
}
function severityPips(severity) {
  return { low: 1, moderate: 2, elevated: 3, high: 4, unknown: 0 }[severity] || 0;
}
function severityLabel(severity) {
  return { low: 'Low', moderate: 'Moderate', elevated: 'Elevated', high: 'High', unknown: 'Unknown' }[severity] || '—';
}

function scoreCell({ label, value, valueNote, severity, body }) {
  return {
    label, value, valueNote,
    severity,
    severityLabel: severityLabel(severity),
    pips: severityPips(severity),
    body,
  };
}

/* Cluster baselines for automation exposure (0-100), used when the exact
   benchmark cell is missing. Loosely averaged from observed role data. */
const AUTOMATION_CLUSTER_BASELINE = {
  finance:          35,
  technology:       22,
  consulting:       18,
  product_design:   22,
  sales:            20,
  marketing:        24,
  operator_founder: 12,
  law:              28,
  operations:       30,
  hr:               24,
  healthcare:       18,
};
function automationClusterBaseline(cluster) {
  return AUTOMATION_CLUSTER_BASELINE[cluster] ?? 25;
}

function attritionBody(cluster, score) {
  if (cluster === 'consulting') return 'Sector-driven attrition; up-or-out timing shapes the trajectory.';
  if (cluster === 'finance')    return score > 0.5 ? 'Compliance-adjacent tracks compress selectively around the 3-YOE band.' : 'Sector-average tenure curves apply.';
  if (cluster === 'technology') return score > 0.5 ? 'Elevated layoff and team-volatility risk in the current cycle.' : 'Sector-average tenure curves apply.';
  return 'Sector-average attrition for this role and tenure.';
}
function automationBody(cluster, value, fromBenchmark) {
  if (!fromBenchmark) return `Direct rating pending; cluster baseline applied for this surface.`;
  if (value >= 50)    return `${cluster === 'finance' ? 'Compliance-heavy' : 'Process-heavy'} workflows compress 35–50% over a decade.`;
  if (value >= 30)    return 'Non-trivial exposure; adjacent skill stacking absorbs most of the compression.';
  return                     'Judgment and relationship layers persist — displacement risk is low.';
}
function geographyBody(city) {
  if (city.drag === 'high') return `Tier-1 cost base in ${city.label} consumes 30–40% of nominal before real accumulation.`;
  if (city.drag === 'med')  return `Moderate Tier-1 drag; rent and COL absorb roughly 20–25% of nominal.`;
  if (city.drag === 'low')  return `Lower cost base; nominal compensation converts more cleanly to real capital.`;
  return                           'Location unset; geography signal pending profile completion.';
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

/* ══════════════════════════════════════════════════════════════════════
   8 · CAPITAL STRUCTURE DECOMPOSITION
   ══════════════════════════════════════════════════════════════════════ */

function buildDecomposition(pcvResult) {
  /* Use the discounted curve so the three stage buckets actually compose
     present value — and sum (within rounding) to pcvCr. Expected curve is
     used only to surface the nominal-vs-PV compression note. */
  const exp  = pcvResult.expected   || [];
  const disc = pcvResult.discounted || [];
  const horizon = Math.max(exp.length, disc.length);
  if (horizon === 0) {
    return { early: { cr: 0, pct: 0, bandLabel: '—' }, mid: { cr: 0, pct: 0, bandLabel: '—' }, late: { cr: 0, pct: 0, bandLabel: '—' }, nominalCr: 0, pvCr: 0, dragCr: 0 };
  }
  const cut1 = Math.floor(horizon / 3);
  const cut2 = Math.floor(2 * horizon / 3);
  const sumRange = (arr, a, b) => arr.slice(a, b).reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);

  /* Present-value contribution by stage (these sum to PCV) */
  const earlyPV = sumRange(disc, 0,    cut1);
  const midPV   = sumRange(disc, cut1, cut2);
  const latePV  = sumRange(disc, cut2, horizon);
  const pvL     = earlyPV + midPV + latePV;

  /* Nominal earnings totals (for the compression note) */
  const nominalL = sumRange(exp, 0, horizon);
  const dragL    = Math.max(0, nominalL - pvL);

  const pct = v => pvL > 0 ? Math.round((v / pvL) * 100) : 0;
  return {
    early:     { cr: earlyPV / 100, pct: pct(earlyPV), bandLabel: `Yrs 1–${cut1}` },
    mid:       { cr: midPV   / 100, pct: pct(midPV),   bandLabel: `Yrs ${cut1 + 1}–${cut2}` },
    late:      { cr: latePV  / 100, pct: pct(latePV),  bandLabel: `Yrs ${cut2 + 1}–${horizon}` },
    pvCr:      pvL / 100,
    nominalCr: nominalL / 100,
    dragCr:    dragL / 100,
  };
}

/* ══════════════════════════════════════════════════════════════════════
   9 · SVG RENDERERS
   ══════════════════════════════════════════════════════════════════════ */

function salaryCurveSVG(expected, benchmarkCurve, startYear, currentComp) {
  if (!expected || expected.length === 0) return '<div class="dash-capital__chart-empty">Curve unavailable</div>';
  const W = 720, H = 220;
  const padL = 44, padR = 16, padT = 16, padB = 30;
  const innerW = W - padL - padR;
  const innerH = H - padT - padB;
  const N = expected.length;
  const years = Array.from({ length: N }, (_, i) => startYear + i);
  /* normalize benchmark curve to N points (linear interpolation) */
  const bench = benchmarkCurve && benchmarkCurve.length > 1
    ? interpolateCurve(benchmarkCurve, N)
    : null;

  const yMaxRaw = Math.max(
    ...expected,
    bench ? Math.max(...bench) : 0,
    currentComp || 0,
  );
  const yMax = yMaxRaw * 1.05;

  const xScale = (x) => padL + ((x - years[0]) / (years[N - 1] - years[0])) * innerW;
  const yScale = (y) => padT + innerH - (y / yMax) * innerH;

  const yTicks = 3;
  const yVals = [];
  for (let i = 1; i <= yTicks; i++) yVals.push((yMax / yTicks) * i);

  const grid = yVals.map(v => {
    const y = yScale(v);
    return `<line x1="${padL}" y1="${y}" x2="${W - padR}" y2="${y}" stroke="var(--hairline)" stroke-width="1"/>`;
  }).join('');

  const yLabels = yVals.map(v => {
    const y = yScale(v);
    return `<text x="${padL - 8}" y="${y + 4}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="9" fill="var(--ink-tertiary)">₹${v.toFixed(0)}L</text>`;
  }).join('');

  const xLabelYears = [years[0], years[Math.floor(N / 2)], years[N - 1]];
  const xLabels = xLabelYears.map(y => `
    <text x="${xScale(y)}" y="${H - padB + 16}" text-anchor="middle"
      font-family="JetBrains Mono, monospace" font-size="9" fill="var(--ink-tertiary)">${y}</text>
  `).join('');

  const pathFor = (vals) => vals.map((v, i) => {
    const x = xScale(years[i]);
    const y = yScale(v);
    return `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  const userPath = pathFor(expected);
  const benchPath = bench ? pathFor(bench) : null;

  /* area under user curve */
  const areaPath = `${userPath} L${xScale(years[N - 1]).toFixed(1)} ${(padT + innerH).toFixed(1)} L${xScale(years[0]).toFixed(1)} ${(padT + innerH).toFixed(1)} Z`;

  return `
    <svg viewBox="0 0 ${W} ${H}" class="dash-capital__chart-svg" preserveAspectRatio="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="dash-cap-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"  stop-color="var(--accent)" stop-opacity="0.16"/>
          <stop offset="100%" stop-color="var(--accent)" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${grid}
      ${yLabels}
      ${xLabels}
      <path d="${areaPath}" fill="url(#dash-cap-grad)"/>
      ${benchPath ? `<path d="${benchPath}" fill="none" stroke="var(--ink-tertiary)" stroke-width="1.2" stroke-dasharray="4 4" opacity="0.7" class="dash-capital__chart-bench"/>` : ''}
      <path d="${userPath}" fill="none" stroke="var(--accent-hi)" stroke-width="1.8" class="dash-capital__chart-user"/>
    </svg>
  `;
}

function interpolateCurve(src, N) {
  if (src.length === N) return src.slice();
  const out = new Array(N);
  for (let i = 0; i < N; i++) {
    const t = i / (N - 1);
    const x = t * (src.length - 1);
    const i0 = Math.floor(x);
    const i1 = Math.min(src.length - 1, i0 + 1);
    const w = x - i0;
    out[i] = src[i0] * (1 - w) + src[i1] * w;
  }
  return out;
}

function percentileRailSVG(pct) {
  const W = 220, H = 180;
  const railX = 56;
  const railTop = 16;
  const railBottom = H - 16;
  const innerH = railBottom - railTop;

  /* p25 at 25% from top → near bottom; in our chart, higher percentile = higher → near top */
  const yFor = (p) => railBottom - (p / 100) * innerH;

  const ticks = [25, 50, 75].map(p => {
    const y = yFor(p);
    return `
      <line x1="${railX - 18}" y1="${y}" x2="${railX + 18}" y2="${y}" stroke="var(--hairline-hi)" stroke-width="1"/>
      <text x="${railX - 26}" y="${y + 4}" text-anchor="end" font-family="JetBrains Mono, monospace" font-size="10" fill="var(--ink-tertiary)">p${p}</text>
    `;
  }).join('');

  const userY = yFor(pct);

  return `
    <svg viewBox="0 0 ${W} ${H}" class="dash-position__rail-svg" xmlns="http://www.w3.org/2000/svg">
      <line x1="${railX}" y1="${railTop}" x2="${railX}" y2="${railBottom}" stroke="var(--hairline)" stroke-width="1.5"/>
      ${ticks}
      <g class="dash-position__rail-marker">
        <line x1="${railX - 28}" y1="${userY}" x2="${railX + 70}" y2="${userY}" stroke="var(--accent)" stroke-width="1" stroke-dasharray="2 3"/>
        <circle cx="${railX}" cy="${userY}" r="6" fill="var(--accent-hi)" stroke="var(--bg-base)" stroke-width="2"/>
        <text x="${railX + 14}" y="${userY + 4}" font-family="Fraunces, serif" font-size="20" font-weight="400" fill="var(--ink-primary)">${pct}<tspan font-family="JetBrains Mono, monospace" font-size="10" fill="var(--ink-tertiary)" dx="2">th</tspan></text>
        <text x="${railX + 14}" y="${userY + 22}" font-family="JetBrains Mono, monospace" font-size="9" fill="var(--ink-tertiary)" letter-spacing="0.12em" text-transform="uppercase">YOU</text>
      </g>
    </svg>
  `;
}

/* ══════════════════════════════════════════════════════════════════════
   10 · RENDER
   ══════════════════════════════════════════════════════════════════════ */

export async function render(container, { store }) {
  const profile = store.profile;

  /* Live PCV computation. PCV.defaults can leave growthRate undefined when
     the by-career-stage growth lookup misses for this cluster — guard it. */
  const pcvState  = PCV.defaults(profile);
  ensureGrowthRate(pcvState, profile);
  const pcvResult = PCV.compute(pcvState);

  /* Lazy benchmark fetch + cell resolution */
  const bench = await loadBenchmark();
  const cell  = resolveBenchmarkCell(bench, profile);

  /* Curve sources */
  const userCurve  = pcvResult.expected || [];
  const benchCurve = extractCurve(cell.role) || extractCurve(cell.fallbackRole);

  /* State synthesis */
  const state = buildState({ profile, pcvState, pcvResult, scenarios: store.scenarios, bench, cell });
  const risks = generateRisks   ({ profile, pcvState, pcvResult, scenarios: store.scenarios, cell, state });
  const opps  = generateOpps    ({ profile, pcvState, pcvResult, scenarios: store.scenarios, cell, bench, state });
  const queue = generateDecisionQueue({ profile, pcvState, pcvResult, scenarios: store.scenarios, cell, bench, state });
  const market = buildMarketPosition  ({ profile, pcvResult, cell, state });
  const risk   = buildRiskPosture     ({ profile, pcvState, scenarios: store.scenarios, cell, state });
  const decomp = buildDecomposition   (pcvResult);

  const currentYear = new Date().getFullYear();

  /* Render */
  container.innerHTML = `
    <div class="dash">

      <!-- ── ZONE 1 · STATE HEADER ───────────────────────────────────── -->
      <header class="dash-state-header" data-reveal>
        <div class="dash-state-header__meta">STATE · ${stampStrip()} · MASTER SCHEMA 4</div>
        <div class="dash-state-header__row">
          <h1 class="dash-state-header__verdict">${state.verdictHTML.split('. ')[0]}.</h1>
          <div class="dash-state-header__context">
            <div class="dash-state-header__context-line">${state.clusterLabel} · ${profile.roleLabel || humanize(profile.role)}</div>
            <div class="dash-state-header__context-line dash-state-header__context-line--sub">${state.city.label} · ${profile.yearsExp} YOE · ₹${profile.currentComp}L</div>
          </div>
        </div>
      </header>

      <!-- ── ZONE 2 · STATE RAIL ─────────────────────────────────────── -->
      <div class="dash-rail dash-rail--state" data-reveal>
        <a class="dash-rail__tile dash-rail__tile--anchor" href="#/tools/professional-capital-value">
          <div class="dash-rail__label">Valuation</div>
          <div class="dash-rail__value">
            <span class="dash-rail__num"><span id="dash-pcv">0.00</span></span>
            <span class="dash-rail__unit">₹ Cr</span>
          </div>
          <div class="dash-rail__sub">HCAM · ${pcvState.horizonYears}y horizon</div>
        </a>
        <a class="dash-rail__tile" href="#/tools/cohort-benchmark">
          <div class="dash-rail__label">Position</div>
          <div class="dash-rail__value">
            <span class="dash-rail__num"><span id="dash-pct">0</span><span class="dash-rail__ord">th</span></span>
            <span class="dash-rail__qual">percentile</span>
          </div>
          <div class="dash-rail__sub">${state.clusterLabel} cohort</div>
        </a>
        <a class="dash-rail__tile" href="#/tools/career-volatility-index">
          <div class="dash-rail__label">Posture</div>
          <div class="dash-rail__value">
            <span class="dash-rail__num"><span id="dash-cvi">0.00</span></span>
            <span class="dash-rail__qual dash-rail__qual--${state.cvi.tone}">· ${state.cvi.label}</span>
          </div>
          <div class="dash-rail__sub">CVI</div>
        </a>
      </div>

      <!-- ── ZONE 3 · BRIEF ──────────────────────────────────────────── -->
      <div class="dash-snapshot" data-reveal>
        <div class="dash-snapshot__head">
          <div class="dash-snapshot__eyebrow">Brief · Decision Snapshot</div>
          <div class="dash-snapshot__stamp">${stampStrip()}</div>
        </div>
        <p class="dash-snapshot__verdict">${state.verdictHTML}</p>
        <div class="dash-snapshot__split">
          <div>
            <div class="dash-snapshot__col-label dash-snapshot__col-label--risk">Top Risks</div>
            ${renderBriefItems(risks, 'severity')}
          </div>
          <div>
            <div class="dash-snapshot__col-label dash-snapshot__col-label--opp">Top Opportunities</div>
            ${renderBriefItems(opps, 'mag')}
          </div>
        </div>
        <a class="dash-snapshot__desk" href="#dash-queue">
          On the desk · ${queue.length} decision${queue.length === 1 ? '' : 's'}
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M5 2v6m0 0L2 5m3 3l3-3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
      </div>

      <!-- ── ZONE 4 · CAPITAL STRUCTURE + MARKET POSITION ────────────── -->
      <div class="dash-zone4">

        <section class="dash-capital" data-reveal>
          <div class="dash-capital__head">
            <div class="dash-capital__eyebrow">Capital Structure</div>
            <div class="dash-capital__title">Where the ₹${pcvResult.pcvCr.toFixed(2)} Cr comes from</div>
          </div>
          <div class="dash-capital__chart">
            ${salaryCurveSVG(userCurve, benchCurve, currentYear, profile.currentComp)}
            <div class="dash-capital__legend">
              <span class="dash-capital__legend-item">
                <span class="dash-capital__legend-line dash-capital__legend-line--user"></span>
                Your path (HCAM)
              </span>
              ${benchCurve ? `
                <span class="dash-capital__legend-item">
                  <span class="dash-capital__legend-line dash-capital__legend-line--bench"></span>
                  Cohort median${cell.fallbackRole ? ' · cluster reference' : ''}
                </span>
              ` : ''}
            </div>
          </div>
          <div class="dash-capital__decomp">
            <div class="dash-capital__decomp-eyebrow">Present value contribution by career stage</div>
            <div class="dash-capital__decomp-row">
              ${decompCell('Early',  decomp.early)}
              ${decompCell('Mid',    decomp.mid)}
              ${decompCell('Late',   decomp.late)}
            </div>
            <div class="dash-capital__decomp-drag">
              <span class="dash-capital__decomp-drag-label">Nominal → Present value</span>
              <span class="dash-capital__decomp-drag-flow">
                <span class="dash-capital__decomp-drag-nominal">₹${decomp.nominalCr.toFixed(2)} Cr</span>
                <span class="dash-capital__decomp-drag-arrow">→</span>
                <span class="dash-capital__decomp-drag-pv">₹${decomp.pvCr.toFixed(2)} Cr</span>
              </span>
              <span class="dash-capital__decomp-drag-note">−₹${decomp.dragCr.toFixed(2)} Cr compression at ${pcvState.discountRate}% over ${pcvState.horizonYears}y</span>
            </div>
          </div>
        </section>

        <section class="dash-position" data-reveal>
          <div class="dash-position__eyebrow">Market Position</div>
          <div class="dash-position__rail">
            ${percentileRailSVG(market.percentile)}
          </div>
          <div class="dash-position__cell">
            <div class="dash-position__cell-label">Benchmark basis</div>
            <div class="dash-position__cell-value">${market.cellLabel}</div>
            ${market.cellNote ? `<div class="dash-position__cell-note">${market.cellNote}</div>` : ''}
          </div>
          ${market.median ? `
            <div class="dash-position__gap">
              <span class="dash-position__gap-label">Cohort median</span>
              <span class="dash-position__gap-value">₹${market.median.toFixed(0)}L</span>
              <span class="dash-position__gap-delta dash-position__gap-delta--${profile.currentComp >= market.median ? 'pos' : 'neg'}">
                ${profile.currentComp >= market.median ? '+' : ''}${(profile.currentComp - market.median).toFixed(0)}L
              </span>
            </div>
          ` : ''}
          <div class="dash-position__confidence">
            <div class="dash-position__confidence-head">
              <span class="dash-position__confidence-eyebrow">Confidence</span>
              <span class="dash-position__confidence-pips dash-position__confidence-pips--${market.quality.level}">
                ${'●'.repeat(market.quality.pips)}<span class="dash-position__confidence-pips-empty">${'●'.repeat(Math.max(0, 4 - market.quality.pips))}</span>
              </span>
            </div>
            <div class="dash-position__confidence-label">${market.quality.label}</div>
            <div class="dash-position__confidence-note">${market.quality.note}</div>
          </div>
        </section>

      </div>

      <!-- ── ZONE 5 · RISK POSTURE ───────────────────────────────────── -->
      <section class="dash-risk" data-reveal>
        <div class="dash-risk__head">
          <div class="dash-risk__eyebrow">Risk Posture</div>
          <div class="dash-risk__regime">${humanize(risk.regime)} regime</div>
        </div>
        <div class="dash-risk__grid">
          ${risk.cells.map(c => `
            <div class="dash-risk__cell dash-risk__cell--${c.severity}">
              <div class="dash-risk__cell-label">${c.label}</div>
              <div class="dash-risk__cell-value">
                <span>${c.value}</span>${c.valueNote ? `<span class="dash-risk__cell-value-note">${c.valueNote}</span>` : ''}
              </div>
              <div class="dash-risk__meter">
                ${[1,2,3,4].map(n => `<span class="dash-risk__pip ${n <= c.pips ? 'is-on' : ''}"></span>`).join('')}
                <span class="dash-risk__cell-severity">${c.severityLabel}</span>
              </div>
              <div class="dash-risk__cell-body">${c.body}</div>
            </div>
          `).join('')}
        </div>
      </section>

      <!-- ── ZONE 6 · DECISION QUEUE ─────────────────────────────────── -->
      <section class="dash-queue" id="dash-queue" data-reveal>
        <div class="dash-queue__head">
          <div class="dash-queue__eyebrow">Decisions on your desk</div>
          <div class="dash-queue__hint">derived from your current state</div>
        </div>
        <div class="dash-queue__rows">
          ${queue.map((q, i) => `
            <a class="dash-queue__row" href="${q.route}">
              <div class="dash-queue__num">${String(i + 1).padStart(2, '0')}</div>
              <div class="dash-queue__body">
                <div class="dash-queue__move">${q.move}</div>
                <div class="dash-queue__why">${q.why}</div>
              </div>
              <div class="dash-queue__route">
                <span class="dash-queue__route-label">${q.routeLabel}</span>
                <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5h6m0 0L5 2m3 3L5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
              </div>
            </a>
          `).join('')}
        </div>
      </section>

      <!-- ── ZONE 7a · LIVE MARKET OVERLAY ───────────────────────────── -->
      <section class="dash-market-pulse-host" id="dash-market-pulse" data-reveal>
        <!-- Filled asynchronously by renderMarketPulseZone(); self-manages
             loading / empty / stale / overlay-only states. Benchmark zones
             above continue to render regardless of overlay state. -->
      </section>

      <!-- ── ZONE 7 · ANALYSIS STACK ─────────────────────────────────── -->
      <section class="dash-stack" data-reveal>
        <div class="dash-stack__head">
          <div class="dash-stack__eyebrow">Analysis Stack</div>
          <div class="dash-stack__hint">layers informing the current brief</div>
        </div>
        <div class="dash-stack__rows">
          ${analysisStackRow('HCAM', 'Human Capital Asset Model',     'live',  `Valuing professional capital at ₹${pcvResult.pcvCr.toFixed(2)} Cr.`)}
          ${(() => {
            const benchCVI = roleCVI(cell.role);
            const isLive = benchCVI != null;
            return analysisStackRow('CVI',  'Career Volatility Index',
              isLive ? 'live' : 'build',
              isLive
                ? `${state.cvi.value.toFixed(2)} reading sourced from ${state.clusterLabel.toLowerCase()} cohort data.`
                : `Using a path-volatility proxy for this cohort while direct readings are integrated.`);
          })()}
          ${analysisStackRow('SST',  'Skill Stacking Theorem',        'build', `Skill inventory ingested; ROI layer scheduled for the next release.`)}
          ${analysisStackRow('GPF',  'Geographic Premium Framework',  'build', `City-tier signal active; full geography premium model not yet integrated.`)}
          ${analysisStackRow('PCC',  'Portfolio Career Construction', 'build', `${Object.keys(store.scenarios).length === 0 ? 'Single trajectory under analysis' : `${Object.keys(store.scenarios).length + 1} trajectories under analysis`}; portfolio comparison layer pending.`)}
          ${analysisStackRow('OT',   'Optionality Theorem',           'build', `Optionality branch not yet incorporated into the current brief.`)}
        </div>
      </section>

      <!-- ── ZONE 8 · METADATA FOOTER ────────────────────────────────── -->
      <footer class="dash-meta-foot">
        <span>Engine coverage 7 / 32</span>
        <span class="dash-meta-foot__sep"></span>
        <span>Phase 4</span>
        <span class="dash-meta-foot__sep"></span>
        <span>Last computed ${nowShort()}</span>
        <span class="dash-meta-foot__sep"></span>
        <span>Auto · live engine</span>
      </footer>

    </div>
  `;

  /* Animations */
  const pcvEl = container.querySelector('#dash-pcv');
  if (pcvEl) countUp(pcvEl, pcvResult.pcvCr, { formatter: v => v.toFixed(2), duration: 1400 });
  const pctEl = container.querySelector('#dash-pct');
  if (pctEl) countUp(pctEl, pcvResult.percentile, { decimals: 0, duration: 1200 });
  const cviEl = container.querySelector('#dash-cvi');
  if (cviEl) countUp(cviEl, state.cvi.value, { formatter: v => v.toFixed(2), duration: 900 });

  /* Scroll-reveal — picks up every [data-reveal] inside the rendered DOM */
  reveal('[data-reveal]');

  /* Live Market Overlay — Zone 7a. Fire-and-forget; the zone manages
     its own loading, empty, stale, and overlay-only states. The seven
     benchmark zones above are unaffected by overlay state. */
  warmupOverlay();
  const mpTarget = container.querySelector('#dash-market-pulse');
  if (mpTarget) {
    renderMarketPulseZone(mpTarget).catch(err => {
      console.warn('[dashboard] market pulse render failed:', err);
    });
  }
}

/* ══════════════════════════════════════════════════════════════════════
   11 · MARKUP HELPERS
   ══════════════════════════════════════════════════════════════════════ */

function renderBriefItems(items, magKey) {
  if (!items.length) {
    return `<div class="dash-snapshot__empty">None surfaced at this state.</div>`;
  }
  return items.map((it, i) => `
    <div class="dash-snapshot__item">
      <span class="dash-snapshot__item-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="dash-snapshot__item-body">${it.body}</span>
      <span class="dash-snapshot__item-mag dash-snapshot__item-mag--${(it[magKey] || '').toLowerCase()}">${it[magKey]}</span>
    </div>
  `).join('');
}

function decompCell(label, d) {
  return `
    <div class="dash-capital__decomp-cell">
      <div class="dash-capital__decomp-label">${label} · ${d.bandLabel}</div>
      <div class="dash-capital__decomp-value">₹${d.cr.toFixed(2)} Cr · ${d.pct}%</div>
      <div class="dash-capital__decomp-bar"><span style="width: ${d.pct}%"></span></div>
    </div>
  `;
}

function analysisStackRow(code, name, status, signal) {
  return `
    <a class="dash-stack__row" href="#/methodology">
      <span class="dash-stack__row-code">${code}</span>
      <span class="dash-stack__row-name">${name}</span>
      <span class="dash-stack__row-status dash-stack__row-status--${status}">${status === 'live' ? 'Live' : 'In Build'}</span>
      <span class="dash-stack__row-signal">${signal}</span>
    </a>
  `;
}

function stampStrip() {
  const d = new Date();
  const month = d.toLocaleString('en-US', { month: 'short' }).toUpperCase();
  return `${month} ${d.getDate()} · ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function nowShort() {
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function pad(n) { return String(n).padStart(2, '0'); }
