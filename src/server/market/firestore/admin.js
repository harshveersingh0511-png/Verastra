/* ──────────────────────────────────────────────────────────────────────
   FIRESTORE ADMIN INIT

   Initializes firebase-admin from environment variables. Singleton.

   Required env vars (set in Netlify):
     FIREBASE_PROJECT_ID
     FIREBASE_CLIENT_EMAIL
     FIREBASE_PRIVATE_KEY     (private key with \n preserved as literal "\n")
   ────────────────────────────────────────────────────────────────────── */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let _db = null;

export function getDb() {
  if (_db) return _db;

  const projectId  = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY || '';

  /* ── Defensive PEM normalization ───────────────────────────────────
     Netlify stores env-var values as flat strings. Depending on how
     the key was pasted, it can arrive in any of these forms:

       Form A: literal-escape ("...\\nMIIEv...\\n-----END...\\n")
       Form B: real-newline   ("...\n MIIEv...\n -----END...\n")
       Form C: with wrapping quotes (\"...\")
       Form D: with CRLF line endings introduced by a Windows clipboard
       E: any combination of the above

     The four-step normalization below produces a canonical PEM string
     that firebase-admin's `cert()` accepts, regardless of which form
     the env var arrived in. Order matters:

       1. Strip wrapping quotes (so we work on the inner string)
       2. Remove all carriage returns (CRLF → LF)
       3. Replace literal "\\n" sequences with real newlines
          (no-op for Form B — the regex matches "\\" + "n", not "\n")
       4. Strip leading/trailing whitespace once (cleans up Form C tails)
     ────────────────────────────────────────────────────────────────── */

  let normalizedKey = rawKey;

  // 1. Strip wrapping quotes (matched pair only)
  if ((normalizedKey.startsWith('"') && normalizedKey.endsWith('"')) ||
      (normalizedKey.startsWith("'") && normalizedKey.endsWith("'"))) {
    normalizedKey = normalizedKey.slice(1, -1);
  }

  // 2. Remove all carriage returns (CRLF → LF, lone CR → nothing)
  normalizedKey = normalizedKey.replace(/\r/g, '');

  // 3. Replace literal "\n" sequences with real newlines; real newlines pass through
  normalizedKey = normalizedKey.replace(/\\n/g, '\n');

  // 4. One final whitespace trim — handles a stray trailing newline or space
  normalizedKey = normalizedKey.trim();

  // Re-append the single trailing newline PEM expects (trim removed it)
  if (!normalizedKey.endsWith('\n')) normalizedKey += '\n';

  if (!projectId || !clientEmail || !normalizedKey) {
    throw new Error('[firestore] missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
  }

  /* ─── TEMPORARY DIAGNOSTIC — remove once env var is verified ───
     Reports structural properties of the key, never the key itself.
     `carriage_return_count` and `surrounded_by_quotes` reflect the
     RAW value (before normalization) so you can see whether the
     normalization was actually needed. */
  const rawHadQuotes = (rawKey.startsWith('"') && rawKey.endsWith('"')) ||
                       (rawKey.startsWith("'") && rawKey.endsWith("'"));
  console.log('[firestore-diagnostic] raw length:                         ', rawKey.length);
  console.log('[firestore-diagnostic] normalized length:                  ', normalizedKey.length);
  console.log('[firestore-diagnostic] starts with "-----BEGIN PRIVATE KEY-----":', normalizedKey.startsWith('-----BEGIN PRIVATE KEY-----'));
  console.log('[firestore-diagnostic] ends with   "-----END PRIVATE KEY-----": ', normalizedKey.trimEnd().endsWith('-----END PRIVATE KEY-----'));
  console.log('[firestore-diagnostic] newline (\\n) count in normalized:    ', (normalizedKey.match(/\n/g) || []).length);
  console.log('[firestore-diagnostic] carriage-return (\\r) count in raw:   ', (rawKey.match(/\r/g) || []).length);
  console.log('[firestore-diagnostic] raw was surrounded by quotes:        ', rawHadQuotes);
  /* ─── END TEMPORARY DIAGNOSTIC ────────────────────────────────── */

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey: normalizedKey }),
      projectId,
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
