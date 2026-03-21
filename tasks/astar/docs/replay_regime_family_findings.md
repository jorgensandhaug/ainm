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
- On that same matched hard 3-round multi-seed benchmark, the first directly benchmarked semimechanistic hazard-posterior family is not yet competitive:
  - best hazard-only result found: `hazard_posterior_knn_k5 + exploration_v2`
  - mean score `56.6601`, weighted KL `0.206195`
  - bucket anchor on the same slice: `70.3257`, weighted KL `0.122435`
- Convex blending rescues most of the hazard-only failure but still does not add net value over bucket on that slice:
  - best tested blend: `hazard_posterior_blend_a25_k5 + exploration_v2`
  - mean score `70.2024`, weighted KL `0.122086`
  - still below bucket anchor by `-0.1233` score

## Strongly Supported Hypotheses

- Replay-backed residual correction materially helps over direct historical priors.
- Teacher-guided/query-conditioned residuals are more useful than the older latent-regime heuristic stack now in repo.
- Query policy matters materially for the replay-backed residual stack; regime-focused repeats beat plain coverage on the hard 3-round multi-seed probe.
- The current semimechanistic hazard family needs better teacher/posterior structure before it can beat a simple historical anchor.
- Calibration matters a lot for the semimechanistic family; blending with a conservative anchor sharply improves the worst held-out round.

## Rejected / Weak Hypotheses

- `latent_regime` as currently implemented is not competitive enough to anchor the family.
- Static or geometry-only priors are not close to the local frontier.
- The first benchmarked `hazard_posterior_knn_v1` family is strong enough, unblended, to beat current simple anchors.
- More hazard weight is currently better once the hazard family is blended with a conservative anchor.

## Open Questions

- Is the semimechanistic family currently limited more by the teacher/decoder or by regime posterior inference?
- Can richer permutation-invariant transcript summaries or a stronger transcript encoder make the hazard family additive over bucket?
- Can the round-specific failure on `ae78003a-4efe-425a-881a-d16a39bca0ad` be fixed by better round coefficients / regime factorization rather than by convex blending?
- Once the hazard family is actually additive over bucket on the hard 3-round slice, does `exploration` start to matter materially there too?
