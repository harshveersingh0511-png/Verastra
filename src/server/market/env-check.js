/* ──────────────────────────────────────────────────────────────────────
   env-check.js — environment-variable validation for the Netlify
   functions. Imported at the top of every function so cold starts fail
   fast with a clear error message instead of cryptic Firebase auth
   errors mid-run.
   ────────────────────────────────────────────────────────────────────── */

const REQUIRED = [
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
];

const RECOMMENDED = [
  'MARKET_REFRESH_MANUAL_TOKEN',
  'MARKET_REFRESH_USER_AGENT',
  'MARKET_REFRESH_TIMEOUT_MS',
];

/**
 * Validate environment. Throws on missing REQUIRED vars (which would
 * make the function entirely non-functional). Logs a warning on
 * missing RECOMMENDED vars (which degrade behavior but don't break
 * the pipeline).
 *
 * @returns {{ok:true, present:Array, missing_required:[], missing_recommended:Array}}
 * @throws {Error} when any REQUIRED var is missing
 */
export function validateEnv() {
  const present = [];
  const missing_required = [];
  const missing_recommended = [];

  for (const k of REQUIRED) {
    if (process.env[k]) present.push(k);
    else missing_required.push(k);
  }
  for (const k of RECOMMENDED) {
    if (process.env[k]) present.push(k);
    else missing_recommended.push(k);
  }

  if (missing_required.length > 0) {
    const msg = `Missing required environment variables: ${missing_required.join(', ')}. ` +
                `Set these in Netlify → Site settings → Environment variables. ` +
                `See README-DEPLOYMENT.md for the full reference.`;
    throw new Error(msg);
  }

  if (missing_recommended.length > 0) {
    console.warn(`[env-check] Missing recommended env vars: ${missing_recommended.join(', ')}. ` +
                 `Defaults will be used where possible.`);
  }

  return { ok: true, present, missing_required, missing_recommended };
}
