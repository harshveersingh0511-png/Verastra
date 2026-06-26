/* ──────────────────────────────────────────────────────────────────────
   overlay-version.js — overlay document schema version (backend).

   Single source of truth for the version stamp written onto every
   overlay document produced by the aggregator. The frontend
   (market-overlay.js) declares a SUPPORTED_VERSIONS list; documents
   whose version is not in that list are rejected at the service layer
   and the overlay surfaces fall back to silence.

   Versioning rule:
     - MAJOR bump (1.x → 2.0): breaking schema change. Frontend MUST
       drop old major from SUPPORTED_VERSIONS before the new backend
       deploys.
     - MINOR bump (1.0 → 1.1): additive schema change. Frontend may
       declare both versions supported during rollout.

   Bump procedure:
     1. Decide major vs minor.
     2. Update OVERLAY_VERSION here.
     3. Update SUPPORTED_VERSIONS in assets/js/data/market-overlay.js.
     4. Deploy frontend first, backend second.
   ────────────────────────────────────────────────────────────────────── */

export const OVERLAY_VERSION = '1.0';
