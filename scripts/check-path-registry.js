#!/usr/bin/env node
/* ──────────────────────────────────────────────────────────────────────
   check-path-registry.js — registry-drift CI check (checkpoint §1.2).

   Walks PATHS in paths.js and confirms every non-null benchmark_path_ref
   resolves against assets/data/benchmarks/benchmarks_master.json.

   Exits non-zero on any unresolved ref. Intended to run pre-refresh.
   ────────────────────────────────────────────────────────────────────── */

import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');

const benchPath = path.join(root, 'assets/data/benchmarks/benchmarks_master.json');
const bench = JSON.parse(fs.readFileSync(benchPath, 'utf8'));

const { PATHS, CITIES } = await import(path.join(root, 'assets/js/data/paths.js'));
const { CLUSTERS } = await import(path.join(root, 'assets/js/data/clusters.js'));

let fail = 0;
const stats = { total: 0, resolved: 0, null_with_reason: 0, unresolved: 0 };

for (const p of Object.values(PATHS)) {
  stats.total++;
  if (!p.benchmark_path_ref) {
    if (!p._ref_null_reason) {
      console.error(`✗ ${p.path_key}: benchmark_path_ref is null but no _ref_null_reason given`);
      fail++; stats.unresolved++;
    } else {
      stats.null_with_reason++;
    }
    continue;
  }
  const { cluster_node, path_node } = p.benchmark_path_ref;
  const node = bench[cluster_node];
  if (!node || typeof node !== 'object' || !(path_node in node)) {
    console.error(`✗ ${p.path_key}: benchmark_path_ref ${cluster_node}.${path_node} does not exist in benchmarks_master.json`);
    fail++; stats.unresolved++;
  } else {
    stats.resolved++;
  }
}

// Check cluster benchmark_keys
for (const c of Object.values(CLUSTERS)) {
  for (const bk of c.benchmark_keys) {
    if (!(bk in bench)) {
      console.error(`✗ cluster ${c.cluster_key}: benchmark_keys references "${bk}" which is missing from benchmarks_master.json`);
      fail++;
    }
  }
}

// Check city registry against benchmark city_cost_of_living.cities
const benchCities = bench.city_cost_of_living?.cities || {};
const benchCityLowerToOrig = new Map(Object.keys(benchCities).map(k => [k.toLowerCase().replace(/[_-]/g, ''), k]));
for (const cityKey of Object.keys(CITIES)) {
  const normalized = cityKey.replace(/[_-]/g, '');
  if (!benchCityLowerToOrig.has(normalized)) {
    console.error(`✗ city ${cityKey}: not found in benchmark city_cost_of_living.cities`);
    fail++;
  }
}

console.log('');
console.log('--- registry summary ---');
console.log(`  total paths        : ${stats.total}`);
console.log(`  bench ref resolved : ${stats.resolved}`);
console.log(`  null with reason   : ${stats.null_with_reason}`);
console.log(`  unresolved (FAIL)  : ${stats.unresolved}`);

if (fail > 0) {
  console.error(`\n${fail} registry mismatch(es) — refresh would abort.`);
  process.exit(1);
}
console.log('\n✓ path registry is consistent with benchmarks_master.json');
