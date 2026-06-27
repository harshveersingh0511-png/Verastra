/* ──────────────────────────────────────────────────────────────────────
   FIRESTORE ADMIN INIT — self-healing service-account loader

   Reads FIREBASE_SERVICE_ACCOUNT (the full Firebase service-account
   JSON), repairs every known formatting issue in private_key before
   calling cert(), validates structural integrity, then initializes
   firebase-admin as a singleton.

   The repair pipeline handles every documented failure mode of
   transporting a PEM through Netlify's env-var storage:

     1. UTF-8 BOM at start of value
     2. Wrapping quotes (single or double)
     3. Zero-width Unicode characters (U+200B, U+200C, U+200D, U+FEFF)
     4. Literal backslash-n that survived JSON.parse (theory #1 —
        double-escaping upstream of Netlify)
     5. CRLF line endings (theory #3 — Windows clipboard / editor)
     6. Leading/trailing whitespace
     7. Missing trailing newline (PEM convention)

   After repair, the result is validated structurally before being
   passed to cert(). If validation fails, a precise diagnostic error
   is thrown that identifies the exact structural defect — at that
   point the issue is data corruption beyond formatting (truncation,
   wrong field, etc.), not transport corruption.

   The diagnostic logging block at the start of getDb() reports
   structural facts about the parsed key, never the key material.
   Remove the block marked TEMPORARY DIAGNOSTIC once a successful
   refresh confirms the repair pipeline is working.
   ────────────────────────────────────────────────────────────────────── */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let _db = null;

/* ── Self-healing repair pipeline ──────────────────────────────────── */

function repairPrivateKey(raw) {
  if (typeof raw !== 'string') {
    return { fixed: raw, repairs: [], fatal: 'private_key is not a string' };
  }

  let fixed = raw;
  const repairs = [];

  // 1. Strip UTF-8 BOM at start
  if (fixed.charCodeAt(0) === 0xFEFF) {
    fixed = fixed.slice(1);
    repairs.push('stripped UTF-8 BOM (U+FEFF)');
  }

  // 2. Strip wrapping quotes (matched pair only)
  if ((fixed.startsWith('"') && fixed.endsWith('"')) ||
      (fixed.startsWith("'") && fixed.endsWith("'"))) {
    fixed = fixed.slice(1, -1);
    repairs.push('stripped wrapping quotes');
  }

  // 3. Strip zero-width Unicode characters anywhere in the string
  const zwBefore = fixed.length;
  fixed = fixed.replace(/[\u200B\u200C\u200D\uFEFF]/g, '');
  if (fixed.length !== zwBefore) {
    repairs.push(`stripped ${zwBefore - fixed.length} zero-width Unicode chars`);
  }

  // 4. Replace literal "\n" with real newlines (theory #1 — double-escaping)
  //    The regex /\\n/g matches backslash+n in the string, NOT real newlines,
  //    so real newlines pass through this step untouched.
  const litBefore = (fixed.match(/\\n/g) || []).length;
  if (litBefore > 0) {
    fixed = fixed.replace(/\\n/g, '\n');
    repairs.push(`converted ${litBefore} literal \\n → real newline`);
  }

  // 5. Strip carriage returns (theory #3 — CRLF line endings)
  const crBefore = (fixed.match(/\r/g) || []).length;
  if (crBefore > 0) {
    fixed = fixed.replace(/\r/g, '');
    repairs.push(`stripped ${crBefore} carriage returns`);
  }

  // 6. Trim leading/trailing whitespace
  const trimmed = fixed.trim();
  if (trimmed.length !== fixed.length) {
    repairs.push(`trimmed ${fixed.length - trimmed.length} whitespace chars`);
  }
  fixed = trimmed;

  // 7. Append the single trailing newline PEM convention expects
  if (!fixed.endsWith('\n')) {
    fixed += '\n';
    repairs.push('appended trailing newline');
  }

  return { fixed, repairs, fatal: null };
}

/* ── Structural validation after repair ────────────────────────────── */

function validateRepairedKey(key) {
  const errors = [];
  if (!key.startsWith('-----BEGIN PRIVATE KEY-----')) {
    errors.push('missing BEGIN marker after repair');
  }
  if (!key.trimEnd().endsWith('-----END PRIVATE KEY-----')) {
    errors.push('missing END marker after repair');
  }
  const newlines = (key.match(/\n/g) || []).length;
  if (newlines < 3) {
    errors.push(`too few newlines after repair (${newlines}); valid keys have 27-28`);
  }
  if (key.length < 1600) {
    errors.push(`key too short after repair (${key.length} chars); valid keys are ~1700`);
  }
  if (key.length > 2200) {
    errors.push(`key too long after repair (${key.length} chars); valid keys are ~1700`);
  }
  return errors;
}

/* ── Main entry ────────────────────────────────────────────────────── */

export function getDb() {
  if (_db) return _db;

  if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    throw new Error('[firestore] missing FIREBASE_SERVICE_ACCOUNT environment variable');
  }

  let serviceAccount;
  try {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  } catch (err) {
    throw new Error(`[firestore] FIREBASE_SERVICE_ACCOUNT is not valid JSON: ${err.message}`);
  }

  const pkBefore = serviceAccount.private_key;

  /* ─── TEMPORARY FORENSIC DIAGNOSTIC ────────────────────────────────
     Reports structural facts about the parsed private_key, never the
     key material. Remove this block once the function runs cleanly. */
  console.log("===== PRIVATE KEY FORENSIC DIAGNOSTIC =====");
  console.log("typeof serviceAccount:           ", typeof serviceAccount);
  console.log("typeof serviceAccount.private_key:", typeof pkBefore);
  console.log("pk length (pre-repair):          ", pkBefore ? pkBefore.length : 'N/A');
  console.log("first 50 chars (JSON-stringified):", JSON.stringify(pkBefore ? pkBefore.substring(0, 50) : ''));
  console.log("last 50 chars (JSON-stringified): ", JSON.stringify(pkBefore ? pkBefore.substring(pkBefore.length - 50) : ''));
  console.log("contains literal \\\\n:            ", pkBefore ? pkBefore.includes('\\n') : 'N/A');
  console.log("contains real newline:           ", pkBefore ? pkBefore.includes('\n') : 'N/A');
  console.log("contains \\r:                     ", pkBefore ? pkBefore.includes('\r') : 'N/A');
  console.log("starts with BEGIN marker:        ", pkBefore ? pkBefore.startsWith('-----BEGIN PRIVATE KEY-----') : 'N/A');
  console.log("ends with END marker (trimmed):  ", pkBefore ? pkBefore.trimEnd().endsWith('-----END PRIVATE KEY-----') : 'N/A');
  console.log("char codes first 30:             ", pkBefore ? Array.from(pkBefore.substring(0, 30)).map(c => c.charCodeAt(0)).join(',') : 'N/A');
  console.log("char codes last 30:              ", pkBefore ? Array.from(pkBefore.substring(pkBefore.length - 30)).map(c => c.charCodeAt(0)).join(',') : 'N/A');
  /* ─── END TEMPORARY FORENSIC DIAGNOSTIC ─────────────────────────── */

  // Run the self-healing repair pipeline
  const { fixed, repairs, fatal } = repairPrivateKey(pkBefore);
  if (fatal) {
    throw new Error(`[firestore] private_key cannot be repaired: ${fatal}`);
  }

  console.log("===== REPAIR PIPELINE RESULT =====");
  if (repairs.length === 0) {
    console.log("repairs applied:                  none (key was already clean)");
  } else {
    console.log(`repairs applied (${repairs.length}):`);
    for (const r of repairs) console.log("  • " + r);
  }
  console.log("pk length (post-repair):         ", fixed.length);
  console.log("post-repair newline count:       ", (fixed.match(/\n/g) || []).length);

  // Validate structural integrity of the repaired key
  const errors = validateRepairedKey(fixed);
  if (errors.length > 0) {
    console.log("structural validation: FAILED");
    for (const e of errors) console.log("  ✗ " + e);
    console.log("===================================");
    throw new Error(
      `[firestore] private_key failed structural validation after repair: ${errors.join('; ')}. ` +
      `This is not a formatting issue — the key data itself is malformed. ` +
      `Re-download the service-account JSON from Firebase Console and re-paste into FIREBASE_SERVICE_ACCOUNT.`
    );
  }
  console.log("structural validation:           PASSED");
  console.log("===================================");

  // Apply the repaired key to the service account object before cert() sees it
  serviceAccount.private_key = fixed;

  if (getApps().length === 0) {
    initializeApp({
      credential: cert(serviceAccount),
    });
  }

  _db = getFirestore();
  return _db;
}

export const COLLECTIONS = Object.freeze({
  role_city_market:    'role_city_market',
  role_skill_market:   'role_skill_market',
  overlay_derived:     'overlay_derived',
  market_snapshots:    'market_snapshots',
  overlay_raw_ingest:  'overlay_raw_ingest',
  overlay_debug_runs:  'overlay_debug_runs',
});
