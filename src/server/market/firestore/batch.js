/* ──────────────────────────────────────────────────────────────────────
   Firestore batch helpers — chunked writes with retry.

   Firestore batched writes cap at 500 operations per batch. This module
   takes an array of (collection, docId, doc) tuples and commits them in
   batches of 500, retrying transient failures with exponential backoff.

   Pre-write canonical-key assertions still happen at the per-writer
   layer (writers.js); these batch helpers assume validated input.
   ────────────────────────────────────────────────────────────────────── */

import { getDb, COLLECTIONS } from './admin.js';

const BATCH_LIMIT = 500;
const MAX_RETRIES = 3;
const RETRY_BASE_MS = 500;

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

/**
 * Commit a batch of operations. Operations are { collection, docId, doc }.
 * @param {Array<{collection:string, docId:string, doc:Object}>} ops
 * @param {{logger:any, runId:string}} ctx
 * @returns {Promise<{ok:number, errors:number, details:Array}>}
 */
export async function batchWrite(ops, ctx) {
  if (!ops || !ops.length) return { ok: 0, errors: 0, details: [] };
  const db = getDb();
  const result = { ok: 0, errors: 0, details: [] };

  // Slice into batches of BATCH_LIMIT
  for (let i = 0; i < ops.length; i += BATCH_LIMIT) {
    const slice = ops.slice(i, i + BATCH_LIMIT);
    let attempt = 0;
    let committed = false;
    let lastErr = null;

    while (attempt < MAX_RETRIES && !committed) {
      attempt++;
      try {
        const batch = db.batch();
        for (const op of slice) {
          const ref = db.collection(op.collection).doc(op.docId);
          batch.set(ref, op.doc);
        }
        await batch.commit();
        result.ok += slice.length;
        committed = true;
      } catch (err) {
        lastErr = err;
        if (attempt < MAX_RETRIES) {
          const wait = RETRY_BASE_MS * Math.pow(2, attempt - 1);
          ctx.logger.warn(`[batchWrite] commit attempt ${attempt} failed: ${err.message}; retrying in ${wait}ms`);
          await sleep(wait);
        }
      }
    }

    if (!committed) {
      result.errors += slice.length;
      result.details.push({
        kind: 'batch_commit_failed',
        from: i,
        to: Math.min(i + BATCH_LIMIT, ops.length),
        error: lastErr?.message || 'unknown',
      });
    }
  }
  return result;
}

/* Convenience: build an ops array from role_city_market docs. */
export function roleCityOps(docs) {
  return docs.map(d => ({
    collection: COLLECTIONS.role_city_market,
    docId: `${d.cluster_key}__${d.path_key}__${d.city_key}`,
    doc: d,
  }));
}

export function roleSkillOps(docs) {
  return docs.map(d => ({
    collection: COLLECTIONS.role_skill_market,
    docId: `${d.cluster_key}__${d.path_key}__${d.skill_key}`,
    doc: d,
  }));
}

export function overlayDerivedOp(docId, doc) {
  return { collection: COLLECTIONS.overlay_derived, docId, doc };
}
