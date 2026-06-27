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
  const privateKey = (process.env.FIREBASE_PRIVATE_KEY || '').replace(/\\n/g, '\n');

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error('[firestore] missing FIREBASE_PROJECT_ID / FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY');
  }

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
