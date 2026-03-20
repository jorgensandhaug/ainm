# Agent 2 Progress Log

## Mission

- Agent: `agent2`
- Family: semimechanistic hazard / state-space / graph-aware world-model family
- Primary objective: improve historical benchmark score reliably and reproducibly on local replay-backed data
- Hard requirements from handoff:
  - read `instructions/agent2.md` and `docs/game_facts.md`
  - inspect framework interfaces before changing models
  - run at least one existing historical benchmark end-to-end before introducing a new family member
  - track all meaningful work in this file
  - commit and push frequently

## Starting State

- Timestamp (UTC): `2026-03-20T22:56:55Z`
- Repo root: `/home/jorge/agent2/tasks/astar`
- Branch: `agent2`
- HEAD at start: `78d89f9977e756f86c1e750be7d1d81c5207f269`
- Remote: `origin https://github.com/jorgensandhaug/ainm.git`
- Existing experiment registry under `experiments/`: none found
- Local historical analyses available: `8` rounds
- Local replay-backed rounds available: `9` rounds

## Ground Truth Constraints From Docs / Framework

- The scoring target is the final `H x W x 6` probabilistic tensor, scored by entropy-weighted KL.
- The live query budget is `50` total queries shared across the `5` seeds in a round.
- Replays appear to expose much richer year-by-year stochastic information than the public API.
- Round is the correct holdout unit. Random trajectory splits would leak regime information.
- Existing framework already contains:
  - historical benchmark pipeline
  - replay ingestion / normalization
  - geometry feature computation
  - a semimechanistic `HazardTeacher`
  - several terminal predictors (`historical_bucket_prior`, `query_residual`, `latent_regime`, etc.)

## Initial Framework Findings

- Historical benchmark entrypoint: `src/astar/workflows/historical_benchmark.py`
- Historical eval model dispatch: `src/astar/workflows/model_eval.py`
- Online predictor dispatch: `src/astar/student/predictor/interactive.py`
- Query policy registry: `src/astar/policy/registry.py`
- Teacher training entrypoint: `src/astar/workflows/train_teacher.py`
- Current semimechanistic teacher: `src/astar/teacher/dynamics/hazard_teacher.py`
- Current geometry bundle: `src/astar/features/geometry.py`
- Current historical baseline with the richest non-online structure appears to be `historical_bucket_prior`

## Working Hypotheses

1. The current `HazardTeacher` is semimechanistic in spirit but still too compressed and too weakly tied to replay-derived transition structure to beat strong bucket baselines by much.
2. The highest leverage path is likely to be:
   - strengthen replay-derived semimechanistic summaries,
   - expose them as a benchmarkable round predictor,
   - then improve validation with a stricter development/full-holdout protocol.
3. Validation can be improved without degrading it by introducing an explicit tiered benchmark protocol and tracking model promotion only from round-held-out results.

## Evaluation Protocol For This Run

- Tier 1: unit tests / smoke checks around touched code
- Tier 2: fixed development holdout on a small replay-backed round subset for quick iteration
- Tier 3: broader leave-one-round-out historical benchmark on all local analyzed rounds
- Tier 4: only claim a family-best result after the broader benchmark and artifact inspection

## Experiment Log

### 2026-03-20

- Read `instructions/agent2.md` fully enough to extract the operational requirements and family-specific plan.
- Read `docs/game_facts.md` and confirmed the public task/scoring contract.
- Inspected the current framework entry points for:
  - benchmark execution
  - model dispatch
  - online predictor dispatch
  - query policy registration
  - teacher training
  - replay ingestion
  - geometry features
- Confirmed there was no pre-existing `PROGRESS_AGENT2.md`.
- Confirmed there was no existing `experiments/` registry for this family.

### 2026-03-20T22:59:20Z

- Continued from existing untracked `PROGRESS_AGENT2.md` in branch `agent2`; treating this file as the required single progress log for this run.
- Re-read canonical repo docs in full:
  - `README.md`
  - `docs/game_facts.md`
  - `instructions/agent2.md`
- Confirmed current repo state:
  - branch: `agent2`
  - HEAD: `78d89f9977e756f86c1e750be7d1d81c5207f269`
  - remote: `origin https://github.com/jorgensandhaug/ainm.git`
  - local analyses: `8` rounds
  - local replay-backed rounds: `9` rounds
  - existing benchmark artifact dirs: `29`
- Tried required task tracker check with `br list`; `br` is not on `PATH` in this environment (`/bin/bash: br: command not found`).

## Confirmed Framework Facts

- Historical benchmark CLI:
  - command: `uv run astar run-historical-benchmark`
  - models currently exposed: `static_semantic`, `geometry_prior`, `historical_bucket_prior`, `latent_regime`, `query_residual`
  - modes: `prior_only`, `online_interactive`
- Historical benchmark implementation:
  - leave-one-round-out over analyzed rounds
  - holdout unit is the round, matching handoff requirements
  - artifact dir: `data/artifacts/benchmarks/<run_name>/`
  - outputs: `result.json`, `report.md`, `summary.jsonl`, `summary.csv`, optional seed visualizations
- Prediction/model registration points confirmed:
  - CLI surface: `src/astar/cli.py`
  - historical eval dispatch: `src/astar/workflows/model_eval.py`
  - online predictor registry: `src/astar/student/predictor/interactive.py`
  - benchmark runner: `src/astar/workflows/historical_benchmark.py`
  - artifact layout: `src/astar/infra/artifacts/paths.py`
  - artifact IO: `src/astar/infra/artifacts/store.py`
- Important practical constraint from current code:
  - `run-historical-benchmark` does not yet expose any `smh_*` family model names
  - adding a new semimechanistic family model will require explicit registration in both CLI choices and predictor/eval dispatch
- Existing semimechanistic/offline pieces present now:
  - `HazardTeacher`
  - `SummaryBankStudent`
  - `query_residual_v7`
  - factorization utilities for round summaries

## Current Next Actions

1. Run at least one existing baseline historical benchmark end-to-end, per handoff.
2. Inspect the strongest relevant existing semimechanistic path (`HazardTeacher`, `query_residual`) after the baseline is recorded.
3. Create the required family experiment registry under `experiments/semimech_hazards/`.
4. Implement and benchmark the next `smh_*` iteration only after baseline + extension points are clear.

## Baselines Measured In This Session

### 2026-03-20T23:00Z `agent2_baseline_historical_bucket_prior_20260320`

- Command:
  - `uv run astar run-historical-benchmark --model historical_bucket_prior --mode prior_only --with-png none --name agent2_baseline_historical_bucket_prior_20260320`
- Result:
  - model: `historical_bucket_prior_v1`
  - rounds: `8`
  - evaluated seeds: `40`
  - mean score: `66.0233`
  - mean weighted KL: `0.148488`
  - total runtime: `3.682s`
  - artifact: `data/artifacts/benchmarks/agent2_baseline_historical_bucket_prior_20260320/result.json`
- Immediate interpretation:
  - baseline is fast and stable
  - it is clearly below the pre-existing `query_residual` family artifacts already present in repo

### Current long-running confirmation benchmark

- Running:
  - `uv run astar run-historical-benchmark --model query_residual --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent2_baseline_query_residual_online50_20260320`
- Purpose:
  - confirm current `query_residual` behavior from this branch/environment instead of trusting only older artifacts

## New Technical Findings

- The current `HazardTeacher` is much weaker than the handoff target:
  - fits per-round coefficients only for terminal build / port / ruin logits from static map features
  - uses a linear map from a `12`-dim regime summary vector into those coefficients
  - does not learn a true replay-to-transition state-space model
  - rollout path is effectively nearest-neighbor replay reuse, not a learned simulator
- The current `teacher_transition` dataset is only coarse yearly aggregate counts:
  - alive count
  - port count
  - ruin cell count
  - built cell count
  - next-step versions of those
  - not a real cell/year or settlement/year transition table
- The current strongest semimechanistic-ish online path is `query_residual_v7`:
  - base: `historical_bucket_prior`
  - plus transcript-derived residual logits
  - plus weak `HazardTeacher` terminal prior
  - plus exact observed-cell pseudo-count blending
- Existing repo benchmark artifact worth beating:
  - `data/artifacts/benchmarks/dev_query_residual_online50_v7/report.md`
  - reported mean score: `73.9505`
  - reported mean weighted KL: `0.106326`
- Likely weakness in current `query_residual` calibration/gating:
  - it enforces `min_delta_scale=0.4`, so it never fully turns off residual correction when transcript signal is weak
  - it applies a constant global `teacher_blend=0.12` on all unobserved cells rather than a locality/confidence-aware blend
  - both may explain why it still loses to the plain prior on some easy rounds

## Active Hypothesis

- Fastest path to a better local score is probably not a full new world model from scratch first.
- More plausible near-term win:
  - keep the current residual family,
  - improve its confidence / locality gating and possibly query policy,
  - add stricter validation for online-interactive models,
  - then benchmark a new named family member against `query_residual_v7`.

## Bug Fixes Landed This Session

### Synthetic-live dataset portability fix

- Discovered by rerunning `query_residual` historical benchmark in this checkout:
  - failure: synthetic dataset index stored absolute `episode_path` values pointing at `/home/jorge/repos/ainm/tasks/astar/...`
  - current workspace is `/home/jorge/agent2/tasks/astar`
  - result: cached synthetic episodes were not loadable here
- Fix implemented:
  - new synthetic-live indexes now store relative episode paths (`episodes/<file>.json`)
  - added path resolver that can recover old absolute-path indexes by resolving against the local dataset directory
  - wired resolver into:
    - `src/astar/student/predictor/query_residual.py`
    - `src/astar/student/posterior/deepset_student.py`
- Validation:
  - added regression coverage in `tests/test_history_datasets.py`

### Synthetic-live cache scope fix for `query_residual`

- Discovered while debugging the failed benchmark:
  - `query_residual` preferred legacy cache `synthetic_live_coverage_v1` whenever `samples_per_round == 1`
  - that legacy cache in this repo only covers `6` rounds, while current local analyzed+replay-backed scope is `8` rounds
  - full benchmarks could therefore silently undertrain on an incomplete synthetic transcript dataset
- Fix implemented:
  - `query_residual` now prefers the scoped cache first
  - cache is validated against requested round scope
  - legacy cache is used only if it fully covers the requested rounds
  - otherwise the scoped dataset is rebuilt
- Validation:
  - added regression coverage in `tests/test_historical_benchmark.py`

## Verification Completed After Fixes

- `uv run --extra dev pytest tests/test_history_datasets.py`
  - `4 passed`
- `uv run --extra dev pytest tests/test_teacher_student.py`
  - `2 passed`
- `uv run --extra dev pytest tests/test_historical_benchmark.py`
  - `5 passed`

## Current Running Experiments

- Completed Tier-2 dev benchmark:
  - command:
    - `uv run astar run-historical-benchmark --model query_residual --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent2_dev_query_residual_3rounds_coverage_20260320 --round-id 8e839974-b13b-407b-a5e7-fc749d877195 --round-id fd3c92ff-3178-4dc9-8d9b-acf389b3982b --round-id ae78003a-4efe-425a-881a-d16a39bca0ad`
  - result:
    - mean score: `72.6319`
    - mean weighted KL: `0.107047`
    - runtime: `243.365s`
    - artifact: `data/artifacts/benchmarks/agent2_dev_query_residual_3rounds_coverage_20260320/result.json`
  - interpretation:
    - repaired current-checkout benchmark reproduces the old 3-round reference line closely
    - portability/scope fixes did not degrade the known coverage-policy baseline on this probe subset

- New Tier-2 policy comparison now running:
  - `uv run astar run-historical-benchmark --model query_residual --mode online_interactive --policy exploration --budget 50 --episode-seed 0 --with-png none --name agent2_dev_query_residual_3rounds_exploration_20260320 --round-id 8e839974-b13b-407b-a5e7-fc749d877195 --round-id fd3c92ff-3178-4dc9-8d9b-acf389b3982b --round-id ae78003a-4efe-425a-881a-d16a39bca0ad`
- Rationale:
  - `coverage` only spends `45` queries
  - `exploration_v2` spends full `50` with `5` diagnostic repeats
  - this is the cleanest immediate policy-only test before altering model logic

### Interruption recovery note

- The first `exploration` run was interrupted by the user turn abort.
- Verified after resuming:
  - no surviving background process for `agent2_dev_query_residual_3rounds_exploration_20260320`
  - no benchmark artifact files created under `data/artifacts/benchmarks/agent2_dev_query_residual_3rounds_exploration_20260320/`
- Action:
  - restart the benchmark from a clean state after pushing current verified checkpoint commit `fbfa76c`

## Immediate Next Actions

1. Run an existing baseline historical benchmark end-to-end and record score, runtime, and artifacts.
2. Inspect the current semimechanistic summary / coefficient extraction path to find the narrowest high-leverage extension.
3. Create the required family experiment registry under `experiments/semimech_hazards/`.
4. Implement the next model iteration only after the baseline is measured and the extension point is clear.
