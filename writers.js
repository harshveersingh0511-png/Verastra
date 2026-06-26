/* ──────────────────────────────────────────────────────────────────────
   FIRESTORE WRITERS — Phase 2 full implementation.

   All overlay writes go through here. Pre-write canonical-key
   assertions; on failure → debug_runs.

   readPreviousSnapshotEvidence() reads the role_city_market and
   role_skill_market collections from the prior run for momentum
   computation. Bounded by MAX_READ.
   ────────────────────────────────────────────────────────────────────── */

import { getDb, COLLECTIONS } from './admin.js';
import { assertCanonicalPathKey, assertCanonicalCityKey } from '../../../../assets/js/data/paths.js';
import { assertCanonicalClusterKey } from '../../../../assets/js/data/clusters.js';

const MAX_READ = 3000;

async function logDebug(runId, kind, payload) {
  try {
    const db = getDb();
    await db.collection(COLLECTIONS.overlay_debug_runs).add({
      run_id: runId, kind, payload, ts: new Date().toISOString(),
    });
  } catch (_e) { /* swallow */ }
}

export async function writeRoleCityMarket(doc, runId) {
  try {
    assertCanonicalClusterKey(doc.cluster_key);
    assertCanonicalPathKey(doc.path_key);
    assertCanonicalCityKey(doc.city_key);
  } catch (e) {
    await logDebug(runId, 'role_city_market_canonical_assert_failed', { error: e.message, doc });
    return { ok: false, error: e.message };
  }
  const id = `${doc.cluster_key}__${doc.path_key}__${doc.city_key}`;
  await getDb().collection(COLLECTIONS.role_city_market).doc(id).set(doc);
  return { ok: true, id };
}

export async function writeRoleSkillMarket(doc, runId) {
  try {
    assertCanonicalClusterKey(doc.cluster_key);
    assertCanonicalPathKey(doc.path_key);
    if (!doc.skill_key) throw new Error('missing skill_key');
  } catch (e) {
    await logDebug(runId, 'role_skill_market_canonical_assert_failed', { error: e.message, doc });
    return { ok: false, error: e.message };
  }
  const id = `${doc.cluster_key}__${doc.path_key}__${doc.skill_key}`;
  await getDb().collection(COLLECTIONS.role_skill_market).doc(id).set(doc);
  return { ok: true, id };
}

export async function writeOverlayDerived(docId, doc) {
  await getDb().collection(COLLECTIONS.overlay_derived).doc(docId).set(doc);
  return { ok: true, id: docId };
}

export async function writeSnapshot(snapshot) {
  await getDb().collection(COLLECTIONS.market_snapshots).doc(snapshot.run_id).set(snapshot);
  return { ok: true, id: snapshot.run_id };
}

export async function writeRawIngest(runId, adapterId, payload) {
  await getDb().collection(COLLECTIONS.overlay_raw_ingest).add({
    run_id: runId, adapter_id: adapterId, payload, ts: new Date().toISOString(),
  });
  return { ok: true };
}

export async function writeDebug(runId, kind, payload) {
  return logDebug(runId, kind, payload);
}

/* Read all role_city_market and role_skill_market docs from the most
   recent snapshot whose run_id != currentRunId. Returns Maps keyed by
   the canonical doc_id. Empty maps mean "no prior snapshot" or a
   transient read failure — momentum then reports as "unknown". */
export async function readPreviousSnapshotEvidence(currentRunId) {
  const roleCityByKey = new Map();
  const roleSkillByKey = new Map();
  try {
    const db = getDb();

    // Find the most recent snapshot before this run
    const snapSnap = await db.collection(COLLECTIONS.market_snapshots)
      .orderBy('run_ts', 'desc')
      .limit(5)
      .get();

    let prevRunId = null;
    for (const d of snapSnap.docs) {
      if (d.id !== currentRunId) { prevRunId = d.id; break; }
    }
    if (!prevRunId) return { roleCityByKey, roleSkillByKey };

    // Read role_city_market entries from that run
    const rcSnap = await db.collection(COLLECTIONS.role_city_market)
      .where('freshness.run_id', '==', prevRunId)
      .limit(MAX_READ).get();
    for (const d of rcSnap.docs) roleCityByKey.set(d.id, d.data());

    const rsSnap = await db.collection(COLLECTIONS.role_skill_market)
      .where('freshness.run_id', '==', prevRunId)
      .limit(MAX_READ).get();
    for (const d of rsSnap.docs) roleSkillByKey.set(d.id, d.data());

    return { roleCityByKey, roleSkillByKey, prev_run_id: prevRunId };
  } catch (err) {
    // Read failure → return empties; orchestrator continues without momentum
    return { roleCityByKey, roleSkillByKey, error: err.message };
  }
}
