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
- `query_residual_v7` 3-round exploration policy line
  - artifact: `data/artifacts/benchmarks/agent2_dev_query_residual_3rounds_exploration_20260320/`
  - mean score: `73.1346`
  - mean weighted KL: `0.104737`
  - note: policy-only improvement over repaired coverage baseline
- `query_residual_v7` full 8-round exploration line
  - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_8rounds_exploration_20260321/`
  - mean score: `74.4010`
  - mean weighted KL: `0.101998`
  - note: first promoted exploration-based full local winner
- `smh_resid_z12_h0_covbase_locgate_v001` full 8-round exploration line
  - artifact: `data/artifacts/benchmarks/agent2_full_smh_resid_locgate_8rounds_exploration_20260321/`
  - mean score: `74.4053`
  - mean weighted KL: `0.101981`
  - note: current best full local round-held-out result in this checkout
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
- Current strongest observed effect:
  - `exploration_v2` mainly wins by rescuing the hardest round `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
  - versus the old full coverage artifact, that round improved by `+9.3641` score and `-0.061395` weighted KL
  - several easier rounds regressed slightly, so the next model iteration should try to keep the hard-round gain while softening easy-round regressions
- Current model-iteration read:
  - localized teacher gating is only a tiny refinement on top of `query_residual_v7 + exploration_v2`
  - versus the promoted exploration baseline, `7/8` rounds are identical
  - only round `8e839974-b13b-407b-a5e7-fc749d877195` improves, by `+0.034415` score and `-0.000134219` weighted KL
