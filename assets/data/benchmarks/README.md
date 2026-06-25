# Benchmark Layer

The canonical home for Verastra's benchmark master dataset and any future
benchmark companions (city cost-of-living overlays, sector growth deltas,
volatility recalibrations).

## Files

- **`benchmarks_master.json`** — the master dataset. Schema v4, ~208 KB.
  Covers 15 professional clusters across India with role-level compensation
  bands, career paths, attrition, automation risk, mobility, network capital,
  reputation capital, and Monte Carlo event probabilities.

## Source-tier policy (from the dataset's own `_meta`)

Every number carries a source_tier:
- **S** — first-party institutional / regulator-grade
- **A** — specialist recruiter or career-data firm with placement-backed data
- **B** — aggregated user-reported
- **C** — editorial / coaching estimates (triangulation only)

User-facing UI shows **S / A only** for v1. **B** acceptable with disclaimer
in internal estimates. **C** is never displayed.

## Reading the data

Use `assets/js/data/benchmarks.js` as the loader. Never reach into the JSON
from tool modules directly — the loader is the contract.

## Permanence

This is a core product asset, not generated. Do not delete or substitute
with a placeholder during refactors. Schema changes are version-bumped in
`_meta.schema_version`.
