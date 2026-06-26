# Verastra · Production Deployment Guide

This document is the end-to-end runbook for deploying the Verastra Market Overlay backend to production. Read it in full before your first deploy.

## Deployment overview

You are deploying:
- A **static frontend** (your existing site) — Netlify serves it as-is.
- A **scheduled function** that runs weekly to refresh the market overlay.
- A **manual function** (admin-token gated) for on-demand refresh.
- A **public health endpoint** for monitoring.

The frontend is unchanged in this deployment cycle except that it now reads overlay docs from Firestore via the shared overlay service. The backend writes to Firestore; the frontend reads. Backend and frontend share no runtime state — they're connected only by document contracts.

---

## Step 1 — Firebase project setup

You already have project `verastra-49947`. Configure it for backend writes:

### 1.1 Generate a service account

1. Firebase Console → Project Settings → Service accounts tab.
2. Click **Generate new private key**. Download the JSON.
3. **Treat this JSON as a secret.** Do not commit. Do not paste into Slack.

From the JSON, you'll need three fields:
- `project_id` → `FIREBASE_PROJECT_ID`
- `client_email` → `FIREBASE_CLIENT_EMAIL`
- `private_key` → `FIREBASE_PRIVATE_KEY` (preserve the `\n` escapes literally)

### 1.2 Deploy Firestore rules

The `firestore.rules` file in the repo configures the public-read / backend-write posture. Deploy via Firebase Console:

1. Firestore → Rules tab.
2. Replace contents with the local `firestore.rules` file.
3. Click Publish.

Posture summary after publish:
- Public read on: `role_city_market`, `role_skill_market`, `overlay_derived`, `market_snapshots`, `city_market_summary`
- Locked: `overlay_raw_ingest`, `overlay_debug_runs` (admin SDK only)
- All other paths: denied (preserves your prior global-deny posture)

### 1.3 Firestore indexes

Two compound queries fire during refresh: `role_city_market` and `role_skill_market` filtered by `freshness.run_id`. The first time these queries run, Firebase logs will surface a "create index" link.

Click both links (one per collection). Until you do this, the **first two scheduled runs** after deploy will report `momentum: 'unknown'` across the board — this is correct behavior, not a bug.

---

## Step 2 — Netlify environment variables

In **Site settings → Environment variables**, add:

| Variable | Required | Value |
|---|---|---|
| `FIREBASE_PROJECT_ID` | ✓ | `verastra-49947` |
| `FIREBASE_CLIENT_EMAIL` | ✓ | `client_email` from service account JSON |
| `FIREBASE_PRIVATE_KEY` | ✓ | `private_key` field, keep `\n` escapes literal |
| `MARKET_REFRESH_MANUAL_TOKEN` | recommended | 64-hex random string (`openssl rand -hex 32`) |
| `MARKET_REFRESH_USER_AGENT` | recommended | `Verastra-MarketOverlay/1.0 (+contact@your-domain)` |
| `MARKET_REFRESH_TIMEOUT_MS` | optional | `20000` (per-adapter time budget, default 20s) |
| `MARKET_REFRESH_PARALLELISM` | optional | `8` (concurrent adapter execution, default 8) |
| `MARKET_REFRESH_DEBUG` | optional | `0` (set `1` to enable verbose adapter logs) |

The function will refuse to start without the three `FIREBASE_*` vars (clean 503 error returned). Missing recommended vars log a warning but the pipeline still functions.

---

## Step 3 — First deploy

1. Push the integrated repo to GitHub (or your usual deploy path).
2. Netlify detects the push and triggers a build.
3. `netlify.toml` declares the functions directory and the scheduled cron.
4. After deploy, three endpoints are live:
   - `GET /.netlify/functions/health` — public diagnostics
   - `POST /.netlify/functions/market-refresh-manual` — admin-gated refresh
   - (internal) `market-refresh` — fires weekly via Netlify scheduler

---

## Step 4 — Pre-flight validation

Run these checks in order. Do NOT proceed to a live write until all pass.

### 4.1 Health endpoint

```bash
curl https://<your-site>.netlify.app/.netlify/functions/health
```

Expected: HTTP 200 with `env.ok: true` and `last_snapshot.status: "no_snapshots_yet"`.

If `env.ok: false`: a required env var is missing. The error message names it.

If you get a 503: Firebase Admin failed to initialize. Most common cause: `FIREBASE_PRIVATE_KEY` lost its `\n` escapes during paste. Re-paste with the escapes preserved.

### 4.2 Dry-run refresh

```bash
curl -X POST https://<your-site>.netlify.app/.netlify/functions/market-refresh-manual \
  -H "x-verastra-admin-token: $MARKET_REFRESH_MANUAL_TOKEN" \
  -H "content-type: application/json" \
  -d '{"dryRun": true}'
```

This runs adapters against the real internet but writes nothing to Firestore. Inspect the response:

- `adapter_health` should show 8 adapter results. Each should be `status: 'ok'` with a positive `fetched` count, OR `status: 'error'` with a clear message.
- Adapters with `status: 'ok'` and `fetched: 0` are the ones whose HTML structure has drifted since the parser was written. **Fix those before doing a live write.**

The most common dry-run findings on first deploy:
- **Wellfound `fetched: 0`**: their URL pattern changed. Check the adapter and adjust.
- **Indeed `error: HTTP 403`**: anti-bot blocked you. May need a different UA or cookies.
- **Greenhouse adapters with `fetched: 0`**: a `board_token` in an allowlist is wrong. Verify against `https://boards-api.greenhouse.io/v1/boards/<token>/jobs`.

### 4.3 Live refresh

Once dry-run looks clean:

```bash
curl -X POST https://<your-site>.netlify.app/.netlify/functions/market-refresh-manual \
  -H "x-verastra-admin-token: $MARKET_REFRESH_MANUAL_TOKEN" \
  -d '{"dryRun": false}'
```

The full snapshot envelope is returned. Look for:
- `status: "ok"` — pipeline completed and writes succeeded
- `status: "stale_no_data"` — no postings were collected; investigate adapter health
- `status: "partial_failure"` — some Firestore writes failed; check `write_errors_detail`

### 4.4 Frontend smoke

Hard-reload your site. Visit the Dashboard. Zone 7a (Live Market Overlay) should populate with whichever signals cleared the confidence bar. Run a Terminal query for a path that has overlay coverage — the memo should include a "Live market overlay" section.

If overlay docs exist in Firestore but the frontend shows nothing: open the browser console. Look for `[market-overlay]` warnings about missing or mismatched `overlay_version`. If you see them, your frontend's `SUPPORTED_VERSIONS` is out of sync with the backend's `OVERLAY_VERSION` — they should both be `'1.0'` today.

---

## Step 5 — Scheduled execution

Once the manual refresh works, you don't need to do anything else. The cron is `0 21 * * 6` UTC (Saturdays 21:00 UTC = Sundays 02:30 IST), declared in `netlify.toml`.

Verify it runs after the first scheduled execution:

```bash
curl https://<your-site>.netlify.app/.netlify/functions/health
```

`last_snapshot.run_id` should reflect the scheduled run, and `trigger` (in the snapshot envelope itself, accessible via Firestore) should be `"schedule"`.

---

## Step 6 — Monitoring

Three monitoring surfaces, in order of how often you'd check them:

1. **Health endpoint** (every refresh, automated if you have monitoring): JSON status. The single most useful field is `last_snapshot.adapter_summary` — counts of OK vs errored adapters.

2. **Firestore `market_snapshots` collection** (when something looks off): every refresh creates one document. Sort by `run_ts` desc. `adapter_health` is a per-adapter map with `status`, `fetched`, `parsed`, `ms`, `error`.

3. **Firestore `overlay_debug_runs` collection** (deep debugging): per-error log records. Filter by `run_id` to focus on a specific failed run.

---

## Common operations

### Adding a new ATS-using employer to an allowlist

1. Edit the appropriate file under `src/server/market/adapters/employer-careers/allowlists/<cluster>.json`.
2. Add an entry. Fields by parser:
   - `greenhouse` → `board_token` (the slug from `boards.greenhouse.io/<token>`)
   - `lever` → `lever_token` (the slug from `jobs.lever.co/<token>`)
   - `ashby` → `ashby_token` (the slug from `jobs.ashbyhq.com/<token>`)
   - `workable` → `workable_id` (the slug from `apply.workable.com/<id>`)
   - `smartrecruiters` → `smartrecruiters_id` (the URL-safe company name)
   - `breezyhr` → `breezy_subdomain` (the `<sub>.breezy.hr` part)
3. Set `default_paths_hint` to an array of overlay path_keys the employer typically hires for.
4. Commit and redeploy. Effect applies on next scheduled refresh (or call manual immediately).

### Bumping the overlay schema version

1. Decide major vs minor (see `overlay-version.js` comment block).
2. Edit `src/server/market/overlay-version.js` — bump `OVERLAY_VERSION`.
3. Edit `assets/js/data/market-overlay.js` — extend (or replace) `SUPPORTED_VERSIONS`.
4. **Deploy frontend first**, then backend, then call a manual refresh to write docs with the new version. Old docs with the old version are silently dropped by the frontend.

### Diagnosing "no overlay on dashboard"

1. `curl /.netlify/functions/health` — is `last_snapshot.status === 'ok'`?
2. If no snapshot yet, run a manual refresh.
3. If snapshot exists but dashboard is empty: open browser console, check for `[market-overlay]` warnings. If you see version-mismatch warnings, your frontend deploy is older than your backend.
4. If snapshot exists, frontend is up to date, but dashboard says "standing by": all signals are THIN-tier or the snapshot is >30 days old. Check `coverage_summary` in the snapshot envelope.

---

## Production readiness checklist

Before you hand this off to a wider audience:

- [ ] Firebase service account created and JSON saved securely
- [ ] All `FIREBASE_*` env vars set in Netlify
- [ ] `MARKET_REFRESH_MANUAL_TOKEN` set in Netlify
- [ ] `firestore.rules` deployed
- [ ] Frontend deployed
- [ ] Backend functions deployed
- [ ] Health endpoint returns 200 with `env.ok: true`
- [ ] Dry-run refresh completes with ≥6 of 8 adapters reporting `status: 'ok'`
- [ ] Live refresh produces a snapshot in `market_snapshots` collection
- [ ] Firestore composite indexes auto-created (click the links Firebase logs)
- [ ] Frontend Dashboard zone 7a displays overlay content
- [ ] Terminal memo for a covered (cluster/role/city) includes overlay paragraph
- [ ] Path Comparison overlay column populates when profile city is set
- [ ] City Move destination panel populates for covered destinations
- [ ] Scheduled run fires on its first Saturday 21:00 UTC

---

## Failure modes & how the system handles them

| Failure | What happens | What you see |
|---|---|---|
| Firebase env var missing | Function returns 503 with clear error | Health endpoint reports `env.ok: false` |
| Service account auth fails | Same as above | 503 with auth error in body |
| One adapter HTTP fails | Other 7 still run; that adapter's row in `adapter_health` is `status: 'error'` | Health endpoint shows reduced adapter count |
| Source HTML changed | Adapter returns `fetched: 0`; pipeline continues | Empty overlay zones / silent recipes for that source's coverage area |
| Firestore write transient failure | Batch retries 3× with exponential backoff | If all retries fail, `status: 'partial_failure'`, `write_errors_detail` lists failures |
| Stale snapshot >30 days old | Frontend service detects, returns `STALE_SILENT` regime | Dashboard zone shows "last refresh N days ago — signal suppressed" |
| Schema version mismatch | Frontend rejects docs with one console warn per doc shape | Dashboard zone shows "standing by — no recent snapshot" |
| Firestore unreachable | Frontend service catches, returns null | All overlay surfaces silent; benchmark-only experience unaffected |
| Bad canonical key | Writer's pre-assertion catches; logs to debug_runs | Single doc rejected; rest of run continues |

The architecture is fail-soft by design. The benchmark-driven cockpit (PCV / CVI / Path Comparison math / etc.) runs identically regardless of overlay state.
