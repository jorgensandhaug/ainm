# Failed Hypotheses

- `latent_regime` current implementation is strong enough to anchor live-style holdout eval.
  - Evidence: `tmp_latent_regime_online_baseline`
  - Result: mean score `10.6888`, mean weighted KL `0.86578`
  - Conclusion: do not spend current iteration budget here without a major redesign.
