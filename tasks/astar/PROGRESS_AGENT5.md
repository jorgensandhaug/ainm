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
