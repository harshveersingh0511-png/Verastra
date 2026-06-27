/* ──────────────────────────────────────────────────────────────────────
   FIRESTORE ADMIN INIT

   Initializes firebase-admin from a single environment variable that
   contains the full Firebase service-account JSON. Singleton.

   Required env var (set in Netlify):
     FIREBASE_SERVICE_ACCOUNT   — the full JSON downloaded from
                                  Firebase Console → Project Settings →
                                  Service accounts → Generate new
                                  private key.
   ────────────────────────────────────────────────────────────────────── */

import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let _db = null;

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
