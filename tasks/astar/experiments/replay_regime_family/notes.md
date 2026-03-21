# Replay Regime Family Notes

## Current Frontier

- Best stored local artifact: `dev_query_residual_online50_v7`
- Working model family: replay-backed `query_residual`
- Biggest untested axis visible in current code: `coverage` vs `exploration` policy
- Validation weakness was single `episode_seed`; branch now supports `--episode-seed-count`

## New Findings

- `query_residual` + `exploration_v2` beats `query_residual` + `coverage` on the hard 3-round multi-seed probe:
  - coverage: `71.7303`
  - exploration: `73.2181`
  - delta: `+1.4878`
- Stale legacy synthetic-live parquet indexes can silently point to another checkout; this branch now rebuilds them automatically.

## Immediate Rationale

- Do not restart from weak baselines.
- Push on query policy and validation first.
- Keep unique names once new materially distinct model configs appear.
