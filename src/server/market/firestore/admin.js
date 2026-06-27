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
  // Netlify stores \n escapes literally; restore them.
  const rawKey = process.env.FIREBASE_PRIVATE_KEY || '';
  const privateKey = rawKey.replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('[firestore] missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
  }

  /* ─── TEMPORARY DIAGNOSTIC — remove once the env var is verified ───
     Logs ONLY structural properties of FIREBASE_PRIVATE_KEY. Never
     prints the key material itself. Intended for one-off verification
     of the env var's PEM formatting on Netlify, then deletion. */
  console.log('[firestore-diagnostic] FIREBASE_PRIVATE_KEY exists:        ', !!process.env.FIREBASE_PRIVATE_KEY);
  console.log('[firestore-diagnostic] raw length:                         ', rawKey.length);
  console.log('[firestore-diagnostic] length after \\n → newline replacement:', privateKey.length);
  console.log('[firestore-diagnostic] starts with "-----BEGIN PRIVATE KEY-----":', privateKey.startsWith('-----BEGIN PRIVATE KEY-----'));
  console.log('[firestore-diagnostic] ends with   "-----END PRIVATE KEY-----":  ', privateKey.trimEnd().endsWith('-----END PRIVATE KEY-----'));
  console.log('[firestore-diagnostic] newline (\\n) count after replacement:    ', (privateKey.match(/\n/g) || []).length);
  console.log('[firestore-diagnostic] carriage-return (\\r) present:            ', privateKey.includes('\r'));
  console.log('[firestore-diagnostic] surrounded by quotes:                    ',
    (rawKey.startsWith('"') && rawKey.endsWith('"')) || (rawKey.startsWith("'") && rawKey.endsWith("'")));
  /* ─── END TEMPORARY DIAGNOSTIC ────────────────────────────────────── */

  if (getApps().length === 0) {
    initializeApp({
      credential: cert({ projectId, clientEmail, privateKey }),
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
