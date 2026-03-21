# Best Models

## Current Best

- experiment: `agent2_full_query_residual_v9_v10_blend025_8rounds_exploration_20260321`
- model: `query_residual_v9_v10_blend025_v001`
- mode: `online_interactive`
- policy: `exploration_v2`
- mean score: `74.5110`
- mean weighted KL: `0.101290`
- note: best current full local round-held-out result in this checkout

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
