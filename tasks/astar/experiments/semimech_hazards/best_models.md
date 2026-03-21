# Best Models

## Current Best

- experiment: `agent2_full_query_residual_v9_v10_builtfreqgatexwide_8rounds_exploration_20260321`
- model: `query_residual_v9_v10_builtfreqgatexwide_v001`
- mode: `online_interactive`
- policy: `exploration_v2`
- mean score: `74.6943`
- mean weighted KL: `0.100390`
- note: best current full local round-held-out result in this checkout

## Current Best Standalone Semimech Line

- experiment: `agent2_full_smh_coeffbank_hbblend50_exactobs_8rounds_coverage_20260321`
- model: `smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_v001`
- mode: `online_interactive`
- policy: `coverage`
- mean score: `72.4834`
- mean weighted KL: `0.110286`
- note: current best standalone `smh_*` full round-held-out result; exact local observation conditioning is the key student-side gain so far

## Current Best Standalone Semimech KL Line

- experiment: `agent2_full_smh_coeffbank_hbblend50_exactobs_8rounds_coverage_20260321`
- model: `smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_v001`
- mode: `online_interactive`
- policy: `coverage`
- mean score: `72.4834`
- mean weighted KL: `0.110286`
- note: also the current best standalone `smh_*` weighted KL on full round-held-out evaluation

## Previous Reference Line

- Best pre-existing semimechanistic-ish artifact in repo:
  - experiment: `dev_query_residual_online50_v7`
  - model: `query_residual_v7`
  - mode: `online_interactive`
  - policy: `coverage`
  - mean score: `73.9505`
  - mean weighted KL: `0.106326`

## Current Session Baseline

- experiment: `agent2_baseline_historical_bucket_prior_20260320`
- model: `historical_bucket_prior_v1`
- mode: `prior_only`
- mean score: `66.0233`
- mean weighted KL: `0.148488`
