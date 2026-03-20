# PROGRESS_AGENT6

## Mission

- Family: family 1 / symbolic + semimechanistic + neuro-symbolic.
- End goal: maximize local historical benchmark score without degrading validation quality.
- Hard constraints from handoff:
  - immutable model names
  - round-heldout eval
  - frequent commits/pushes
  - maintain experiment memory

## Current Repo State

- Repo root for task work: `/home/jorge/agent6/tasks/astar`
- Git top-level: `/home/jorge/agent6`
- Branch: `agent6`
- Remote: `origin https://github.com/jorgensandhaug/ainm.git`
- `br` unavailable in this shell (`br: command not found`), so tracking is being done here plus machine-readable registry under `data/artifacts/family1/`.

## Required Reads Completed

- `README.md`
- `docs/game_facts.md`
- `instructions/agent6.md`

## Facts Verified Early

- Historical benchmark framework already exists: `uv run astar run-historical-benchmark --model <name>`
- Current online-capable predictors in code include `query_residual` even though README live-model section does not mention it.
- Replay payloads in `data/raw/replays/**` contain full yearly frames and settlement fields:
  - `x`, `y`, `population`, `food`, `wealth`, `defense`, `has_port`, `alive`, `owner_id`
- Stored replay payloads do not expose `tech_level` or `longship` fields.
- Replay DTO expects yearly boundary frames only; no sub-phase states in current stored schema.
- `sim_seed` is stored for replay captures.

## Current Baselines Found

- `historical_bucket_prior_v1`
  - dev online benchmark aggregate score: `66.0233`
  - artifact: `data/artifacts/benchmarks/dev_historical_bucket_online50/result.json`
- `query_residual_v7`
  - dev online benchmark aggregate score: `73.9505`
  - artifact: `data/artifacts/benchmarks/dev_query_residual_online50_v7/result.json`

## Immediate Gaps / Problems

- No family-1 specific progress doc existed.
- No family-1 machine-readable experiment registry existed.
- Current default `query_residual` path is not immutable by requested family naming convention.
- Validation currently exists, but there is no family-1 specific benchmark bookkeeping or versioned model registry.

## Current Workstream

1. Create mandatory tracking infra.
2. Add immutable versioned family-1 model registration for query-residual-style student variants.
3. Benchmark a low-risk variant using more synthetic transcript coverage instead of mutating the default model.
4. If useful, tighten validation next by adding more robust benchmark handling around stochastic episode seeds.

## Active Experiment

- Candidate model: `f1_student_query_residual_p45_v01`
- Hypothesis:
  - adding `45` to training budget prefixes should better match actual executed query count seen in current online historical runs
  - this keeps baseline training cost nearly unchanged, unlike the slower `samples_per_round=4` variant
- Intended comparison target:
  - baseline `query_residual_v7`
- Validation plan:
  - smoke/small check first
  - then full dev historical benchmark if smoke is sane

## Runtime Finding

- `f1_student_query_residual_s4p45_v01`
  - smoke benchmark on 3 held-out rounds was started, then aborted
  - reason: runtime far too slow for practical iteration (multi-minute 3-round smoke with no artifact completion)
  - current disposition: keep registered, but not current mainline unless caching/perf work lands

## Infrastructure Finding

- Synthetic live dataset indices were not workspace-portable.
- Root cause:
  - cached dataset index rows stored absolute `episode_path` values from `/home/jorge/repos/ainm/tasks/astar/...`
  - reruns in `/home/jorge/agent6/tasks/astar` failed when loading the legacy `samples_per_round=1` dataset
- Fix landed:
  - added path resolver that maps stale absolute episode paths back into the current dataset directory
  - wired this into both query-residual training and summary-bank student loading
  - added regression test covering stale absolute path recovery

## Files To Watch

- `data/artifacts/family1/registry.jsonl`
- `src/astar/student/predictor/query_residual.py`
- `src/astar/student/predictor/interactive.py`
- `src/astar/workflows/model_eval.py`
- `src/astar/workflows/historical_benchmark.py`
- `src/astar/cli.py`

## Running Log

### 2026-03-20 UTC

- Read README, canonical game facts doc, and full handoff.
- Verified repo state, branch, remote, baseline benchmark artifacts.
- Verified replay settlement payload keys from raw replay files.
- Confirmed `br` missing in environment.
- Began implementation of immutable family-1 model registration and experiment registry.
- Added immutable model spec registry for versioned query-residual family variants.
- Added `f1_student_query_residual_s4p45_v01`; aborted first smoke run due poor iteration speed.
- Pivoted active candidate to cheaper `f1_student_query_residual_p45_v01`.
- Found and fixed synthetic-live dataset portability bug caused by stale absolute episode paths.
- Regression tests passing after fix:
  - `tests/test_history_datasets.py`
  - `tests/test_historical_benchmark.py`
  - `tests/test_live_online.py`
- Finished smoke benchmark for `f1_student_query_residual_p45_v01`:
  - artifact: `data/artifacts/benchmarks/tmp_f1_student_query_residual_p45_v01_probe3/result.json`
  - mean_score `72.6319`
  - mean_weighted_kl `0.107047`
  - runtime `242.003s`
- Compared against `tmp_query_residual_probe_3rounds_v7`:
  - mean_score_delta `-0.4708`
  - mean_weighted_kl_delta `+0.002263`
  - win_rate `0.333`
  - verdict: reject variant; no score improvement
- Current conclusion:
  - best value this turn is infra/reproducibility + immutable model registration, not a new best model
  - next likely path is performance engineering / caching before more query-residual sweeps
