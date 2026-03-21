# PROGRESS_AGENT5

## Objective

- Max local test-data score.
- Keep validation strict or improve it without degrading live relevance.
- Track all meaningful work here.
- Commit + push meaningful improvements to branch `agent5`.

## Repo Canon Read

- Read `README.md`.
- Read `docs/game_facts.md`.
- Read full `instructions/agent5.md`.

## Early Environment Facts

- CWD: `/home/jorge/agent5/tasks/astar`
- Branch: `agent5`
- Remote: `origin https://github.com/jorgensandhaug/ainm.git`
- Worktree initially appeared clean from `git status --short`.
- `br` command missing in current shell env (`/bin/bash: br: command not found`); need verify alternate invocation if task tracking required.
- AGENTS doc points at `/home/jorge/repos/ainm/tasks/astar/...` for canon docs, but actual usable canon files exist in current repo at `README.md` and `docs/game_facts.md`.

## Framework Map

- CLI entry: `src/astar/cli.py`
- Historical benchmark: `src/astar/workflows/historical_benchmark.py`
- Predictor registry: `src/astar/student/predictor/interactive.py`
- Artifact layout: `src/astar/infra/artifacts/paths.py`
- Current interactive predictors:
  - `geometry_prior`
  - `historical_bucket_prior`
  - `latent_regime`
  - `query_residual`
- Historical benchmark modes:
  - `prior_only`
  - `online_interactive`

## Existing Local Artifacts Noted

- 8-round historical benchmark outputs already present in `data/artifacts/benchmarks/`
- Existing model checkpoints:
  - `data/artifacts/models/historical_bucket_prior_v1/checkpoint.json`
  - `data/artifacts/models/hazard_teacher_v1/checkpoint.json`
  - `data/artifacts/models/summary_bank_student_v1/...`
- Replay manifold artifacts exist:
  - `data/artifacts/replays/manifold/round_regime_manifold_v1.{json,npz}`
- Synthetic/teacher datasets already materialized under `data/artifacts/datasets/`

## Existing Baseline Findings

- Best visible existing benchmark report inspected:
  - `data/artifacts/benchmarks/dev_query_residual_online50_v7/report.md`
- Reported metric:
  - mean score `73.9505`
  - mean weighted KL `0.106326`
  - rounds `8`
  - seeds `40`
- Weakest inspected round in that report:
  - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
  - round mean score `46.4143`
- v7 vs v5 comparison already present:
  - mean score delta `+0.2525`
  - mean weighted KL delta `-0.001154`
  - gain uneven by round

## Immediate Hypotheses

- Current best path is likely `query_residual`, not exposed teacher/student stack alone.
- Need identify what makes `f1dac...` hard.
- Need fresh reproducible baseline run in current workspace before edits.
- Validation may be improvable through stronger split protocol / targeted diagnostics, but must remain held-out-round faithful.

## Work Log

### 2026-03-20T00:00:00Z

- Started.
- Read canon docs + handoff.
- Mapped benchmark/model/artifact seams.
- Identified current strongest visible benchmark and likely target model family.
- Next:
  - verify task tracker access if possible
  - run fresh historical baseline
  - inspect hard-round behavior
  - decide minimal high-value model/validation changes

### 2026-03-20T23:00:00Z

- `br` verified unavailable in both `bash` and `zsh`; continuing with local file tracking here.
- Found critical local-validation bug:
  - `query_residual` failed in this checkout because synthetic-live dataset indices stored absolute `episode_path` values from another workspace root (`/home/jorge/repos/ainm/...`).
- Found second dataset bug:
  - legacy `synthetic_live_coverage_v1` only covers 6 rounds, but `query_residual` would still silently reuse it for 8-round training scope.
  - missing rounds: `36e581f1-73f8-453f-ab98-cbe3052b701b`, `c5cdf100-a876-4fb7-b5d8-757162c97989`.
- Implemented fixes:
  - synthetic-live artifact loader now resolves moved/stale paths against current workspace
  - synthetic-live dataset builder now writes portable relative `episode_path` values
  - `query_residual` now rejects incomplete cached/legacy synthetic datasets and rebuilds a scope-matching dataset instead
  - `SummaryBankStudent` updated to use same path-resolution behavior
- Added tests:
  - synthetic dataset writes portable relative episode paths
  - synthetic artifact loader resolves moved-workspace paths
  - historical benchmark with `query_residual` succeeds even if incomplete legacy `synthetic_live_coverage_v1` exists
- Verified:
  - `uv run --extra dev pytest tests/test_history_datasets.py -q` -> `4 passed`
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `5 passed`
- Notes:
  - full hard-round probe on held-out `f1dac...` triggered first-time build of the 8-round scoped synthetic dataset and was too slow for inline iteration; aborted after confirming this path now builds a richer scoped dataset instead of reusing stale legacy data.
  - sandbox blocked cleanup of the partial generated dataset dir via `rm -rf`; left uncommitted unless later intentionally kept.
- Immediate next:
  - commit + push this portability/validation fix
  - build scoped synthetic dataset intentionally
  - rerun targeted hard-round probes
  - test whether richer scoped dataset alone improves `query_residual`

### 2026-03-21T00:00:00Z

- Portability fix committed + pushed to `origin/agent5`.
- Added second validation/pipeline improvement:
  - `build_synthetic_live_dataset()` now skips `materialize_round_episode()` when required per-seed feature/evidence/replay-summary artifacts already exist.
  - reason: dataset rebuilds were wasting ~36.5s/round on rematerialization even when cached artifacts were already present.
- Verified rematerialization hotspot on `c5cdf...`:
  - `build_round_episode`: ~8.99s
  - `materialize_round_episode`: ~36.50s
  - `load_round_learning_episode`: ~0.04s
  - `run_online_episode`: ~0.02s
- Added test proving repeat synthetic dataset builds reuse existing materialized round artifacts instead of rewriting them.
- Re-verified tests after this change:
  - `uv run --extra dev pytest tests/test_history_datasets.py -q` -> `5 passed`
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `5 passed`
- Explicitly built full scoped 8-round synthetic transcript dataset:
  - `query_residual_synthetic_live__policy=coverage__samples=1__rounds=n=8__sha1=ea07400de1`
  - `row_count=8`
  - `round_count=8`
  - `total_query_count=360`
  - wall time `318.768s`
- Full-corpus held-out round probes with default `query_residual` + `coverage` + 7 training rounds:
  - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`: `54.5655`
    - old benchmark report: `46.4143`
    - delta: `+8.1512`
  - `c5cdf100-a876-4fb7-b5d8-757162c97989`: `67.0175`
    - old benchmark report: `71.1327`
    - delta: `-4.1152`
  - `36e581f1-73f8-453f-ab98-cbe3052b701b`: `64.4914`
    - old benchmark report: `63.9633`
    - delta: `+0.5281`
- Interpretation:
  - richer full-corpus transcript training clearly helps the hardest known round (`f1dac...`).
  - it hurts `c5cdf...`, so the effect is not uniformly positive.
  - across the 3 probed rounds, net round-score delta is still positive (`+4.5641` total; about `+0.57` if spread over the 8-round mean), but this is not enough evidence to freeze defaults yet.
- First actual model ablation after infra fixes:
  - `query_residual` with `ridge_lambda=16` on held-out `c5cdf...`
  - result: `67.1045` vs `67.0175` default
  - conclusion: only trivial recovery; `c5cdf...` regression is not mainly a weak-ridge problem.
- Current best next hypotheses:
  - richer transcript diversity (`samples_per_round > 1`) may help more than stronger ridge.
  - policy-conditioned transcript generation (`exploration` / repeat-aware) still needs probing.
  - may need smarter training-round selection or mixture logic rather than “always all 7 rounds”.

### 2026-03-21T01:00:00Z

- Verified replay diversity ceiling for current local test corpus:
  - most rounds have `58` replay runs per seed
  - `71451d74-be9f-471f-aacd-a41f3b68a9cd` has one seed with `59`
  - implication: `samples_per_round > 1` is real extra transcript diversity, not duplicate rollout noise.
- Finished full scoped 8-round `samples_per_round=4` coverage dataset build:
  - `query_residual_synthetic_live__policy=coverage__samples=4__rounds=n=8__sha1=ea07400de1`
  - `row_count=32`
  - `round_count=8`
  - `total_query_count=1440`
  - wall time `327.370s`
- Next immediate step:
  - run same held-out probes (`f1dac...`, `c5cdf...`, `36e581...`) with `samples_per_round=4`
  - compare directly against current `samples=1` scoped-dataset results

### 2026-03-21T07:00:00Z

- User clarified direction:
  - stop spending iteration budget mainly on `query_residual`
  - build genuinely new grey-box teacher/student model family members
  - use much more parallel experimentation / hardware
- Why `query_residual` happened first:
  - handoff explicitly required adapting to existing framework, running working end-to-end baselines, validating on held-out rounds, and continuing from current state.
  - that established trustworthy validation + fixed real local bugs, but it was only baseline/infra work.
- Parallel codebase recon done:
  - teacher/regime stack map
  - student/posterior stack map
  - conclusion: easiest benchmarkable new family is teacher/student online inference, not more residual tweaking.
- Implemented new benchmarkable grey-box predictors:
  - `greybox_regime_ridge_v01`
  - `greybox_regime_knn_v01`
- Design:
  - train `HazardTeacher` on held-in replay rounds
  - train transcript-to-regime posterior on legal synthetic transcripts from held-in rounds
  - transcript features reuse rich regime-oriented residual summaries rather than crude frequency counts
  - decode via hazard teacher
  - blend with historical bucket prior
  - enforce exact observed-cell evidence with count-based exact-cell blending
- Framework integration added:
  - online predictor registry
  - historical eval path
  - CLI model choices for synthetic / historical / live runs
  - held-out benchmark smoke tests for both new models
- Verification:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `7 passed`
  - `uv run --extra dev pytest tests/test_history_datasets.py -q` -> `5 passed`
- Immediate next:
  - run real held-out probes on local full corpus for both grey-box models
  - compare against `query_residual` and existing `latent_regime`
  - if promising, scale transcript sample count upward and run larger parallel ablations

### 2026-03-21T08:00:00Z

- New grey-box probe results on full local corpus, `policy=coverage`, `samples_per_round=4`, held-out rounds `{f1dac..., c5cdf..., 36e581...}`:

- `greybox_regime_knn_v01`
  - `f1dac...`: `51.2754`
  - `c5cdf...`: `77.1572`
  - `36e581...`: `45.8848`
  - interpretation:
    - strong on `c5cdf...`
    - too unstable; rejected as current lead

- `greybox_regime_ridge_v01`
  - default `prior_blend=0.25`
  - `f1dac...`: `53.5571`
  - `c5cdf...`: `78.7253`
  - `36e581...`: `49.7357`
  - interpretation:
    - strong new family signal
    - massive gain on `c5cdf...`
    - still too weak on `36e581...`

- Ridge prior-blend sweep:
  - `f1dac...`
    - best near `prior_blend=0.25` (`53.5571`)
  - `c5cdf...`
    - best near `prior_blend=0.35` (`79.1772`)
  - `36e581...`
    - monotonically improved up to `prior_blend=0.55` (`53.8911`)
  - Interpretation:
    - constant global blend is not enough
    - likely decoder generalization / confidence mismatch remains

### 2026-03-21T09:00:00Z

- Implemented third new grey-box family member:
  - `greybox_hazard_lowrank_v01`
- Design:
  - fit semimechanistic replay coefficients per held-in round
  - factorize them into low-rank round coordinates
  - learn transcript-to-coordinate regression on legal synthetic transcripts
  - decode reconstructed coefficient vector through `HazardTeacher`
  - blend with historical bucket prior + exact observed-cell evidence
- 3-round held-out probes, `policy=coverage`, `samples_per_round=4`, default `prior_blend=0.35`:
  - `f1dac...`: `57.3516`
  - `c5cdf...`: `78.5253`
  - `36e581...`: `64.6992`

### 2026-03-21T10:25:44Z

- Re-read full handoff plus canon docs again before continuing:
  - `README.md`
  - `docs/game_facts.md`
  - `instructions/agent5.md`
- Reconfirmed handoff intent:
  - `query_residual` was only baseline/infra bootstrap
  - main target remains grey-box teacher/student/policy family
  - highest-priority missing branches still include better teacher parameterization, direct student head, and stronger policy/validation protocols
- Machine-health snapshot before launching more work:
  - host `c4d-monster-01.c.ai-nm26osl-1706.internal`
  - RAM `2.9TiB total`, `2.0TiB available`
  - load averages `48.96 / 58.73 / 62.44` on `384` cores
  - plenty of safe headroom for more parallel experiments
- Checked competing machine usage:
  - other agents currently running several heavy teacher/student sweeps
  - notable large-memory jobs from `agent1` and `agent3`
  - still enough headroom that `4-16` worker historical benchmarks remain safe
- `br list` checked again and still unavailable in current env (`command not found`).
- Current local tree is dirty mainly from:
  - benchmark/dataset/replay artifact generation
  - unfinished local hook-up for `greybox_hybrid_lowrank_coefficientknn`
- Two full 8-round benchmarks still running from prior turn and need harvest before selecting next lead:
  - session `4989`: `greybox_hybrid_lowrank_queryres`, `policy=exploration_r3`, default weight `0.35`
  - session `11477`: `greybox_hybrid_lowrank_queryres_w45`, `policy=exploration_r3`, weight `0.45`
- Current working decision:
  - treat official historical benchmark as canonical selector
  - avoid more pure `query_residual` tuning
  - focus next on actual new grey-box family branches beyond current monolithic low-rank hazard decoder

### 2026-03-21T10:50:00Z

- Implemented new direct-head branch from handoff H9 / Phase 8:
  - `greybox_student_joint`
  - file: `src/astar/student/predictor/greybox_student_joint.py`
- Core design:
  - base predictor = `GreyboxHazardLowRankPredictor` with prior-heavier blend (`prior_blend=0.55`)
  - train legal transcript encoder on synthetic live episodes from held-in rounds only
  - target = round-shared delta-logit tensor between lowrank base prediction and historical ground truth
  - compress delta tensors with low-rank basis
  - regress transcript features -> residual-basis coordinates
  - inference = lowrank base + direct tensor correction + exact observed-cell re-imposition
- Reasoning:
  - this is not another pure residual-only baseline
  - it is the missing “joint student / direct tensor head” branch from the handoff
  - hypothesis: transcript evidence can explain low-dimensional cross-seed correction patterns the lowrank teacher misses
- Framework integration added:
  - online predictor registry
  - historical eval path
  - CLI model choices
  - historical benchmark smoke coverage in tests
- Verification:
  - `uv run python -m py_compile src/astar/student/predictor/greybox_student_joint.py src/astar/student/predictor/interactive.py src/astar/workflows/model_eval.py src/astar/cli.py src/astar/workflows/historical_benchmark.py tests/test_historical_benchmark.py`
    - passed
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
    - `16 passed in 49.59s`
- New targeted held-out probes launched with full 7-round training and 3 held-out rounds `{36e581..., c5cdf..., f1dac...}`:
  - `agent5_student_joint_probe3_default`
    - config: `samples=4`, `rank=6`, `ridge=8.0`, `correction_blend=0.85`, `correction_scale=0.75`
  - `agent5_student_joint_probe3_aggressive`
    - config: `samples=4`, `rank=8`, `ridge=6.0`, `correction_blend=1.0`, `correction_scale=1.0`
  - `agent5_student_joint_probe3_conservative`
    - config: `samples=4`, `rank=4`, `ridge=12.0`, `correction_blend=0.65`, `correction_scale=0.55`
- Probe outputs are set to write `result.json` under `data/artifacts/benchmarks/<name>/`.
- Commit/push checkpoint:
  - local commit: `f399d0bc` `[astar] add greybox joint student predictor`
  - pushed to `origin/agent5` via clean worktree as remote commit `b23848c5`

### 2026-03-21T10:55:00Z

- Harvested previously launched full 8-round `exploration_r3` historical benchmarks:
  - `agent5_hybrid_lowrank_queryres_explorationr3_online50_v03w35`
    - model `greybox_hybrid_lowrank_queryres`
    - policy `exploration_r3`
    - `samples=4`, `budget=50`, `episode_seed=0`
    - mean score `75.1931`
    - mean weighted KL `0.097798`
  - `agent5_hybrid_lowrank_queryres_w45_explorationr3_online50_v01`
    - model `greybox_hybrid_lowrank_queryres_w45`
    - policy `exploration_r3`
    - `samples=4`, `budget=50`, `episode_seed=0`
    - mean score `75.1356`
    - mean weighted KL `0.098000`
- Interpretation:
  - `exploration_r3` is now the best validated result in this branch so far.
  - New local lead:
    - `75.1931` vs prior coverage lead `74.9421`
    - delta `+0.2510`
  - `w35` remains slightly better than `w45` under `exploration_r3`.
  - immediate consequence: no need to keep exploring `coverage` vs `exploration_r3` for this exact hybrid family unless new model families change the posterior/query interaction materially.

### 2026-03-21T11:00:00Z

- Found prior already-materialized joint-student probe artifact:
  - `data/artifacts/benchmarks/agent5_student_joint_coverage_probe3_v01/`
- Result:
  - model `greybox_student_joint`
  - policy `coverage`
  - rounds `{36e581..., c5cdf..., f1dac...}`
  - mean score `37.9554`
  - mean weighted KL `0.395407`
  - per-round:
    - `36e581...`: `16.7019`
    - `c5cdf...`: `73.4436`
    - `f1dac...`: `23.7208`
- Interpretation:
  - naive/default joint direct-head branch is catastrophically overcorrecting.
  - only reason to continue this branch is if heavily shrunken correction variants recover most of the lowrank base and add a small gain.
  - ongoing custom ablations are therefore correctly focused on smaller correction strengths.

### 2026-03-21T10:45:00Z

- Implemented new direct student branch aligned with handoff Phase 8 / H9:
  - model family entry: `greybox_student_joint`
  - internal name: `greybox_student_joint_v01`
- Design:
  - fit existing `greybox_hazard_lowrank` predictor as teacher-backed base
  - build legal synthetic transcript prefixes from held-in rounds only
  - for each prefix, compute low-rank base prediction for the whole round
  - supervise a low-rank direct tensor head on the round-shared logit correction between base prediction and true final tensors
  - infer correction from transcript regime features + inferred low-rank coords + prediction summary stats
  - apply correction to the full 5-seed prediction tensor, then reapply exact observed-cell blending and probability floor
- Why this branch matters:
  - this is not another pure residual baseline
  - it directly targets the handoff requirement of a legal online student with both latent/teacher structure and a direct tensor head
  - correction is round-shared across all seeds, exploiting the shared hidden round parameters more explicitly than cellwise-only residual fitting
- Integrated:
  - predictor registry / online path
  - historical eval path
  - CLI choices
  - historical benchmark allowlist
  - smoke coverage in `tests/test_historical_benchmark.py`
- Verification:
  - `uv run python -m py_compile ...` for touched files passed
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` passed with `16 passed in 54.58s`
- In-flight evaluation:
  - 3-round held-out probe running:
    - benchmark `agent5_student_joint_coverage_probe3_v01`
    - rounds `{36e581..., c5cdf..., f1dac...}`
    - `policy=coverage`
    - `samples_per_round=4`
    - `budget=50`
    - session `19824`

### 2026-03-21T10:55:00Z

- Harvested prior in-flight full 8-round `exploration_r3` historical benchmarks:
  - `agent5_hybrid_lowrank_queryres_explorationr3_online50_v03w35`
    - model `greybox_hybrid_lowrank_queryres`
    - mean score `75.1931115`
    - mean weighted KL `0.09779810`
  - `agent5_hybrid_lowrank_queryres_w45_explorationr3_online50_v01`
    - model `greybox_hybrid_lowrank_queryres_w45`
    - mean score `75.1355846`
    - mean weighted KL `0.09799999`
- Interpretation:
  - both beat previous official coverage lead `74.9420879`
  - default low-rank weight `0.35` remains best of the two
  - current best visible official full-8 result in this workspace is now `exploration_r3 + greybox_hybrid_lowrank_queryres_v03`
- First direct-joint-student probe result:
  - benchmark `agent5_student_joint_coverage_probe3_v01`
  - mean score `37.9554`
  - mean weighted KL `0.395407`
  - per-round:
    - `36e581...`: `16.7019`
    - `c5cdf...`: `73.4436`
    - `f1dac...`: `23.7208`
- Conclusion from first joint-student default:
  - branch is directionally interesting only on `c5cdf...`
  - default correction head is far too aggressive and catastrophically degrades `36e581...` and `f1dac...`
  - do not promote this default
  - immediate next action: conservative shrinkage ablations (`lower rank`, `lower correction_scale`, `lower correction_blend`)

### 2026-03-21T11:10:00Z

- Implemented new belief-adaptive policy branch:
  - `adaptive_rN`
  - current implementation: full coverage first, then spend remaining repeat budget on already-observed windows that look most stochastic from the transcript itself
  - repeat scoring uses:
    - motif prior
    - observed dynamic mass (`settlement + port + ruin`)
    - empirical repeat entropy across observed final-state samples
    - settlement density
    - mild repeat-count penalty
- Generalized synthetic transcript dataset planning so non-static policies are valid:
  - if a policy does not expose a static query plan, synthetic dataset generation now uses the competition cap (`50`) as an upper bound and relies on `run_online_episode()` to stop when the policy returns `None`
  - this preserves existing static-plan behavior and makes adaptive policies compatible with transcript dataset generation
- Re-verified after adaptive-policy compatibility change:
  - `uv run --extra dev pytest tests/test_history_datasets.py -q` -> `5 passed`
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `16 passed`
- Conservative joint-student shrinkage probes in progress:
  - variant A: `residual_rank=2`, `correction_scale=0.15`, `correction_blend=0.15`
  - variant B: `residual_rank=3`, `correction_scale=0.25`, `correction_blend=0.25`
- Partial results so far on the 3-round hard slice:
  - `36e581...`
    - A: `66.4656`
    - B: `66.4064`
    - both fix the catastrophic default and edge above current coverage-hybrid score on this round
  - `c5cdf...`
    - A: `77.8781`
    - B: `77.9704`
    - both remain strong, though still below the best low-rank-only `c5cdf...` result
- Still pending at time of this log:
  - `f1dac...` for both conservative joint-student variants
  - 3-round `coverage_r5` probe for the current lead model
  - 3-round `adaptive_r5` probe for the current lead model

### 2026-03-21T10:00:00Z

- Added round-level parallelism to `run_historical_benchmark` behind an explicit `max_workers` argument.
- CLI now accepts `--jobs` / `--max-workers` and forwards to historical benchmark.
- Validation behavior is unchanged by default:
  - `max_workers=None` keeps the old serial path
  - `max_workers>1` parallelizes held-out rounds with `ProcessPoolExecutor`
- Added regression test proving parallel and serial outputs match on sample data.
- Verified:
  - `uv run python -m py_compile src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `14 passed in 29.55s`

### 2026-03-21T10:00:00Z

- Added new coefficient-fingerprint posterior branch:
  - `greybox_coefficient_knn_v01`
  - trains a kNN posterior over replay/live transcript feature vectors
  - targets actual per-round coefficient fingerprints from the semimechanistic teacher manifold
  - decodes through `HazardTeacher`, then applies prior blend + exact-cell evidence blend
- Wiring added:
  - online predictor registry
  - historical benchmark eval path
  - CLI model choices
  - benchmark smoke test matrix
- Validation:
  - `uv run python -m py_compile src/astar/student/predictor/greybox_coefficient_knn.py src/astar/student/predictor/interactive.py src/astar/workflows/model_eval.py src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q -k coefficient_knn` -> `1 passed`
- Notes:
  - first attempt used synthetic dataset materialization and hit DuckDB/catalog contention under parallel benchmark workers
  - refactored branch to use replay-run transcript proxies directly, removing the catalog write path
  - real 3-round probe is running now:
    - `agent5_coefficient_knn_probe3`
    - `coverage`, `samples_per_round=4`, `budget=50`, `jobs=1`
- Interpretation:
  - first genuinely strong cross-round grey-box model
  - much better balance than ridge/knn
  - worth full-corpus validation + blend sweeps

- Full 8-round held-out evaluation, `greybox_hazard_lowrank_v01`, `prior_blend=0.35`:
  - `36e581...`: `64.6992`
  - `71451d...`: `69.9241`
  - `76909e...`: `75.8642`
  - `8e8399...`: `81.0221`
  - `ae7800...`: `75.5373`
  - `c5cdf...`: `78.5253`
  - `f1dac...`: `57.3516`
  - `fd3c92...`: `66.5113`
  - mean round score `71.179393`
  - mean round weighted KL `0.115481`

- Low-rank prior-blend sweep on representative held-out rounds:
  - `f1dac...`
    - `0.35`: `57.3516`
    - `0.45`: `56.0437`
    - `0.55`: `54.2762`
    - `0.65`: `52.1114`
    - `0.75`: `49.6517`
  - `c5cdf...`
    - `0.35`: `78.5253`
    - `0.45`: `78.1557`
    - `0.55`: `77.2615`
    - `0.65`: `75.8803`
    - `0.75`: `74.0655`
  - `71451d...`
    - `0.35`: `69.9241`
    - `0.45`: `71.6980`
    - `0.55`: `73.2280`
    - `0.65`: `74.5468`
    - `0.75`: `75.6192`
  - `76909e...`
    - `0.35`: `75.8642`
    - `0.45`: `76.7368`
    - `0.55`: `77.3242`
    - `0.65`: `77.6497`
    - `0.75`: `77.6723`
  - `fd3c92...`
    - `0.35`: `66.5113`
    - `0.45`: `69.6132`
    - `0.55`: `72.2452`
    - `0.65`: `74.5054`
    - `0.75`: `76.4645`
- Interpretation:
  - higher prior helps easier rounds substantially
  - but it damages `f1dac...` and `c5cdf...`
  - constant prior blend alone cannot dominate everywhere

- Full 8-round rerun, `greybox_hazard_lowrank_v01`, `prior_blend=0.55`:
  - `36e581...`: `65.8168`
  - `71451d...`: `73.2280`
  - `76909e...`: `77.3242`
  - `8e8399...`: `84.9902`
  - `ae7800...`: `74.7563`
  - `c5cdf...`: `77.2615`
  - `f1dac...`: `54.2762`
  - `fd3c92...`: `72.2452`
  - mean round score `72.487302`
  - mean round weighted KL `0.109967`
- Interpretation:
  - clear gain over low-rank default
  - still not enough to beat visible old best benchmark report

- Built first hybrid model:
  - `greybox_hybrid_lowrank_queryres_v01`
  - blend `0.25 * lowrank(prior_blend=0.55) + 0.75 * query_residual(samples=1)`
  - rationale:
    - low-rank is much stronger on several easier rounds
    - `query_residual` still protects some hard/off-manifold cases
    - fixed blend already looked promising in ad hoc probes

- 5-round hybrid probe:
  - `36e581...`: `65.8363`
  - `71451d...`: `79.8373`
  - `c5cdf...`: `70.2865`
  - `f1dac...`: `55.4568`
  - `fd3c92...`: `78.8574`

- Full 8-round held-out hybrid evaluation:
  - `36e581...`: `65.836291`
  - `71451d...`: `79.837298`
  - `76909e...`: `83.512497`
  - `8e8399...`: `86.048940`
  - `ae7800...`: `79.104778`
  - `c5cdf...`: `70.286534`
  - `f1dac...`: `55.456790`
  - `fd3c92...`: `78.857417`
  - mean round score `74.867568`
  - mean round weighted KL `0.099605`
- Interpretation:
  - current best result in this session
  - beats visible old report mean `73.9505` by about `+0.9171`
  - next priority was productizing this ad hoc hybrid through normal registry / CLI / benchmark path

### 2026-03-21T10:00:00Z

- Re-read family-specific handoff sections in `instructions/agent5.md`.
- Main implications re-confirmed:
  - keep pushing teacher + tiny round regime + fast student
  - benchmark-trained query policy matters
  - once low-rank plateaus, discrete mixture and smarter online adaptation are first-class next branches

- Machine health / concurrency read:
  - early check:
    - `Mem available ~= 2.9 TiB`
    - `cores = 384`
    - only one significant competing `astar` run visible
  - later during our experiment burst:
    - `Mem available ~= 2.4 TiB`
    - load average about `45.9`
    - still large headroom
  - other active agents visibly running:
    - `hazard_posterior_*`
    - `ffam_retrieval_*`
    - `teacher_student_blend_*`
  - operating choice:
    - keep several long probes live, but not spam dozens of redundant full-benchmark jobs into an already busy machine

- Productized current best fixed hybrid through normal framework path:
  - registry / model-eval / CLI / historical-benchmark integration for:
    - `greybox_hybrid_lowrank_queryres`
  - fixed missing `QueryResidualPredictor` import bug in hybrid implementation
  - verification:
    - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `9 passed`
    - `uv run --extra dev pytest tests/test_history_datasets.py -q` -> `5 passed`
    - `uv run --extra dev pytest tests/test_teacher_student.py -q` -> `4 passed`

- Added fast experiment harness:
  - `scripts/agent5_hybrid_sweep.py`
  - purpose:
    - sweep lowrank/query-residual blend weights cheaply
    - separate `lowrank_samples_per_round` vs `residual_samples_per_round`
    - reuse one recorded transcript belief per held-out round
    - stream per-round results with flushing

- Opened policy search space without changing benchmark API:
  - `build_named_policy()` now parses:
    - `coverage`
    - `exploration`
    - `coverage_rN`
    - `exploration_rN`
  - new test:
    - `uv run --extra dev pytest tests/test_exploration_policy.py -q` -> `2 passed`

- New predictor-family branches added to codebase:
  - `greybox_gated_hybrid_v01`
    - transcript-dependent gate over:
      - `greybox_hazard_lowrank_v01`
      - `query_residual`
    - gate inputs:
      - transcript regime features
      - expert disagreement features
    - gate target:
      - best lowrank blend weight over synthetic legal transcripts on held-in rounds
  - `greybox_hazard_mixture_v01`
    - discrete regime mixture over clustered semimechanistic coefficient prototypes
    - motivated directly by handoff’s “low-rank or richer discrete-mixture regime model” branch

- Integrated new predictors into benchmark path:
  - registry / model-eval / CLI / historical benchmark / smoke tests now include:
    - `greybox_hazard_mixture`
    - `greybox_gated_hybrid`
  - verification:
    - `uv run --extra dev pytest tests/test_historical_benchmark.py -q -k greybox_regime_online_historical_benchmark_runs` -> `6 passed, 5 deselected`

- Parallel experiment program launched:
  - full 8-round fixed-weight sweeps:
    - `coverage`
    - `exploration`
  - short 4-round flushed policy probes:
    - `coverage`
    - `exploration`
    - `exploration_r3`
    - `exploration_r8`
  - direct 4-round standard-path probes:
    - `greybox_gated_hybrid`
    - `greybox_hazard_mixture`

- Partial result already informative on first 2 completed rounds of short policy probes:
  - held-out `36e581...`
    - `coverage`
      - best among tested weights so far at `lowrank_weight=0.45`
      - score `61.0651`
    - `exploration`
      - best among tested weights so far at `lowrank_weight=0.25`
      - score `60.2697`
    - interpretation:
      - `coverage` beats default `exploration`
      - this round wants materially more low-rank mass than the old fixed `0.25`
  - held-out `71451d...`
    - `coverage`
      - best among tested weights so far at `lowrank_weight=0.00`
      - score `76.3894`
    - `exploration`
      - best among tested weights so far at `lowrank_weight=0.00`
      - score `75.8661`
    - interpretation:
      - `coverage` again beats default `exploration`
      - this round wants essentially pure residual, opposite of `36e581...`

- Current scientific conclusion from partial probes:
  - policy:
    - default `exploration` does not currently look superior to `coverage`
    - richer `exploration_rN` variants still under test
  - inference:
    - fixed blend weight is clearly wrong
    - evidence already strongly favors transcript-dependent gating as the next highest-value branch
    - discrete hazard mixture remains worth testing because low-rank vs residual disagreement appears regime-structured, not random

### 2026-03-21T11:00:00Z

- Found and fixed a serious sweep-harness validation bug:
  - earlier `scripts/agent5_hybrid_sweep.py` was accidentally sweeping against `greybox_hazard_lowrank` default `prior_blend=0.35`
  - but the actual current best hybrid uses low-rank `prior_blend=0.55`
  - harness now instantiates the tuned low-rank expert directly with configurable `--lowrank-prior-blend`
  - consequence:
    - earlier sweep numbers remain useful for broad direction only
    - corrected sweeps are the ones to trust for model selection

- Sweep harness validation against standard benchmark path:
  - 2-round coverage subset `{36e581..., 71451...}`
  - corrected sweep at `lowrank_weight=0.25`:
    - mean score `67.267978`
    - mean weighted KL `0.132953`
  - direct standard benchmark for `greybox_hybrid_lowrank_queryres` on same subset:
    - mean score `67.26797838955613`
    - mean weighted KL `0.1329526785429317`
  - interpretation:
    - sweep harness is now validated for this family/config
    - can use it confidently for rapid model selection before spending more full-benchmark wall time

- Corrected 4-round sweep with tuned low-rank expert, held-out rounds `{36e581..., 71451..., c5cdf..., f1dac...}`:

- `coverage`
  - tested weights: `0.00, 0.15, 0.25, 0.35, 0.45, 0.55`
  - best:
    - `lowrank_weight=0.35`
    - mean score `68.305538`
    - mean weighted KL `0.130043`
  - interpretation:
    - coverage alone only wants a mild retune over the current fixed `0.25`

- `exploration_r3`
  - tested weights: `0.00, 0.15, 0.25, 0.35, 0.45, 0.55`
  - best:
    - `lowrank_weight=0.45`
    - mean score `69.886928`
    - mean weighted KL `0.122225`
  - interpretation:
    - materially better than corrected `coverage`
    - delta vs best corrected `coverage`: about `+1.5814` score and `-0.007818` weighted KL
    - current strongest post-fix direction is:
      - policy `exploration_r3`
      - hybrid low-rank weight `0.45`
      - low-rank prior blend `0.55`
      - residual samples `1`

- Branch triage from direct benchmark probes:
  - `greybox_gated_hybrid` on 2-round coverage subset `{36e581..., 71451...}`:
    - mean score `66.881302`
    - mean weighted KL `0.134754`
    - worse than fixed hybrid baseline on same subset (`67.267978`, `0.132953`)
    - conclusion:
      - first gating implementation is not production-ready
  - `greybox_hazard_mixture` on 4-round coverage subset `{36e581..., 71451..., c5cdf..., f1dac...}`:
    - mean score `47.513991`
    - mean weighted KL `0.277624`
    - catastrophic on `36e581...`, `71451...`, `f1dac...`
    - conclusion:
      - discrete hazard-mixture branch is currently rejected

- Productized new explicit fixed-hybrid model variant:
  - `greybox_hybrid_lowrank_queryres_w45`
  - rationale:
    - handoff requires distinct model names for materially distinct configs
    - corrected sweep selected `lowrank_weight=0.45` as current best on the 4-round probe

- Live long-running jobs now:
  - standard 4-round benchmarks still running for:
    - `greybox_hybrid_lowrank_queryres` with `policy=exploration_r3`
    - `greybox_hybrid_lowrank_queryres_w45` with `policy=exploration_r3`
  - full 8-round corrected sweep running for:
    - `policy=exploration_r3`
    - weights `{0.25, 0.45, 0.55}`

### 2026-03-21T09:20:00Z

- Re-read full grey-box handoff again, especially:
  - tiny regime manifold / maybe discrete mixture
  - direct student head / joint student
  - posterior-aware repeated-query policy
- Machine-health snapshot before scaling parallelism:
  - `Mem`: `2.9 TiB total`, `28 GiB used`, effectively all free at launch
  - later under broad multi-agent load: `494 GiB used`, `2.4 TiB available`
  - `nproc`: `384`
  - load around `48` on `384` cores while many other agents were already benchmarking
  - implication:
    - still enormous headroom
    - safe to run multiple heavy experiments in parallel
    - need monitor RAM because other agents are active, but no need to throttle hard yet

- Active machine observations:
  - multiple other agents are running serious benchmark jobs on the same host
  - examples seen in `ps`:
    - `agent1` hazard-posterior exploration benchmarks
    - `agent2` coeffbank variants
    - `agent6` summary/roundlaw decoder probes
    - `agent7` ffam retrieval exploration probes
  - decision:
    - keep parallelism moderate-high rather than maxing all cores blindly

- Added new-family experiment harness:
  - `scripts/agent5_hybrid_sweep.py`
  - purpose:
    - fit `greybox_hazard_lowrank` + `query_residual` once per held-out round
    - reuse one transcript and both expert bundles to score many convex blend weights cheaply
    - much better iteration path than re-running a full registered benchmark for every weight

- Added new-family model branches aligned with handoff:
  - `greybox_gated_hybrid_v01`
    - transcript-dependent gate over `{greybox_hazard_lowrank, query_residual}`
    - gate features:
      - transcript regime features
      - expert-disagreement features
    - gate target:
      - best convex low-rank weight per held-in synthetic transcript prefix under weighted KL
  - `greybox_hazard_mixture_v01`
    - discrete regime-mixture decoder over per-round semimechanistic coefficient fingerprints
    - clusters historical round fingerprints into a tiny set of prototypes
    - infers soft mixture weights from transcript features
    - directly tests handoff hypothesis `H6` (small discrete mixture over regime families helps)

- Quick viability checks:
  - `uv run python -m py_compile scripts/agent5_hybrid_sweep.py src/astar/student/predictor/greybox_gated_hybrid.py src/astar/student/predictor/greybox_hazard_mixture.py` passed
  - `greybox_hazard_mixture_v01` 3-round fit smoke succeeded:
    - `clusters=3`
    - `training_example_count=72`
    - `coefficient_prototypes.shape=(3, 51)`

- Parallel experiments launched:
  - standard-path full 8-round registered benchmark for `greybox_hybrid_lowrank_queryres`
  - 3-round `exploration` policy probe for the same hybrid
  - full fixed-weight hybrid sweep with `scripts/agent5_hybrid_sweep.py`
  - 3-round held-out probe for `greybox_gated_hybrid_v01`
  - 3-round held-out probe for `greybox_hazard_mixture_v01`
- Status:
  - runs in flight
  - waiting on numeric results before deciding which new branch to wire into registry/tests next

- First new-branch result back:
  - `greybox_hazard_mixture_v01` 3-round held-out probe, `cluster_count=2`, `policy=coverage`, `samples_per_round=4`
  - round scores:
    - `36e581...`: `11.5467`
    - `c5cdf...`: `81.3993`
    - `f1dac...`: `39.8258`
  - mean score: `44.2572`
  - mean weighted KL: `0.366848`
- Conclusion:
  - this first simple discrete-mixture prototype is not viable
  - confirms that a naive tiny-discrete regime family can be extremely unstable even when one round is excellent
  - reject current `greybox_hazard_mixture_v01` as a benchmark candidate

- Trusted hybrid reweighting probe:
  - used new `scripts/agent5_hybrid_sweep.py --eval-round-id ...`
  - crucially:
    - evaluated only `{36e581..., c5cdf..., f1dac...}`
    - but trained each held-out round on the full 8-round corpus minus that held-out round
    - this is much more trustworthy than the earlier tiny 3-round-only training split

- Coverage policy, full-training trusted probe:
  - `36e581...`
    - `0.00`: `64.4914`
    - `0.25`: `65.8363`
    - `0.45`: `66.4555`
    - `0.55`: `66.6075`
    - `0.65`: `66.6487`
  - `c5cdf...`
    - `0.00`: `67.0175`
    - `0.25`: `70.2865`
    - `0.45`: `72.6394`
    - `0.55`: `73.7078`
    - `0.65`: `74.6911`
  - `f1dac...`
    - `0.00`: `54.5655`
    - `0.25`: `55.4568`
    - `0.45`: `55.7925`
    - `0.55`: `55.8119`
    - `0.65`: `55.7180`
  - aggregate:
    - `0.00`: `62.0248`
    - `0.25`: `63.8599`
    - `0.45`: `64.9625`
    - `0.55`: `65.3757`
    - `0.65`: `65.6859`
    - best weighted KL also at `0.65`: `0.142659`
- Interpretation:
  - old hybrid weight `0.25` is clearly too conservative
  - heavier low-rank weight keeps helping on two of the three trusted rounds and only slightly softens `f1dac...`
  - promoted new lead config:
    - `greybox_hybrid_lowrank_queryres_v02`
    - `lowrank_weight=0.65`
    - low-rank component still uses `prior_blend=0.55`

- Exploration policy, full-training trusted probe on same 3 rounds:
  - aggregate:
    - `0.00`: `62.5658`
    - `0.25`: `64.0308`
    - `0.45`: `64.8471`
    - `0.55`: `65.1229`
    - `0.65`: `65.3011`
  - best at `0.65`, but still below coverage at the same weight (`65.3011` vs `65.6859`)
- Interpretation:
  - `exploration` is competitive, not dominant
  - current evidence says `coverage + heavier low-rank blend` is still the better lead

- Gated hybrid status:
  - partial 3-round probe showed:
    - `36e581...`: `16.9708`
    - `c5cdf...`: `81.6963`
  - run manually interrupted before final third round once it was clear the gate was extremely unstable on at least one trusted round
- Current conclusion:
  - keep `greybox_gated_hybrid_v01` as an experimental branch only
  - do not promote it ahead of fixed-weight hybrid v02 without much stronger evidence

- Validation / policy support checks:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `12 passed`
  - `uv run --extra dev pytest tests/test_exploration_policy.py -q` -> `2 passed`
  - `uv run --extra dev pytest tests/test_teacher_student.py -q` -> `4 passed`

- Branch checkpoint:
  - committed teacher/student checkpoint-load support
  - pushed safely to remote via clean detached worktree
  - remote branch head now:
    - `origin/agent5` -> `a27b90c`
  - pushed commit:
    - `a27b90c [astar] add teacher/student checkpoint loading`

### 2026-03-21T09:55:00Z

- Re-read canon + handoff again in current workspace:
  - `README.md`
  - `docs/game_facts.md`
  - full `instructions/agent5.md`
- Re-confirmed handoff gap vs current implementation:
  - current grey-box family already has:
    - semimechanistic round fingerprints
    - low-rank manifold
    - simple fixed/gated/mixture hybrids
  - still missing stronger handoff-aligned branches:
    - richer transcript-conditioned posterior over round-law fingerprints
    - stronger student-side direct online adaptation
    - faster official held-out benchmark throughput

- Current machine-health / concurrency snapshot:
  - host: `c4d-monster-01.c.ai-nm26osl-1706.internal`
  - time: `2026-03-21T09:55:07Z`
  - memory:
    - total `2.9 TiB`
    - used `704 GiB`
    - available `2.2 TiB`
  - cpu:
    - `384` cores
    - load average about `65.6 / 94.6 / 92.5`
  - competing jobs visible:
    - many `agent3` teacher-student blend probes
    - `agent7` ffam operator probes
    - others likely active but not saturating the box
  - implication:
    - still huge headroom
    - safe to run moderate-high parallelism
    - but avoid wasting memory on stale solved sweeps

- Found stale long-running agent5 sweeps still alive from earlier session state:
  - `scripts/agent5_hybrid_sweep.py --policy coverage ...`
  - `scripts/agent5_hybrid_sweep.py --policy exploration ...`
  - older exploration-only sweep
  - one inline `python3 -` helper process
- Action:
  - terminated those stale agent5 sweep processes to recover memory / cpu for new experiments

- Full 8-round corrected hybrid sweep result to trust over the earlier 3-round probe:
  - policy `coverage`
  - low-rank expert:
    - `greybox_hazard_lowrank_v01`
    - `prior_blend=0.55`
    - `samples_per_round=4`
  - residual expert:
    - `query_residual_v7`
    - `samples_per_round=1`
  - sweep weights:
    - `0.00`: mean score `74.255312`, mean weighted KL `0.102772`
    - `0.15`: mean score `74.993794`, mean weighted KL `0.098964`
    - `0.25`: mean score `75.278994`, mean weighted KL `0.097415`
    - `0.35`: mean score `75.396483`, mean weighted KL `0.096656`
    - `0.45`: mean score `75.339954`, mean weighted KL `0.096711`
    - `0.55`: mean score `75.099362`, mean weighted KL `0.097628`
    - `0.65`: mean score `74.660350`, mean weighted KL `0.099481`
  - conclusion:
    - full-8 held-out leader is **not** current `v02` weight `0.65`
    - best fixed hybrid from the full benchmark is `coverage + lowrank_weight=0.35`

- Full 8-round corrected hybrid sweep, policy `exploration`:
  - `0.00`: mean score `74.401100`, mean weighted KL `0.101998`
  - `0.15`: mean score `74.999452`, mean weighted KL `0.098962`
  - `0.25`: mean score `75.172187`, mean weighted KL `0.097995`
  - `0.35`: mean score `75.166993`, mean weighted KL `0.097856`
  - `0.45`: mean score `74.981435`, mean weighted KL `0.098559`
  - `0.55`: mean score `74.609260`, mean weighted KL `0.100143`
  - `0.65`: mean score `74.040016`, mean weighted KL `0.102672`
  - conclusion:
    - `exploration` is competitive but still below `coverage`
    - best exploration fixed hybrid is `lowrank_weight=0.25`
    - current fixed-weight lead remains coverage at `0.35`

- Immediate next branches chosen:
  - validation/process:
    - parallelize official historical benchmark over held-out rounds
    - objective: same results, much faster iteration on this machine
  - new model family work:
    - implement transcript-conditioned posterior over semimechanistic round-law fingerprints / coefficient vectors
    - rationale:
      - closer to handoff’s “tiny discrete regime + low-rank residual” than current crude cluster mixture
      - should exploit the small-round / many-transcript asymmetry directly
  - housekeeping:
    - once code is in, revisit `greybox_hybrid_lowrank_queryres` versioning/defaults so the registered lead reflects full-8 evidence rather than the narrower 3-round probe

### 2026-03-21T10:20:00Z

- Validation/throughput improvement completed:
  - `run_historical_benchmark()` now supports explicit held-out-round parallelism via `max_workers`
  - CLI exposes:
    - `--jobs`
    - `--max-workers`
  - design choice:
    - default stays serial when `max_workers=None`
    - no silent benchmark-behavior change
    - parallelism only affects throughput, not metric semantics
- Verification:
  - serial-vs-parallel historical benchmark equivalence test added
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `14 passed`
  - `uv run python -m py_compile src/astar/student/predictor/greybox_coefficient_knn.py src/astar/student/predictor/interactive.py src/astar/workflows/model_eval.py src/astar/workflows/historical_benchmark.py src/astar/cli.py` passed
- Branch state:
  - local branch head now:
    - `305bb922 [astar] parallelize historical benchmark rounds`

- Implemented new experimental grey-box branch:
  - `greybox_coefficient_knn_v01`
- Intended idea:
  - infer transcript-conditioned posterior directly over semimechanistic coefficient vectors
  - decode through `HazardTeacher`
  - keep same online-safe prediction path:
    - historical bucket prior blend
    - exact observed-cell correction
    - probability floor
- Important correction made during implementation:
  - first draft tried to use full-map replay frames as pseudo transcripts
  - rejected/fixed immediately because that would leak non-legal information
  - final current implementation trains only from legal synthetic transcript episodes via `_load_training_rows()` / `load_synthetic_episode()`

- Early screen for the coefficient-knn idea:
  - no-code prototype using full 7-round training and trusted held-out `36e581...`
  - tested:
    - `k in {8,16,32}`
    - `prior_blend in {0.35,0.45}`
    - small coefficient-mean shrinkage variants
  - best observed on `36e581...`:
    - `k=16`
    - `shrink=0.00`
    - `prior_blend=0.45`
    - score `58.877493`
    - weighted KL `0.176808`
- Interpretation:
  - this is far below:
    - `greybox_hazard_lowrank_v01` on same round (`64.6992`)
    - current hybrid lead on same round (`66.4555` to `66.6487` depending on weight in trusted/full probes)
  - even before finishing the other held-out rounds, this effectively rules `greybox_coefficient_knn_v01` out as a near-term lead candidate
  - kept as an experimental branch only unless later evidence shows a much stronger variant

- Resource-management action:
  - terminated the longer coefficient-knn prototype after the negative first-round screen
  - reason:
    - not worth burning more compute on a branch already dominated by existing low-rank / hybrid leads

- Current lead unchanged:
  - best validated fixed hybrid remains:
    - policy `coverage`
    - low-rank weight `0.35`
    - low-rank prior blend `0.55`
  - next highest-value model work is still:
    - better online adaptation / student posterior than fixed coefficient knn
    - likely something closer to discrete+continuous regime inference or better hybrid gating that does not collapse on `36e581...`

### 2026-03-21T10:30:00Z

- Experimental branch checkpoint committed + pushed:
  - local commit:
    - `3a1f7159 [astar] add experimental coefficient knn predictor`
  - remote equivalent on `origin/agent5`:
    - `e67144d8`
- Branch contents:
  - legal-only `greybox_coefficient_knn_v01`
  - registry/eval integration
  - kept in tree as explicit experimental branch, not lead

- Promoted hybrid lead code to explicit new internal version:
  - local commit:
    - `d1118448 [astar] promote hybrid lowrank queryres v03`
  - remote equivalent on `origin/agent5`:
    - `f430efd7`
  - change:
    - `greybox_hybrid_lowrank_queryres_v03`
    - `lowrank_weight=0.35`

- Re-verified after `v03` promotion:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q` -> `15 passed in 46.29s`

- Official full 8-round benchmark for the promoted lead:
  - command path:
    - `run_historical_benchmark(... model_name='greybox_hybrid_lowrank_queryres', mode='online_interactive', policy_name='coverage', samples_per_round=4, budget=50, episode_seed=0, max_workers=8, benchmark_name='agent5_hybrid_lowrank_queryres_online50_v03')`
  - artifact:
    - `data/artifacts/benchmarks/agent5_hybrid_lowrank_queryres_online50_v03/result.json`
  - report summary:
    - mean score `74.942088`
    - mean weighted KL `0.099138`
    - total runtime `417.087s`
    - summed eval runtime `3146.226s`
  - round means:
    - `36e581...`: `66.1974`
    - `71451d...`: `79.3881`
    - `76909e...`: `83.1980`
    - `8e8399...`: `86.3316`
    - `ae7800...`: `78.8787`
    - `c5cdf...`: `71.4961`
    - `f1dac...`: `55.6710`
    - `fd3c92...`: `78.3757`

- Interpretation:
  - official benchmark still beats the visible old report:
    - `74.9421` vs `73.9505`
    - delta about `+0.9916`
  - also edges the earlier fixed hybrid session result:
    - `74.9421` vs `74.8676`
    - delta about `+0.0745`
  - but it is lower than the earlier sweep estimate (`75.3965`)
    - gap about `-0.4544`
  - conclusion:
    - sweep harness remains useful for search/ranking candidate regions
    - official historical benchmark remains the canonical model-selection metric
    - current practical lead is still `greybox_hybrid_lowrank_queryres_v03`, but with less margin than the sweep had suggested
