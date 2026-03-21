# Replay Regime Family Notes

## Current Frontier

- Best stored local artifact: `dev_query_residual_online50_v7`
- Working model family: replay-backed `query_residual`
- Validation weakness was single `episode_seed`; branch now supports `--episode-seed-count`
- New direct semimechanistic family is now benchmarkable:
  - `hazard_posterior_knn_*`
  - `hazard_posterior_blend_a*_k5`

## New Findings

- `query_residual` + `exploration_v2` beats `query_residual` + `coverage` on the hard 3-round multi-seed probe:
  - coverage: `71.7303`
  - exploration: `73.2181`
  - delta: `+1.4878`
- Stale legacy synthetic-live parquet indexes can silently point to another checkout; this branch now rebuilds them automatically.
- The first direct semimechanistic hazard family is not yet additive over a simple bucket prior.
  - best hazard-only: `56.6601`
  - bucket anchor on same slice: `70.3257`
- Conservative blending largely fixes the catastrophic held-out round failure:
  - best tested blend: `a=0.25`, `k=5`, `exploration`
  - result: `70.2024`
  - still slightly behind bucket, so the hazard component itself still needs work

## Immediate Rationale

- Stop spending sweep budget on hazard-only v1 policy/k variants.
- Improve the semimechanistic teacher/posterior itself before more full benchmark promotions.
- Keep unique names once new materially distinct model configs appear.
