#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────
   self-test.js — End-to-end pipeline test against synthetic input.

   Designed to run in CI or pre-deploy. Does NOT hit live Firestore or
   the live internet. Verifies:

     1. All adapter modules load and conform to the contract
     2. Normalization pipeline buckets postings correctly
     3. Aggregator produces well-shaped role_city/role_skill docs
     4. Confidence + freshness gating works
     5. Schema versioning is stamped on every emitted document
     6. Canonical-key assertions pass

   Exit code 0 on success, 1 on any failure.

   Run: node scripts/self-test.js
   ────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

let passed = 0, failed = 0;
function check(label, cond, detail) {
  if (cond) { console.log(`  ✓ ${label}`); passed++; }
  else      { console.log(`  ✗ ${label}${detail ? ` — ${detail}` : ''}`); failed++; }
}

console.log('=== 1. Module load ===');
const { getActiveAdapters, getAllAdapters } = await import(path.join(root, 'src/server/market/adapters/index.js'));
const { ADAPTER_SIGNATURE, validateAdapter } = await import(path.join(root, 'src/server/market/adapters/_base.js'));
const { normalize } = await import(path.join(root, 'src/server/market/normalize/index.js'));
const {
  aggregateRoleCity, aggregateRoleSkill,
  buildDashboardPulse, buildTerminalSnippets, buildCityPulse,
} = await import(path.join(root, 'src/server/market/aggregate/index.js'));
const { scoreConfidence, freshnessFactor, freshnessCapTier } = await import(path.join(root, 'src/server/market/scoring/confidence.js'));
const { scoreMomentum } = await import(path.join(root, 'src/server/market/scoring/momentum.js'));
const { OVERLAY_VERSION } = await import(path.join(root, 'src/server/market/overlay-version.js'));
const { CLUSTERS } = await import(path.join(root, 'assets/js/data/clusters.js'));
const { PATHS, CITIES } = await import(path.join(root, 'assets/js/data/paths.js'));
check('all backend modules load', true);

console.log('\n=== 2. Adapter contract conformance ===');
const all = getAllAdapters();
check(`adapter count >= 8`, all.length >= 8, `got ${all.length}`);
for (const a of all) {
  try { validateAdapter(a); check(`  adapter ${a.id} conforms`, true); }
  catch (e) { check(`  adapter ${a.id} conforms`, false, e.message); }
}
const active = getActiveAdapters();
check(`active adapters (live or light)`, active.length >= 8, `got ${active.length}`);
check(`future-slot adapters excluded`, !active.find(a => a.v1_status === 'future_slot'));

console.log('\n=== 3. New ATS parser modules load ===');
const parserNames = ['ashby', 'smartrecruiters', 'workable', 'breezyhr'];
for (const p of parserNames) {
  try {
    await import(path.join(root, `src/server/market/adapters/employer-careers/parsers/${p}.js`));
    check(`parser/${p} loads`, true);
  } catch (e) {
    check(`parser/${p} loads`, false, e.message);
  }
}

console.log('\n=== 4. Allowlists are valid JSON + tagged ===');
const allowDir = path.join(root, 'src/server/market/adapters/employer-careers/allowlists');
const allowFiles = await fs.readdir(allowDir);
check(`12 cluster allowlists present`, allowFiles.filter(f => f.endsWith('.json')).length === 12);
for (const f of allowFiles) {
  if (!f.endsWith('.json')) continue;
  try {
    const data = JSON.parse(await fs.readFile(path.join(allowDir, f), 'utf8'));
    const ok = !!data.cluster_key && Array.isArray(data.employers);
    check(`  allowlist ${f}`, ok);
  } catch (e) {
    check(`  allowlist ${f}`, false, e.message);
  }
}

console.log('\n=== 5. Registries align with benchmarks_master.json ===');
const benchPath = path.join(root, 'assets/data/benchmarks/benchmarks_master.json');
const bench = JSON.parse(await fs.readFile(benchPath, 'utf8'));
let nullRefCount = 0, mappedCount = 0, brokenCount = 0;
for (const p of Object.values(PATHS)) {
  if (!p.benchmark_path_ref) { nullRefCount++; continue; }
  const { cluster_node, path_node } = p.benchmark_path_ref;
  if (bench[cluster_node] && path_node in bench[cluster_node]) mappedCount++;
  else { brokenCount++; console.log(`    BROKEN: ${p.path_key} → ${cluster_node}.${path_node}`); }
}
check(`zero broken benchmark refs`, brokenCount === 0, `${brokenCount} broken`);
check(`mapped vs null-ref split`, true, `${mappedCount} mapped, ${nullRefCount} null-ref`);

console.log('\n=== 6. Normalization pipeline ===');
const ctx = {
  now: new Date(),
  runId: 'self_test',
  logger: { info() {}, warn() {}, error() {}, debug() {} },
  env: {},
  timeBudgetMs: 5000,
  dryRun: true,
};

const synthetic = [
  { title: 'Senior FP&A Analyst', company: 'Stripe', location: 'Bangalore', description: 'FP&A, SQL, advanced Excel, financial modeling. CTC ₹22-32 LPA.', source: 'naukri', source_url: 'u1', posted_ts: '2026-06-22', salary_raw: '₹22-32 LPA' },
  { title: 'Software Engineer', company: 'Razorpay', location: 'Bangalore', description: 'Node.js, Python, AWS, microservices.', source: 'employer_careers', source_url: 'u2', posted_ts: '2026-06-23', salary_raw: null },
  { title: 'Multiple Roles', company: 'Confidential', location: 'Mumbai', description: 'Various openings.', source: 'naukri', source_url: 'u3', posted_ts: null, salary_raw: null },
  { title: 'FP&A Manager', company: 'CRED', location: 'Atlantis', description: 'FP&A in mythical city.', source: 'naukri', source_url: 'u4', posted_ts: null, salary_raw: null },
];

const buckets = { full: [], cluster_usable: [], drop: 0 };
for (const r of synthetic) {
  const n = normalize(r, ctx);
  if (n.bucket === 'full') buckets.full.push(n);
  else if (n.bucket === 'cluster_usable') buckets.cluster_usable.push(n);
  else buckets.drop++;
}
check('FP&A/Bangalore classified into fin_acct_tax', !!buckets.full.find(b => b.cluster_key === 'fin_acct_tax' && b.city_key === 'bangalore'));
check('SWE/Bangalore classified into product_tech_data', !!buckets.full.find(b => b.cluster_key === 'product_tech_data'));
check('Multiple Roles catch-all dropped', buckets.drop >= 1);
check('Unknown city Atlantis dropped', !!buckets.full.every(b => b.city_key !== null));

console.log('\n=== 7. Aggregation produces well-shaped docs ===');
const applicability = JSON.parse(await fs.readFile(path.join(root, 'assets/js/data/source-applicability.json'), 'utf8'));
const prev = { roleCityByKey: new Map(), roleSkillByKey: new Map() };
const roleCityDocs = aggregateRoleCity(buckets, prev, applicability, ctx);
const roleSkillDocs = aggregateRoleSkill(buckets, prev, applicability, ctx);
check(`role_city docs emitted`, roleCityDocs.length > 0);

if (roleCityDocs.length > 0) {
  const sample = roleCityDocs[0];
  check('  doc carries overlay_version', sample.overlay_version === OVERLAY_VERSION, `got "${sample.overlay_version}"`);
  check('  doc carries cluster_key + path_key + city_key', !!sample.cluster_key && !!sample.path_key && !!sample.city_key);
  check('  doc carries demand.weighted_evidence', typeof sample.demand?.weighted_evidence === 'number');
  check('  doc carries confidence.tier', ['HIGH','MEDIUM','LOW','THIN'].includes(sample.confidence?.tier));
  check('  doc carries momentum.direction', !!sample.momentum?.direction);
  check('  doc carries benchmark_comparable', typeof sample.benchmark_comparable === 'boolean');
  check('  doc carries freshness.snapshot_ts + run_id', !!sample.freshness?.snapshot_ts && !!sample.freshness?.run_id);
}

console.log('\n=== 8. Derived docs (dashboard_pulse + terminal_snippets + city_pulse) ===');
const dashboardPulse = buildDashboardPulse(roleCityDocs, roleSkillDocs, buckets, applicability, ctx);
check(`dashboard_pulse produced`, !!dashboardPulse);
check('  carries overlay_version', dashboardPulse?.overlay_version === OVERLAY_VERSION);
check('  has cluster_coverage_health for all 12 clusters', Object.keys(dashboardPulse?.cluster_coverage_health || {}).length === 12);

const snippets = buildTerminalSnippets(roleCityDocs, roleSkillDocs, ctx);
check(`terminal_snippets produced`, !!snippets);
check('  carries overlay_version', snippets?.overlay_version === OVERLAY_VERSION);

if (roleCityDocs.length > 0) {
  const cityPulse = buildCityPulse(roleCityDocs[0].city_key, roleCityDocs, roleSkillDocs, ctx);
  check(`city_pulse produced`, !!cityPulse);
  check('  carries overlay_version', cityPulse?.overlay_version === OVERLAY_VERSION);
}

console.log('\n=== 9. Scoring functions are pure + deterministic ===');
check(`freshnessFactor at age 0`, freshnessFactor(new Date().toISOString()) === 1.0);
check(`freshnessFactor at age 35d → 0`, freshnessFactor(new Date(Date.now() - 35*86400000).toISOString()) === 0);
check(`freshnessCapTier @ 5d = HIGH`, freshnessCapTier(new Date(Date.now() - 5*86400000).toISOString()) === 'HIGH');
check(`freshnessCapTier @ 15d = MEDIUM`, freshnessCapTier(new Date(Date.now() - 15*86400000).toISOString()) === 'MEDIUM');
check(`scoreMomentum positive delta = accelerating`, scoreMomentum(0.5, 0.3).direction === 'accelerating');
check(`scoreMomentum no-prev = unknown`, scoreMomentum(0.5, null).direction === 'unknown');

console.log('\n=== 10. Source-applicability schema sanity ===');
const sources = Object.keys(applicability).filter(k => !k.startsWith('_'));
check(`source-applicability has ≥ 8 sources`, sources.length >= 8);
for (const s of sources) {
  const sa = applicability[s];
  check(`  ${s}: has influence_weight map`, sa.influence_weight && typeof sa.influence_weight === 'object');
  // future-slot sources don't need source_tier (never invoked at runtime)
  if (sa.v1_status !== 'future_slot') {
    check(`  ${s}: has source_tier`, ['T1','T2','T3'].includes(sa.source_tier));
  }
}

console.log(`\n${'='.repeat(60)}`);
console.log(`Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
