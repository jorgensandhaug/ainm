# Semimech Hazards Notes

## Scope

- Family owner: `agent2`
- Goal: beat existing `query_residual_v7` historical online benchmark while keeping evaluation round-held-out and reproducible.

## Session Facts

- Branch: `agent2`
- Start commit: `78d89f9977e756f86c1e750be7d1d81c5207f269`
- Canonical docs read:
  - `README.md`
  - `docs/game_facts.md`
  - `instructions/agent2.md`

## Current Baselines

- `historical_bucket_prior_v1`
  - artifact: `data/artifacts/benchmarks/agent2_baseline_historical_bucket_prior_20260320/`
  - mean score: `66.0233`
  - mean weighted KL: `0.148488`
- `query_residual_v7` 3-round repaired dev line
  - artifact: `data/artifacts/benchmarks/agent2_dev_query_residual_3rounds_coverage_20260320/`
  - mean score: `72.6319`
  - mean weighted KL: `0.107047`
- Existing repo artifact to beat:
  - `data/artifacts/benchmarks/dev_query_residual_online50_v7/`
  - mean score: `73.9505`
  - mean weighted KL: `0.106326`

## Working View

- Current hazard teacher is not yet a real transition teacher.
- Near-term leverage likely sits in:
  - residual/teacher gating
  - policy choice
  - stronger validation for online-interactive selection
