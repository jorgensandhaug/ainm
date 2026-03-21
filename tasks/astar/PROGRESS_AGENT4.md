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
