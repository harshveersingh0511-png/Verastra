/* ──────────────────────────────────────────────────────────────────────
   Netlify Scheduled Function · weekly market overlay refresh.

   Schedule registered via @netlify/functions `schedule()` wrapper —
   this is the current canonical Netlify scheduling syntax. The cron
   expression "0 21 * * 6" fires Saturdays at 21:00 UTC, equivalent to
   Sundays 02:30 IST.

   The schedule is declared HERE only; netlify.toml carries no
   scheduler registration to prevent duplicate / conflicting cron
   entries.
   ────────────────────────────────────────────────────────────────────── */

import { schedule } from '@netlify/functions';
import { validateEnv } from '../../src/server/market/env-check.js';
import { runRefresh } from '../../src/server/market/orchestrator.js';

const baseHandler = async (_event) => {
  try {
    validateEnv();  // throws if FIREBASE_* missing
  } catch (err) {
    console.error('[market-refresh] env validation failed:', err.message);
    return { statusCode: 503, body: JSON.stringify({ ok: false, error: err.message }) };
  }

  try {
    const snapshot = await runRefresh({ trigger: 'schedule', dryRun: false });
    return {
      statusCode: 200,
      body: JSON.stringify({
        ok: snapshot.status === 'ok' || snapshot.status === 'stale_no_data',
        run_id: snapshot.run_id,
        status: snapshot.status,
        adapter_summary: snapshot.adapter_summary,
        counts: snapshot.counts,
      }),
    };
  } catch (err) {
    console.error('[market-refresh] orchestrator failed:', err);
    return { statusCode: 500, body: JSON.stringify({ ok: false, error: err.message }) };
  }
};

// Saturday 21:00 UTC == Sunday 02:30 IST.
export const handler = schedule('0 21 * * 6', baseHandler);
