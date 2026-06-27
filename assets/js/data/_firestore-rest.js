/* ──────────────────────────────────────────────────────────────────────
   Firestore REST client — minimal, no SDK dependency.

   Public-read collections only (overlay docs from Phase 2). All overlay
   collections in this project are configured with `allow read: if true`
   so no auth token is required for the calls this module makes.

   Two operations exposed:
     - getDoc(collection, docId)      → decoded object or null
     - runQuery(collection, filters)  → array of decoded objects

   This module is intentionally NOT exported to consumer surfaces.
   Only market-overlay.js imports it. Treat as a transport layer.
   ────────────────────────────────────────────────────────────────────── */

const PROJECT_ID = 'verastra-49947';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const FETCH_TIMEOUT_MS = 6000;

/* ── Firestore value decoder ───────────────────────────────────────────
   Firestore REST returns typed values like { stringValue: "x" }, etc.
   Walks the value tree and returns plain JS values. */
export function decodeValue(v) {
  if (v == null) return null;
  if ('stringValue'   in v) return v.stringValue;
  if ('booleanValue'  in v) return v.booleanValue;
  if ('integerValue'  in v) return Number(v.integerValue);
  if ('doubleValue'   in v) return v.doubleValue;
  if ('timestampValue' in v) return v.timestampValue;
  if ('nullValue'     in v) return null;
  if ('arrayValue'    in v) {
    const arr = v.arrayValue.values || [];
    return arr.map(decodeValue);
  }
  if ('mapValue' in v) {
    const fields = v.mapValue.fields || {};
    const out = {};
    for (const [k, val] of Object.entries(fields)) out[k] = decodeValue(val);
    return out;
  }
  return null;
}

export function decodeDoc(rawDoc) {
  if (!rawDoc || !rawDoc.fields) return null;
  const out = {};
  for (const [k, v] of Object.entries(rawDoc.fields)) out[k] = decodeValue(v);
  return out;
}

/* ── HTTP helpers ─────────────────────────────────────────────────────── */

async function timedFetch(url, init = {}) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(t);
  }
}

/* GET a single document. Returns the decoded object or null on absence
   or any failure. NEVER throws — the service layer above relies on null
   meaning "no overlay available" and proceeds gracefully. */
export async function getDoc(collection, docId) {
  try {
    const url = `${BASE}/${encodeURIComponent(collection)}/${encodeURIComponent(docId)}`;
    const res = await timedFetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    return decodeDoc(json);
  } catch (_e) {
    return null;
  }
}

/* Encode a JS value back into Firestore typed form. Used by runQuery
   to build filter literals. */
function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'string')  return { stringValue: v };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  }
  return { stringValue: String(v) };
}

/* runQuery — minimal: equality filters on a single collection.
   filters: { field_path: value, ... } (AND-composed)
   Returns an array of decoded documents.

   Used sparingly. Most reads in market-overlay.js are direct doc
   fetches by canonical doc_id; queries are reserved for "give me all
   skill docs for this (cluster, path)" type lookups. */
export async function runQuery(collection, filters, opts = {}) {
  try {
    const url = `${BASE}:runQuery`;
    const filterArr = Object.entries(filters || {}).map(([fieldPath, value]) => ({
      fieldFilter: {
        field: { fieldPath },
        op: 'EQUAL',
        value: encodeValue(value),
      },
    }));
    const body = {
      structuredQuery: {
        from: [{ collectionId: collection }],
        where: filterArr.length === 1
          ? filterArr[0]
          : filterArr.length > 1
            ? { compositeFilter: { op: 'AND', filters: filterArr } }
            : undefined,
        limit: opts.limit || 50,
      },
    };
    const res = await timedFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return [];
    const arr = await res.json();
    if (!Array.isArray(arr)) return [];
    const out = [];
    for (const entry of arr) {
      if (entry.document) {
        const d = decodeDoc(entry.document);
        if (d) out.push(d);
      }
    }
    return out;
  } catch (_e) {
    return [];
  }
}
