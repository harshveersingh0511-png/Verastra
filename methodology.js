/* ──────────────────────────────────────────────────────────────────────
   METHODOLOGY VIEW — the doctrine page
   Sticky TOC · scrolling doctrine body · sticky right meta panel that
   updates per framework as you scroll.

   Six framework sections (HCAM/CVI/SST/GPF/PCC/OT). Each with:
   what it measures · construction · assumptions · caveats · engines.
   ────────────────────────────────────────────────────────────────────── */

const FRAMEWORKS = [
  {
    code: 'HCAM',
    layer: 'Valuation & Earnings Power',
    name: 'Human Capital Asset Model',
    tagline: 'The DCF for careers.',
    measures: `The discounted present value of a professional trajectory, modeled as a financial asset. HCAM is the
      valuation primitive every other framework composes against: when CVI says a path is fragile, what it means
      operationally is "haircut the HCAM expectation." When OT identifies a convex move, it's measured against the
      HCAM baseline. PCV is the framework's most direct expression.`,
    formula: 'PCV = Σ<sub>t=0</sub><sup>T−1</sup> [ C<sub>0</sub> · (1+g)<sup>t</sup> · (1 − ν·vol) ] / (1+d)<sup>t</sup>',
    where: `C₀ = current annual compensation · g = expected nominal growth rate · vol = career volatility (from CVI) ·
      ν = 0.3 volatility haircut sensitivity (calibrated) · d = discount rate · T = horizon in years`,
    construction: `Expected compensation in year t compounds geometrically at rate g from a current base C₀. That
      expectation is then haircut linearly by ν·vol — a haircut sensitivity ν=0.3 calibrated against the variance of
      observed cohort outcomes in the master benchmark dataset. The haircut output is discounted to present value at
      rate d, and the sequence is summed across the horizon T. Output unit is ₹ Cr.`,
    assumptions: [
      'Compensation grows geometrically at a constant nominal rate. Mid-career inflections (sector switch, sabbatical, founder pivot) are out of scope; they live in Path Comparison.',
      'Volatility produces a linear expected-value haircut. Quadratic and tail-risk treatments are deferred to CVI v2.',
      'Discount rate is constant across the horizon. Term-structure treatment (declining d for longer horizons) is a v2 feature.',
      'Cohort percentile is a normal-CDF heuristic over track-level median/sigma priors. Tighter benchmarking requires Cohort Benchmark.',
    ],
    caveats: [
      'PCV is a point estimate. For distributional outcomes — the full distribution of PCV under stochastic comp paths — use Monte Carlo Trajectory.',
      'Output is nominal ₹. Real PCV requires a separate inflation-adjustment layer (Phase 4 deliverable).',
      'Recession and discontinuity scenarios are explicitly NOT in HCAM. They live in Recession Stress Test.',
      'Sensitivity to discount rate is large at long horizons — a 200 bps shift in d typically moves PCV by 25–40%.',
    ],
    engines: [
      { num: '01', name: 'Professional Capital Value', status: 'live', slug: 'professional-capital-value' },
      { num: '02', name: 'MBA NPV Calculator', status: 'build' },
      { num: '03', name: 'PhD NPV Calculator', status: 'build' },
      { num: '04', name: 'Sabbatical NPV Impact', status: 'build' },
      { num: '05', name: 'FIRE Threshold Calculator', status: 'build' },
      { num: '06', name: 'Offer Decomposer', status: 'build' },
    ],
    sourceTier: 'S',
  },

  {
    code: 'CVI',
    layer: 'Volatility, Risk & Downside',
    name: 'Career Volatility Index',
    tagline: 'The fragility profile of a trajectory.',
    measures: `A bounded [0, 1] composite that quantifies how fragile a professional position is at this moment. CVI is
      composed from role-level attrition, automation exposure, sector compression, firm-quality decay, and inter-cluster
      mobility. It is the risk premium HCAM applies via the volatility haircut.`,
    formula: 'CVI = w<sub>a</sub>·attrition + w<sub>x</sub>·automation + w<sub>s</sub>·sector + w<sub>f</sub>·firm_decay − w<sub>m</sub>·mobility',
    where: `w_a, w_x, w_s, w_f, w_m = component weights (calibrated against historical cohort displacement) · all component
      values normalized to [0, 1] · output clamped to [0, 1]`,
    construction: `Each of the five components is sourced from the benchmark master dataset at source-tier S or A only.
      Attrition is the 5-year cohort-exit rate for the specific role. Automation exposure follows a labor-market exposure
      index calibrated quarterly. Sector compression is a forward-looking estimate of revenue/headcount compression in the
      addressable sector. Firm-quality decay tracks brand and balance-sheet trajectory of the employer tier. Mobility is
      the only term that subtracts — it measures cross-cluster optionality and partially offsets the other risks.`,
    assumptions: [
      'Risk components are roughly independent at the cohort level. Specific cluster-level correlations exist (e.g. tax + audit move together) but are absorbed into the weights at calibration time.',
      'Mobility is treated as risk reduction, not risk addition. This is right empirically — the most mobile cohorts have the lowest tail outcomes — but counterintuitive.',
      'Weights are stable across professional clusters in v1. Cluster-specific weight recalibration is a v2 deliverable.',
    ],
    caveats: [
      'CVI is a snapshot. Tail risks — 2008-scale recessions, sector collapses, regulatory shocks — are not in CVI by construction. They live in Recession Stress Test.',
      'AI displacement weight is the most uncertain term in the composite and is recalibrated quarterly. Material changes to displacement priors will materially move CVI for affected roles.',
      'CVI for founder and operator paths is conservative — outcome variance dominates and the composite undershoots reported high-variance reality.',
    ],
    engines: [
      { num: '07', name: 'Career Volatility Index', status: 'live', slug: 'career-volatility-index' },
      { num: '08', name: 'Monte Carlo Trajectory', status: 'build' },
      { num: '09', name: 'Recession Stress Test', status: 'build' },
      { num: '10', name: 'AI Displacement Index', status: 'build' },
      { num: '11', name: 'Sector Mobility Index', status: 'build' },
    ],
    sourceTier: 'A',
  },

  {
    code: 'SST',
    layer: 'Skill Capital & ROI',
    name: 'Skill Stacking Theorem',
    tagline: 'Skill acquisition as capital allocation.',
    measures: `The risk-adjusted compensation premium from acquiring a defined skill (or skill stack) over a horizon.
      Treats each skill as a position with a learning cost, a compounding premium, a decay rate, and an interaction
      profile with skills already in the stack.`,
    formula: 'SST<sub>i</sub> = ( Δpremium<sub>i</sub> · decay<sub>i</sub> − cost<sub>i</sub> ) / ttl<sub>i</sub>',
    where: `Δpremium_i = expected compensation premium from skill i · decay_i = premium decay factor over the horizon ·
      cost_i = total acquisition cost (time + opportunity + direct outlay) · ttl_i = time-to-proficiency in months`,
    construction: `For each candidate skill, SST returns a per-month ROI under stated horizon and decay assumptions.
      Stacking is handled multiplicatively for complementary skills (e.g. Python on top of FP&A: Δpremium compounds) and
      additively for substitutes. Network capital and reputation capital are treated as adjacent asset types, not as a
      fifth skill — see the Network Compound Engine and Reputation Index for those constructions.`,
    assumptions: [
      'Skill premiums are quasi-stable over 5–7 year windows. Technology-adjacent skills assume faster decay.',
      'Learning cost includes the opportunity cost of foregone earned income during acquisition, not just direct outlay.',
      'Complementary stacking is multiplicative; substitute stacking is additive. The complement/substitute classification is in the dataset.',
    ],
    caveats: [
      'Premium estimates for emerging skills are sparse and noisy. Source-tier C data is excluded from production SST runs; affected skills return "NULL_INSUFFICIENT_DATA" rather than a guess.',
      'SST does not model branding or signaling effects of credential acquisition (CFA, MBA). Those are valued in HCAM via the direct premium term and in OT via optionality.',
      'Career-stage matters: SST premiums are highest in the first compounding decade. After ~10 years experience, premiums compress significantly for most skills.',
    ],
    engines: [
      { num: '12', name: 'Skill ROI Engine', status: 'live', slug: 'skill-roi' },
      { num: '13', name: 'Specialization Premium', status: 'build' },
      { num: '14', name: 'Network Compound Engine', status: 'build' },
      { num: '15', name: 'Reputation Index', status: 'build' },
    ],
    sourceTier: 'A',
  },

  {
    code: 'GPF',
    layer: 'Geography & Mobility',
    name: 'Geographic Premium Framework',
    tagline: 'Real wealth after the city takes its share.',
    measures: `Real compensation across cities and borders after rent, tax, cost of living, currency, and qualitative
      adjustments. GPF reveals the geographic premium most movers fail to model — the case where a 40% nominal raise to
      a Tier 1 metro produces a 5% real-wealth gain after the city consumes its share.`,
    formula: 'Real_Comp = Nominal_Comp · (1 − tax) · (1 / CoL) · FX − rent_share − transit_share',
    where: `tax = effective marginal tax rate · CoL = cost-of-living index (base = 1.0) · FX = currency conversion to
      base · rent_share and transit_share = consumed shares of nominal in the new geography`,
    construction: `GPF starts with nominal compensation, applies the effective tax rate, normalizes for cost-of-living
      and currency, and then subtracts the consumed shares from rent and commute. Quality-of-life adjustment is applied
      separately as a multiplier with an explicit subjectivity disclaimer — the framework returns multiple QOL scenarios
      rather than a single point estimate, because QOL weights are unavoidably personal.`,
    assumptions: [
      'Cost-of-living indices are aggregated to the metro level. Within-metro variance (e.g. South Mumbai vs Navi Mumbai) is not modeled in v1.',
      'Tax rates assume residence-only, single-filer status. Cross-border tax treaties and multi-jurisdiction filings are handled by International Premium Map.',
      'Currency conversion uses spot rates at compute time. Forward-curve treatment is a v2 feature.',
    ],
    caveats: [
      'City data refresh cadence is quarterly. Crisis-period CoL spikes (housing bubble, rent shocks) are not reflected until the next cycle.',
      'Quality-of-life adjustment is intentionally not collapsed to a single number. Family proximity, climate, healthcare access, and visa friction are returned as separate dimensions for the user to weight.',
      'GPF assumes voluntary mobility. Forced relocation (visa expiration, family obligation, firm closure) requires CVI to size the downside.',
    ],
    engines: [
      { num: '16', name: 'City Move Calculator', status: 'live', slug: 'city-move-calculator' },
      { num: '17', name: 'International Premium Map', status: 'build' },
      { num: '18', name: 'Cohort Benchmark', status: 'live', slug: 'cohort-benchmark' },
    ],
    sourceTier: 'A',
  },

  {
    code: 'PCC',
    layer: 'Path Comparison & Portfolio',
    name: 'Portfolio Career Construction',
    tagline: 'A career as a portfolio of positions.',
    measures: `The risk-return profile of a career composed of multiple positions — primary role, side income, skill
      investments, equity stakes, brand assets. PCC asks the portfolio-theory question: given your existing positions,
      what is the next allocation that improves the risk-adjusted return of the whole?`,
    formula: 'Optimal_Portfolio = argmax<sub>w</sub> ( w<sup>T</sup>μ − γ · w<sup>T</sup>Σw )',
    where: `w = allocation vector across positions · μ = expected return vector (from HCAM per position) · Σ =
      covariance matrix between positions · γ = risk aversion coefficient (user-set or default 2.0)`,
    construction: `Each career position is modeled as a holding with expected return (from HCAM), variance (from CVI),
      and a covariance with other positions in the portfolio. Optimal allocation is found by maximizing the standard
      mean-variance utility. Liquidity and reversibility constraints are applied as hard bounds: cash income is fully
      liquid, equity grants are time-locked, reputation is sticky downward but liquid upward.`,
    assumptions: [
      'Time and energy are the scarce resources being allocated, not just money. The model returns time-allocation recommendations alongside capital allocation.',
      'Correlations between positions are non-zero. Building a personal brand correlates positively with consulting income; tenure-track and startup-operator paths correlate negatively.',
      'Risk aversion γ is user-set. Default γ = 2.0 corresponds to moderate risk aversion in standard utility theory.',
    ],
    caveats: [
      'Portfolio framing is most useful past the first compounding inflection — typically 7–10 years experience. Earlier careers benefit more from depth than diversification, and PCC will return depth recommendations in that range.',
      'Covariance estimates are heuristic, drawn from the benchmark dataset where source-tier A coverage exists. Pairs without source-tier A coverage are excluded rather than estimated.',
      'PCC does not handle behavioral effects (career adventurism, status concerns, identity anchoring). These are real and material but explicitly out of scope.',
    ],
    engines: [
      { num: '19', name: 'Trajectory Engine', status: 'live', slug: 'trajectory-engine' },
      { num: '20', name: 'Portfolio Analyzer', status: 'build' },
      { num: '21', name: 'Barbell Allocator', status: 'build' },
      { num: '22', name: 'Path Comparison Engine', status: 'live', slug: 'path-comparison' },
      { num: '23', name: 'Firm Tier Classifier', status: 'build' },
      { num: '24', name: 'Bonus Ratio Benchmark', status: 'build' },
      { num: '25', name: 'Equity Calibration', status: 'build' },
      { num: '26', name: 'Raise Benchmark', status: 'build' },
    ],
    sourceTier: 'A',
  },

  {
    code: 'OT',
    layer: 'Strategic Optionality & Founder',
    name: 'Optionality Theorem',
    tagline: 'The convexity of a position.',
    measures: `The convexity of a strategic position — the gap between its expected value and the value of the optionality
      embedded in it. Where most career thinking optimizes for expected value, OT optimizes for the convex tail: the moves
      that bound your downside while keeping the upside open. Founder paths, partner tracks, IP positions, equity stakes,
      durable networks.`,
    formula: 'Position_Value = EV + max( 0, OV − floor_loss )',
    where: `EV = expected value of the position from HCAM · OV = optionality value (Black-Scholes-style adjustment for
      asymmetric upside) · floor_loss = bounded downside, typically the cash compensation differential vs the alternative
      stable role`,
    construction: `Each strategic move is decomposed into its expected-value component (the point estimate the rest of
      Verastra computes) and its optionality component (the convex tail). The optionality term uses an exit-distribution
      prior calibrated against published exit data for the relevant cluster — operator and founder paths have power-law
      exit distributions, partner tracks have log-normal, equity grants follow firm-specific priors. Positions are
      classified as convex if OV exceeds 30% of EV.`,
    assumptions: [
      'Downside is bounded. In every cluster the model considers, the worst case is reversion to a salaried role at a level above subsistence — there is always a floor. This assumption may not hold under exceptional circumstances (health, legal, family) but holds in the modal case.',
      'Tail outcomes follow a power-law for founder/operator paths and a log-normal for credentialed paths. These priors are recalibrated annually.',
      'Time-to-exit is roughly log-normally distributed across cluster outcomes. Median exit time is 6–9 years for funded founders, 12–15 years for partner tracks.',
    ],
    caveats: [
      'OT can recommend moves with low expected value but high variance. This is correct on paper but requires explicit risk-appetite calibration in practice. The model surfaces a "stomach check" warning when EV is below the cohort median.',
      'Founder EV is the noisiest input in the system. The tiered exit-distribution prior is honest about the wide bands, but readers should treat absolute founder EVs as order-of-magnitude estimates.',
      'OT does not model emotional and identity costs of pivoting into convex paths. Founder burnout, partner-track grind, and equity-overhang anxiety are real and not in the formula.',
    ],
    engines: [
      { num: '27', name: 'Founder EV Simulator', status: 'build' },
      { num: '28', name: 'Exit Path Decomposer', status: 'build' },
      { num: '29', name: 'Optionality Tree', status: 'build' },
      { num: '30', name: 'Moat Builder', status: 'build' },
      { num: '31', name: 'Negotiation Lever Map', status: 'build' },
      { num: '32', name: 'Career Thesis Builder', status: 'build' },
    ],
    sourceTier: 'A',
  },
];

/* ── Render ──────────────────────────────────────────────────────── */

export async function render(container, { store }) {
  container.innerHTML = `
    <div class="meth">

      <!-- ── TOC ─────────────────────────────────────────────── -->
      <aside class="meth-toc">
        <div class="meth-toc__label">Doctrine · Six Frameworks</div>
        ${FRAMEWORKS.map(f => `
          <a class="meth-toc__item" href="#/methodology" data-anchor="${f.code.toLowerCase()}">
            <span class="meth-toc__code">${f.code}</span>
            <span class="meth-toc__name">${f.name}</span>
          </a>
        `).join('')}
      </aside>

      <!-- ── BODY ────────────────────────────────────────────── -->
      <main class="meth-body">

        <div class="meth-intro">
          <div class="surface-head__eyebrow">Methodology · The Trust Layer</div>
          <h1 class="meth-intro__title">How Verastra thinks.</h1>
          <p class="meth-intro__body">
            Six frameworks for valuing, stress-testing, and structuring professional human capital across cohorts.
            Each one is a published, citable construction with explicit assumptions, declared caveats, and a defined
            set of citing engines. Written as doctrine — precise about what is known and honest about what is not.
          </p>
        </div>

        ${FRAMEWORKS.map(f => renderFramework(f)).join('')}

      </main>

      <!-- ── META ────────────────────────────────────────────── -->
      <aside class="meth-meta">
        <div class="meth-meta__label">Currently Reading</div>
        <div class="meth-meta__code" id="meta-code">${FRAMEWORKS[0].code}</div>
        <div class="meth-meta__name" id="meta-name">${FRAMEWORKS[0].name}</div>
        <div class="meth-meta__stats">
          <div class="meth-meta__stat">
            <span class="meth-meta__stat-label">Layer</span>
            <span class="meth-meta__stat-value" id="meta-layer">${FRAMEWORKS[0].layer}</span>
          </div>
          <div class="meth-meta__stat">
            <span class="meth-meta__stat-label">Engines</span>
            <span class="meth-meta__stat-value" id="meta-engines">${FRAMEWORKS[0].engines.length}</span>
          </div>
          <div class="meth-meta__stat">
            <span class="meth-meta__stat-label">Live</span>
            <span class="meth-meta__stat-value" id="meta-live">${FRAMEWORKS[0].engines.filter(e => e.status === 'live').length}</span>
          </div>
          <div class="meth-meta__stat">
            <span class="meth-meta__stat-label">Source Tier</span>
            <span class="meth-meta__stat-value" id="meta-tier">${FRAMEWORKS[0].sourceTier}</span>
          </div>
          <div class="meth-meta__stat">
            <span class="meth-meta__stat-label">Schema</span>
            <span class="meth-meta__stat-value">v2026.6</span>
          </div>
        </div>
        <a class="meth-meta__cta" href="#/tools" id="meta-cta">
          <span>Open engines</span>
          <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><path d="M2 5h6m0 0L5 2m3 3L5 8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </a>
      </aside>

    </div>
  `;

  setupScrollSync(container);
  setupTocClicks(container);
}

function renderFramework(f) {
  const liveCount = f.engines.filter(e => e.status === 'live').length;
  return `
    <section class="meth-framework" id="${f.code.toLowerCase()}" data-framework="${f.code}">
      <header class="meth-framework__head">
        <div class="meth-framework__layer-tag">
          <span class="meth-framework__layer-tag-code">${f.code}</span>
          <span>Layer · ${f.layer}</span>
        </div>
        <h2 class="meth-framework__name">${f.name}</h2>
        <p class="meth-framework__caption">${f.tagline}</p>
      </header>

      <div class="meth-sub">
        <div class="meth-sub__label">01 · What it measures</div>
        <div class="meth-sub__body">${f.measures}</div>
      </div>

      <div class="meth-sub">
        <div class="meth-sub__label">02 · Construction</div>
        <div class="meth-formula">
          ${f.formula}
          <div class="meth-formula__where">where  ${f.where}</div>
        </div>
        <div class="meth-sub__body">${f.construction}</div>
      </div>

      <div class="meth-sub">
        <div class="meth-sub__label">03 · Assumptions</div>
        <ul class="meth-list">
          ${f.assumptions.map(a => `<li>${a}</li>`).join('')}
        </ul>
      </div>

      <div class="meth-sub">
        <div class="meth-sub__label">04 · Caveats</div>
        <ul class="meth-list">
          ${f.caveats.map(c => `<li>${c}</li>`).join('')}
        </ul>
      </div>

      <div class="meth-sub">
        <div class="meth-sub__label">05 · Citing Engines · ${liveCount} live / ${f.engines.length} total</div>
        <div class="meth-engines">
          ${f.engines.map(e => `
            ${e.status === 'live' ? `<a class="meth-engine-link" href="#/tools/${e.slug}">` : `<div class="meth-engine-link">`}
              <span class="meth-engine-link__num">${e.num}</span>
              <span class="meth-engine-link__name">${e.name}</span>
              <span class="meth-engine-link__status meth-engine-link__status--${e.status}">${e.status === 'live' ? 'Live' : 'In Build'}</span>
            ${e.status === 'live' ? `</a>` : `</div>`}
          `).join('')}
        </div>
      </div>
    </section>
  `;
}

/* ── Scroll sync — update meta panel + active TOC item ──────────── */

function setupScrollSync(container) {
  const sections = container.querySelectorAll('.meth-framework');
  const tocItems = container.querySelectorAll('.meth-toc__item');
  const meta = {
    code: container.querySelector('#meta-code'),
    name: container.querySelector('#meta-name'),
    layer: container.querySelector('#meta-layer'),
    engines: container.querySelector('#meta-engines'),
    live: container.querySelector('#meta-live'),
    tier: container.querySelector('#meta-tier'),
  };

  function setActive(code) {
    const f = FRAMEWORKS.find(x => x.code === code);
    if (!f) return;
    if (meta.code)    meta.code.textContent = f.code;
    if (meta.name)    meta.name.textContent = f.name;
    if (meta.layer)   meta.layer.textContent = f.layer;
    if (meta.engines) meta.engines.textContent = f.engines.length;
    if (meta.live)    meta.live.textContent = f.engines.filter(e => e.status === 'live').length;
    if (meta.tier)    meta.tier.textContent = f.sourceTier;
    tocItems.forEach(item => {
      item.classList.toggle('is-active', item.dataset.anchor === code.toLowerCase());
    });
  }

  // Initial active
  setActive(FRAMEWORKS[0].code);

  // IntersectionObserver — section closest to top wins
  const observer = new IntersectionObserver((entries) => {
    // Pick the entry highest in the viewport that's intersecting
    const visible = entries
      .filter(e => e.isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
    if (visible.length > 0) {
      setActive(visible[0].target.dataset.framework);
    }
  }, {
    rootMargin: '-15% 0px -60% 0px',
    threshold: 0,
  });

  sections.forEach(s => observer.observe(s));
}

function setupTocClicks(container) {
  container.querySelectorAll('.meth-toc__item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      const code = item.dataset.anchor;
      const target = container.querySelector(`#${code}`);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}
