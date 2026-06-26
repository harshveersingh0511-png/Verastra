# Verastra · Phase 3 — Integration Spec

Phase 3 backend (the shared overlay service) and four consumer modules are complete and self-contained. This document tells you the exact, minimal edits to apply to four existing files so the overlay surfaces appear in the cockpit.

**Touch budget:** 4 existing files, ~6-12 lines added per file, zero lines removed. Every file should continue to behave identically when the overlay docs are absent.

---

## Architectural rule (re-statement)

Consumer surfaces import **only** from `assets/js/data/market-overlay.js` (the shared service) and the small surface-side modules built on top of it:

- `assets/js/terminal/overlay-composer.js` — Terminal-side prose
- `assets/js/views/dashboard-market-pulse.js` — Dashboard zone renderer
- `assets/js/tools/path-comparison-overlay.js` — Path Comparison cell helpers
- `assets/js/tools/city-move-overlay.js` — City Move destination panel helpers

No consumer file imports from `_firestore-rest.js`, reads `role_city_market` directly, checks confidence tiers, or inspects `benchmark_comparable`. All of that is encapsulated in the service.

---

## 1 · `app.html` — load the CSS

Single line, place it next to the other CSS imports in `<head>`:

```html
<link rel="stylesheet" href="assets/css/overlay.css">
```

---

## 2 · `assets/js/terminal/recipes.js` — overlay paragraph injection

### Step 2a — Add one import at the top of the file

```js
import { composeOverlayParagraph } from './overlay-composer.js';
```

### Step 2b — At the point in each recipe where the prose memo is being assembled, append one line

For recipes that have resolved a `(cluster_key, path_key, city_key)` triple — typically these eight: **CAPITAL_VALUATION**, **CITY_MOVE**, **OFFER_EVALUATION**, **COHORT_POSITION**, **CLUSTER_PIVOT**, **PROMOTION_SCENARIO**, **TRAJECTORY_PROJECTION**, **PATH_COMPARISON** — add the following near the end of memo composition, just before the memo is returned:

```js
const overlayPara = await composeOverlayParagraph({
  cluster_key, path_key, city_key
});
if (overlayPara) memo.push(overlayPara);
```

For recipes that resolved only a `city_key` (e.g. a city-scoped lookup), pass only what you have — the composer auto-selects the right sub-composer based on which keys are present:

```js
const overlayPara = await composeOverlayParagraph({ city_key });
if (overlayPara) memo.push(overlayPara);
```

For **BENCHMARK_LOOKUP**, which has no triple but should mention overlay system state, pass no arguments:

```js
const overlayPara = await composeOverlayParagraph();
if (overlayPara) memo.push(overlayPara);
```

### Recipe-specific composer choice (reference table)

| Recipe class | Keys passed | Composer fired internally | Notes |
|---|---|---|---|
| CAPITAL_VALUATION | `{cluster, path, city}` | role-city composer | One paragraph after the valuation conclusion |
| CITY_MOVE | `{city: destination}` | city pulse composer | After the cost-of-living verdict |
| OFFER_EVALUATION | `{cluster, path, city}` | role-city composer | After the offer verdict |
| COHORT_POSITION | `{cluster, path, city}` | role-city composer | After cohort placement |
| CLUSTER_PIVOT | `{cluster: target, path: target, city}` | role-city composer | For the *target* path |
| SKILL_INVESTMENT | none (skip) | — | Phase 3 does not surface overlay here; skill ROI is benchmark-driven |
| VOLATILITY_READ | none (skip) | — | Volatility is benchmark-only in V1 |
| PROMOTION_SCENARIO | `{cluster, path: next_band_path, city}` | role-city composer | For the *next-band* path |
| FOUNDER_TRACK | none (skip) | — | Founder track is a cross-cluster modifier, not a path with overlay data |
| TRAJECTORY_PROJECTION | `{cluster, path, city}` | role-city composer | One paragraph at the projection horizon |
| PATH_COMPARISON | per-path: `{cluster, path, city}` | role-city composer × N | One paragraph per path under comparison |
| BENCHMARK_LOOKUP | none | dashboard pulse summary composer | Mentions overlay system state |

**Recipes that should NOT get overlay paragraphs:** SKILL_INVESTMENT, VOLATILITY_READ, FOUNDER_TRACK. These are either benchmark-only or operate on dimensions the overlay does not model in V1.

---

## 3 · `assets/js/views/dashboard.js` — add the market pulse zone

### Step 3a — Add one import at the top

```js
import { renderMarketPulseZone } from './dashboard-market-pulse.js';
import { warmup as warmupOverlay } from '../data/market-overlay.js';
```

### Step 3b — Add the zone to the DOM scaffolding

Choose your placement. The recommended slot is **after Zone 6 (Decision Queue) and before Zone 7 (Analysis Stack)** — the overlay zone is decision-supporting context, not state, and not analysis itself. The new zone is **Zone 7a — Live Market Overlay**, leaving the existing eight zones intact.

In the dashboard scaffolding code, where you build the zones, add:

```html
<section class="zone zone--market-pulse" data-zone="market-pulse">
  <div class="zone__body" id="market-pulse-zone"></div>
</section>
```

### Step 3c — Render the zone after dashboard mount

In the function that finalizes the dashboard render (after the existing eight zones are populated), add:

```js
const mpTarget = document.getElementById('market-pulse-zone');
if (mpTarget) {
  // Fire-and-forget; the zone manages its own loading / empty / stale states.
  renderMarketPulseZone(mpTarget).catch(err => {
    console.warn('[market-pulse] render failed:', err);
  });
}
```

### Step 3d (optional but recommended) — warm cache on app boot

In the early dashboard mount path:

```js
// Pre-fetch the dashboard pulse so the zone renders without a visible delay.
warmupOverlay();
```

---

## 4 · `assets/js/tools/path-comparison.js` — add overlay column

### Step 4a — Add the import

```js
import { getOverlayForPathRow, renderOverlayCell } from './path-comparison-overlay.js';
```

### Step 4b — Add the column header

Wherever the comparison table is built, add a new `<th>` after the existing analytical columns (placement is up to you; the right edge is fine):

```html
<th class="path-comparison__col path-comparison__col--overlay">
  Live market signal
</th>
```

### Step 4c — Add the cell render for each row

For each path row being built, add an overlay cell. The `clusterKey`, `pathKey`, `cityKey` should be the ones the row is comparing (City Comparison passes its `city_key` per row; if a row has no city the cell will render `—`):

```js
const overlayCell = document.createElement('td');
overlayCell.className = 'path-comparison__cell path-comparison__cell--overlay';
row.appendChild(overlayCell);

// Async-fill; row is already in DOM, so this updates in place
(async () => {
  const overlay = await getOverlayForPathRow(clusterKey, pathKey, cityKey);
  renderOverlayCell(overlayCell, overlay);
})();
```

When `cityKey` is null (user has not specified a destination), `getOverlayForPathRow` returns null and the cell stays as `—`. No errors, no Firestore call attempted.

---

## 5 · `assets/js/tools/city-move-calculator.js` — destination momentum panel

### Step 5a — Add the imports

```js
import { getDestinationMomentum, renderDestinationMomentumPanel } from './city-move-overlay.js';
```

### Step 5b — After the calculation result block in the DOM, add a target

```html
<div id="city-move-destination-momentum"></div>
```

Place this **after** the cost-of-living verdict, the gross-up table, and the PCV impact summary — i.e. the overlay panel is the *last* element of the result page so its presence/absence never visually displaces the benchmark-driven content.

### Step 5c — Populate the panel after recalculation

In the recalc handler, after the existing benchmark math has rendered:

```js
const target = document.getElementById('city-move-destination-momentum');
if (target) {
  // Clear any prior panel so a destination change doesn't double-render
  target.replaceChildren();
  const momentum = await getDestinationMomentum(destinationCityKey);
  if (momentum) renderDestinationMomentumPanel(target, momentum);
}
```

If the destination city has no overlay pulse (or the pulse is stale), `getDestinationMomentum` returns null and nothing is rendered — the calculator's existing benchmark output stands on its own, identical to today.

---

## Behavior matrix — what users see in each state

| Overlay docs state | Dashboard market pulse zone | Path Comparison overlay column | City Move destination panel | Terminal recipes |
|---|---|---|---|---|
| Snapshot fresh, HIGH-tier signals present | Three lanes populated with accelerations / coolings / skill shifts; coverage strip green | Each path row shows demand + momentum + comparability flag | Destination panel shows momentum summary + strongest clusters/paths | Each applicable recipe appends one assertive overlay paragraph |
| Snapshot fresh, MEDIUM-tier only | Same shape, MEDIUM-tier badges | Same, MEDIUM badges | Same, MEDIUM tier | Paragraphs use "Recent overlay signal suggests…" softer verbs |
| Snapshot fresh, LOW-tier only | Items appear but with LOW badges (visually muted) | Cells render with LOW badge | Panel renders | Paragraphs use "Early overlay signal tentatively suggests…" hedge |
| Snapshot fresh, all THIN | Zone shows "no notable shifts this week" empty states | Cell renders `—` | Panel omitted | No overlay paragraph appended |
| Snapshot older than 30 days (stale) | Zone shows "last refresh N days ago — signal suppressed" | Cell renders `—` | Panel omitted | No overlay paragraph appended |
| Overlay docs missing entirely (first run pending, or Firestore unreachable) | Zone shows "standing by — no recent snapshot" | Cell renders `—` | Panel omitted | No overlay paragraph appended |
| Path is `benchmark_comparable: false` (one of the 31 null-ref paths) | Item shows "overlay-only" badge instead of "benchmark-comparable" | Cell shows "overlay-only" badge | Path entry shows "overlay-only" badge | Paragraph appends explicit note: "This path has no benchmark cohort cell in V1, so no benchmark comparison is offered" |

This last row is the one that satisfies your explicit Phase 2 ask: the benchmark-comparable distinction is visible in the interpretation layer, not hidden.

---

## What this PR does NOT change

- No file under `assets/data/benchmarks/` is touched. Benchmark core (Layer A) is unchanged.
- PCV, Cohort Benchmark, Skill ROI, Trajectory Engine, Path Comparison math, City Move math — all continue to read benchmark cells. The overlay is purely additive context.
- The terminal recipe classifier (`classifier.js`), entity extractor (`entities.js`), and benchmark accessors (`benchmarks.js`) are unchanged.
- The dashboard's existing eight zones (State Header, State Rail, Brief, Capital Structure + Market Position, Risk Posture, Decision Queue, Analysis Stack, Metadata Footer) are unchanged. The market pulse is **Zone 7a**, added between zones 6 and 7.

---

## Failure modes — confirmed safe

I want to call out the failure modes explicitly so you can sanity-check the architecture is what you wanted:

1. **Firestore unreachable / 503** — `_firestore-rest.js` returns null. Service propagates null. Every consumer surface renders the no-overlay state (empty zone, `—` cell, omitted panel, no recipe paragraph). The benchmark-driven app is unaffected.
2. **Doc exists but malformed** — `decodeDoc()` returns whatever it can decode; missing fields appear as undefined; `buildInterpretation()` defaults to THIN tier; consumer goes silent.
3. **Stale snapshot (> 30 days)** — Detected at the service layer; all consumers see `is_stale: true` via `interpretation`. They render the stale state (dashboard) or omit overlay entirely (other surfaces).
4. **Cache poisoning during a session** — In-memory cache is per-page-load (12-hour TTL); refresh clears it. Explicit `clearCache()` available for testing.
5. **Path with `benchmark_comparable: false`** — Service still returns the doc + interpretation; `can_make_comparative_claim` is false. Consumers render the overlay-only badge. Terminal composer appends the explicit benchmark-noncomparative sentence.
6. **Mismatched canonical keys** — Should never happen because the Phase 2 writer asserted canonical keys before write. If somehow it did, the consumer's `getDoc()` call returns null (doc not found) and the surface goes silent.
7. **Schema version mismatch** — Every overlay doc carries `overlay_version` (stamped by the backend aggregator). The frontend declares `SUPPORTED_VERSIONS = ['1.0']`. Docs whose version is missing or not in that list are rejected at the service layer; a single `console.warn` per doc-shape is logged for ops visibility. Consumer surfaces fall back to the no-overlay state identically to case (1) above.

## Version + cache configuration

The Phase 3 service uses two configurable constants that operations should be aware of:

- **Cache TTL: 12 hours.** Backend refresh is weekly (Sunday 02:30 IST), so a long TTL is safe — a continuously open tab re-fetches twice a day, catching the Sunday snapshot on the next visit without redundant reads during normal use. Defined in `market-overlay.js` as `CACHE_TTL_MS`.

- **Supported overlay versions: `['1.0']`.** Defined in `market-overlay.js` as `SUPPORTED_VERSIONS`. The backend's matching `OVERLAY_VERSION` constant lives in `src/server/market/overlay-version.js`. Both must be kept in sync.

  **Bumping the version** when the overlay schema evolves:
  - *Minor bump* (1.0 → 1.1, additive schema change): extend `SUPPORTED_VERSIONS` to `['1.0', '1.1']` and deploy the frontend first; then bump backend `OVERLAY_VERSION` to `'1.1'` and deploy. Old docs continue to work during the transition.
  - *Major bump* (1.x → 2.0, breaking schema change): drop `'1.x'` from `SUPPORTED_VERSIONS` in the same release that adds `'2.0'`, coordinate the deploys so users do not see orphaned old docs being rejected. A force-refresh of the overlay (manual function call) just after the new backend ships ensures all Firestore docs carry the new major before frontend rejects start firing.

  When versions are out of sync, the frontend logs a single `console.warn` per affected doc shape — visible in browser devtools and (if you ship analytics) trappable as a deploy-skew signal.

---

## Validation steps

After applying the five edits above:

1. **Load the dashboard with overlay docs absent (or before first refresh)**. Expect the new zone to show "standing by — no recent snapshot." Existing zones identical.
2. **Run a manual overlay refresh** via the Phase 2 `market-refresh-manual` function. Docs populate Firestore.
3. **Hard-reload the dashboard.** Market pulse zone populates within ~1-2s. Confidence badges, comparability flags visible.
4. **Open Path Comparison** with two paths + a destination city. Overlay column populates per row. Null-ref paths show "overlay-only".
5. **Open City Move Calculator** for a city the overlay has covered. Destination momentum panel appears below the cost calculation. For a city with no overlay coverage, the panel is silently absent.
6. **In the Terminal**, run a query that hits CAPITAL_VALUATION or CITY_MOVE for a city with overlay coverage. Last paragraph of the memo should be the overlay paragraph. Run the same query for a null-ref path — paragraph should still appear but with the "no benchmark comparison is offered" sentence.

If any of the above doesn't behave correctly, the failure is isolated to the four-file integration patches — the service and consumer modules can be tested independently by calling them directly in the browser console.
