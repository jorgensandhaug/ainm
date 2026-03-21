# Replay Regime Family Findings

## Verified Facts

- Historical benchmark holdout protocol is leave-one-round-out over analyzed rounds.
- Online-interactive historical eval can now aggregate over multiple transcript seeds per held-out round via `--episode-seed-count`.
- Stored 8-round online-interactive best artifact found so far is `query_residual` / `query_residual_v7` with coverage:
  - benchmark: `dev_query_residual_online50_v7`
  - mean score: `73.9505`
  - mean weighted KL: `0.10633`
- Stored 8-round online-interactive `historical_bucket_prior` baseline:
  - benchmark: `dev_historical_bucket_online50`
  - mean score: `66.0226`
  - mean weighted KL: `0.14851`
- `latent_regime` performs badly in stored 8-round online-interactive eval:
  - benchmark: `tmp_latent_regime_online_baseline`
  - mean score: `10.6888`
  - mean weighted KL: `0.86578`
- `query_residual_v7` improves 7/8 stored held-out rounds vs `historical_bucket_prior`; one regression remains:
  - regression round: `8e839974-b13b-407b-a5e7-fc749d877195`
  - delta vs bucket baseline: `-1.336`
- `query_residual` synthetic-live cache reuse had a reproducibility bug:
  - legacy cached indexes could contain absolute episode paths from another checkout
  - current branch now rebuilds stale caches automatically
- On the matched hard 3-round multi-seed benchmark (`episode_seeds=[0,1]`), `query_residual` + `exploration_v2` beats `query_residual` + `coverage`:
  - coverage: mean score `71.7303`, weighted KL `0.111276`
  - exploration: mean score `73.2181`, weighted KL `0.104341`
  - delta: `+1.4878` score, `-0.006935` weighted KL

## Strongly Supported Hypotheses

- Replay-backed residual correction materially helps over direct historical priors.
- Teacher-guided/query-conditioned residuals are more useful than the older latent-regime heuristic stack now in repo.
- Query policy matters materially for the replay-backed residual stack; regime-focused repeats beat plain coverage on the hard 3-round multi-seed probe.

## Rejected / Weak Hypotheses

- `latent_regime` as currently implemented is not competitive enough to anchor the family.
- Static or geometry-only priors are not close to the local frontier.

## Open Questions

- Does `exploration` beat `coverage` for `query_residual` once cached/trained on the same policy?
- How much of current 8-round ranking changes when using multi-seed validation instead of single-seed only?
- Can multi-transcript historical validation change model-selection decisions materially?
- Can the round-specific regression on `8e839974-b13b-407b-a5e7-fc749d877195` be traced to policy/query mismatch, teacher misspecification, or calibration?
