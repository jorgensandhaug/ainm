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

- experiment: `agent2_dev5_smh_coeffbank_hbblend50_path4_b20_coverage_20260321`
- model: `smh_coeffbank_z0_h0_covlike_hbblend50_v001`
- mode: `online_interactive`
- policy: `coverage`
- mean score: `64.7681`
- mean weighted KL: `0.161315`
- note: current best standalone `smh_*` dev line on score; first semimech family member to strongly beat both pure historical bucket and pure coeff-bank on the fixed 4-round held-out slice

## Current Best Standalone Semimech KL Line

- experiment: `agent2_dev5_smh_coeffbank_hbblend60_path4_b20_coverage_20260321`
- model: `smh_coeffbank_z0_h0_covlike_hbblend60_v001`
- mode: `online_interactive`
- policy: `coverage`
- mean score: `64.7502`
- mean weighted KL: `0.158263`
- note: slightly below `hbblend50` on score, best current standalone `smh_*` weighted KL on the fixed 4-round held-out slice

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
