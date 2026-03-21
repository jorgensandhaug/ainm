# Best Models

## Current Best

- experiment: `agent2_full_smh_glmmlatent_z2_8rounds_exploration_20260322`
- model: `smh_glmmlatent_z2_h0_covbase_calnone_v001`
- mode: `online_interactive`
- policy: `exploration_v2`
- mean score: `78.3805`
- mean weighted KL: `0.086960`
- note: best current full local round-held-out result in this checkout; tiny round-manifold semh teacher decisively beats the old residual line

## Current Best Standalone Semimech Line

- experiment: `agent2_full_smh_glmmlatent_z2_8rounds_exploration_20260322`
- model: `smh_glmmlatent_z2_h0_covbase_calnone_v001`
- mode: `online_interactive`
- policy: `exploration_v2`
- mean score: `78.3805`
- mean weighted KL: `0.086960`
- note: current best standalone `smh_*` full round-held-out result; low-rank round manifold is the decisive teacher-side gain

## Current Best Standalone Semimech KL Line

- experiment: `agent2_full_smh_glmmlatent_z2_8rounds_exploration_20260322`
- model: `smh_glmmlatent_z2_h0_covbase_calnone_v001`
- mode: `online_interactive`
- policy: `exploration_v2`
- mean score: `78.3805`
- mean weighted KL: `0.086960`
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
