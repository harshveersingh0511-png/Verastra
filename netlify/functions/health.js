/* ──────────────────────────────────────────────────────────────────────
   Netlify Function · /health
   Lightweight diagnostics endpoint. Returns:
     - env validation result
     - overlay schema version
     - last snapshot summary (run_id, ts, counts, adapter_health summary)
     - simple coverage_summary lifted from the most recent snapshot

   No auth required — exposed publicly. Returns no secrets.
   ────────────────────────────────────────────────────────────────────── */

import { validateEnv } from '../../src/server/market/env-check.js';
import { OVERLAY_VERSION } from '../../src/server/market/overlay-version.js';

export const handler = async () => {
  const out = {
    service: 'verastra-market-overlay',
    overlay_version: OVERLAY_VERSION,
    timestamp: new Date().toISOString(),
    env: null,
    last_snapshot: null,
    error: null,
  };

  // Env check — surface degradation, do not throw to the response.
  try {
    out.env = validateEnv();
  } catch (err) {
    out.env = { ok: false, error: err.message };
    return {
      statusCode: 503,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(out, null, 2),
    };
  }

  // Best-effort last-snapshot lookup. Lazy import so Firestore admin
  // only spins up when env is healthy.
  try {
    const { getDb, COLLECTIONS } = await import('../../src/server/market/firestore/admin.js');
    const db = getDb();
    const snap = await db.collection(COLLECTIONS.market_snapshots)
      .orderBy('run_ts', 'desc')
      .limit(1).get();
    if (!snap.empty) {
      const d = snap.docs[0].data();
      out.last_snapshot = {
        run_id: d.run_id,
        run_ts: d.run_ts,
        status: d.status,
        duration_ms: d.duration_ms,
        adapter_summary: d.adapter_summary || null,
        counts: d.counts || null,
        coverage_summary: d.coverage_summary || null,
        overlay_version: d.overlay_version || null,
      };
    } else {
      out.last_snapshot = { status: 'no_snapshots_yet' };
    }
  } catch (err) {
    out.last_snapshot = { status: 'error', error: err.message };
  }

  return {
    statusCode: 200,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(out, null, 2),
  };
};
