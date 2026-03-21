## Agent1 Progress

### Session Continuation

- date: 2026-03-21 UTC
- resumed commit: `cbc6262`
- branch: `agent1`
- remote tracking: `origin/agent1`
- live machine snapshot before new work:
  - load avg: `120.12 / 102.48 / 73.92`
  - mem used: `1.2 TiB`
  - mem free: `1.7 TiB`
- other-agent activity confirmed:
  - many large agent5 hybrid sweeps active
  - agent4 already using `run-historical-benchmark --jobs 3`
  - agent7/agent2 also running live historical probes
- own active runs on resume:
  - `dev_hazard_v2_k5_r3_coverage_online50_v1`
  - `dev_hazard_v2_k5_r3_exploration_online50_v1`
- new objective:
  - add native `--jobs` support to historical benchmark on this branch
  - validate it
  - then relaunch heavier v2 exploration using controlled parallelism rather than extra top-level shells
- implementation/result:
  - added true round-parallel historical benchmark execution with `ProcessPoolExecutor`
  - exposed `jobs` through CLI, result artifacts, rendered reports, and catalog payloads
  - added focused regression coverage for `jobs=2`
  - initial fork-based pool passed but emitted multiprocessing deadlock warning in multithreaded parent
  - changed pool start method to `spawn`; warning cleared
  - validation:
    - `python3 -m compileall src/astar/workflows/historical_benchmark.py src/astar/cli.py src/astar/eval/reports.py tests/test_historical_benchmark.py`
    - `uv run --with pytest python -m pytest tests/test_historical_benchmark.py -q`
    - result: `11 passed in 32.01s`
- live machine snapshot after validation:
  - load avg: `96.01 / 96.21 / 77.93`
  - mem used: `979 GiB`
  - mem free: `1.9 TiB`
- current status after validation:
  - old full raw-v2 promotions still running and still have no `report.md`
  - next model step chosen from handoff: move beyond summary-space kNN into a learned student posterior / small-teacher continuation

### Session Continuation

- date: 2026-03-21 UTC
- resumed commit: `43c3671`
- branch: `agent1`
- remote tracking: `origin/agent1`
- worktree state at resume: clean
- `br` check at resume: unavailable (`command not found`)
- immediate objective: finish the first full 8-round `query_residual` + `exploration` benchmark on the repaired multi-seed-capable benchmark stack, then decide whether to expand validation or pivot
- note: no `dev_query_residual_exploration_online50_v1` artifact exists yet; prior promotion was interrupted before completion

### Pivot

- user overrode the previous “improve strongest implemented baseline first” direction
- new instruction priority: stop treating `query_residual` as mainline; push directly into the handoff’s new replay-regime family
- concrete pivot target:
  - take the existing hazard-teacher + posterior-student components that already exist in-tree
  - make them holdout-safe and benchmarkable in `online_interactive`
  - then run multiple parallel probes on that new family instead of spending more time polishing `query_residual`
- implementation gap identified at pivot:
  - `latent_regime` historical/online eval still routes to the older heuristic predictor
  - the actual hazard-teacher + summary-bank student stack is trained/tested in isolation but not wired into benchmark model selection

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
27. pivoted from `query_residual`-first exploration to direct replay-regime-family development after user override
28. identified that the hazard-teacher + summary-bank posterior stack already existed but was not wired into historical online benchmarking
29. implemented a new holdout-safe online model family:
   - new predictor: `hazard_posterior_knn`
   - trains `HazardTeacher` on training rounds only
   - builds / reuses round-scoped synthetic live datasets for those training rounds only
   - fits `SummaryBankStudent` on those synthetic episodes
   - exposes config-specific model names such as `hazard_posterior_knn_v1__policy=...__samples=...__k=...`
30. added parallel-experiment-friendly CLI model aliases:
   - `hazard_posterior_knn`
   - `hazard_posterior_knn_k1`
   - `hazard_posterior_knn_k3`
   - `hazard_posterior_knn_k5`
   - `hazard_posterior_knn_k9`
31. updated historical benchmark metadata plumbing so the new synthetic-live-backed model family records `samples_per_round`
32. added focused historical benchmark smoke coverage for the new family
33. reran focused historical benchmark suite after the new model wiring: `7 passed in 7.28s`
34. attempted the first 8-way parallel real-data probe sweep on the new family
35. discovered an infra bottleneck that blocked parallel experimentation:
   - multiple jobs building/materializing datasets collided on `data/catalog.duckdb`
   - failure mode was DuckDB file-lock contention during auxiliary `CatalogDB.log_event(...)`
36. changed catalog logging to be best-effort under lock contention so telemetry cannot kill the main workload
37. reran focused historical benchmark suite after the catalog concurrency fix: `7 passed in 8.14s`
38. restarted the parallel hazard-posterior probe sweep after cache creation + catalog fix
39. completed the first real hazard-posterior grid on the matched hard 3-round, 2-episode-seed probe:
   - `k1 + exploration`: `51.8630`, KL `0.231672`
   - `k3 + coverage`: `55.6897`, KL `0.210982`
   - `k5 + coverage`: `56.5785`, KL `0.206602`
   - `k5 + exploration`: `56.6601`, KL `0.206195`
   - `k9 + coverage`: `56.5785`, KL `0.206602`
40. key finding from the first hazard-only sweep:
   - new semimechanistic family is real but currently far behind `query_residual` on this benchmark slice
   - failure is dominated by held-out round `ae78003a-4efe-425a-881a-d16a39bca0ad` (`35.9` mean score vs `73.6` for query-residual exploration on the same slice)
   - coverage vs exploration only weakly matters at this stage; decoder/calibration dominates
41. moved immediately to the handoff’s calibration/ensemble step instead of sweeping more hazard-only variants
42. implemented `hazard_posterior_blend` family:
   - blends the new hazard posterior predictor with `HistoricalBucketPriorPredictor`
   - config encoded in the resolved model name, including `k` and hazard weight `a`
   - initial CLI aliases added: `hazard_posterior_blend_a25_k5`, `hazard_posterior_blend_a35_k5`, `hazard_posterior_blend_a50_k5`
43. added focused historical benchmark smoke coverage for the blend family
44. reran focused historical benchmark suite after adding the blend family: `8 passed in 10.44s`
45. measured the actual bucket anchor on the same matched hard 3-round, 2-episode-seed slice:
   - `historical_bucket_prior + coverage`: `70.3257`, KL `0.122435`
46. completed the first blend sweep on the same slice with `policy=exploration`, `samples_per_round=2`, `k=5`:
   - `a=0.25`: `70.2024`, KL `0.122086`
   - `a=0.35`: `69.5894`, KL `0.124981`
   - `a=0.50`: `68.1605`, KL `0.132057`
47. key blend conclusion:
   - calibration/ensemble dramatically rescues the catastrophic `ae780...` failure compared with hazard-only
   - but even the best blend (`a=0.25`) still does **not** beat the bucket anchor on aggregate (`70.2024 < 70.3257`)
   - therefore current hazard component is still net-negative on this slice; the next gain must come from improving the semimechanistic teacher/posterior itself, not from more convex blending of the same v1 hazard model
48. re-read handoff + repo docs after user correction and re-anchored to the actual replay-regime family rather than `query_residual`
49. parallel code inspection from explorer agents confirmed:
    - raw replay frames already expose enough state for richer transition/event summaries
    - v1 bottleneck is structural: 3-head decoder + tiny lossy kNN summary
50. implemented v2 dataset plumbing:
    - `SyntheticEpisodeArtifact` now carries `map_width` / `map_height`
    - synthetic-live dataset builder can now store externally supplied regime vectors rather than only the old summary-vector labels
51. implemented `src/astar/history/summaries/round_coefficients_v2.py`
    - richer interacted static feature bank
    - replay-derived transition summary augmentation
    - score-weighted per-round multiclass terminal coefficient fitting against dynamic classes vs empty baseline
52. implemented `src/astar/teacher/dynamics/hazard_teacher_v2.py`
    - fits per-round coefficient rows
    - factorizes them with low-rank SVD manifold
    - decodes latent coordinates directly into final tensors
53. implemented a stronger transcript-set student in `src/astar/student/posterior/deepset_student.py`
    - observation-level set features
    - coverage moments
    - repeat-window variance
    - owner concentration and settlement-mark summaries
    - normalized kNN in transcript-feature space
54. implemented new predictor family in `src/astar/student/predictor/hazard_posterior_v2.py`
    - `hazard_posterior_v2`
    - `hazard_posterior_v2_blend`
55. wired new family through:
    - `interactive.py`
    - `historical_benchmark.py`
    - `cli.py`
56. added focused v2 historical benchmark smoke tests
57. fixed two v2 plumbing bugs found by test:
    - strict zip on frame transitions
    - one-element-short zero-observation transcript vector
58. reran focused benchmark suite after fixes:
    - `uv run --with pytest python -m pytest tests/test_historical_benchmark.py -q`
    - result: `10 passed in 18.32s`
59. checked machine-wide capacity before scaling parallelism:
    - memory available: ~`2.9 TiB`
    - cores: `384`
    - load near idle
    - no competing benchmark jobs found
60. launched the first hard-slice real-data v2 benchmark:
    - `hazard_posterior_v2_k5_r3`
    - policy `coverage`
    - matched hard 3-round multi-seed slice
    - currently still running while this log entry is written
61. inspected whole-machine activity before increasing sweep width:
    - other agents are active on the box
    - visible benchmark jobs included agent4 `gbx_transition_teacher_*` prior-only runs and agent2 `smh_coeffbank_*` online runs
    - despite that, system load and RAM headroom remained extremely loose
62. widened the live v2 sweep after the health check:
    - added `hazard_posterior_v2_k5_r3` with `policy=exploration`
    - added `hazard_posterior_v2_blend_a20_k5_r3` with `policy=exploration`
63. re-checked machine health after other agents scaled up:
    - load average rose to about `57`
    - memory in use rose to about `836 GiB`
    - free memory still about `2.1 TiB`
    - decision: keep current sweep width, no need to throttle existing jobs, but stop adding more until first results land
64. first completed real-data v2 result:
    - benchmark: `probe_hazard_v2_k5_r3_coverage_3rounds_seed0to1`
    - model: `hazard_posterior_v2_k5_r3`
    - policy: `coverage`
    - mean score: `74.2658`
    - weighted KL: `0.103147`
    - runtime: `974.458s`
65. first major v2 benchmark conclusion:
    - this beats prior hard-slice best `query_residual + exploration` (`73.2181`, KL `0.104341`)
    - this also beats the bucket anchor and every prior hazard-v1 result on the same slice
    - so the new regime-manifold / multiclass terminal decoder path is now a real improvement, not just architectural churn
66. additional matched hard-slice v2 results:
    - `hazard_posterior_v2_k5_r3 + exploration`: `74.1259`, KL `0.103718`
    - `hazard_posterior_v2_k9_r4 + exploration`: `74.1259`, KL `0.103718`
    - `hazard_posterior_v2_blend_a20_k5_r3 + exploration`: `71.0375`, KL `0.118206`
    - `hazard_posterior_v2_blend_a35_k5_r3 + exploration`: `71.3270`, KL `0.116462`
67. v2 sweep interpretation after those additional results:
    - raw v2 stays best
    - on this slice, `coverage` beats `exploration` by about `+0.1399` score and `-0.000571` KL
    - increasing to `k9/r4` did not improve over `k5/r3`
    - blending the strong raw v2 model back toward bucket is net-negative
68. promotion decision:
    - keep full 8-round raw promotions running:
      - `dev_hazard_v2_k5_r3_coverage_online50_v1`
      - `dev_hazard_v2_k5_r3_exploration_online50_v1`
    - kill full 8-round blend promotion because the matched hard-slice evidence says it is a waste of compute

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
- pushed `37f9cac` to `origin/agent1`

### 2026-03-21 Continuation: Hazard v2 Pivot

- user correction accepted:
  - stop treating `query_residual` as the path
  - stop spending budget on hazard-v1 blend polishing
  - implement the actual replay-regime handoff more directly
  - use parallel exploration aggressively
- re-read:
  - `instructions/agent1.md`
  - local `README.md`
  - local `docs/game_facts.md`
- repo-note:
  - AGENTS first-read paths pointed at `/home/jorge/repos/ainm/...`
  - those paths do not exist in this checkout
  - used local repo copies instead

### v1 Postmortem

- hazard-v1 failure is structural, not tuning:
  - teacher only decodes 3 static heads: build / port / ruin
  - teacher latent target is ad hoc 12d replay summary, not a direct coefficient manifold
  - student is not a real set encoder; it is kNN on counts + class freqs + four means
- subagent findings confirmed raw replay frames already support richer transition heads:
  - collapse `{1,2}->{3}`
  - rebuild `3->{1,2}`
  - reclaim `3->4`
  - owner flips
  - year-to-year population / food / wealth / defense deltas
  - shared alive / port / ruin curves

### v2 Implementation Decision

- new mainline family to implement now:
  - score-weighted semimechanistic terminal decoder with richer static/interacted features
  - per-round coefficient fitting over dynamic terminal classes vs empty baseline
  - low-rank SVD manifold over fitted round coefficient vectors
  - synthetic-live episodes labeled by round manifold coordinates, not by v1 summary vector
  - transcript-set student with observation-level set features, pooled coverage stats, repeat-window stats, owner concentration, and settlement-mark summaries
- rationale:
  - direct coefficient manifold is a better latent target than the v1 replay summary
  - multiclass terminal decoder fixes the biggest teacher bottleneck
  - normalized set-summary kNN is a more faithful first student than the prior tiny summary vector

### Immediate Work In Flight

1. add `round_coefficients_v2.py`
2. add `hazard_teacher_v2.py`
3. extend synthetic-live artifacts to carry map size and externally supplied regime vectors
4. add v2 transcript-set student
5. wire new predictor family + benchmark/CLI registration
6. run focused tests
7. launch parallel historical probes on the hard 3-round multi-seed slice
