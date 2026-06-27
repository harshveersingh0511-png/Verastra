# Verastra · Market Overlay V1 — Implementation README

This document covers the **Layer B market overlay** built on top of the Verastra benchmark core. The benchmark core (Layer A) is unchanged by anything in this directory.

> **Status: Phase 1 — Foundation only.**
> Canonical registries, backend skeleton, Firestore writer layer, Netlify functions, and rules are shipped. Adapters are stubs that fetch nothing; aggregation returns empty results. Phase 2 brings sources live; Phase 3 wires consumer surfaces.

---

## What Phase 1 delivers

| Concern | Where | State |
|---|---|---|
| 12-cluster registry | `assets/js/data/clusters.js` | **Done** |
| Canonical path registry (90 paths) | `assets/js/data/paths.js` | **Done** |
| 28-city registry | `assets/js/data/paths.js` (`CITIES`) | **Done** |
| Source × cluster influence weights | `assets/js/data/source-applicability.json` | **Done** |
| Adapter contract + registry | `src/server/market/adapters/_base.js`, `adapters/index.js` | Stub adapters |
| Normalization pipeline (cluster/path/city/skill/seniority/salary) | `src/server/market/normalize/` | Pipeline runs; bands are minimal |
| Confidence scoring + freshness decay | `src/server/market/scoring/confidence.js` | **Done** |
| Momentum scoring | `src/server/market/scoring/momentum.js` | **Done** |
| Aggregation | `src/server/market/aggregate/index.js` | Stubs; canonical-key assertions live |
| Firestore admin + writers | `src/server/market/firestore/` | **Done** |
| Orchestrator | `src/server/market/orchestrator.js` | Runs end-to-end against stubs |
| Netlify scheduled + manual functions | `netlify/functions/` | **Done** |
| Firestore rules | `firestore.rules` | **Done** |
| Registry-drift CI check | `scripts/check-path-registry.js` | **Done** |

---

## File structure

```
verastra/
├── assets/
│   └── js/
│       └── data/
│           ├── clusters.js                       NEW — 12-cluster registry
│           ├── paths.js                          NEW — canonical path + city registry
│           ├── source-applicability.json         NEW — source × cluster weights
│           ├── benchmarks.js                     EXISTING (untouched)
│           └── ...
│
├── src/
│   └── server/
│       └── market/
│           ├── orchestrator.js                   NEW — fetch → normalize → aggregate → write
│           ├── adapters/
│           │   ├── _base.js                      NEW — adapter contract
│           │   ├── index.js                      NEW — adapter registry
│           │   └── employer-careers/
│           │       ├── employer-careers.js       NEW — single consolidated adapter
│           │       ├── allowlists/               NEW — 12 cluster-keyed JSONs (empty)
│           │       └── parsers/                  NEW — greenhouse/lever/workday/sitemap/listing-page stubs
│           ├── normalize/
│           │   ├── index.js                      NEW — pipeline entrypoint
│           │   ├── cluster-classifier.js         NEW — priority-ordered cluster patterns
│           │   ├── path-classifier.js            NEW — uses paths.js title_patterns
│           │   ├── city-resolver.js              NEW — uses CITIES + aliases
│           │   ├── skill-extractor.js            NEW — global skill dict (Phase 2 expands)
│           │   ├── seniority-classifier.js       NEW
│           │   └── salary-parser.js              NEW — approved-source gated
│           ├── scoring/
│           │   ├── confidence.js                 NEW — tier + freshness decay + caps
│           │   └── momentum.js                   NEW — delta vs prev snapshot
│           ├── aggregate/
│           │   └── index.js                      NEW — Phase 2 fills, but assertions live
│           └── firestore/
│               ├── admin.js                      NEW — firebase-admin init
│               └── writers.js                    NEW — per-collection writers
│
├── netlify/
│   └── functions/
│       ├── market-refresh.js                     NEW — scheduled weekly handler
│       └── market-refresh-manual.js              NEW — token-gated manual trigger
│
├── netlify.toml                                  NEW — function config + cron
├── package.json                                  NEW — ESM + firebase-admin + @netlify/functions
├── firestore.rules                               NEW — overlay rules block
├── scripts/
│   └── check-path-registry.js                    NEW — registry-drift CI check
└── README-MARKET-OVERLAY.md                      NEW — this file
```

No existing Verastra files were modified in Phase 1.

---

## How the refresh works (when fully wired in Phase 2)

```
  scheduled cron (weekly, Sat 21:00 UTC = Sun 02:30 IST)
      │
      ▼
  netlify/functions/market-refresh.js
      │
      ▼
  src/server/market/orchestrator.js · runRefresh()
      │
      ├─► getActiveAdapters()        (Phase 1: 8 stubs · Phase 2: 8 live/light + 5 future-slot)
      │
      ├─► for each adapter: fetch(ctx) → RawPosting[]
      │        ↳ write to overlay_raw_ingest (locked)
      │
      ├─► normalize(raw, ctx)        — pipeline with §2 usability gate
      │        ↳ bucket: 'full' | 'cluster_usable' | 'drop'
      │
      ├─► readPreviousSnapshotEvidence()   — for momentum
      │
      ├─► aggregate:
      │     · role_city_market docs        (cluster × path × city)
      │     · role_skill_market docs       (cluster × path × skill)
      │     · dashboard_pulse              (overlay_derived/dashboard_pulse)
      │     · terminal_snippets            (overlay_derived/terminal_snippets)
      │     · city_pulse__<city>           (overlay_derived/city_pulse__<city>)
      │
      ├─► writers assert canonical keys, write to Firestore
      │
      └─► market_snapshots/<run_id>        — adapter health, counts, status
```

---

## Manual setup checklist (before Phase 2 can run live)

These items are blocked for you to do, since they touch your Firebase project and Netlify site directly.

### 1. Service account for backend writes

In the Firebase console (verastra-49947):
- **Settings → Service accounts → Generate new private key**.
- Save the JSON locally. **Never commit this file.**

### 2. Netlify environment variables

In **Netlify · Site settings · Environment variables**, add:

| Variable | Value |
|---|---|
| `FIREBASE_PROJECT_ID` | `verastra-49947` |
| `FIREBASE_CLIENT_EMAIL` | `client_email` field from the service account JSON |
| `FIREBASE_PRIVATE_KEY` | `private_key` field from the service account JSON (paste with `\n` escapes intact) |
| `MARKET_REFRESH_MANUAL_TOKEN` | a random 32-byte hex string (`openssl rand -hex 32`) |
| `MARKET_REFRESH_USER_AGENT` | `Verastra-MarketOverlay/1.0 (+contact@your-domain)` |
| `MARKET_REFRESH_TIMEOUT_MS` | `25000` |
| `MARKET_REFRESH_DEBUG` | `0` (set to `1` to enable debug logs) |

### 3. Deploy Firestore rules

The `firestore.rules` file in this repo is the **new posture**. To deploy:

- Option A (manual): Firebase console → Firestore → Rules → paste the contents of `firestore.rules` → Publish.
- Option B (CLI): `firebase deploy --only firestore:rules` (requires `firebase-tools` installed and a `firebase.json` pointing at this rules file).

**Critical**: do not deploy rules until the backend service-account write path is verified — once these rules are live, the only writers are admin-SDK-credentialed functions.

### 4. Install dependencies for local testing

```bash
npm install
```

This pulls `firebase-admin` and `@netlify/functions`. (No build step is added to the static site; these are functions-only deps.)

### 5. Verify registry consistency

```bash
node scripts/check-path-registry.js
```

Should print `✓ path registry is consistent with benchmarks_master.json`.

### 6. Dry-run the orchestrator locally

```bash
npm run market:refresh:dry
```

Runs the orchestrator against stub adapters with `dryRun: true` (no writes). Confirms the pipeline wires end-to-end. Expected output: zero raw postings, zero docs written, snapshot status `ok`.

### 7. Manual refresh against live Firestore (after rules + env vars deployed)

```bash
curl -X POST "https://<your-site>.netlify.app/.netlify/functions/market-refresh-manual" \
  -H "x-verastra-admin-token: <MARKET_REFRESH_MANUAL_TOKEN>" \
  -H "content-type: application/json" \
  -d '{"dryRun": true}'
```

---

## What sources are live vs stub in V1

| Adapter | Phase 1 | Phase 2 target | Cluster influence |
|---|---|---|---|
| `naukri` | Stub | **Live** (broad, primary) | All 12 except `govt_psu_public_sector` (weight 0) |
| `indeed_in` | Stub | **Live** (broad, primary) | All 12 except `govt_psu_public_sector` |
| `foundit` | Stub | **Live** (broad, secondary) | All 12 except `govt_psu_public_sector` |
| `iimjobs` | Stub | **Live** (specialist) | Finance, Consulting, Research |
| `wellfound_in` | Stub | **Live** (specialist) | Product/Tech/Data, partial Sales/Marketing |
| `employer_careers` | Stub | **Live** (single adapter, 12 allowlists) | All 12 (weight varies) |
| `cutshort` | Stub | **Light** | Product/Tech/Data primarily |
| `psu_official_portals` | Stub | **Light** | `govt_psu_public_sector` only |
| `linkedin`, `hirist`, `shine`, `behance_dribbble`, `remoteok` | Future slot | Not invoked | — |

`remoteok` was removed from V1 live set per the final checkpoint correction. It remains as a typed future slot only.

---

## Frontend overlay reader (Phase 3)

Will live at `assets/js/data/market-overlay.js`. It will:

1. Read `overlay_derived/dashboard_pulse` for the Dashboard market-pulse zone.
2. Read `overlay_derived/terminal_snippets` for Terminal recipe injection.
3. Read `overlay_derived/city_pulse__<city>` for City Move Calculator.
4. Query `role_city_market` directly for fine-grained tool needs (Path Comparison).

The reader will gracefully no-op if any overlay doc is missing — the benchmark-only experience never breaks.

---

## What still remains heuristic / Phase-2 work

- **Adapter fetch logic**: every adapter is currently a stub. Phase 2 implements per-source fetchers.
- **Skill dictionary**: Phase 1 ships a minimal global skill dictionary (~10 skills). Phase 2 expands to cluster-scoped dictionaries.
- **Aggregator joins**: Phase 1 aggregator functions return empty arrays. Phase 2 implements grouping, weight multiplication, momentum lookups, and derived-doc assembly.
- **Previous-snapshot reads**: Phase 1 returns empty maps; Phase 2 implements bulk-read by `run_id` filter.
- **Employer allowlists**: 12 empty allowlist files exist; Phase 2 populates the curated employer lists per cluster.
- **City-pulse derived docs**: Phase 1 has the writer; Phase 2 populates per-city aggregations.

---

## Boundaries (do not violate)

1. **Benchmark core (Layer A) is unchanged.** No file under `assets/data/benchmarks/` is modified by this work.
2. **Overlay never alters benchmark math.** Salary clues are advisory-only. PCV, Cohort Benchmark, Skill ROI, Trajectory Engine, Path Comparison, City Move continue to read benchmark cells as their source of truth.
3. **Canonical-key discipline.** All overlay docs use `path_key` / `cluster_key` / `city_key` from the registries. Writers assert this before write.
4. **No new sources without checkpoint update.** The V1 source set is fixed in `source-applicability.json`.
5. **Backend-only writes.** Frontend reads Firestore via public-read rules on the four normalized collections; raw ingest + debug runs are locked.
