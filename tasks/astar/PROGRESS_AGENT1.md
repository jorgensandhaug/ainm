## Agent1 Progress

### Session

- date: 2026-03-20 UTC
- branch: `agent1`
- repo root: `/home/jorge/agent1`
- task cwd: `/home/jorge/agent1/tasks/astar`
- base branch state before this session: `78d89f9`
- current pushed commit before real-model continuation: `230a12f`

### Mandatory Reads Completed

- `AGENTS.md`
- `README.md`
- `docs/game_facts.md`
- `instructions/agent1.md`

### Current Environment Facts

- actual tracked repo is the real Astar codebase
- `git rev-parse --show-toplevel` => `/home/jorge/agent1`
- `br` unavailable in shell
- bare `python` unavailable in shell path; `python3` and `uv run` work
- benchmark artifacts and replay/analysis data already exist locally

### Current Model / Eval State Found

- supported historical eval models in code:
  - `geometry_prior`
  - `historical_bucket_prior`
  - `latent_regime`
  - `query_residual`
- holdout protocol in `run_historical_benchmark` is leave-one-round-out over analyzed rounds
- online-interactive eval currently uses one transcript realization per held-out round via single `episode_seed`
- current best stored 8-round online-interactive result found:
  - benchmark: `dev_query_residual_online50_v7`
  - model: `query_residual`
  - policy: `coverage`
  - mean score: `73.9505`
  - mean weighted KL: `0.10633`
- baseline stored 8-round online-interactive `historical_bucket_prior` result:
  - mean score: `66.0226`
  - mean weighted KL: `0.14851`
- largest round gains of `query_residual_v7` vs bucket baseline:
  - `ae78003a-4efe-425a-881a-d16a39bca0ad`: `+28.276`
  - `36e581f1-73f8-453f-ab98-cbe3052b701b`: `+10.095`
  - `76909e29-f664-4b2f-b16b-61b7507277e9`: `+9.516`
- one round regression:
  - `8e839974-b13b-407b-a5e7-fc749d877195`: `-1.336`

### Key Inference

- strongest existing stack is already the replay-backed `query_residual` family, not the older bucket or latent-regime baselines
- biggest immediate gap vs handoff: eval still selects on single transcript seed; that is noisier than live expected performance
- biggest immediate modeling lever visible in current code: policy
  - handoff says regime ID > full coverage
  - code already has `exploration` policy
  - no stored benchmark using `exploration` found

### Action Log

1. read mandatory repo docs and full `instructions/agent1.md`
2. mapped repo root / task cwd / git branch / remote state
3. inspected benchmark and model-eval code paths
4. summarized stored benchmark results
5. identified current best local benchmark family: `query_residual`
6. identified likely next experiment axis: `coverage` vs `exploration`
7. identified validation weakness: single `episode_seed`
8. added central family docs:
   - `docs/replay_regime_family_findings.md`
   - `experiments/replay_regime_family/registry.csv`
   - `experiments/replay_regime_family/notes.md`
   - `experiments/replay_regime_family/best_models.md`
   - `experiments/replay_regime_family/failed_hypotheses.md`
   - `experiments/replay_regime_family/next_steps.md`
9. implemented multi-episode-seed support for historical online benchmarks
10. added focused test coverage for the new multi-episode path
11. compile check passed for changed Python files
12. direct `pytest` invocation was unavailable in the base env; verified via `uv run --with pytest python -m pytest tests/test_historical_benchmark.py -q`
13. targeted historical benchmark tests passed: `5 passed in 4.66s`
14. launched `query_residual` + `exploration` 3-round probe on the challenging round set used by stored `tmp_query_residual_probe_3rounds_v7`
15. removed mistaken `family1_dummy/` tracked artifacts introduced during early repo-root confusion
16. finished `query_residual` `exploration` single-seed probe on the matched 3-round set
17. result vs stored `coverage` on same rounds:
   - aggregate score delta: `+0.0319`
   - aggregate weighted-KL delta: `-0.000046`
   - round deltas:
     - `8e839974-b13b-407b-a5e7-fc749d877195`: `-0.8767`
     - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`: `+0.2242`
     - `ae78003a-4efe-425a-881a-d16a39bca0ad`: `+0.7482`
18. confirmed new multi-seed benchmark path on real data:
   - command: `uv run astar run-historical-benchmark --model historical_bucket_prior --mode online_interactive --policy coverage --budget 4 --episode-seed 0 --episode-seed-count 2 --with-png none --name smoke_bucket_multi_episode_2rounds_seed0to1 ...`
   - result: success
   - reported `episode_seeds: 0,1`
   - reported `evaluated_seeds: 20`
19. launched `query_residual` `coverage` 3-round multi-seed probe (`episode_seed_count=2`) to get lower-noise policy comparison
20. discovered and fixed stale synthetic-dataset cache reuse:
   - legacy `synthetic_live_coverage_v1/index.parquet` can point at absolute episode paths from a different checkout
   - `_load_synthetic_dataset_ref()` now rejects stale episode paths and triggers rebuild in current worktree
21. optimized multi-seed historical benchmark runtime:
   - historical online benchmarks now reuse one trained predictor per held-out round across transcript seeds
   - avoids pointless refits for each `episode_seed`
22. validated stale-cache fix with targeted regression test
23. completed matched 3-round multi-seed policy comparison:
   - `coverage`, seeds `0,1`: mean score `71.7303`, weighted KL `0.111276`
   - `exploration`, seeds `0,1`: mean score `73.2181`, weighted KL `0.104341`
   - aggregate delta: `+1.4878` score, `-0.006935` weighted KL in favor of `exploration`
   - round deltas:
     - `8e839974-b13b-407b-a5e7-fc749d877195`: `+1.4616`
     - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`: `+0.7303`
     - `ae78003a-4efe-425a-881a-d16a39bca0ad`: `+2.2714`
24. promoted `query_residual` + `exploration` to full 8-round benchmark `dev_query_residual_exploration_online50_v1` (running)
25. fixed benchmark timing accounting after predictor reuse so `evaluation_seconds` includes predictor-fit time again
26. reran focused tests after stale-cache + timing fixes: `6 passed in 5.78s`

### Working Hypotheses

- H1: `query_residual` + `exploration` policy should beat `query_residual` + `coverage` on online-interactive holdout because the predictor is regime-sensitive and exploration adds targeted repeats
- H2: multi-seed historical online eval will be a better model-selection signal than single-seed eval because live querying is stochastic
- H1 status update: supported
  - weak on single-seed (`+0.0319`)
  - strong on matched multi-seed (`+1.4878`)

### Planned Next Steps

1. finish in-flight `query_residual` `exploration` probe
2. compare against stored `coverage` result on matched rounds
3. run a smoke benchmark using new `--episode-seed-count` support
4. if exploration wins, promote to broader benchmark with unique run name

### Push Log

- pushed `230a12f` to `origin/agent1`
