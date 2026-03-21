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

### 2026-03-21T12:30Z

- Re-read `README.md`, `docs/game_facts.md`, `instructions/agent4.md`, `AGENTS.md` before continuing new family work.
- Re-checked machine health before launching more jobs:
  - load about `54 / 62 / 68`
  - available memory about `1.8 TiB`
  - many other agents already saturating CPU
- Parallelism decision:
  - keep local benchmark jobs moderate (`jobs=6`) because CPU is contested
  - memory is not the bottleneck right now
- `br list`: still unavailable, `br: command not found`

### 2026-03-21T12:38Z

- Finished pending `samples_per_round` sweep for `gbx_maponly_transcriptregime_mapknn_blend20` under `coverage`, episode seeds `0,1,2`.
- Results:
  - baseline best existing `samples=4`:
    - `dev_gbx_maponly_transcriptregime_mapknn_blend20_cov_seed02_jobs8_v1`
    - score `68.042288`
    - weighted KL `0.133045`
  - `samples=8`:
    - `dev_gbx_maponly_transcriptregime_mapknn_blend20_cov_seed02_s8_jobs6_v1`
    - score `66.3372`
    - weighted KL `0.142833`
  - `samples=16`:
    - `dev_gbx_maponly_transcriptregime_mapknn_blend20_cov_seed02_s16_jobs6_v1`
    - score `66.3566`
    - weighted KL `0.142734`
- Interpretation:
  - adding more synthetic transcript samples per round strongly hurts held-out online score
  - current sample-level KNN student is unstable to larger sample banks

### 2026-03-21T12:43Z

- Finished negative gating sweep for current transcript-blend family:
  - `gbx_maponly_transcriptregime_mapknn_confblend20`:
    - score `68.0152`
    - weighted KL `0.133175`
    - basically flat/slightly worse than uniform `blend20`
  - `gbx_maponly_transcriptregime_mapknn_confentropy20`:
    - score `67.4221`
    - weighted KL `0.136014`
    - clearly worse
- Conclusion:
  - local confidence gating does not fix the sample-level KNN issue

### 2026-03-21T12:49Z

- Ran synthetic-bank geometry analysis on existing `coverage`, `samples=4/8/16` transcript checkpoints.
- Key finding:
  - per-round standardized transcript centroids separate perfectly inside every 7-round training fold:
    - centroid round-classification accuracy `1.0`
  - sample-level 5-NN round classification is lower:
    - about `0.879` for `samples=4`
    - about `0.906` for `samples=8`
    - about `0.990` for `samples=16`
  - mean within-round distance stays much smaller than between-round distance:
    - within about `4.5`
    - between about `12.0`
- New hypothesis:
  - transcript features do carry strong round-law signal
  - failure is likely from sample-level neighbor noise / bad local averaging, not lack of signal
  - next branch: implement a round-posterior / roundbank student over the replay manifold instead of sample-level KNN

### 2026-03-21T13:00Z

- Implemented new round-level transcript student branch:
  - new model `gbx_roundbank_terminal_mapknn_v1`
  - new blend aliases:
    - `gbx_maponly_roundbank_mapknn_blend10`
    - `gbx_maponly_roundbank_mapknn_blend20`
- Design:
  - reuse existing synthetic transcript dataset + terminal teacher
  - replace sample-level transcript KNN posterior with round-level centroid posterior
  - build one centroid / shrunk diagonal scale per training round
  - infer posterior weights over training rounds from transcript summary distance
  - decode through existing terminal teacher
- Touched:
  - `src/astar/student/predictor/gbx_transcript_regime.py`
  - `src/astar/student/predictor/interactive.py`
  - `src/astar/cli.py`
  - `tests/test_historical_benchmark.py`
- Targeted validation passed:
  - `py_compile` on touched files
  - `4` targeted pytest cases passed, including roundbank historical smoke

### 2026-03-21T13:03Z

- Launched parallel full 8-round replay-backed benchmarks for the new branch:
  - `dev_gbx_roundbank_terminal_mapknn_cov_seed02_jobs6_v1`
  - `dev_gbx_maponly_roundbank_mapknn_blend10_cov_seed02_jobs6_v1`
  - `dev_gbx_maponly_roundbank_mapknn_blend20_cov_seed02_jobs6_v1`
  - `dev_gbx_maponly_roundbank_mapknn_blend20_cov_seed02_s8_jobs6_v1`
- Reason for this sweep:
  - establish whether round-level posterior alone helps
  - test whether map-prior blending still helps
  - test whether roundbank fixes the `samples=8` collapse seen in sample-level KNN

### 2026-03-21T13:20Z

- Roundbank branch results, all on `coverage`, episode seeds `0,1,2`, full 8-round online historical benchmark:
  - pure `gbx_roundbank_terminal_mapknn`:
    - `42.6254`
    - weighted KL `0.319965`
  - `gbx_maponly_roundbank_mapknn_blend10`:
    - `67.0848`
    - weighted KL `0.137810`
  - `gbx_maponly_roundbank_mapknn_blend20`:
    - `67.3106`
    - weighted KL `0.137132`
  - `gbx_maponly_roundbank_mapknn_blend20`, `samples=8`:
    - `65.8288`
    - weighted KL `0.145917`
- Conclusion:
  - round-centroid posterior is not competitive with current champion
  - it also does **not** fix the `samples_per_round=8` collapse

### 2026-03-21T13:32Z

- Implemented and benchmarked transcript-to-regime ridge branch:
  - new model `gbx_ridge_terminal_mapknn_v1`
  - new blends:
    - `gbx_maponly_ridge_mapknn_blend10`
    - `gbx_maponly_ridge_mapknn_blend20`
- Results, same benchmark slice:
  - pure `gbx_ridge_terminal_mapknn`:
    - `41.5470`
    - weighted KL `0.325316`
  - `gbx_maponly_ridge_mapknn_blend10`:
    - `67.3681`
    - weighted KL `0.136281`
  - `gbx_maponly_ridge_mapknn_blend20`:
    - `67.7778`
    - weighted KL `0.134627`
  - `gbx_maponly_ridge_mapknn_blend20`, `samples=8`:
    - `65.9715`
    - weighted KL `0.145058`
- Conclusion:
  - ridge posterior is better than roundbank
  - still below current champion
  - still does not fix the `samples=8` collapse

### 2026-03-21T13:47Z

- Found an obvious transcript-representation gap:
  - previous transcript summary mostly ignored query location and ignored change relative to known initial map
- Implemented delta-aware transcript features:
  - query center mean/std
  - queried-window initial class frequencies
  - observed-minus-initial class deltas
  - queried changed-cell fraction
- New model:
  - `gbx_transcript_regime_knn_terminal_mapknn_delta_v1`
- New blends:
  - `gbx_maponly_transcriptdelta_mapknn_blend10`
  - `gbx_maponly_transcriptdelta_mapknn_blend20`
- Results, same benchmark slice:
  - pure delta transcript model:
    - `43.1367`
    - weighted KL `0.309774`
  - delta blend10:
    - `67.5306`
    - weighted KL `0.135321`
  - delta blend20:
    - `68.0169`
    - weighted KL `0.133171`
  - delta blend20, `samples=8`:
    - `66.2836`
    - weighted KL `0.143170`
- Interpretation:
  - delta-aware features are the best new branch this turn
  - they nearly tie the current champion but do not beat it
  - they also fail to fix the `samples=8` collapse

### 2026-03-21T13:58Z

- Implemented one ensemble/calibration branch from handoff:
  - `gbx_maponly_transcriptdual_mapknn_blend20`
  - equal-weight combination of:
    - base transcript KNN mapknn
    - delta-aware transcript KNN mapknn
- Result:
  - `68.0310`
  - weighted KL `0.133101`
- Interpretation:
  - ensemble is also near-tie only
  - still slightly below current champion

### 2026-03-21T14:00Z

- Current champion remains unchanged:
  - `gbx_maponly_transcriptregime_mapknn_blend20`
  - `68.042288`
  - weighted KL `0.133045`
- Best new branch from this turn:
  - `gbx_maponly_transcriptdelta_mapknn_blend20`
  - `68.0169`
  - weighted KL `0.133171`
- Gap vs champion:
  - score about `-0.0254`
  - weighted KL about `+0.000126`
- Broad verification after all edits:
  - `uv run pytest tests/test_historical_benchmark.py -q`
  - `39 passed`

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

### 2026-03-21T10:56Z

- Re-read:
  - `instructions/agent4.md`
  - `README.md`
  - `docs/game_facts.md`
  - `AGENTS.md`
- Re-checked machine state before launching more work:
  - CPU count `384`
  - memory available about `1.8 TiB`
  - load average about `35.6 / 46.5 / 53.2`
- Checked current sibling activity from process table:
  - agent7 running many `ffam_mode_*` online historical probes
  - agent6 running regime-posterior audit jobs
  - agent5 running greybox student ablations
  - agent2 running `smh_coeffbank_*` online historical benchmark
- `br list` still unavailable in this shell: `br: command not found`
- Interpretation:
  - RAM headroom is huge
  - CPU is active but far from saturated for this box
  - safe to use more benchmark parallelism after new code lands

### 2026-03-21T10:58Z

- Re-read online-student seam in:
  - `src/astar/student/posterior/deepset_student.py`
  - `src/astar/student/predictor/interactive.py`
  - `src/astar/student/predictor/base.py`
  - `src/astar/workflows/train_student.py`
  - `src/astar/history/datasets/synthetic_live.py`
  - `src/astar/teacher/dynamics/terminal_teacher.py`
  - `src/astar/workflows/historical_benchmark.py`
- Key finding:
  - repo already has a transcript-summary `SummaryBankStudent`
  - but it is tied to the weak hazard teacher and not wired into live / historical online serving
- New branch decision:
  - stop further terminal-only prior tuning
  - implement a real online grey-box student family
  - use synthetic-live transcript bank + regime residual inference + stronger terminal decoder

### 2026-03-21T11:00Z

- Chosen new model design before patching:
  - transcript-conditioned kNN posterior over round regime residual
  - residualized around terminal-teacher map prior to factor out geography
  - decoder is terminal teacher, first target variant `mapknn`
- Planned inference:
  - build compact transcript summary from legal observations only
  - concatenate that with current map-prior regime signal
  - standardize features
  - infer regime residual by weighted kNN over synthetic-live episodes
  - decode final tensor with `GreyBoxTerminalTeacher.posterior_predictive(...)`
- Planned validation:
  - add online historical benchmark smoke tests
  - then launch parallel 3-round probes across decoder variants / policies

### 2026-03-21T11:18Z

- Implemented new online grey-box student family:
  - file: `src/astar/student/predictor/gbx_transcript_regime.py`
  - models:
    - `gbx_transcript_regime_knn_terminal_mapknn`
    - `gbx_transcript_regime_knn_terminal_mapllr`
    - `gbx_transcript_regime_knn_terminal_mapprior`
- Core design now in code:
  - build compact transcript summaries from legal query observations only
  - append current round terminal-teacher map-prior regime
  - standardize feature bank
  - infer regime **residual** by weighted kNN over synthetic-live episodes
  - decode posterior predictive final tensor with `GreyBoxTerminalTeacher`
- Important engineering choices:
  - residualize around terminal-teacher map prior, not absolute regime
  - reuse fold-scoped terminal-teacher checkpoints
  - reuse fold-scoped synthetic-live datasets
  - synthetic dataset cache name is shared across transcript-regime variants so mapknn/mapllr/mapprior do not rebuild identical transcripts
- Wired serving path in:
  - `src/astar/student/predictor/interactive.py`
  - `src/astar/cli.py`
- Small validation improvement:
  - top-level `HistoricalBenchmarkResult.samples_per_round` now reports actual online `samples_per_round` for all online models, not only `query_residual`

### 2026-03-21T11:19Z

- Verification after implementation:
  - `uv run python -m py_compile src/astar/student/predictor/gbx_transcript_regime.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
    - passed
  - `uv run pytest tests/test_historical_benchmark.py -q`
    - `28 passed`
  - focused rerun after dataset-cache sharing patch:
    - `uv run pytest tests/test_historical_benchmark.py::test_gbx_transcript_regime_knn_terminal_mapknn_online_historical_benchmark_runs tests/test_historical_benchmark.py::test_gbx_transcript_regime_scoped_checkpoint_reuse -q`
    - `2 passed`

### 2026-03-21T11:20Z

- Next immediate experiment plan:
  - launch real historical online probes on hard replay-backed rounds
  - first sweep dimensions:
    - decoder variant: `mapknn`, `mapllr`, `mapprior`
    - policy: `coverage`, `exploration`
    - training transcripts: `samples_per_round=4`
- Reason:
  - enough transcript diversity to test whether the student family has signal
  - still cheap enough for many-way parallel search on this machine

### 2026-03-21T11:24Z

- Found + fixed first serving bug before long runs:
  - canonical policy names like `exploration_v2` were being normalized a second time inside the new transcript-regime student path
  - this broke `historical_benchmark`, because it passes canonical policy names after resolving aliases
- Fix:
  - added explicit alias/canonical policy resolver for transcript-regime models
  - checkpoint paths now canonicalize to one policy token
  - synthetic-live dataset builds use the alias name the policy registry actually accepts
- Added regression test:
  - `test_gbx_transcript_regime_accepts_canonical_exploration_policy_name`
  - targeted rerun:
    - `3 passed`

### 2026-03-21T11:26Z

- Found parallelism blocker under real benchmark load:
  - concurrent synthetic-live/materialization paths were crashing on DuckDB catalog lock contention
  - root seam: `src/astar/infra/catalog/db.py`
- Fix:
  - expanded transient lock retry budget in `CatalogDB._connect(...)`
  - purpose is not to weaken logging, only to serialize through temporary lock contention instead of failing the worker
- This is directly relevant to the user's request for heavy parallel experimentation on this machine

### 2026-03-21T11:28Z

- Launched 6 managed real probes on hard 4-round replay subset with `samples_per_round=4`, `budget=50`, `jobs=4`, `with-png=none`:
  - `agent4_probe_gbx_trk_mapknn_cov_s4_r4`
  - `agent4_probe_gbx_trk_mapknn_exp_s4_r4`
  - `agent4_probe_gbx_trk_mapllr_cov_s4_r4`
  - `agent4_probe_gbx_trk_mapllr_exp_s4_r4`
  - `agent4_probe_gbx_trk_mapprior_cov_s4_r4`
  - `agent4_probe_gbx_trk_mapprior_exp_s4_r4`
- Round subset:
  - `36e581f1-73f8-453f-ab98-cbe3052b701b`
  - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
  - `ae78003a-4efe-425a-881a-d16a39bca0ad`
  - `c5cdf100-a876-4fb7-b5d8-757162c97989`
- Current managed exec session ids:
  - coverage:
    - mapknn `30692`
    - mapllr `39776`
    - mapprior `71945`
  - exploration:
    - mapknn `21875`
    - mapllr `81325`
    - mapprior `23418`

### 2026-03-21T11:31Z

- First parallel probe launch exposed a remaining systems issue:
  - benchmark workers were still colliding on dataset/materialization-time catalog writes
  - even after expanding DuckDB retry budget, starting all folds cold at once was still fragile
- New operational decision:
  - stop cold-starting many transcript-regime benchmarks at once
  - prebuild the exact fold-scoped synthetic transcript datasets serially first
  - then rerun the benchmark sweep against warm caches
- Added another throughput guard in `gbx_transcript_regime.py`:
  - per-dataset `.build.lock`
  - purpose: multiple model variants should not rebuild the same synthetic-live dataset concurrently

### 2026-03-21T11:32Z

- Started serial prebuild over the 4-round hard subset for:
  - policy `coverage`
  - policy `exploration`
  - `samples_per_round=4`
  - all 4 leave-one-round-out training folds
- Current managed prebuild session id:
  - `65342`
- Expected effect:
  - later benchmark workers become mostly read-only on synthetic transcript data
  - should remove the main catalog-lock failure mode from the sweep

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

### 2026-03-21T02:00Z approx

- Committed and pushed current champion state:
  - commit `8349132`
  - branch `agent4`
  - remote `origin/agent4`
- Repo status after push: clean
- `br list` still blocked because `br` command is unavailable in this shell
- Next remaining scientific question after promotion:
  - does `exploration_v2` still win under **full 8-round multi-episode** validation, not just:
    - 3-round multi-episode subset
    - full 8-round single-seed dev
- Next planned runs:
  - full 8-round `coverage` with `episode_seed_count=2`
  - full 8-round `exploration` with `episode_seed_count=2`
  - use that result as strongest local selection signal currently available in this branch

### 2026-03-21T02:30Z approx

- Completed strongest current validation available in this branch:
  - full 8-round historical online benchmark
  - transcript seeds `0,1`
  - predictor reused across episode seeds per held-out round
- Full multi-episode coverage baseline:
  - run: `dev_query_residual_online50_scopefix1_seed01`
  - mean score `74.1150`
  - mean weighted KL `0.103500`
  - runtime `1565.1s`
- Full multi-episode exploration benchmark:
  - run: `dev_query_residual_exploration_scopefix1_seed01`
  - mean score `74.5587`
  - mean weighted KL `0.101003`
  - runtime `1615.1s`
- Manual paired comparison across `(round_id, seed_index, episode_seed)`:
  - score delta `+0.4437`
  - weighted KL delta `-0.002497`
  - win rate `0.600`
  - loss rate `0.400`
  - round deltas:
    - `c5cdf100-a876-4fb7-b5d8-757162c97989`: `+2.8897`
    - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`: `+3.0826`
    - `76909e29-f664-4b2f-b16b-61b7507277e9`: `+0.7464`
    - `8e839974-b13b-407b-a5e7-fc749d877195`: `+0.3402`
    - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`: `+0.1911`
    - `71451d74-be9f-471f-aacd-a41f3b68a9cd`: `-0.1457`
    - `ae78003a-4efe-425a-881a-d16a39bca0ad`: `-1.6648`
    - `36e581f1-73f8-453f-ab98-cbe3052b701b`: `-1.8900`
- Updated conclusion:
  - `query_residual + exploration_v2` remains champion not only on:
    - 3-round multi-episode subset
    - full 8-round single-seed dev
  - but also on full 8-round multi-episode validation
  - this is now the strongest local evidence in agent4 branch so far

### 2026-03-21T02:44Z

- Re-read required docs/handoff in current turn:
  - `README.md`
  - `docs/game_facts.md`
  - `instructions/agent4.md`
  - `PROGRESS_AGENT4.md`
- Re-checked git state:
  - branch `agent4`
  - worktree clean
- Re-checked task tracker:
  - `br list` still blocked, command not installed in shell
- New working hypothesis:
  - current policy gain comes mainly from using the otherwise-idle last `5` queries
  - current `exploration_v2` is very weak scientifically:
    - static
    - non-adaptive
    - exactly one extra hotspot repeat per seed
    - does not optimize those `5` repeats globally for round-latent identification
- Next concrete experiment:
  - add stronger repeat-allocation policy variants under same legal `50`-query budget
  - benchmark them first on held-out subset, then promote only if they beat `exploration_v2`

### 2026-03-21T02:55Z

- Implemented new static query-allocation variants in `src/astar/policy/coverage.py` + `src/astar/policy/registry.py`:
  - existing `exploration_v2`: one top repeat per seed
  - new `exploration_global_v1`: allocate the last `5` queries to top global seed/viewports, allowing seed concentration
  - new `exploration_focus_v1`: allocate all last `5` queries to the single best global hotspot
- Added policy tests in `tests/test_exploration_policy.py`:
  - verify `exploration_global_v1` matches exact top-global motif ranking
  - verify `exploration_focus_v1` repeats the single best global viewport
- Narrow regression checks passed:
  - `uv run python -m py_compile src/astar/policy/coverage.py src/astar/policy/registry.py tests/test_exploration_policy.py`
  - `uv run pytest tests/test_exploration_policy.py tests/test_history_datasets.py tests/test_historical_benchmark.py`
  - `12 passed`
- Started full 8-round single-seed benchmark for:
  - `dev_query_residual_exploration_global1`
  - status at log time: still running
- Quick qualitative allocation audit on real dev rounds:
  - `exploration_global_v1` can concentrate repeats on stronger seeds, e.g. `3,1,1`
  - `exploration_focus_v1` can spend all `5` repeats on one seed/hotspot
  - this directly tests whether regime information is better concentrated than spread one-per-seed

### 2026-03-21T03:05Z

- While `exploration_global_v1` full benchmark was running, improved validation/analysis tooling for policy research:
  - `compare_historical_benchmarks` no longer rejects paired comparisons only because policies differ
  - comparison now keys strictly on `(round_id, seed_index, episode_seed)` plus matching mode/budget/episode seeds
  - report now records `baseline_policy_name` and `candidate_policy_name`
  - long comparison artifact names now fall back to hashed run suffixes to avoid OS filename-length failures
- Files changed:
  - `src/astar/workflows/results.py`
  - `src/astar/eval/reports.py`
  - `src/astar/workflows/compare_historical_benchmarks.py`
  - `tests/test_historical_benchmark.py`
- Verification:
  - `uv run python -m py_compile src/astar/workflows/results.py src/astar/eval/reports.py src/astar/workflows/compare_historical_benchmarks.py tests/test_historical_benchmark.py`
  - `uv run pytest tests/test_historical_benchmark.py`
  - `6 passed`

### 2026-03-21T03:45Z

- Full 8-round single-seed policy experiment completed:
  - run: `dev_query_residual_exploration_global1`
  - model: `query_residual`
  - policy: `exploration_global_v1`
  - mean score `73.4448`
  - mean weighted KL `0.107623`
  - runtime `2341.1s`
- Paired comparison vs current single-seed champion `dev_query_residual_exploration_scopefix1`:
  - artifact: `data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=exploration_v2__candidate_policy=exploration_global_v1__budget=50__episode_seeds=0__baseline=query_residual__candidate=query_residual__run_sha1=22d4986f57.md`
  - score delta `-0.9563`
  - weighted-KL delta `+0.005625`
  - win rate `0.425`
  - CI95 entirely negative on score delta
- Interpretation:
  - concentrating the extra `5` repeats across fewer seeds is bad overall
  - it helped `36e581...`
  - but materially hurt `c5cdf...` and especially `f1dac...`
  - `exploration_focus_v1` is therefore deprioritized as an even more concentrated version of a losing direction

### 2026-03-21T03:55Z

- Ported minimal high-value iteration-speed improvement from local sibling worktree:
  - scoped checkpoint caching for holdout-trained `query_residual`
  - purpose: reuse fitted fold predictors across repeated benchmarks on same train-scope/policy/model
- Files changed:
  - `src/astar/student/predictor/query_residual.py`
  - `src/astar/student/predictor/interactive.py`
  - `tests/test_historical_benchmark.py`
- Verification:
  - new test `test_query_residual_scoped_checkpoint_reuse`
  - `uv run pytest tests/test_historical_benchmark.py`
  - `7 passed`

### 2026-03-21T04:05Z

- Found strong local signal in sibling worktree `agent3`:
  - full 8-round single-seed benchmark `agent3_dev_query_residual_v11_full_corrected`
  - model `query_residual_v11`
  - policy `coverage`
  - mean score `74.6870`
  - mean weighted KL `0.099885`
  - better than current agent4 single-seed champion `74.4011`
- Ported only the minimal `v11` ingredients, not the whole variant matrix:
  - named model `query_residual_v11`
  - fixed effective `samples_per_round=2`
  - stratified entropy training-cell selection
  - exact local residual channels in transcript features
- Files changed:
  - `src/astar/student/predictor/query_residual.py`
  - `src/astar/student/predictor/interactive.py`
  - `src/astar/workflows/model_eval.py`
  - `src/astar/workflows/historical_benchmark.py`
  - `src/astar/cli.py`
  - `tests/test_historical_benchmark.py`
- Verification:
  - added smoke test `test_query_residual_v11_online_historical_benchmark_runs`
  - `uv run python -m py_compile src/astar/student/predictor/query_residual.py src/astar/student/predictor/interactive.py src/astar/workflows/model_eval.py src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
  - `uv run pytest tests/test_historical_benchmark.py`
  - `8 passed`
- Next run started:
  - full 8-round single-seed replication on this branch
  - command target name: `dev_query_residual_v11_coverage1`

### 2026-03-21T04:40Z

- Full 8-round single-seed replication completed for local `query_residual_v11` port:
  - run: `dev_query_residual_v11_coverage1`
  - model: `query_residual_v11`
  - policy: `coverage`
  - samples_per_round: `2`
  - mean score `74.6870`
  - mean weighted KL `0.099885`
  - runtime `1794.6s`
- Result exactly matched sibling local worktree signal, so port is faithful.
- This is now the best single-seed score seen in agent4 branch:
  - previous single-seed champion:
    - `dev_query_residual_exploration_scopefix1`
    - `74.4011`
    - `0.101998`
  - new delta:
    - score `+0.2859`
    - weighted KL `-0.002113`
- Paired comparison artifact vs previous single-seed champion:
  - `data/artifacts/comparisons/historical__mode=online_interactive__baseline_policy=exploration_v2__candidate_policy=coverage__budget=50__episode_seeds=0__baseline=query_residual__candidate=query_residual_v11.md`
- Comparison interpretation:
  - gains are concentrated, not uniform
  - large improvements on hard rounds, especially `36e581...` and `f1dac...`
  - mild regressions on some easier rounds remain
  - but mean score and KL both improve
- Next highest-value experiment started immediately:
  - `dev_query_residual_v11_exploration1`
  - objective: test whether the stronger `v11` model still benefits from the extra `5` exploration repeats

### 2026-03-21T05:20Z

- Full 8-round single-seed `v11` policy ablations finished:
  - `dev_query_residual_v11_exploration1`
    - `74.0566`
    - `0.103085`
    - verdict: reject full exploration retrain for `v11`
  - paired vs `dev_query_residual_v11_coverage1`:
    - score delta `-0.6304`
    - weighted-KL delta `+0.003201`
    - CI95 entirely negative on score
- Scientific interpretation:
  - exploration helped the older `query_residual` family
  - but once the posterior/training target is strengthened (`v11`), retraining on exploration transcripts is harmful
  - the likely issue is not the extra observations alone, but the exploration-conditioned synthetic training distribution

### 2026-03-21T05:30Z

- Stronger multi-episode validation for `v11+coverage` completed:
  - run: `dev_query_residual_v11_coverage_seed01`
  - mean score `74.5264`
  - mean weighted KL `0.100625`
  - runtime `161.7s`
- Comparisons:
  - vs old multi-episode coverage `dev_query_residual_online50_scopefix1_seed01`:
    - score delta `+0.4115`
    - weighted-KL delta `-0.002875`
  - vs previous multi-episode branch champion `dev_query_residual_exploration_scopefix1_seed01`:
    - score delta `-0.0322`
    - weighted-KL delta `-0.000378`
    - effectively near-tie on score, better on KL
- Conclusion at that point:
  - `v11+coverage` became best coverage-family model
  - but did not clearly dominate the old exploration champion on score

### 2026-03-21T05:40Z

- Tested hybrid decoupling hypothesis:
  - keep the stronger `v11` predictor trained on `coverage`
  - serve it under `exploration_v2` transcript collection
  - rationale: exploration observations may help, while exploration-conditioned training had already shown harm
- Implemented tiny alias:
  - model name `query_residual_v11_covtrain`
  - train policy fixed to `coverage`
  - serve policy still chosen by benchmark/live runner
  - cached `v11+coverage` fold checkpoints reused directly
- Verification:
  - added smoke test `test_query_residual_v11_covtrain_online_historical_benchmark_runs`
  - `uv run pytest tests/test_historical_benchmark.py`
  - `9 passed`
- Single-seed hybrid result:
  - run: `dev_query_residual_v11_covtrain_exploration1`
  - mean score `74.5850`
  - mean weighted KL `0.100585`
  - better than full `v11+exploration` retrain
  - still slightly below `v11+coverage` on single-seed mean score
- Multi-episode hybrid result:
  - run: `dev_query_residual_v11_covtrain_exploration_seed01`
  - mean score `74.6485`
  - mean weighted KL `0.100186`
  - this is now the best mean score and best KL under the strongest local seed01 validation run available in agent4 branch
- Paired comparisons:
  - vs old branch champion `dev_query_residual_exploration_scopefix1_seed01`:
    - score delta `+0.0898`
    - weighted-KL delta `-0.000817`
    - win rate `0.500`
  - vs `dev_query_residual_v11_coverage_seed01`:
    - score delta `+0.1221`
    - weighted-KL delta `-0.000439`
    - win rate `0.575`
- Notes:
  - one extra single-seed comparison command hit a DuckDB catalog lock due concurrent comparison logging; benchmark artifacts themselves were unaffected
  - strongest current promotion candidate is now:
    - model: `query_residual_v11_covtrain`
    - serve policy: `exploration_v2`
    - benchmark: `dev_query_residual_v11_covtrain_exploration_seed01`

### 2026-03-21T06:10Z

- Re-read canonicals at start of new session block:
  - `README.md`
  - `docs/game_facts.md`
  - `instructions/agent4.md`
  - `PROGRESS_AGENT4.md`
- Re-checked branch status: clean before edits.
- Re-checked task tracker:
  - `br list` still unavailable in shell (`command not found`).
- Inspected current frontier code and artifacts:
  - `src/astar/student/predictor/query_residual.py`
  - `src/astar/student/predictor/interactive.py`
  - `src/astar/policy/coverage.py`
  - `src/astar/workflows/historical_benchmark.py`
  - `src/astar/workflows/model_eval.py`
  - current best benchmark reports for:
    - `dev_query_residual_v11_coverage_seed01`
    - `dev_query_residual_v11_covtrain_exploration_seed01`

### 2026-03-21T06:20Z

- Audited `v11_covtrain` train/serve mismatch scientifically:
  - coverage-trained model sees at most:
    - global query count `45 / 50 = 0.9`
    - per-seed query count `9 / 50 = 0.18`
  - exploration serving uses:
    - global query count `50 / 50 = 1.0`
    - per-seed query count `10 / 50 = 0.2`
- Loaded scoped `query_residual_v11` checkpoints and inspected coefficient magnitudes.
- Found large coefficient norm on `global_query_count`:
  - L2 about `0.850`
  - dominant positive settlement effect
- Hypothesis:
  - current hybrid benefits from extra repeated observations,
  - but may also suffer from coverage->exploration serving-distribution mismatch in heuristic calibration / blending.

### 2026-03-21T06:30Z

- Tested serving-only count-clipping idea in-process, reusing held-out coverage-trained fold checkpoints while evaluating on historical exploration transcripts.
- Variant:
  - clip `global_query_count` to `0.9`
  - clip `seed_query_count` to `0.18`
  - keep extra exploration exact-count evidence intact
- Result on 8-round seed01 validation:
  - count-clip probe mean score `74.5945`
  - mean weighted KL `0.100391`
- Verdict:
  - reject count-clipping
  - worse than current hybrid `74.6485 / 0.100186`

### 2026-03-21T06:40Z

- Switched to serving-only calibration search on same cached coverage-trained fold checkpoints.
- Important methodological note:
  - this did **not** retrain folds
  - only serving-time posterior calibration changed
  - validation remains correct holdout-by-round
- Seed01 sweep results:
  - baseline current hybrid:
    - `74.648496`
    - `0.100186`
  - `beta=(4,16)`:
    - `74.701439`
    - `0.099827`
  - `beta=(2,8)`:
    - `74.481003`
    - `0.100605`
  - `prior_blend=0.25`:
    - `75.447266`
    - `0.096100`
  - `teacher_blend=0.0`:
    - no change vs baseline
  - `prior_blend=0.25` + `beta=(4,16)`:
    - `75.466084`
    - `0.095894`
- Interpretation:
  - dominant missed opportunity was over-anchoring to the historical prior during exploration serving
  - exact-count blend should be somewhat stronger too

### 2026-03-21T06:50Z

- Ran finer low-prior sweeps.
- Single-seed (`episode_seed=0`) with `beta=(4,16)`:
  - `prior=0.18`: `75.853071`, `0.093967`
  - `prior=0.15`: `76.025666`, `0.093081`
  - `prior=0.12`: `76.185739`, `0.092259`
  - `prior=0.10`: `76.285448`, `0.091747`
  - `prior=0.08`: `76.379504`, `0.091263`
- Stronger seed01 sweep with `beta=(4,16)`:
  - `prior=0.12`: `76.250922`, `0.091881`
  - `prior=0.10`: `76.350414`, `0.091372`
  - `prior=0.08`: `76.444128`, `0.090893`
- Trend stayed monotone as prior anchor dropped.

### 2026-03-21T07:00Z

- Tested zero-prior regime.
- Stronger seed01 sweep:
  - `prior=0.00`, `beta=(4,16)`:
    - `76.759795`
    - `0.089269`
  - `prior=0.00`, `beta=(6,24)`:
    - `76.862578`
    - `0.088911`
  - `prior=0.00`, `beta=(8,32)`:
    - `76.858129`
    - `0.088984`
- Supporting single-seed sweep:
  - `prior=0.00`, `beta=(0,0)` catastrophically bad:
    - `33.514786`
    - `0.487255`
  - `prior=0.00`, `beta=(1,4)` also bad:
    - `73.490547`
    - `0.103818`
  - `prior=0.00`, `beta=(2,8)`:
    - `75.906116`
    - `0.092928`
  - `prior=0.00`, `beta=(4,16)`:
    - `76.698045`
    - `0.089614`
  - `prior=0.00`, `beta=(6,24)`:
    - `76.793183`
    - `0.089292`
- Conclusion:
  - zero final prior blend is decisively better under exploration serving for this coverage-trained `v11` family
  - exact observed-cell blending still needs substantial shrinkage (`beta` cannot go to zero)
  - best validated point so far:
    - `prior_blend=0.0`
    - `beta_min=6.0`
    - `beta_scale=24.0`

### 2026-03-21T07:05Z

- Implemented new explicit alias:
  - `query_residual_v11_covtrain_p0_b624`
- Meaning:
  - same coverage-trained `v11` fold checkpoints as `query_residual_v11_covtrain`
  - serving calibration overrides:
    - `prior_blend=0.0`
    - `beta_min=6.0`
    - `beta_scale=24.0`
- Files edited:
  - `src/astar/student/predictor/query_residual.py`
  - `src/astar/student/predictor/interactive.py`
  - `src/astar/workflows/model_eval.py`
  - `src/astar/cli.py`
  - `tests/test_historical_benchmark.py`
- Next:
  - run smoke/regression tests
  - run normal historical benchmark artifact for new alias
  - compare against previous best benchmark artifacts
  - commit + push

### 2026-03-21T07:15Z

- Verification after alias wiring:
  - `uv run python -m py_compile src/astar/student/predictor/query_residual.py src/astar/student/predictor/interactive.py src/astar/workflows/model_eval.py src/astar/cli.py tests/test_historical_benchmark.py`
    - passed
  - `uv run pytest tests/test_historical_benchmark.py tests/test_history_datasets.py tests/test_exploration_policy.py`
    - `17 passed`

### 2026-03-21T07:20Z

- Ran normal benchmark artifact for searched seed01 setting:
  - run: `dev_query_residual_v11_covtrain_p0_b624_seed01`
  - model: `query_residual_v11_covtrain_p0_b624`
  - policy: `exploration_v2`
  - episode seeds: `0,1`
  - mean score `76.8626`
  - mean weighted KL `0.088911`
  - report:
    - `data/artifacts/benchmarks/dev_query_residual_v11_covtrain_p0_b624_seed01/report.md`
- Paired vs prior hybrid champion on same seed01 setting:
  - baseline: `dev_query_residual_v11_covtrain_exploration_seed01`
  - candidate: `dev_query_residual_v11_covtrain_p0_b624_seed01`
  - comparison artifact:
    - `data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_v2__budget=50__episode_seeds=0-1__baseline=query_residual_v11_covtrain__candidate=query_residual_v11_covtrain_p0_b624.md`
  - score delta `+2.2141`
  - weighted-KL delta `-0.011275`
  - win rate `0.688`
  - CI95 on score delta entirely positive: `[1.5140, 3.0172]`

### 2026-03-21T07:30Z

- Ran stronger unseen-seed validation, intentionally outside the search seeds:
  - baseline run:
    - `dev_query_residual_v11_covtrain_exploration_seed23`
    - mean score `74.5538`
    - mean weighted KL `0.100738`
  - candidate run:
    - `dev_query_residual_v11_covtrain_p0_b624_seed23`
    - mean score `76.7034`
    - mean weighted KL `0.089665`
- Paired unseen-seed comparison:
  - artifact:
    - `data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_v2__budget=50__episode_seeds=2-3__baseline=query_residual_v11_covtrain__candidate=query_residual_v11_covtrain_p0_b624.md`
  - score delta `+2.1496`
  - weighted-KL delta `-0.011072`
  - win rate `0.662`
  - CI95 on score delta entirely positive: `[1.4212, 2.9619]`
- Interpretation:
  - large gain survives on unseen episode seeds, so this is not just overfitting the search seeds `0,1`
  - calibration fix appears genuinely robust

### 2026-03-21T07:32Z

- Combined summary across both disjoint 2-seed validations (`0,1` plus unseen `2,3`):
  - old hybrid `query_residual_v11_covtrain`:
    - `160` evaluated seeds
    - mean score `74.601134`
    - mean weighted KL `0.100462`
  - new calibrated alias `query_residual_v11_covtrain_p0_b624`:
    - `160` evaluated seeds
    - mean score `76.782986`
    - mean weighted KL `0.089288`
- Combined delta:
  - score `+2.181852`
  - weighted KL `-0.011174`

## Current Best Known Scores

- best previous multi-episode branch champion:
  - `dev_query_residual_v11_covtrain_exploration_seed01`
  - mean score `74.6485`
  - mean weighted KL `0.100186`
- new best searched seed01 benchmark:
  - `dev_query_residual_v11_covtrain_p0_b624_seed01`
  - mean score `76.8626`
  - mean weighted KL `0.088911`
- unseen-seed confirmation:
  - `dev_query_residual_v11_covtrain_p0_b624_seed23`
  - mean score `76.7034`
  - mean weighted KL `0.089665`

## Current Goal

- Commit calibrated alias + benchmark evidence.
- Push branch to remote.
- Current promotion candidate:
  - model: `query_residual_v11_covtrain_p0_b624`
  - serve policy: `exploration_v2`
  - strongest validated evidence:
    - searched seeds `0,1`: `76.8626 / 0.088911`
    - unseen seeds `2,3`: `76.7034 / 0.089665`

### 2026-03-21T07:40Z

- Post-push continuation start.
- Current branch state after push:
  - commit `3370b5c`
  - pushed to `origin/agent4`
- Next frontier hypotheses after the large calibration win:
  1. exploration-trained `query_residual_v11` may need the same serving calibration and could now be competitive again
  2. repeat-allocation policy results may change under the new much-lower-prior / stronger exact-count blend regime
  3. if both fail, current calibrated coverage-trained exploration hybrid remains default champion

### 2026-03-21T07:50Z

- Tested exploration-trained `query_residual_v11` under the same calibrated serving settings:
  - serving overrides:
    - `prior_blend=0.0`
    - `beta_min=6.0`
    - `beta_scale=24.0`
  - 8-round seed01 result:
    - mean score `76.674806`
    - mean weighted KL `0.089837`
- Interpretation:
  - huge improvement over the old exploration-trained calibration
  - but still below coverage-trained calibrated alias `76.8626 / 0.088911`
  - keep coverage-trained family as champion

### 2026-03-21T08:00Z

- Re-tested policy family under the new calibrated alias `query_residual_v11_covtrain_p0_b624`.
- Single-seed quick screen (`episode_seed=0`):
  - `coverage`: `76.891811`, `0.088688`
  - `exploration_global_v1`: `76.793712`, `0.089271`
  - `exploration_focus_v1`: `76.714580`, `0.089684`
- Immediate conclusion:
  - concentrated repeat policies still do not beat the best baseline
  - but unexpectedly, `coverage` now edged out `exploration_v2` on this seed

### 2026-03-21T08:10Z

- Materialized calibrated coverage-policy benchmark artifacts:
  - `dev_query_residual_v11_covtrain_p0_b624_coverage_seed01`
    - `76.7994`
    - `0.089116`
  - `dev_query_residual_v11_covtrain_p0_b624_coverage_seed23`
    - `76.9992`
    - `0.088112`
- Policy comparison under same calibrated alias:
  - searched seeds `0,1`:
    - coverage vs exploration delta `-0.0632`
    - weighted-KL delta `+0.000205`
    - CI includes zero
  - unseen seeds `2,3`:
    - coverage vs exploration delta `+0.2958`
    - weighted-KL delta `-0.001553`
    - CI95 entirely positive on score
- Combined across seeds `0..3`:
  - exploration:
    - mean score `76.782986`
    - mean weighted KL `0.089288`
  - coverage:
    - mean score `76.899299`
    - mean weighted KL `0.088614`
- New interpretation:
  - after fixing posterior calibration, the extra 5 exploration repeats are no longer clearly worth their opportunity cost
  - current best overall deployed policy/model pair is now:
    - model `query_residual_v11_covtrain_p0_b624`
    - policy `coverage`

### 2026-03-21T08:12Z

- Next highest-value experiment:
  - tune serving calibration directly for `coverage` under the same train-fold checkpoints
  - rationale:
    - current `p0_b624` point was discovered under exploration serving
    - coverage now appears stronger overall
    - coverage may prefer slightly different `prior_blend` / `beta` tradeoff because observed cells are single-sample only

### 2026-03-21T08:20Z

- Coverage-specific calibration sweep completed.
- Single-seed (`episode_seed=0`) coverage results:
  - current point `prior=0.00`, `beta=(6,24)`:
    - `76.891811`
    - `0.088688`
  - stronger shrinkage:
    - `prior=0.00`, `beta=(8,32)`:
      - `76.886375`
      - `0.088758`
    - `prior=0.00`, `beta=(10,40)`:
      - `76.860362`
      - `0.088901`
  - reintroducing prior anchor hurt:
    - `prior=0.05`, `beta=(6,24)`:
      - `76.684270`
      - `0.089735`
    - `prior=0.10`, `beta=(6,24)`:
      - `76.440378`
      - `0.090964`
- Conclusion:
  - current calibrated point `p0_b624` is already the best tested coverage-serving calibration
  - no further improvement found in the immediate local neighborhood

## Current Best Known Scores

- best previous multi-episode branch champion:
  - `dev_query_residual_v11_covtrain_exploration_seed01`
  - mean score `74.6485`
  - mean weighted KL `0.100186`
- best calibrated exploration-serving alias:
  - `dev_query_residual_v11_covtrain_p0_b624_seed01`
  - mean score `76.8626`
  - mean weighted KL `0.088911`
- best current overall policy/model pair:
  - `dev_query_residual_v11_covtrain_p0_b624_coverage_seed23`
  - mean score `76.9992`
  - mean weighted KL `0.088112`
- combined policy summary across seeds `0..3` for the calibrated alias:
  - exploration:
    - mean score `76.782986`
    - mean weighted KL `0.089288`
  - coverage:
    - mean score `76.899299`
    - mean weighted KL `0.088614`
  - coverage delta vs exploration:
    - score `+0.116313`
    - weighted KL `-0.000674`
- current champion:
  - model `query_residual_v11_covtrain_p0_b624`
  - policy `coverage`

### 2026-03-21T08:30Z

- Validation process tightened again for post-calibration work:
  - search split: episode seeds `0,1`
  - validation split: episode seeds `2,3`
  - fresh holdout split: episode seeds `4,5`
- Rationale:
  - calibration search already touched `0..3`
  - new tweaks should now be selected without peeking at an untouched additional split
- Next target:
  - global temperature under the current champion
  - keep `prior_blend=0.0`, `beta=(6,24)`, policy `coverage`

### 2026-03-21T08:40Z

- Coverage-policy temperature sweep on search split `0,1`:
  - `temp=1.15`:
    - `76.799370`
    - `0.089116`
  - `temp=1.10`:
    - `77.876950`
    - `0.084321`
  - `temp=1.05`:
    - `78.715486`
    - `0.080699`
  - `temp=1.00`:
    - `79.239010`
    - `0.078549`
  - lower than `1.00`:
    - `temp=0.95`: `78.781886`, `0.080675`
    - `temp=0.90`: `77.925277`, `0.084660`
    - `temp=0.85`: `76.745990`, `0.090229`
- Interpretation:
  - temperature had been far too soft
  - optimum is sharply centered around `1.00`
  - this is not a small calibration gain; it is another major score jump

### 2026-03-21T08:50Z

- Stronger validation for the `temp=1.00` point under `coverage`:
  - validation split `2,3`:
    - mean score `79.654901`
    - mean weighted KL `0.076741`
  - untouched holdout split `4,5`:
    - mean score `79.266294`
    - mean weighted KL `0.078576`
- Baseline calibrated-coverage alias on holdout `4,5`:
  - `76.842151`
  - `0.089007`
- Conclusion:
  - `temperature=1.00` survives both validation and untouched holdout
  - this is a real improvement, not split-specific overfitting

### 2026-03-21T09:00Z

- Implemented new explicit alias:
  - `query_residual_v11_covtrain_p0_b624_t100`
- Meaning:
  - same coverage-trained `v11` fold checkpoints
  - serving overrides:
    - `prior_blend=0.0`
    - `beta_min=6.0`
    - `beta_scale=24.0`
    - `temperature=1.0`
- Files edited:
  - `src/astar/student/predictor/query_residual.py`
  - `src/astar/student/predictor/interactive.py`
  - `src/astar/cli.py`
  - `tests/test_historical_benchmark.py`
- Verification:
  - `uv run python -m py_compile src/astar/student/predictor/query_residual.py src/astar/student/predictor/interactive.py src/astar/cli.py tests/test_historical_benchmark.py`
    - passed
  - `uv run pytest tests/test_historical_benchmark.py tests/test_history_datasets.py tests/test_exploration_policy.py`
    - `18 passed`

### 2026-03-21T09:10Z

- Materialized official benchmark artifacts for the new alias under policy `coverage`:
  - `dev_query_residual_v11_covtrain_p0_b624_t100_coverage_seed01`
    - `79.2390`
    - `0.078549`
  - `dev_query_residual_v11_covtrain_p0_b624_t100_coverage_seed23`
    - `79.6549`
    - `0.076741`
  - `dev_query_residual_v11_covtrain_p0_b624_t100_coverage_seed45`
    - `79.2663`
    - `0.078576`
- Paired official comparisons vs prior calibrated coverage champion `query_residual_v11_covtrain_p0_b624`:
  - searched seeds `0,1`:
    - artifact:
      - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seeds=0-1__baseline=query_residual_v11_covtrain_p0_b624__candidate=query_residual_v11_covtrain_p0_b624_t100.md`
    - score delta `+2.4396`
    - weighted-KL delta `-0.010567`
    - CI95 `[1.6870, 3.2842]`
  - validation seeds `2,3`:
    - artifact:
      - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seeds=2-3__baseline=query_residual_v11_covtrain_p0_b624__candidate=query_residual_v11_covtrain_p0_b624_t100.md`
    - score delta `+2.6557`
    - weighted-KL delta `-0.011371`
    - CI95 `[1.9023, 3.5051]`
  - untouched holdout seeds `4,5`:
    - artifact:
      - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seeds=4-5__baseline=query_residual_v11_covtrain_p0_b624__candidate=query_residual_v11_covtrain_p0_b624_t100.md`
    - score delta `+2.4241`
    - weighted-KL delta `-0.010430`
    - CI95 `[1.6797, 3.2661]`

## Current Best Known Scores

- prior calibrated coverage champion:
  - combined across splits `0..5`
  - `240` evaluated seeds
  - mean score `76.880250`
  - mean weighted KL `0.088745`
- new temperature-fixed champion:
  - model `query_residual_v11_covtrain_p0_b624_t100`
  - policy `coverage`
  - combined across splits `0..5`
  - `240` evaluated seeds
  - mean score `79.386735`
  - mean weighted KL `0.077956`
- combined delta vs prior calibrated coverage champion:
  - score `+2.506485`
  - weighted KL `-0.010789`

### 2026-03-21T09:20Z

- Post-push continuation start after `5a49186`.
- Current state:
  - strongest validated champion is now temperature-fixed `query_residual_v11_covtrain_p0_b624_t100` with policy `coverage`
  - temperature was the dominant remaining calibration axis
- Next frontier:
  - fine local search around `temperature=1.00`
  - keep:
    - policy `coverage`
    - `prior_blend=0.0`
    - `beta=(6,24)`
  - use the stricter split protocol:
    - search `0,1`
    - validate `2,3`
    - holdout `4,5`

### 2026-03-21T09:30Z

- New session continuation.
- Re-read required docs:
  - `README.md`
  - `docs/game_facts.md`
  - `instructions/agent4.md`
  - `AGENTS.md`
- Checked worktree:
  - branch `agent4`
  - only dirty file at resume was this progress log
- Re-checked task tracking command:
  - `br list` still unavailable in this shell: `br: command not found`
- Re-checked current benchmark/artifact surface and serving code.
- Current scientific read:
  - the large `t100` win means prior calibration was still materially suboptimal
  - therefore the next high-value search is not arbitrary architecture churn
  - it is a controlled post-`t100` serving sweep around the remaining coupled calibration knobs
- Immediate next experiments:
  - inspect serving math around:
    - `temperature`
    - `prior_blend`
    - `beta_min`
    - `beta_scale`
    - `teacher_blend`
  - then run stricter split search without weakening validation:
    - search `0,1`
    - validate `2,3`
    - holdout `4,5`

### 2026-03-21T09:45Z

- User redirected priority explicitly:
  - stop treating `query_residual` as the main family
  - move into the handoff's intended grey-box teacher/student development path
- Re-read the rest of `instructions/agent4.md` with that change in mind.
- Key correction:
  - `query_residual` matches only the handoff's Phase C direct transcript baseline
  - it is not the core grey-box world-model family
- Therefore current highest-value new work is:
  - canonical replay event extraction
  - a real replay-derived local transition / hazard teacher
  - held-out evaluation for that teacher as a map-only regime-marginal prior

### 2026-03-21T10:05Z

- Implemented new replay event/transition foundation:
  - `src/astar/history/replay/events.py`
  - canonical cell-transition extraction
  - canonical settlement-event extraction
  - per-frame settlement graph snapshot extraction
  - transition feature stack helper for local replay-transition models
- Implemented new dataset builder:
  - `src/astar/history/datasets/teacher_events.py`
  - writes:
    - `cell_transitions.parquet`
    - `settlement_events.parquet`
    - `graph_snapshots.parquet`
- Implemented first actual grey-box teacher decoder:
  - `src/astar/teacher/dynamics/transition_teacher.py`
  - model name:
    - `gbx_transition_teacher_v1`
  - architecture:
    - replay-derived local transition model
    - per-round ridge-fitted multiclass next-cell coefficients
    - low-rank cross-round factorization + regime->coefficient map
    - multi-step Markov rollout decoder from initial map to year 50
    - regime-marginal prior via posterior predictive over training-round particles
- Wired teacher into held-out prior-only historical eval:
  - `src/astar/workflows/model_eval.py`
  - benchmark CLI choice added for historical benchmarks
- Added tests:
  - `tests/test_transition_teacher.py`
  - extended `tests/test_history_datasets.py`
  - extended `tests/test_historical_benchmark.py`
- Verification:
  - `uv run python -m py_compile ...` on new/edited files passed
  - `uv run pytest tests/test_history_datasets.py tests/test_transition_teacher.py tests/test_historical_benchmark.py -q`
    - `18 passed in 18.76s`
- Next:
  - run first full historical held-out benchmark for `gbx_transition_teacher`
  - inspect whether the initial local transition teacher is at least a viable family base
  - then iterate on:
    - dynamic local context features
    - regime factorization rank
    - live student / posterior path

### 2026-03-21T10:20Z

- Implemented benchmark parallelism for held-out rounds in `run_historical_benchmark(...)`:
  - new `jobs` argument
  - CLI support:
    - `astar run-historical-benchmark --jobs <n>`
  - current limitation by design:
    - parallel mode requires `--with-png none`
    - this keeps validation semantics unchanged while avoiding rework of visualization-side context passing
- Used `spawn` process context to avoid `fork()` warnings / deadlock risk from a multi-threaded parent.
- Added regression test:
  - `test_run_historical_benchmark_prior_mode_parallel_jobs`
- Verification:
  - `uv run pytest tests/test_historical_benchmark.py -q`
    - `13 passed`
  - parallel smoke after `spawn` change:
    - `uv run pytest tests/test_historical_benchmark.py::test_run_historical_benchmark_prior_mode_parallel_jobs -q`
    - `1 passed`

### 2026-03-21T10:25Z

- Started `gbx_transition_teacher` held-out benchmarks.
- Observed:
  - first serial runs were too slow and under-utilized hardware
  - switched to parallel fold execution with `jobs`
  - launched:
    - `tmp_gbx_transition_teacher_probe3_jobs3`
    - `dev_gbx_transition_teacher_prior1_jobs8`
  - then killed the full `jobs=8` run to free workers for the 3-round probe first
- Current benchmark status at log time:
  - `tmp_gbx_transition_teacher_probe3_jobs3` still running
  - no score artifact written yet
- Interpretation:
  - the new grey-box teacher path is now real and benchmarkable
  - next bottlenecks are no longer “missing family implementation”
  - they are:
    - runtime cost of transition-teacher held-out fits
    - model quality of the first local-transition decoder

### 2026-03-21T10:43Z

- Extended the first grey-box teacher into a stronger prior variant:
  - new model alias:
    - `gbx_transition_teacher_mapprior_v1`
  - files:
    - `src/astar/teacher/dynamics/transition_teacher.py`
    - `src/astar/workflows/model_eval.py`
    - `src/astar/cli.py`
    - `tests/test_transition_teacher.py`
    - `tests/test_historical_benchmark.py`
- Main additions:
  - map-only round summary features from the five visible seed maps
  - ridge map-summary -> regime prediction
  - nearest-neighbor regime particle posterior around that map prior
  - scoped checkpoint caching keyed by training-round set
  - rollout speedup by precomputing static feature stacks once per seed
- Why this matters:
  - handoff requires map-only prior baseline before more complex online student work
  - cached fits remove repeated retraining cost from held-out replay benchmarks
  - map-conditioned prior is a scientifically cleaner prior than uniform training-round averaging
- Verification:
  - `uv run python -m py_compile src/astar/cli.py src/astar/teacher/dynamics/transition_teacher.py src/astar/workflows/model_eval.py tests/test_historical_benchmark.py tests/test_transition_teacher.py`
    - passed
  - `uv run pytest tests/test_transition_teacher.py tests/test_historical_benchmark.py -q`
    - `18 passed in 24.00s`
- Next:
  - commit + push this mapprior/cache patch
  - restart grey-box benchmarks on the cached path
  - run heavier parallel held-out probes for:
    - `gbx_transition_teacher`
    - `gbx_transition_teacher_mapprior`

### 2026-03-21T11:05Z

- Added a new grey-box family baseline:
  - `gbx_prior_maponly_bucket_v1`
  - files:
    - `src/astar/history/summaries/map_summary.py`
    - `src/astar/student/predictor/gbx_map_prior.py`
    - `src/astar/student/predictor/interactive.py`
    - `src/astar/workflows/model_eval.py`
    - `src/astar/cli.py`
    - `tests/test_historical_benchmark.py`
- Model idea:
  - use only the five visible initial maps
  - compute round-level map summary
  - choose nearest historical rounds in map-summary space
  - form weighted per-round bucket priors
  - decode final per-cell class probabilities with the same terrain/structural/full shrinkage stack as the historical bucket baseline
- Why:
  - this is the handoff's mandatory map-only terminal predictor class
  - it is live-legal
  - it is very fast, so it can be swept aggressively
- Verification:
  - `uv run python -m py_compile src/astar/history/summaries/map_summary.py src/astar/student/predictor/gbx_map_prior.py src/astar/student/predictor/interactive.py src/astar/teacher/dynamics/transition_teacher.py src/astar/workflows/model_eval.py src/astar/cli.py tests/test_historical_benchmark.py`
    - passed
  - `uv run pytest tests/test_historical_benchmark.py -q`
    - `15 passed in 23.40s`
- First benchmark results:
  - `tmp_gbx_prior_maponly_bucket_probe3_jobs3`
    - mean score `52.9048`
    - mean weighted KL `0.313887`
  - `dev_gbx_prior_maponly_bucket_prior1_jobs8`
    - mean score `66.3208`
    - mean weighted KL `0.141605`
  - matched comparator:
    - `dev_historical_bucket_prior_prior1_jobs8`
    - mean score `66.0233`
    - mean weighted KL `0.148488`
- Interpretation:
  - round-map conditioning does help over the older unconditioned bucket prior
  - gain is small
  - this family is useful as a fast prior / ensemble member, not as a standalone winner yet

### 2026-03-21T11:12Z

- Wired the semimechanistic event-hazard family into held-out benchmark eval:
  - `hazard_teacher_v1`
  - new map-conditioned variant:
    - `hazard_teacher_mapprior_v1`
- Files:
  - `src/astar/teacher/dynamics/hazard_teacher.py`
  - `src/astar/workflows/model_eval.py`
  - `src/astar/cli.py`
  - `tests/test_historical_benchmark.py`
- Main additions:
  - map-summary -> regime prior for `HazardTeacher`
  - map-posterior particle selection like the transition teacher path
  - historical benchmark model wiring for both hazard-teacher priors
- Verification:
  - `uv run python -m py_compile src/astar/teacher/dynamics/hazard_teacher.py src/astar/workflows/model_eval.py src/astar/cli.py tests/test_historical_benchmark.py`
    - passed
  - `uv run pytest tests/test_historical_benchmark.py -q`
    - `17 passed in 26.48s`
- Running now:
  - `tmp_gbx_transition_teacher_mapprior_probe3_jobs3_cached`
  - `dev_gbx_transition_teacher_mapprior_prior1_jobs8`
  - `tmp_hazard_teacher_mapprior_probe3_jobs3`
  - `dev_hazard_teacher_mapprior_prior1_jobs8`
  - bucket hyperparameter sweep over:
    - `neighbor_count in {1,2,3,5}`
    - shrinkage tuples:
      - `(16,8,4)`
      - `(32,12,6)`
      - `(64,24,12)`
      - `(96,32,16)`

### 2026-03-21T11:20Z

- First explicit event-hazard probe completed:
  - `tmp_hazard_teacher_mapprior_probe3_jobs3`
  - mean score `42.2922`
  - mean weighted KL `0.468442`
  - runtime `49.974s`
- Interpretation:
  - current semimechanistic hazard decoder is far too weak as a standalone prior
  - the 3-round probe is bad enough that the full 8-round hazard-mapprior run is not worth continuing
- Action:
  - killed `dev_hazard_teacher_mapprior_prior1_jobs8`
  - kept running:
    - `tmp_gbx_transition_teacher_mapprior_probe3_jobs3_cached`
    - `dev_gbx_transition_teacher_mapprior_prior1_jobs8`
    - map-only bucket sweep

### 2026-03-21T11:32Z

- Re-read `instructions/agent4.md` again after user pushback:
  - keep moving deeper into the handoff family
  - stop treating existing baselines as the main path
  - use machine capacity more aggressively, but check machine health first
- Machine-health check before next launch batch:
  - `nproc` -> `384`
  - `free -h` -> about `2.9 TiB` RAM total, about `21 GiB` used, about `2.9 TiB` available
  - observed only light competing load relative to machine capacity
  - conclusion:
    - `jobs=8` full held-out benchmark concurrency is safe
    - multiple benchmark families can run in parallel without RAM pressure
- Re-checked `br list`:
  - still unavailable: `br: command not found`

### 2026-03-21T11:40Z

- Implemented next handoff step after local-only transition teacher:
  - graph-aware transition teacher family
  - new model names:
    - `gbx_transition_teacher_graph_v1`
    - `gbx_transition_teacher_graph_mapprior_v1`
- Main code changes:
  - `src/astar/history/replay/events.py`
    - added dynamic graph-influence feature stack
    - features:
      - settlement influence
      - port influence
      - occupied influence
      - ruin influence
  - `src/astar/teacher/dynamics/transition_teacher.py`
    - variant-scoped checkpoints by model name
    - optional graph feature inclusion in fit + rollout
    - old checkpoint compatibility preserved with default `include_graph_features=False`
  - `src/astar/workflows/model_eval.py`
    - benchmark wiring for graph + graph-mapprior variants
  - `src/astar/cli.py`
    - CLI exposure for graph variants
  - tests:
    - `tests/test_transition_teacher.py`
    - `tests/test_historical_benchmark.py`
- Verification:
  - first pass failed due `_fit_round_coefficients` still being a classmethod after the graph flag change
  - fixed immediately by converting it to an instance method
  - final verification:
    - `uv run pytest tests/test_transition_teacher.py tests/test_historical_benchmark.py -q`
    - `25 passed in 17.17s`
- Active benchmark batch now:
  - base transition teacher:
    - `tmp_gbx_transition_teacher_mapprior_probe3_jobs3_rerun1`
    - `dev_gbx_transition_teacher_mapprior_prior1_jobs8_rerun1`
  - graph transition teacher:
    - `tmp_gbx_transition_teacher_graph_mapprior_probe3_jobs3_v1`
    - `dev_gbx_transition_teacher_graph_mapprior_prior1_jobs8_v1`

### 2026-03-21T11:59Z

- Added the next explicit handoff hypotheses into the transition-teacher line:
  - phase-conditioned dynamics
  - global-state/common-shock proxy features
- New transition-teacher variants added:
  - `gbx_transition_teacher_phase_v1`
  - `gbx_transition_teacher_phase_mapprior_v1`
  - `gbx_transition_teacher_graph_phase_v1`
  - `gbx_transition_teacher_graph_phase_mapprior_v1`
  - `gbx_transition_teacher_graph_phase_global_v1`
  - `gbx_transition_teacher_graph_phase_global_mapprior_v1`
- Main code changes:
  - `src/astar/history/replay/events.py`
    - added smooth cubic phase basis features
    - added global class-ratio features
    - extended transition feature stack builder with phase/global switches
  - `src/astar/teacher/dynamics/transition_teacher.py`
    - checkpoint support for `include_phase_features` and `include_global_features`
    - fit path now conditions transition coefficients on replay step / horizon
    - rollout path now conditions yearly transitions on rollout phase and current global class mix
  - `src/astar/workflows/model_eval.py`
    - added benchmark wiring for all new transition-teacher variants
  - `src/astar/cli.py`
    - exposed the new variants in visualization + historical benchmark CLI choices
  - tests:
    - `tests/test_transition_teacher.py`
    - `tests/test_historical_benchmark.py`
- Verification:
  - `uv run pytest tests/test_transition_teacher.py tests/test_historical_benchmark.py -q`
  - result: `31 passed in 33.94s`
- Current machine-health check before launching the next sweep:
  - `free -h` -> about `2.9 TiB` total, `1.1 TiB` used, `1.8 TiB` available
  - the targeted coefficient-cache precompute is still actively computing with 6 workers near 100% CPU each
  - still enough headroom to launch several 3-round probes in parallel

### 2026-03-21T12:12Z

- Pushed the phase/global branch:
  - commit `1fe21c2`
  - message: `Add phase/global transition teacher variants`
- Launched parallel 3-round prior-only probes on the key replay rounds
  - `36e581f1-73f8-453f-ab98-cbe3052b701b`
  - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
  - `c5cdf100-a876-4fb7-b5d8-757162c97989`
- Active probe batch:
  - `tmp_gbx_transition_teacher_mapprior_probe3_jobs3_v2`
  - `tmp_gbx_transition_teacher_graph_mapprior_probe3_jobs3_v2`
  - `tmp_gbx_transition_teacher_phase_mapprior_probe3_jobs3_v1`
  - `tmp_gbx_transition_teacher_graph_phase_mapprior_probe3_jobs3_v1`
  - `tmp_gbx_transition_teacher_graph_phase_global_mapprior_probe3_jobs3_v1`
- Also launched a broad coefficient-cache precompute for the new variants across all replay-backed historical rounds:
  - `gbx_transition_teacher_phase_v1`
  - `gbx_transition_teacher_graph_phase_v1`
  - `gbx_transition_teacher_graph_phase_global_v1`
- First durable filesystem signal after launch:
  - base 3-round caches now exist for
    - `gbx_transition_teacher_v1`
    - `gbx_transition_teacher_graph_v1`
  - on rounds
    - `36e581f1-73f8-453f-ab98-cbe3052b701b`
    - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
    - `c5cdf100-a876-4fb7-b5d8-757162c97989`
- Machine state remained acceptable after the launch:
  - `free -h` stayed around `1.7 TiB` available
  - no need to throttle parallelism yet

### 2026-03-21T12:48Z

- Cached 3-round probe reruns made the transition-teacher verdict clear:
  - `tmp_gbx_transition_teacher_mapprior_probe3_jobs3_cached_v3`
    - mean score `4.4032`
    - mean weighted KL `1.103593`
  - `tmp_gbx_transition_teacher_graph_mapprior_probe3_jobs3_cached_v3`
    - mean score `4.4060`
    - mean weighted KL `1.103454`
- Interpretation:
  - the monolithic rollout decoder is fundamentally wrong, not just under-tuned
  - graph features do almost nothing
  - predicted class mass collapses toward a diffuse near-equilibrium over all 6 classes instead of preserving the strong empty/forest dominance seen in truth
  - this transition-family line should not be treated as a candidate live prior in its current form
- Action taken:
  - killed the stale uncached 3-round probe batch once caches existed
  - kept the broad phase/global coefficient-cache fanout running for science support / possible later reuse
- Implemented a new direct terminal-law branch instead of unstable 50-step rollout:
  - `src/astar/teacher/dynamics/terminal_teacher.py`
  - model names:
    - `gbx_terminal_regime_teacher_v1`
    - `gbx_terminal_regime_teacher_mapprior_v1`
  - structure:
    - predict final tensor directly from static per-cell map features
    - condition coefficients on replay-derived round-regime vector
    - map-only prior over regime via round-map summary
    - no iterative rollout
- Wiring + tests added:
  - `src/astar/workflows/model_eval.py`
  - `src/astar/cli.py`
  - `tests/test_terminal_teacher.py`
  - `tests/test_historical_benchmark.py`
  - verification:
    - `uv run pytest tests/test_terminal_teacher.py tests/test_historical_benchmark.py -q`
    - `22 passed in 47.14s`
- First 3-round direct-terminal benchmark:
  - `tmp_gbx_terminal_regime_teacher_mapprior_probe3_jobs3_v1`
  - mean score `27.6683`
  - mean weighted KL `0.751953`
- Interpretation of direct-terminal result:
  - massive improvement over the broken rollout teacher (`27.7` vs `4.4`)
  - still far below the stronger map-only prior family (`~66`)
  - failure is now much narrower:
    - the direct objective helps a lot
    - but the current regime prior / linear direct decoder is still not competitive enough
  - next likely move:
    - residualize the direct regime teacher against `gbx_prior_maponly_bucket` instead of predicting absolute terminal logits from scratch

### 2026-03-21T13:16Z

- Implemented that residualized direct-terminal branch:
  - `src/astar/teacher/dynamics/terminal_teacher.py`
    - added residual variants
      - `gbx_terminal_regime_residual_teacher_v1`
      - `gbx_terminal_regime_residual_teacher_mapprior_v1`
    - coefficient fitting can now target log-probability residuals vs a provided base prior
    - serving path now supports adding the decoded residual logits back onto the base prediction
  - `src/astar/workflows/model_eval.py`
    - added benchmark wiring for the residual terminal variants
    - training-time residual rows use leave-one-out `gbx_prior_maponly_bucket` support rounds when possible
    - two-round test fallback uses full support set so the tiny test fixture still works
  - `src/astar/cli.py`
    - exposed residual terminal variants in CLI choices
  - tests:
    - `tests/test_terminal_teacher.py`
    - `tests/test_historical_benchmark.py`
- Verification after residual-teacher patch:
  - `uv run pytest tests/test_terminal_teacher.py tests/test_historical_benchmark.py -q`
  - result: `24 passed in 41.33s`
- Residual 3-round benchmark:
  - `tmp_gbx_terminal_regime_residual_teacher_mapprior_probe3_jobs3_v1`
  - mean score `22.5158`
  - mean weighted KL `0.762824`
- Interpretation:
  - residualization against `gbx_prior_maponly_bucket` did **not** help
  - direct terminal teacher remains better than residual terminal teacher
  - likely failure point is not missing base logits alone; it is weak round-law inference / interpolation

### 2026-03-21T13:23Z

- Refreshed machine-health / concurrency check before next branch:
  - `free -h`
    - `2.9 TiB` total
    - `735 GiB` used
    - `2.2 TiB` available
  - `nproc` -> `384`
  - `uptime` load average -> about `89 / 71 / 67`
- Interpretation:
  - cluster box is CPU-busy from many agents, but memory headroom is still enormous
  - safe to keep using medium/high parallelism, but no need to flood all cores from this worktree
- Observed other active runs on the host:
  - agent7 is probing `ffam_mode_v1..v6`
  - agent2 is running `smh_coeffbank_*`
- Current agent4 reading:
  - do not spend more time on rollout transition variants unless a new decoder idea appears
  - next science target should be better map-summary -> round-law inference for the direct terminal family

### 2026-03-21T13:38Z

- Added two new direct-terminal serving variants aimed at the actual weak point:
  - `gbx_terminal_regime_mapknn_teacher_v1`
    - uses map-summary nearest neighbors directly as the regime posterior particle set
    - avoids the crude global linear `map_summary -> regime` map at serving time
  - `gbx_terminal_regime_mapllr_teacher_v1`
    - uses local linear regression from nearby map summaries to the regime mean
    - still keeps the same historical neighbor particles for posterior averaging
- Main code changes:
  - `src/astar/teacher/dynamics/terminal_teacher.py`
    - stores training `map_bank`
    - persists `map_posterior_mode`
    - supports `regime_space_knn`, `map_summary_knn`, `map_summary_local_linear`
  - `src/astar/workflows/model_eval.py`
    - benchmark/model wiring for the two new terminal variants
    - serving-time neighbor count override set to `5` for both new modes
  - `src/astar/cli.py`
    - exposed the new model names in visual + historical benchmark CLI choices
  - tests:
    - `tests/test_terminal_teacher.py`
    - `tests/test_historical_benchmark.py`
- Verification:
  - `uv run pytest tests/test_terminal_teacher.py tests/test_historical_benchmark.py -q`
  - result: `27 passed in 44.10s`
- Next immediate step:
  - benchmark `mapknn` vs `mapllr` on the same 3 hard replay-backed rounds before expanding to full 8-round runs

### 2026-03-21T13:44Z

- Ran a direct offline LOO science probe on the 8 replay+analysis rounds to compare map-summary inference rules for the terminal family.
- Result:
  - old global linear map:
    - `map_summary -> regime` LOO MSE: `0.01248`
    - `map_summary -> coefficient_vector` LOO MSE: `0.11168`
  - direct map-summary kNN:
    - `k=2`: regime `0.00707`, coeff `0.05005`
    - `k=4`: regime `0.00645`, coeff `0.04924`
    - `k=5`: regime `0.00650`, coeff `0.04752`
    - `k=6`: regime `0.00689`, coeff `0.04718`
- Interpretation:
  - local map-summary neighbors are dramatically better than the old global linear map for held-out round-law recovery
  - this strongly justifies the new `mapknn` serving branch
  - `mapllr` is still worth one probe, but it is no longer the main candidate
- Launched benchmark probes:
  - `tmp_gbx_terminal_regime_mapknn_teacher_probe3_jobs3_v1`
  - `tmp_gbx_terminal_regime_mapllr_teacher_probe3_jobs3_v1`

### 2026-03-21T13:52Z

- The 3-round probe result for the new serving modes was effectively inconclusive:
  - `tmp_gbx_terminal_regime_mapknn_teacher_probe3_jobs3_v1`
    - mean score `27.5629`
    - mean weighted KL `0.752910`
  - `tmp_gbx_terminal_regime_mapllr_teacher_probe3_jobs3_v1`
    - mean score `27.5629`
    - mean weighted KL `0.752910`
- Why inconclusive:
  - each held-out fold in that 3-round benchmark only has `2` support rounds
  - with so little support, the old regime-space posterior and the new map-summary local variants collapse toward nearly the same behavior
- Extra local-linear science check on full 8-round LOO:
  - `map_summary local_linear -> regime`:
    - `k=2`: `0.00708`
    - `k=3`: `0.01811`
    - `k=4`: `0.01559`
    - `k=5`: `0.01709`
    - `k=6`: `0.01985`
- Interpretation:
  - if local-linear helps at all, it likely needs a very tight neighborhood (`k=2`)
  - current `mapknn` remains the strongest evidence-backed branch
- Launched the real held-out test across all analyzed rounds in parallel:
  - `dev_gbx_terminal_regime_teacher_mapprior_jobs8_v1`
  - `dev_gbx_terminal_regime_mapknn_teacher_jobs8_v1`
  - `dev_gbx_terminal_regime_mapllr_teacher_jobs8_v1`
- Runtime check after launch:
  - each benchmark has 8 live multiprocessing workers
  - machine still has abundant RAM headroom; no throttling needed

### 2026-03-21T14:00Z

- Added the first explicit ensemble/calibration branch from the handoff:
  - convex blend of `gbx_prior_maponly_bucket` with the terminal family
- New benchmarkable variants:
  - `gbx_maponly_terminal_mapprior_blend10`
  - `gbx_maponly_terminal_mapprior_blend20`
  - `gbx_maponly_terminal_mapknn_blend10`
  - `gbx_maponly_terminal_mapknn_blend20`
- Main code changes:
  - `src/astar/workflows/model_eval.py`
    - added recursive bundle blending helper logic inside model selection
    - current blend weights are terminal-teacher weights `0.10` and `0.20`
  - `src/astar/cli.py`
    - exposed the new blend model names
  - `tests/test_historical_benchmark.py`
    - added smoke test for `gbx_maponly_terminal_mapknn_blend10`
- Verification:
  - `uv run pytest tests/test_historical_benchmark.py::test_gbx_maponly_terminal_mapknn_blend10_historical_benchmark_runs -q`
  - result: `1 passed in 2.74s`
- Launched additional full 8-round held-out runs in parallel:
  - `dev_gbx_maponly_terminal_mapknn_blend10_jobs8_v1`
  - `dev_gbx_maponly_terminal_mapknn_blend20_jobs8_v1`

### 2026-03-21T14:11Z

- Full 8-round held-out terminal-family results are now in:
  - old direct mapprior terminal:
    - `dev_gbx_terminal_regime_teacher_mapprior_jobs8_v1`
    - mean score `41.1294`
    - mean weighted KL `0.335720`
  - new map-summary local terminal:
    - `dev_gbx_terminal_regime_mapknn_teacher_jobs8_v1`
    - mean score `43.3332`
    - mean weighted KL `0.320569`
  - local-linear variant:
    - `dev_gbx_terminal_regime_mapllr_teacher_jobs8_v1`
    - mean score `43.3332`
    - mean weighted KL `0.320569`
- Paired comparison:
  - baseline `gbx_terminal_regime_teacher_mapprior`
  - candidate `gbx_terminal_regime_mapknn_teacher`
  - artifact:
    - `data/artifacts/comparisons/historical__mode=prior_only__baseline=gbx_terminal_regime_teacher_mapprior__candidate=gbx_terminal_regime_mapknn_teacher.md`
  - delta:
    - score `+2.2038`
    - weighted KL `-0.015151`
    - win rate `0.875`
  - caveat:
    - the candidate loses heavily on round `36e581f1-73f8-453f-ab98-cbe3052b701b`
    - the gain comes from strong wins on several other rounds, especially `71451d74-...`
- Interpretation:
  - better map-summary posterior inference clearly matters
  - but the pure terminal family is still far below the stronger map-only prior family

### 2026-03-21T14:14Z

- Full 8-round uniform ensemble results:
  - `dev_gbx_maponly_terminal_mapknn_blend10_jobs8_v1`
    - mean score `65.8403`
    - mean weighted KL `0.145416`
  - `dev_gbx_maponly_terminal_mapknn_blend20_jobs8_v1`
    - mean score `64.8240`
    - mean weighted KL `0.152532`
- Comparison vs existing map-only prior baseline `dev_gbx_prior_maponly_bucket_prior1_jobs8`:
  - baseline map-only:
    - mean score `66.3208`
    - mean weighted KL `0.141605`
  - paired compare for `blend10`:
    - score delta `-0.4806`
    - weighted KL delta `+0.003812`
    - artifact:
      - `data/artifacts/comparisons/historical__mode=prior_only__baseline=gbx_prior_maponly_bucket__candidate=gbx_maponly_terminal_mapknn_blend10.md`
  - `blend20` is clearly worse than `blend10` on mean metrics alone
- Compare-tool caveat:
  - second paired compare for `blend20` hit a DuckDB catalog lock:
    - `_duckdb.IOException` on `data/catalog.duckdb`
  - this is a catalog logging conflict, not a benchmark correctness issue
- Interpretation:
  - uniform blending is not enough
  - next best idea is entropy-gated selective blending so the terminal model only influences uncertain cells

### 2026-03-21T14:15Z

- Added and launched the next selective ensemble branch:
  - new models:
    - `gbx_maponly_terminal_mapknn_entropyblend25`
    - `gbx_maponly_terminal_mapknn_entropyblend50`
  - mechanism:
    - terminal weight is scaled per-cell by normalized entropy of the map-only prior
  - verification:
    - `uv run pytest tests/test_historical_benchmark.py::test_gbx_maponly_terminal_mapknn_entropyblend25_historical_benchmark_runs -q`
    - result: `1 passed in 2.09s`
  - active full 8-round runs:
    - `dev_gbx_maponly_terminal_mapknn_entropyblend25_jobs8_v1`
    - `dev_gbx_maponly_terminal_mapknn_entropyblend50_jobs8_v1`

### 2026-03-21T14:21Z

- Entropy-gated whole-distribution blends finished:
  - `dev_gbx_maponly_terminal_mapknn_entropyblend25_jobs8_v1`
    - mean score `65.8443`
    - mean weighted KL `0.145533`
  - `dev_gbx_maponly_terminal_mapknn_entropyblend50_jobs8_v1`
    - mean score `64.3333`
    - mean weighted KL `0.155457`
- Interpretation:
  - entropy gating does not materially improve on uniform `blend10`
  - larger entropy-gated terminal weight is clearly harmful
  - whole-distribution blending now looks exhausted for this terminal branch

### 2026-03-21T14:23Z

- Added a more surgical ensemble variant:
  - keep the map-only prior's total dynamic mass
  - use the terminal teacher only to redistribute that mass among classes `settlement/port/ruin/forest`
- New models:
  - `gbx_maponly_terminal_mapknn_dynblend50`
  - `gbx_maponly_terminal_mapknn_dynblend100`
- Verification:
  - `uv run pytest tests/test_historical_benchmark.py::test_gbx_maponly_terminal_mapknn_dynblend50_historical_benchmark_runs -q`
  - result: `1 passed in 1.14s`
- Active full 8-round held-out runs:
  - `dev_gbx_maponly_terminal_mapknn_dynblend50_jobs8_v1`
  - `dev_gbx_maponly_terminal_mapknn_dynblend100_jobs8_v1`

### 2026-03-21T14:27Z

- Dynamic-subspace blend results are in:
  - `dev_gbx_maponly_terminal_mapknn_dynblend50_jobs8_v1`
    - mean score `64.0344`
    - mean weighted KL `0.155575`
  - `dev_gbx_maponly_terminal_mapknn_dynblend100_jobs8_v1`
    - mean score `53.1484`
    - mean weighted KL `0.226181`
- Combined conclusion for the terminal-ensemble sweep:
  - pure terminal improved materially with map-summary local serving
    - best pure terminal: `43.3332 / 0.320569`
  - but every ensemble attempt still lost to the strong map-only prior baseline
    - map-only baseline remains `66.3208 / 0.141605`
  - variants tested and rejected:
    - uniform blend `10%`, `20%`
    - entropy-gated blend `25%`, `50%`
    - dynamic-subspace blend `50%`, `100%`
- Current scientific read:
  - the terminal teacher does carry some real round-law information
  - but its calibration/composition errors are too large for simple ensembling tricks to turn it into the best prior
  - this terminal-family branch is now reasonably exhausted for cheap next-step variants
  - next productive branch should move away from terminal-only correction and back toward a different grey-box teacher/student design

### 2026-03-21T11:39Z

- Re-read `instructions/agent4.md`, `README.md`, and `docs/game_facts.md`, then checked current box health before scaling out.
  - load roughly `43-48`
  - memory free roughly `1.9 TiB`
  - other agents are using CPU, not materially constraining RAM
- Confirmed local replay-backed analyzed-round set is now `8`, not `4`:
  - `36e581f1-73f8-453f-ab98-cbe3052b701b`
  - `71451d74-be9f-471f-aacd-a41f3b68a9cd`
  - `76909e29-f664-4b2f-b16b-61b7507277e9`
  - `8e839974-b13b-407b-a5e7-fc749d877195`
  - `ae78003a-4efe-425a-881a-d16a39bca0ad`
  - `c5cdf100-a876-4fb7-b5d8-757162c97989`
  - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
  - `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
- New development branch added in `src/astar/student/predictor/interactive.py`:
  - `gbx_maponly_transcriptregime_mapknn_blend20`
  - `gbx_maponly_transcriptregime_mapknn_blend30`
  - `gbx_maponly_transcriptregime_mapknn_blend40`
  - `gbx_maponly_transcriptregime_mapknn_blend50`
  - `gbx_maponly_transcriptregime_mapknn_blend60`
- Mechanism:
  - base predictor is `gbx_prior_maponly_bucket`
  - residual online student is `gbx_transcript_regime_knn_terminal_mapknn`
  - final prediction is convex blend of the two full terminal distributions with probability-floor re-normalization
- This is the first actual online serving implementation of the partial-eval result found earlier:
  - raw transcript-regime student alone was weak
  - but convex blending over the strong map prior gave a large partial lift on the ready held-outs
  - so the right next step is not more raw-student tuning first; it is end-to-end validation of the blend family
- CLI exposure added in `src/astar/cli.py` for:
  - historical benchmark
  - synthetic tournament
  - synthetic benchmark
  - live online
- Verification passed:
  - `uv run python -m py_compile src/astar/student/predictor/interactive.py tests/test_historical_benchmark.py src/astar/cli.py`
  - `uv run pytest tests/test_historical_benchmark.py::test_gbx_maponly_transcriptregime_mapknn_blend50_online_historical_benchmark_runs tests/test_historical_benchmark.py::test_gbx_transcript_regime_knn_terminal_mapknn_online_historical_benchmark_runs tests/test_historical_benchmark.py::test_gbx_transcript_regime_scoped_checkpoint_reuse tests/test_historical_benchmark.py::test_gbx_transcript_regime_accepts_canonical_exploration_policy_name -q`
  - result: `4 passed`
- Runtime step in progress:
  - prewarming `gbx_transcript_regime_knn_terminal_mapknn` fold checkpoints on all `8` replay-backed rounds for both `coverage` and `exploration_v2`
  - reason: avoid concurrent fold-fit races when launching many alpha-sweep historical benchmarks in parallel

### 2026-03-21T11:48Z

- Added scoped checkpoint locking for transcript-regime student builds in `src/astar/student/predictor/interactive.py`.
  - problem:
    - once the new blend family existed, the natural next step was many parallel 8-round benchmarks
    - without a lock, many workers could try to write the same fold checkpoint at once
  - fix:
    - `checkpoint.json.lock` guard with recheck/wait loop around transcript predictor fit/save
  - this is a real infrastructure improvement for high-parallelism exploration, not model-specific glue
- Used the new lock path to switch from a bad serial prewarm to aggressive fold-parallel prewarm.
  - after cleanup of one stale interrupted dataset lock, all `16/16` transcript fold checkpoints were populated:
    - `8` held-out folds for `coverage`
    - `8` held-out folds for `exploration_v2`
- Verified current box state while scaling up:
  - load around `50-56`
  - available RAM around `1.6-1.7 TiB`
  - still plenty of headroom for parallel historical sweeps
- Small CLI wiring miss found and fixed:
  - `run-historical-benchmark` parser list initially omitted the new blend model names even though the predictor implementation existed
  - patched `src/astar/cli.py`
- Small policy-interface fact confirmed:
  - historical benchmark CLI accepts `exploration`, not canonical label `exploration_v2`
  - predictor internals still resolve that to `exploration_v2` where needed
- Active experiment state after infrastructure setup:
  - baseline 8-round coverage online artifact already exists:
    - `dev_gbx_prior_maponly_bucket_online_cov_seed02_jobs8_v1`
    - mean score `66.320826`
    - mean weighted KL `0.141605`
    - evaluated seeds `120`
  - active runs now:
    - full 8-round `coverage` alpha sweep for:
      - `blend20`
      - `blend30`
      - `blend40`
      - `blend50`
      - `blend60`
    - one single-process `blend50` debug benchmark to get the first finished end-to-end artifact as soon as possible

### 2026-03-21T12:02Z

- Full 8-round, 3-episode-seed sweep finished for the new online transcript-regime blend family.
- Coverage policy results, all on:
  - `mode=online_interactive`
  - `policy=coverage`
  - `budget=50`
  - `samples_per_round=4`
  - `episode_seeds=0,1,2`
  - `evaluated_seeds=120`
- Baseline:
  - `dev_gbx_prior_maponly_bucket_online_cov_seed02_jobs8_v1`
  - score `66.320826`
  - weighted KL `0.141605`
- `mapknn` blend sweep:
  - `blend05`: `67.030274 / 0.137836`
  - `blend10`: `67.542060 / 0.135267`
  - `blend15`: `67.875563 / 0.133705`
  - `blend20`: `68.042288 / 0.133045`
  - `blend30`: `67.906326 / 0.134215`
  - `blend40`: `67.179212 / 0.138598`
  - `blend50`: `65.886313 / 0.146339`
  - `blend60`: `64.035880 / 0.157893`
- Scientific read from the full sweep:
  - the partial 2-held-out optimum near `0.5` was overfit and does not survive all `8` rounds
  - on the full local replay set, the useful transcript residual is real but must be weakly blended
  - best alpha is `0.20`
  - score/KL both degrade monotonically after `0.20`
- Strongest new model so far:
  - `gbx_maponly_transcriptregime_mapknn_blend20`
  - report:
    - `data/artifacts/benchmarks/dev_gbx_maponly_transcriptregime_mapknn_blend20_cov_seed02_jobs8_v1/report.md`
  - paired vs baseline:
    - comparison:
      - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seeds=0-1-2__baseline=gbx_prior_maponly_bucket__candidate=gbx_maponly_transcriptregime_mapknn_blend20.md`
    - score delta `+1.721461`
    - weighted KL delta `-0.008559`
    - win rate `0.650`
    - score CI95 `[1.0407, 2.3402]`
  - paired vs `blend15`:
    - comparison:
      - `data/artifacts/comparisons/historical__mode=online_interactive__policy=coverage__budget=50__episode_seeds=0-1-2__baseline=gbx_maponly_transcriptregime_mapknn_blend15__candidate=gbx_maponly_transcriptregime_mapknn_blend20.md`
    - score delta `+0.166725`
    - weighted KL delta `-0.000660`
    - score CI95 `[0.0394, 0.2983]`
- Exploration-policy robustness check on the top low-alpha candidates:
  - `blend10`: `67.379679 / 0.136213`
  - `blend15`: `67.669998 / 0.134881`
  - `blend20`: `67.814703 / 0.134328`
  - same ranking as coverage: `blend20 > blend15 > blend10`
  - direct paired manual compare coverage vs exploration for `blend20` over `120` paired seeds:
    - score delta `+0.227585` for coverage
    - weighted KL delta `-0.001283` for coverage
    - bootstrap CI95 for score delta `[0.0847, 0.3886]`
- Negative alternative residual-source probes at the winning alpha:
  - `gbx_maponly_transcriptregime_mapllr_blend20`: `66.179025 / 0.143797`
  - `gbx_maponly_transcriptregime_mapprior_blend20`: `66.318294 / 0.143270`
  - both are clearly below `mapknn blend20`
- Supporting infra/testing outcomes from this sweep:
  - added smoke coverage for alt blend aliases in `tests/test_historical_benchmark.py`
  - targeted verification:
    - `uv run pytest tests/test_historical_benchmark.py::test_gbx_maponly_transcriptregime_mapknn_blend50_online_historical_benchmark_runs tests/test_historical_benchmark.py::test_gbx_maponly_transcriptregime_alt_blends_build tests/test_historical_benchmark.py::test_gbx_transcript_regime_accepts_canonical_exploration_policy_name -q`
    - result: `3 passed`
- One remaining infra annoyance found:
  - `compare-historical-benchmarks` cross-policy artifact writing can hit `OSError: [Errno 36] File name too long` for long model names because the auto-generated comparison filename is too long
  - I worked around that with a direct paired-analysis script instead of spending the turn on filename-shortening plumbing
