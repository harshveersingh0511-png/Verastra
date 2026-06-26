# Verastra · Build Notes

Human capital decision intelligence platform. Vanilla JS, no framework, no build step. Obsidian/honey design system. Static file serving.

## Status — Phase 7 complete

7 live engines + Terminal orchestration layer with all 12 recipes fully composed.
25 remaining engines staged as IN BUILD cards.

## Phase 7 ships

All 12 Terminal recipes now produce fully-composed memos backed by real engine output. The eight previously-stubbed classes (Cluster Pivot, Skill Investment, Volatility Read, Promotion Scenario, Founder Track, Trajectory Projection, Path Comparison, Benchmark Lookup) ship complete in this build.

### Memos · all 12 classes producing real output

| Class | Headline shape (Harshveer profile) |
|---|---|
| `CAPITAL_VALUATION` | `Capital value: ₹4.98 Cr at the 73th percentile of the Transfer Pricing cohort.` |
| `CITY_MOVE` | `Real wealth gain Mumbai → Bangalore: +₹11.3L/year.` |
| `OFFER_EVALUATION` | `Offer ₹35.0L lands at the 99th percentile — a strong offer for this cohort.` |
| `COHORT_POSITION` | `73th percentile against the Transfer Pricing cohort.` |
| `CLUSTER_PIVOT` | `Pivot to Consulting & Strategy adds ₹13.60 Cr in PCV vs staying in Finance.` |
| `SKILL_INVESTMENT` | `CFA Charterholder: NHV +₹12.2L over 60mo, payback M21.` |
| `VOLATILITY_READ` | `CVI 1.07 (Moderate) — top driver: Attrition. Published: 0.95.` |
| `PROMOTION_SCENARIO` | `Promotion in Y4 costs ₹7.26 Cr vs baseline (post-growth assumption is below pre).` |
| `FOUNDER_TRACK` | `Founder track (Seed) edges ahead by ₹2.34 Cr in pure PCV — but read the caveats.` |
| `TRAJECTORY_PROJECTION` | `Projected 14-year path: ₹2.09 Cr discounted, ₹4.57 Cr nominal cumulative.` |
| `PATH_COMPARISON` | `Investment Banking — Analyst wins by ₹1.52 Cr in PCV.` |
| `BENCHMARK_LOOKUP` | `Transfer Pricing: median ₹30L (low 24 · high 40 · tier S).` |

### Recipe pattern

Each recipe is a pure function: `run(query, ent, profile) → memo`. The recipe (a) resolves missing parameters against the profile, (b) calls engine modules to do the actual computation, (c) composes the memo from real engine output. Same inputs → same memo. No LLM, no randomness, no fabrication.

```
recipes.js
├── runCapitalValuation     → PCV
├── runCityMove             → City Move
├── runOfferEvaluation      → Cohort + PCV
├── runCohortPosition       → Cohort matrix
├── runClusterPivot         → Path Comparison (B = detected target)
├── runSkillInvestment      → Skill ROI with α
├── runVolatilityRead       → CVI with published comparison
├── runPromotionScenario    → Trajectory with no-promo counterfactual
├── runFounderTrack         → Path Comparison vs founder track
├── runTrajectoryProjection → Trajectory + salary_curve overlay
├── runPathComparison       → Path Comparison (both paths from query)
└── runBenchmarkLookup      → Matrix cell or aggregate
```

### Counterfactuals and cross-checks

Several recipes surface a counterfactual or cross-check, not just a single number:

- **Promotion scenario** computes the no-promotion baseline and surfaces the delta (the gain or loss from the promotion specifically).
- **Volatility Read** shows both the computed CVI from the 4-component formula AND the published CVI from `career_volatility_index_extended` — divergence is visible.
- **Trajectory Projection** surfaces the published 14-year `salary_curve_lpa_median` (when one exists for the role) alongside the modeled trajectory.
- **Offer Evaluation** combines cohort matrix percentile + PCV recomputed at the offer comp + optional city-real adjustment.
- **Path Comparison** uses each path's own benchmark-driven discount rate (path-specific career risk premium).

## Phase 5 + 6 recap

Phase 5: every live engine consumes `benchmarks_master.json` through `assets/js/data/benchmarks.js`. Full 28-city coverage, 0.0–3.0 CVI scale matching dataset, 93 matrix cells in Cohort Benchmark, 21 skills in Skill ROI, career-stage growth in Trajectory, path-specific discount in Path Comparison.

Phase 6: Terminal as a natural-language decision routing surface — rules-based classifier across 12 query classes with graceful fallback, entity extractor for cities/comps/years/skills/roles/firms, four fully-composed recipes (Capital Valuation, City Move, Offer Evaluation, Cohort Position).

## What remains heuristic (by design)

- DCF formulation, ν=0.3 PCV volatility haircut sensitivity
- Skill cost in ₹ (dataset doesn't carry direct outlay)
- 30% flat tax in City Move
- Comp bump heuristic in Promotion Scenario (40% at <Y3, 35% at Y4-6, 28% at Y7+)
- Founder growth assumption (25% pre-exit) in Founder Track recipe

## What does NOT use AI

The classifier is rules-based. Entity extraction is regex + alias lookup. Recipes call engines and compose templated memos. The Terminal is intentionally deterministic: same query + same profile → same memo. This is a choice, not a limitation.

## Build at

`/home/claude/build/verastra/`
