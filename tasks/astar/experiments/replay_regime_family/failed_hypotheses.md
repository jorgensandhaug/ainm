# Failed Hypotheses

- `latent_regime` current implementation is strong enough to anchor live-style holdout eval.
  - Evidence: `tmp_latent_regime_online_baseline`
  - Result: mean score `10.6888`, mean weighted KL `0.86578`
  - Conclusion: do not spend current iteration budget here without a major redesign.
- First directly benchmarked semimechanistic `hazard_posterior_knn_v1` is already stronger than simple anchors.
  - Evidence: matched hard 3-round multi-seed probe
  - Best result: `hazard_posterior_knn_k5 + exploration_v2` => mean score `56.6601`, mean weighted KL `0.206195`
  - Anchor on same slice: `historical_bucket_prior + coverage` => mean score `70.3257`, mean weighted KL `0.122435`
  - Conclusion: do not spend more sweep budget on hazard-only v1 calibration/policy variants before improving the teacher/posterior itself.
