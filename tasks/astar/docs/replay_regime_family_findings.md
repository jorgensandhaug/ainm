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
- The new v2 regime-manifold / multiclass terminal decoder family is competitive on the same matched hard 3-round multi-seed benchmark:
  - `hazard_posterior_v2_k5_r3 + coverage`
  - mean score `74.2658`, weighted KL `0.103147`
  - delta vs prior hard-slice best `query_residual + exploration_v2`: `+1.0477` score, `-0.001194` weighted KL
  - round means:
    - `8e839974-b13b-407b-a5e7-fc749d877195`: `80.5274`
    - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`: `82.6298`
    - `ae78003a-4efe-425a-881a-d16a39bca0ad`: `59.6401`
- Additional v2 matched hard-slice results clarify the sweep:
  - `hazard_posterior_v2_k5_r3 + exploration_v2`: `74.1259`, weighted KL `0.103718`
  - `hazard_posterior_v2_k9_r4 + exploration_v2`: identical to `k5_r3 + exploration_v2`
  - `hazard_posterior_v2_blend_a20_k5_r3 + exploration_v2`: `71.0375`, weighted KL `0.118206`
  - `hazard_posterior_v2_blend_a35_k5_r3 + exploration_v2`: `71.3270`, weighted KL `0.116462`
  - implication: raw v2 is best; blending back toward bucket now hurts

## Strongly Supported Hypotheses

- Replay-backed residual correction materially helps over direct historical priors.
- Teacher-guided/query-conditioned residuals are more useful than the older latent-regime heuristic stack now in repo.
- Query policy matters materially for the replay-backed residual stack; regime-focused repeats beat plain coverage on the hard 3-round multi-seed probe.
- The semimechanistic family was bottlenecked by v1 structure, not by the family idea itself.
- Direct coefficient-manifold supervision plus a stronger multiclass terminal decoder can beat both bucket and `query_residual` on held-out local rounds.
- The new v2 family is not helped by blending with the conservative bucket anchor on the matched hard slice.
- For the new v2 family, broad `coverage` is at least slightly better than `exploration_v2` on the current hard slice.

## Rejected / Weak Hypotheses

- `latent_regime` as currently implemented is not competitive enough to anchor the family.
- Static or geometry-only priors are not close to the local frontier.
- The first benchmarked `hazard_posterior_knn_v1` family is strong enough, unblended, to beat current simple anchors.
- More hazard weight is currently better once the hazard family is blended with a conservative anchor.
- The semimechanistic family should be deprioritized because v1 hazard benchmarks were too weak.
  - Evidence: `hazard_posterior_v2_k5_r3 + coverage` now beats the prior hard-slice frontier.
  - Conclusion: keep pushing v2/v3 decoder/posterior improvements.
- Conservative bucket blending should remain the default safety move for the new v2 family.
  - Evidence: both tested v2 blends are materially below the raw v2 model on the same slice.
  - Conclusion: do not spend more immediate budget on v2 blend sweeps unless a later full-round result contradicts this.

## Open Questions

- Does the v2 hard-slice win survive full 8-round multi-seed evaluation?
- Can the round-specific weakness on `ae78003a-4efe-425a-881a-d16a39bca0ad` be reduced further without giving back the strong wins on the other two hard rounds?
- Are the largest remaining v2 errors mainly decoder calibration / forest recall, or mainly posterior/regime inference?
- Does full 8-round validation keep `coverage` ahead of `exploration`, or is the hard-slice policy ordering unstable out of sample?
