/* ──────────────────────────────────────────────────────────────────────
   ORCHESTRATOR — Production hardening
   ──────────────────────────────────────────────────────────────────────

   Pipeline (unchanged contract):
     1. Validate environment
     2. Discover active adapters
     3. Fetch raw postings IN PARALLEL with per-adapter timeout enforcement
     4. Persist raw_ingest (locked collection, debug-only)
     5. Normalize each raw posting → bucketed normalized postings
     6. Read previous snapshot for momentum
     7. Aggregate role_city + role_skill docs
     8. Build derived docs (dashboard_pulse, terminal_snippets, city_pulse__<city>)
     9. Write all docs via BATCHED commits (Firestore 500-op batches)
    10. Write market_snapshots envelope with full execution report

   Production characteristics:
     - Each adapter runs concurrently; one adapter's failure cannot
       cascade and stop others.
     - Total runtime stays bounded by max(adapter_runtime) instead of
       sum(adapter_runtime).
     - Firestore writes are batched 500-at-a-time; first write attempt
       fails over to 3 exponential-backoff retries.
     - Every snapshot doc carries adapter_health[], counts{},
       version_info, and execution_summary.
   ────────────────────────────────────────────────────────────────────── */

import { getActiveAdapters } from './adapters/index.js';
import { normalize } from './normalize/index.js';
import { dedupeWithinSource } from './util/dedupe.js';
import {
  aggregateRoleCity, aggregateRoleSkill,
  buildDashboardPulse, buildTerminalSnippets, buildCityPulse,
} from './aggregate/index.js';
import { writeSnapshot, writeRawIngest, writeDebug, readPreviousSnapshotEvidence } from './firestore/writers.js';
import { batchWrite, roleCityOps, roleSkillOps, overlayDerivedOp } from './firestore/batch.js';
import { OVERLAY_VERSION } from './overlay-version.js';

/* Bundler-inlined data. esbuild reads source-applicability.json at
   bundle time and embeds the parsed value here. Works under both ESM
   and CJS output formats — no runtime fs.readFile or import.meta.url
   needed. */
import APPLICABILITY from '../../../assets/js/data/source-applicability.json' with { type: 'json' };

/* ── Logger ──────────────────────────────────────────────────────────── */

function makeLogger(prefix) {
  const stamp = () => new Date().toISOString();
  return {
    info:  (m, ...a) => console.log(`[${stamp()}] [${prefix}] ${m}`, ...a),
    warn:  (m, ...a) => console.warn(`[${stamp()}] [${prefix}] ⚠ ${m}`, ...a),
    error: (m, ...a) => console.error(`[${stamp()}] [${prefix}] ✗ ${m}`, ...a),
    debug: (m, ...a) => process.env.MARKET_REFRESH_DEBUG === '1' && console.log(`[${stamp()}] [${prefix}] ${m}`, ...a),
  };
}

function newRunId(now = new Date()) {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  const hh = String(now.getUTCHours()).padStart(2, '0');
  return `run_${yyyy}_${mm}_${dd}_${hh}`;
}

/* ── Parallel adapter execution with per-adapter timeout ─────────────── */

async function runAdapter(adapter, ctx, timeBudgetMs) {
  const t0 = Date.now();
  let raw = [];
  let status = 'ok';
  let error = null;
  try {
    raw = await Promise.race([
      adapter.fetch(ctx),
      new Promise((_, rej) => setTimeout(() => rej(new Error('time_budget_exceeded')), timeBudgetMs)),
    ]);
    if (!Array.isArray(raw)) raw = [];
  } catch (err) {
    status = 'error';
    error = err.message || String(err);
    raw = [];
  }
  const deduped = dedupeWithinSource(raw);
  return {
    adapter_id: adapter.id,
    kind: adapter.kind,
    v1_status: adapter.v1_status,
    status,
    error,
    fetched: raw.length,
    parsed: deduped.length,
    ms: Date.now() - t0,
    raw: deduped,
  };
}

/* ── Main entrypoint ─────────────────────────────────────────────────── */

/**
 * @param {{
 *   trigger?: 'schedule'|'manual',
 *   dryRun?: boolean,
 *   adapterTimeoutMs?: number,
 *   parallelism?: number,
 * }} options
 */
export async function runRefresh(options = {}) {
  const startedAt = new Date();
  const runId = newRunId(startedAt);
  const logger = makeLogger(runId);
  const trigger = options.trigger || 'schedule';
  const dryRun = !!options.dryRun;
  const adapterTimeoutMs = Number(options.adapterTimeoutMs || process.env.MARKET_REFRESH_TIMEOUT_MS || 20000);
  const parallelism = Number(options.parallelism || process.env.MARKET_REFRESH_PARALLELISM || 8);

  const ctx = {
    now: startedAt, runId, logger,
    env: process.env,
    timeBudgetMs: adapterTimeoutMs,
    dryRun,
  };

  logger.info(`refresh start trigger=${trigger} dryRun=${dryRun} parallelism=${parallelism} adapterTimeoutMs=${adapterTimeoutMs}`);

  /* Source applicability is statically imported above; no runtime
     file read needed. Wrap in a try just to keep the surrounding
     error-handling shape unchanged. */
  let applicability = APPLICABILITY;
  if (!applicability || typeof applicability !== 'object') {
    logger.error('source-applicability.json appears empty or malformed at bundle time');
    if (!dryRun) await writeDebug(runId, 'applicability_load_failed', { error: 'empty_after_bundle' });
    applicability = {};
  }

  /* Discover adapters */
  const adapters = getActiveAdapters();
  logger.info(`active adapters (${adapters.length}): ${adapters.map(a => a.id).join(', ')}`);

  /* Parallel adapter execution. Limit concurrency to `parallelism`. */
  const adapterHealth = {};
  const allRaw = [];

  const adapterResults = await _runWithConcurrency(
    adapters.map(a => () => runAdapter(a, ctx, adapterTimeoutMs)),
    parallelism,
  );

  for (const r of adapterResults) {
    adapterHealth[r.adapter_id] = {
      status: r.status,
      kind: r.kind,
      v1_status: r.v1_status,
      fetched: r.fetched,
      parsed: r.parsed,
      ms: r.ms,
      error: r.error,
    };
    for (const row of r.raw) allRaw.push(row);
  }

  // Persist raw_ingest (capped per adapter)
  if (!dryRun) {
    for (const r of adapterResults) {
      if (r.raw.length > 0) {
        try { await writeRawIngest(runId, r.adapter_id, r.raw.slice(0, 500)); }
        catch (err) { logger.warn(`raw_ingest write failed for ${r.adapter_id}: ${err.message}`); }
      }
      if (r.status === 'error') {
        try { await writeDebug(runId, 'adapter_error', { adapter: r.adapter_id, error: r.error }); }
        catch (_e) {}
      }
    }
  }

  const adapterOk = Object.values(adapterHealth).filter(h => h.status === 'ok').length;
  const adapterErr = Object.values(adapterHealth).filter(h => h.status === 'error').length;
  logger.info(`adapters complete: ok=${adapterOk} error=${adapterErr} raw_total=${allRaw.length}`);

  /* Normalize */
  const normalized = { full: [], cluster_usable: [], drop: 0, drop_reasons: {} };
  for (const raw of allRaw) {
    const n = normalize(raw, ctx);
    if (n.bucket === 'full') normalized.full.push(n);
    else if (n.bucket === 'cluster_usable') normalized.cluster_usable.push(n);
    else {
      normalized.drop++;
      const r = n.drop_reason || 'unknown';
      normalized.drop_reasons[r] = (normalized.drop_reasons[r] || 0) + 1;
    }
  }
  logger.info(`normalized: full=${normalized.full.length} cluster_usable=${normalized.cluster_usable.length} drop=${normalized.drop}`);

  /* Previous snapshot for momentum */
  let prevSnapshot = { roleCityByKey: new Map(), roleSkillByKey: new Map() };
  if (!dryRun) {
    try {
      prevSnapshot = await readPreviousSnapshotEvidence(runId);
      logger.info(`previous snapshot: roleCity=${prevSnapshot.roleCityByKey.size} roleSkill=${prevSnapshot.roleSkillByKey.size} prev_run=${prevSnapshot.prev_run_id || 'none'}`);
    } catch (err) {
      logger.warn(`previous-snapshot read failed: ${err.message} — momentum will report as 'unknown' for this run`);
      await writeDebug(runId, 'previous_snapshot_read_failed', { error: err.message });
    }
  }

  /* Aggregate */
  const roleCityDocs = aggregateRoleCity(normalized, prevSnapshot, applicability, ctx);
  const roleSkillDocs = aggregateRoleSkill(normalized, prevSnapshot, applicability, ctx);
  logger.info(`aggregated: roleCity=${roleCityDocs.length} roleSkill=${roleSkillDocs.length}`);

  /* Derived docs */
  const dashboardPulse  = buildDashboardPulse(roleCityDocs, roleSkillDocs, normalized, applicability, ctx);
  const terminalSnippets = buildTerminalSnippets(roleCityDocs, roleSkillDocs, ctx);

  const citiesWithEvidence = new Set(roleCityDocs.map(d => d.city_key));
  const cityPulseDocs = [];
  for (const cityKey of citiesWithEvidence) {
    const pulse = buildCityPulse(cityKey, roleCityDocs, roleSkillDocs, ctx);
    if (pulse) cityPulseDocs.push(pulse);
  }

  /* Batch write everything */
  let writeReport = { ok: 0, errors: 0, details: [] };
  if (!dryRun) {
    const ops = [];
    ops.push(...roleCityOps(roleCityDocs));
    ops.push(...roleSkillOps(roleSkillDocs));
    if (dashboardPulse)   ops.push(overlayDerivedOp('dashboard_pulse', dashboardPulse));
    if (terminalSnippets) ops.push(overlayDerivedOp('terminal_snippets', terminalSnippets));
    for (const p of cityPulseDocs) ops.push(overlayDerivedOp(`city_pulse__${p.city_key}`, p));

    logger.info(`committing ${ops.length} document writes in batches of 500…`);
    writeReport = await batchWrite(ops, ctx);
    logger.info(`writes: ok=${writeReport.ok} errors=${writeReport.errors}`);
  }

  /* Snapshot envelope */
  const endedAt = new Date();
  const status = (allRaw.length === 0) ? 'stale_no_data'
              : (writeReport.errors > 0) ? 'partial_failure'
              : 'ok';
  const snapshot = {
    overlay_version: OVERLAY_VERSION,
    run_id: runId,
    run_ts: startedAt.toISOString(),
    ended_ts: endedAt.toISOString(),
    duration_ms: endedAt - startedAt,
    trigger,
    dry_run: dryRun,
    adapter_health: adapterHealth,
    adapter_summary: {
      total: adapters.length,
      ok: adapterOk,
      errored: adapterErr,
    },
    counts: {
      raw_total: allRaw.length,
      normalized_full: normalized.full.length,
      normalized_cluster_usable: normalized.cluster_usable.length,
      dropped: normalized.drop,
      drop_reasons: normalized.drop_reasons,
      role_city_docs_produced: roleCityDocs.length,
      role_skill_docs_produced: roleSkillDocs.length,
      derived_docs_produced: (dashboardPulse ? 1 : 0) + (terminalSnippets ? 1 : 0) + cityPulseDocs.length,
      writes_committed: writeReport.ok,
      write_errors: writeReport.errors,
    },
    coverage_summary: dashboardPulse?.cluster_coverage_health || null,
    write_errors_detail: writeReport.details.slice(0, 10),
    status,
  };

  if (!dryRun) {
    try { await writeSnapshot(snapshot); }
    catch (err) { logger.error(`snapshot write failed: ${err.message}`); }
  }

  logger.info(`refresh complete in ${snapshot.duration_ms}ms status=${status}`);
  return snapshot;
}

/* ── Concurrency limiter ─────────────────────────────────────────────── */

async function _runWithConcurrency(tasks, n) {
  const results = new Array(tasks.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const idx = cursor++;
      if (idx >= tasks.length) return;
      try { results[idx] = await tasks[idx](); }
      catch (e) { results[idx] = { adapter_id: 'unknown', status: 'error', error: e.message, raw: [] }; }
    }
  }
  const workers = Array.from({ length: Math.min(n, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}
