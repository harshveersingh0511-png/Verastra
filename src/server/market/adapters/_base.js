/* ──────────────────────────────────────────────────────────────────────
   ADAPTER BASE — shared contract for all market-overlay source adapters.

   Every adapter in src/server/market/adapters/ exports:

     {
       id:              string,    // matches a key in source-applicability.json
       kind:            'broad' | 'specialist' | 'weak_auxiliary',
       v1_status:       'live' | 'light' | 'future_slot',
       async fetch(ctx) { ... }    // returns raw_postings[]
     }

   The orchestrator iterates registered adapters, calls fetch(), and
   passes raw_postings into the normalization pipeline.

   ctx (passed to fetch) carries:
     - now           : Date
     - runId         : string
     - logger        : { info, warn, error, debug }
     - env           : process env subset (USER_AGENT, timeouts, etc.)
     - timeBudgetMs  : per-adapter time budget
     - dryRun        : boolean
   ────────────────────────────────────────────────────────────────────── */

/**
 * @typedef {Object} RawPosting
 * @property {string} title
 * @property {string} company
 * @property {string} location
 * @property {string} description
 * @property {string} source          // adapter id, e.g. "naukri"
 * @property {string} source_url
 * @property {string|null} posted_ts  // best-effort ISO timestamp
 * @property {string|null} salary_raw // unparsed salary string if present
 * @property {Object} [meta]          // adapter-specific extras
 */

/**
 * @typedef {Object} AdapterContext
 * @property {Date} now
 * @property {string} runId
 * @property {{info:Function, warn:Function, error:Function, debug:Function}} logger
 * @property {Object} env
 * @property {number} timeBudgetMs
 * @property {boolean} dryRun
 */

/**
 * @typedef {Object} Adapter
 * @property {string} id
 * @property {'broad'|'specialist'|'weak_auxiliary'} kind
 * @property {'live'|'light'|'future_slot'} v1_status
 * @property {(ctx: AdapterContext) => Promise<RawPosting[]>} fetch
 */

export const ADAPTER_SIGNATURE = Object.freeze({
  required: ['id', 'kind', 'v1_status', 'fetch'],
  kinds: ['broad', 'specialist', 'weak_auxiliary'],
  statuses: ['live', 'light', 'future_slot'],
});

export function validateAdapter(adapter) {
  for (const k of ADAPTER_SIGNATURE.required) {
    if (adapter[k] === undefined || adapter[k] === null) {
      throw new Error(`[adapter] missing field "${k}" on adapter "${adapter.id || '<unknown>'}"`);
    }
  }
  if (!ADAPTER_SIGNATURE.kinds.includes(adapter.kind)) {
    throw new Error(`[adapter] invalid kind "${adapter.kind}" on "${adapter.id}"`);
  }
  if (!ADAPTER_SIGNATURE.statuses.includes(adapter.v1_status)) {
    throw new Error(`[adapter] invalid v1_status "${adapter.v1_status}" on "${adapter.id}"`);
  }
  if (typeof adapter.fetch !== 'function') {
    throw new Error(`[adapter] fetch must be a function on "${adapter.id}"`);
  }
  return adapter;
}

/* Adapter stub helper. Phase 1 adapter files use this so the orchestrator
   can be exercised end-to-end before Phase 2 brings real fetch logic. */
export function stubAdapter({ id, kind, v1_status, reason }) {
  return validateAdapter({
    id,
    kind,
    v1_status,
    async fetch(ctx) {
      ctx.logger.warn(`[${id}] stub adapter; reason: ${reason || 'phase_1_skeleton'}`);
      return [];
    },
  });
}
