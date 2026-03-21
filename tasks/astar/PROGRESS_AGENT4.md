# PROGRESS_AGENT4

## Mission

Max local test/benchmark score for agent4 family work, following `instructions/agent4.md`.

Primary constraints:
- obey `README.md` + `docs/game_facts.md`
- keep validation correct or stronger, never weaker
- log all meaningful work here
- commit + push branch progress to remote

## Start State

- Date: `2026-03-20 UTC`
- Worktree: `/home/jorge/agent4/tasks/astar`
- Git branch: `agent4`
- Git status at start: clean
- `br list`: blocked, `br` not found in shell

## Canon Read

- `README.md`: read
- `docs/game_facts.md`: read
- `instructions/agent4.md`: read full
- `AGENTS.md`: read

## Current Repo Facts

- Existing offline stack already includes:
  - replay ingest / summarize
  - transition + terminal datasets
  - hazard teacher
  - summary-bank student
  - manifold factorization
  - synthetic benchmark / tournament workflows
- Existing live-exposed predictors:
  - `geometry_prior`
  - `historical_bucket_prior`
  - `latent_regime`
- Existing benchmark artifacts show newer work around `query_residual`
- Historical data/artifacts already present for multiple rounds/seeds

## Agent4 Interpretation

Handoff says:
- first trust replay/event pipeline
- answer low-rank round-manifold question early
- improve strong baseline stack in structured order
- log every experiment

Given current repo state, priority is not greenfield pipeline build. Priority is:
1. audit current replay/event/manifold/teacher/student/query-residual path
2. find strongest existing local benchmark baseline
3. identify weakest scientifically unjustified piece or biggest score bottleneck
4. improve model and/or validation without degrading correctness
5. benchmark on local held-out rounds

## Work Log

### 2026-03-20T00:00Z

- Read required docs.
- Verified branch clean.
- Verified remote `origin` exists.
- Checked repo layout and artifact inventory.
- Found no existing `PROGRESS_AGENT4.md`.
- Found `br` command unavailable.

### 2026-03-20T00:01Z

- Noted likely current research frontier in this branch is not raw replay extraction; repo already has:
  - `teacher_transition_v1`
  - `teacher_terminal_v1`
  - `hazard_teacher_v1`
  - `summary_bank_student_v1`
  - `round_regime_manifold_v1`
  - multiple `query_residual` benchmark runs
- Next: inspect benchmark reports + model code to pick exact improvement target.

### 2026-03-20T00:02Z

- Read current frontier code:
  - `src/astar/student/predictor/query_residual.py`
  - `src/astar/student/predictor/interactive.py`
  - `src/astar/workflows/historical_benchmark.py`
  - `src/astar/workflows/model_eval.py`
  - `src/astar/teacher/dynamics/hazard_teacher.py`
  - `src/astar/history/summaries/round_coefficients.py`
  - `src/astar/history/summaries/manifold.py`
- Confirmed best recorded local benchmark in artifacts:
  - `dev_query_residual_online50_v7`
  - mean score `73.9505`
  - mean weighted KL `0.106326`
- Main weak rounds in that report:
  - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`: `46.41`
  - `36e581f1-73f8-453f-ab98-cbe3052b701b`: `63.96`
  - `c5cdf100-a876-4fb7-b5d8-757162c97989`: `71.13`

### 2026-03-20T00:03Z

- Found scientific mismatch vs handoff:
  - handoff says choose tiny regime manifold early using held-out utility
  - current manifold code uses fixed `max_rank` SVD only
  - current teacher maps 12D regime summary directly to coefficients
  - current `query_residual` predicts 12D regime summary directly
- Existing artifact `round_regime_manifold_v1` says first 3 coefficient PCs explain:
  - `0.536`
  - `0.382`
  - `0.065`
- Existing teacher science artifact is weak / stale:
  - terminal L1 `0.136`
  - alive-curve MAE `28.02`
  - coefficient L2 `27.33`

### 2026-03-20T00:05Z

- Ran local coefficient-space low-rank probe across replay-backed rounds.
- Results:
  - 9 replay-backed rounds found
  - coefficient matrix shape: `(9, 51)`
  - regime-summary matrix shape: `(9, 12)`
  - coefficient explained variance:
    - PC1 `0.6671`
    - PC2 `0.2409`
    - PC3 `0.0414`
    - rest small
  - leave-one-round-out coefficient reconstruction MSE by rank:
    - rank 1: `0.7935`
    - rank 2: `0.7773`
    - rank 3: `0.7809`
    - rank 4: `0.7836`
    - rank 5: `0.7798`
    - rank 6: `0.7795`
  - direct regime->coefficient LOO MSE: `0.7794`
  - regime nearest-neighbor LOO MSE: `1.2263`
- Interpretation:
  - coefficient space is strongly low-rank
  - rank `2` is best on simple LOO metric
  - current fixed-rank / direct mapping leaves regularization value on table

## Next Edit

- Add LOO-selected manifold rank to `history/summaries/manifold.py`
- Regularize teacher coefficient decoding through that manifold
- Keep validation stricter, not weaker
- Then run tests + a smaller online historical benchmark probe vs current `query_residual_v7`

### 2026-03-20T00:06Z

- Implemented stronger manifold validation utilities in `src/astar/history/summaries/manifold.py`:
  - candidate ranks
  - LOO reconstruction score per rank
  - selected rank metadata
  - regime->coordinate ridge fit helper
- Also added dataset portability fix:
  - synthetic-live dataset now writes relative `episode_path`
  - resolution helper can relocate legacy absolute paths into current dataset dir
  - patched both `query_residual` and `SummaryBankStudent` to use the resolver
- Added test:
  - `test_synthetic_live_dataset_index_paths_are_portable`

### 2026-03-20T00:07Z

- Tried serving-path experiment:
  - regularize `HazardTeacher` through selected low-rank coefficient manifold
  - wire that into `query_residual`
- Result on same 3-round subset as existing artifact `tmp_query_residual_probe_3rounds_v7`:
  - new run `tmp_query_residual_probe_3rounds_manifold1`
  - mean score `72.6319`
  - old artifact `tmp_query_residual_probe_3rounds_v7`
  - mean score `73.1027`
- Conclusion:
  - manifold-regularized teacher **lost**
  - do not keep that as active serving path

### 2026-03-20T00:08Z

- Reverted serving default back to direct regime->coefficient teacher fit.
- Kept manifold machinery as optional analysis/research path only.
- Re-ran focused tests after revert:
  - `tests/test_history_datasets.py`
  - `tests/test_history_manifold.py`
  - `tests/test_teacher_student.py`
  - `tests/test_science_eval.py`
  - `tests/test_historical_benchmark.py`
  - all passing

### 2026-03-20T00:09Z

- Found larger validation bug in active `query_residual` path:
  - when `samples_per_round == 1`, code preferred legacy `synthetic_live_coverage_v1`
  - it did so even when requested training rounds were not fully covered
  - that can silently drop replay-backed rounds from transcript training
- Fixed:
  - `_load_synthetic_dataset_ref(..., required_round_ids=...)`
  - validates requested round coverage
  - validates episode paths resolve in current worktree
  - only reuses legacy dataset if both checks pass
  - otherwise forces scoped dataset rebuild

### 2026-03-20T00:10Z

- Re-ran same 3-round probe after portability/scope fixes:
  - `tmp_query_residual_probe_3rounds_portablefix`
  - mean score `72.6319`
- Interpretation:
  - no gain on the old 3-round subset
  - expected, because those 3 rounds were already present in the legacy dataset
  - real expected effect is on full 8-round benchmark, where legacy dataset omitted some rounds

### 2026-03-20T00:11Z

- Attempted full 8-round benchmark with new scope validation.
- Tool-run was interrupted by session/runtime limits before completion.
- Also attempted explicit build of scoped 8-round synthetic dataset:
  - partial files written
  - process ended before writing `index.parquet` / `summary.json`
- Current workaround:
  - launched full 8-round benchmark in background with log:
    - PID `1662523`
    - log `/tmp/agent4_dev_query_residual_scopefix1.log`
  - benchmark name:
    - `dev_query_residual_online50_scopefix1`

## Current Best Known Scores

- historical artifact baseline:
  - `dev_query_residual_online50_v7`
  - mean score `73.9505`
  - mean weighted KL `0.106326`
- rejected experiment:
  - `tmp_query_residual_probe_3rounds_manifold1`
  - mean score `72.6319`
- portability/scope-fix sanity probe:
  - `tmp_query_residual_probe_3rounds_portablefix`
  - mean score `72.6319`

## Current Goal

- Wait for `dev_query_residual_online50_scopefix1` to finish.
- If full 8-round score improves over `73.9505`, keep validation fixes + new dataset path contract and promote result.
- If not, retain validation fixes only and continue searching for score-positive changes.

### 2026-03-21T00:22Z

- Full benchmark completed:
  - `dev_query_residual_online50_scopefix1`
  - mean score `74.2553`
  - mean weighted KL `0.102772`
  - runtime `2222.3s`
- Previous best historical artifact:
  - `dev_query_residual_online50_v7`
  - mean score `73.9505`
  - mean weighted KL `0.106326`
- Net improvement:
  - score `+0.3048`
  - weighted KL `-0.003554`

### 2026-03-21T00:23Z

- Paired benchmark comparison vs old artifact:
  - mean score delta `+0.3048`
  - mean weighted KL delta `-0.003554`
  - win rate `0.375`
  - loss rate `0.625`
  - CI still wide because only `40` seeds
- Important interpretation:
  - improvement is concentrated, not uniform
  - expected because fix targets training-scope correctness, not generic calibration
- Strong signal:
  - round `36e581f1-73f8-453f-ab98-cbe3052b701b` improved on all 5 seeds
  - this round had been missing from legacy synthetic transcript coverage

## Current Best Known Scores

- active best on full 8-round dev benchmark:
  - `dev_query_residual_online50_scopefix1`
  - mean score `74.2553`
  - mean weighted KL `0.102772`
- previous best artifact:
  - `dev_query_residual_online50_v7`
  - mean score `73.9505`
  - mean weighted KL `0.106326`
- rejected experiment:
  - `tmp_query_residual_probe_3rounds_manifold1`
  - mean score `72.6319`
- portability/scope-fix sanity probe:
  - `tmp_query_residual_probe_3rounds_portablefix`
  - mean score `72.6319`

## Decision

- Keep:
  - synthetic dataset relative-path contract
  - cross-worktree path resolver
  - required-round coverage validation for query-residual synthetic data reuse
  - manifold validation utilities as offline analysis support
- Promote:
  - `query_residual_v8` checkpoint/model name for default live loading
  - reason: avoid silently reusing stale `query_residual_v7` checkpoints that were trained before the scope-validation fix
- Do not keep as active serving change:
  - low-rank manifold-regularized `HazardTeacher` default

### 2026-03-21T00:24Z

- Updated default live/checkpoint path from `query_residual_v7` to `query_residual_v8`.
- Re-ran targeted tests after version bump:
  - `tests/test_historical_benchmark.py`
  - `tests/test_history_datasets.py`
  - `tests/test_teacher_student.py`
  - all passing

### 2026-03-21T00:28Z

- Resumed work from pushed `query_residual_v8` baseline.
- Verified git status still clean on branch `agent4`.
- Re-checked handoff and benchmark artifacts before new experimentation.
- `br list` still blocked in this shell because `br` command is unavailable.
- Identified next low-risk/high-signal experiment:
  - test `query_residual` with `samples_per_round=2`
  - reason: path is already wired through CLI/workflows/checkpoint naming
  - expected effect: reduce transcript-training variance by exposing multiple stochastic transcripts per training round
  - first target is exact prior 3-round probe subset:
    - `8e839974-b13b-407b-a5e7-fc749d877195`
    - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
    - `ae78003a-4efe-425a-881a-d16a39bca0ad`
- Decision:
  - do not change validation contract for this probe
  - keep comparison apples-to-apples vs `tmp_query_residual_probe_3rounds_portablefix`

### 2026-03-21T00:45Z

- Completed exact matched 3-round probe for `query_residual` with `samples_per_round=2`:
  - run: `tmp_query_residual_probe_3rounds_samples2`
  - mean score `71.3184`
  - mean weighted KL `0.113224`
  - runtime `1012.5s`
- Compared against matched fixed baseline `tmp_query_residual_probe_3rounds_portablefix`:
  - score delta `-1.3135`
  - weighted KL delta `+0.006177`
  - win rate `0.267`
  - loss rate `0.733`
  - comparison artifact:
    - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seed=0__baseline=query_residual__candidate=query_residual__baseline_run=tmp_query_residual_probe_3rounds_portablefix__candidate_run=tmp_query_residual_probe_3rounds_samples2.md`
- Failure pattern:
  - modest regression on `8e839974-b13b-407b-a5e7-fc749d877195`
  - severe regression on `ae78003a-4efe-425a-881a-d16a39bca0ad` across all seeds
  - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b` stayed roughly flat
- Conclusion:
  - reject `samples_per_round=2` for active `query_residual`
  - more synthetic transcript samples add variance/overfit cost here, not robustness

### 2026-03-21T00:46Z

- Checked local sibling worktrees for nearby family evidence before choosing next branch:
  - agent7 full-dev reports:
    - `query_residual_v8`: `73.0354`
    - `query_residual_v9`: `73.4065`
    - both below current agent4 best `74.2553`
  - conclusion:
    - do not import manifold-variant `v8/v9` serving path ideas
- Checked local agent1 replay-family notes/artifacts:
  - `exploration_v2` policy already exists in this branch via `policy/registry.py`
  - matched 3-round single-seed probe in agent1:
    - mean score `73.1346`
    - slightly above old `coverage` probe `73.1027`
  - matched 3-round multi-episode probe in agent1:
    - mean score `73.2181`
    - strong positive delta vs `coverage` multi-seed baseline
- Updated next priority:
  - run `query_residual` with `policy=exploration` on the same 3-round subset in this branch
  - if positive enough, consider full 8-round benchmark
  - separately consider porting multi-episode historical benchmark support as a stronger validation method

### 2026-03-21T00:53Z

- Implemented stronger historical benchmark validation in this branch:
  - added `--episode-seed-count` support to `run-historical-benchmark`
  - benchmark can now average over multiple transcript seeds per held-out round
  - online historical benchmark now reuses one fitted predictor per held-out round across episode seeds
  - comparison/report/result plumbing now pairs by `(round_id, seed_index, episode_seed)`
- Reason:
  - single transcript seed is noisy for online-query model selection
  - multi-episode averaging is a more faithful proxy for live stochastic query rounds
  - predictor reuse keeps this stronger validation computationally practical
- Files touched for this validation upgrade:
  - `src/astar/workflows/historical_benchmark.py`
  - `src/astar/workflows/model_eval.py`
  - `src/astar/workflows/results.py`
  - `src/astar/workflows/compare_historical_benchmarks.py`
  - `src/astar/eval/reports.py`
  - `src/astar/cli_output.py`
  - `src/astar/cli.py`
  - `tests/test_historical_benchmark.py`
- Verification:
  - `uv run python -m py_compile ...` on changed files: passed
  - `uv run pytest tests/test_historical_benchmark.py`: `5 passed`
- In parallel:
  - launched same 3-round probe with `policy=exploration`
  - run name: `tmp_query_residual_probe_3rounds_exploration1`

### 2026-03-21T01:22Z

- Completed matched 3-round single-seed `exploration_v2` probe:
  - run: `tmp_query_residual_probe_3rounds_exploration1`
  - mean score `73.1346`
  - mean weighted KL `0.104737`
  - runtime `1038.3s`
- Manual paired comparison vs matched fixed `coverage` baseline `tmp_query_residual_probe_3rounds_portablefix`:
  - score delta `+0.5027`
  - weighted KL delta `-0.002310`
  - win rate `0.800`
  - loss rate `0.200`
  - by round:
    - `8e839974-b13b-407b-a5e7-fc749d877195`: `+0.6723`
    - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`: `+0.8208`
    - `ae78003a-4efe-425a-881a-d16a39bca0ad`: `+0.0149`
- Interpretation:
  - single-seed signal favors `exploration_v2`
  - but improvement is still small enough that stronger validation was necessary

### 2026-03-21T01:27Z

- Ran new stronger multi-episode historical benchmark on same 3-round subset with transcript seeds `0,1`:
  - coverage run: `tmp_query_residual_probe_3rounds_cov_seed01`
    - mean score `71.7303`
    - mean weighted KL `0.111276`
    - runtime `258.5s`
  - exploration run: `tmp_query_residual_probe_3rounds_expl_seed01`
    - mean score `73.2181`
    - mean weighted KL `0.104341`
    - runtime `254.5s`
- Manual paired comparison across `(round_id, seed_index, episode_seed)`:
  - score delta `+1.4878`
  - weighted KL delta `-0.006935`
  - win rate `1.000`
  - loss rate `0.000`
  - by round:
    - `8e839974-b13b-407b-a5e7-fc749d877195`: `+1.4616`
    - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`: `+0.7303`
    - `ae78003a-4efe-425a-881a-d16a39bca0ad`: `+2.2714`
- Conclusion:
  - stronger validation materially supports `exploration_v2`
  - next step is justified:
    - launch full 8-round dev benchmark with `policy=exploration`

### 2026-03-21T01:54Z

- Completed full 8-round dev benchmark with `query_residual` + `exploration_v2`:
  - run: `dev_query_residual_exploration_scopefix1`
  - mean score `74.4011`
  - mean weighted KL `0.101998`
  - runtime `1597.9s`
- Previous best full-dev result in this branch:
  - `dev_query_residual_online50_scopefix1`
  - mean score `74.2553`
  - mean weighted KL `0.102772`
- Manual paired comparison vs current best coverage run:
  - score delta `+0.1458`
  - weighted KL delta `-0.000774`
  - win rate `0.650`
  - loss rate `0.350`
  - round deltas:
    - `c5cdf100-a876-4fb7-b5d8-757162c97989`: `+2.5964`
    - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`: `+1.2128`
    - `8e839974-b13b-407b-a5e7-fc749d877195`: `+0.6638`
    - `76909e29-f664-4b2f-b16b-61b7507277e9`: `+0.3803`
    - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`: `+0.1913`
    - `71451d74-be9f-471f-aacd-a41f3b68a9cd`: `-0.0416`
    - `ae78003a-4efe-425a-881a-d16a39bca0ad`: `-1.6506`
    - `36e581f1-73f8-453f-ab98-cbe3052b701b`: `-2.1862`
- Interpretation:
  - exploration does not win uniformly
  - but it improves the branch-wide full-dev objective
  - multi-episode probe support and full-dev result align enough to promote it as current champion configuration
- Current champion configuration:
  - model family: `query_residual` with scope-fix validation/caching improvements
  - online policy: `exploration_v2`
  - benchmark reference:
    - `data/artifacts/benchmarks/dev_query_residual_exploration_scopefix1/report.md`

### 2026-03-21T01:55Z

- Final verification before commit:
  - `uv run pytest tests/test_historical_benchmark.py`: passed
  - `uv run pytest tests/test_historical_benchmark.py tests/test_history_datasets.py tests/test_teacher_student.py`: `11 passed`
- Ready to commit + push:
  - stronger historical validation (`episode_seed_count`, predictor reuse)
  - negative `samples_per_round=2` result
  - positive `exploration_v2` policy result on both 3-round multi-seed and full 8-round dev
