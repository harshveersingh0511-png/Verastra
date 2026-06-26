/* ──────────────────────────────────────────────────────────────────────
   Netlify Function · manual overlay refresh (admin-token gated).

   Usage:
     curl -X POST https://<site>/.netlify/functions/market-refresh-manual \
       -H "x-verastra-admin-token: <MARKET_REFRESH_MANUAL_TOKEN>" \
       -H "content-type: application/json" \
       -d '{"dryRun": false}'

   Body fields:
     dryRun           boolean  — if true, no Firestore writes occur
     adapterTimeoutMs number   — per-adapter timeout override (ms)
     parallelism      number   — concurrent adapter execution cap

   Returns the full snapshot envelope on success.
   ────────────────────────────────────────────────────────────────────── */

import { validateEnv } from '../../src/server/market/env-check.js';
import { runRefresh } from '../../src/server/market/orchestrator.js';

export const handler = async (event) => {
  // Auth
  const expected = process.env.MARKET_REFRESH_MANUAL_TOKEN;
  if (!expected) {
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: 'MARKET_REFRESH_MANUAL_TOKEN not set in environment' }) };
  }
  const provided = event.headers['x-verastra-admin-token'] || event.headers['X-Verastra-Admin-Token'];
  if (provided !== expected) {
    return { statusCode: 401, body: JSON.stringify({ ok: false, error: 'unauthorized' }) };
  }

  // Env validation
  try { validateEnv(); }
  catch (err) {
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: err.message }) };
  }

  // Body parse
  let body = {};
  try { body = event.body ? JSON.parse(event.body) : {}; } catch { /* ignore */ }

  const options = {
    trigger: 'manual',
    dryRun: !!body.dryRun,
    adapterTimeoutMs: body.adapterTimeoutMs,
    parallelism: body.parallelism,
  };

  try {
    const snapshot = await runRefresh(options);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true, ...snapshot }, null, 2),
    };
  } catch (err) {
    console.error('[market-refresh-manual] failed:', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message, stack: err.stack }) };
  }
};
