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
- `uv run --extra dev pytest tests/test_historical_benchmark.py`
  - `6 passed`
- `uv run --extra dev pytest tests/test_online_episode.py`
  - `1 passed`

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

- Completed Tier-2 policy comparison:
  - command:
    - `uv run astar run-historical-benchmark --model query_residual --mode online_interactive --policy exploration --budget 50 --episode-seed 0 --with-png none --name agent2_dev_query_residual_3rounds_exploration_20260320 --round-id 8e839974-b13b-407b-a5e7-fc749d877195 --round-id fd3c92ff-3178-4dc9-8d9b-acf389b3982b --round-id ae78003a-4efe-425a-881a-d16a39bca0ad`
  - result:
    - mean score: `73.1346`
    - mean weighted KL: `0.104737`
    - runtime: `973.411s`
    - artifact: `data/artifacts/benchmarks/agent2_dev_query_residual_3rounds_exploration_20260320/result.json`

## 2026-03-21T10:41Z Restart / corrective direction

- Re-read:
  - `README.md`
  - `docs/game_facts.md`
  - `instructions/agent2.md`
- Re-checked machine state before launching new heavy work:
  - RAM available: about `2.1 TiB`
  - load average still high because other agents are active
  - practical policy for this branch: keep heavy semh runs to `1-2` concurrent jobs, not more
- Confirmed current uncommitted code state includes a new unfinished file:
  - `src/astar/student/predictor/smh_student.py`
- Current direction for this session:
  - stop spending main effort on `query_residual`
  - finish a semh-native transcript-conditioned residual student on top of semh priors
  - register at least one new `smh_*` residual-student model cleanly in CLI / historical benchmark / tests
  - benchmark on the fixed semh dev rounds first, then promote only if it clears the existing semh exactobs line
- Immediate technical issues found in the draft `smh_student.py`:
  - wrong transcript delta-scale logic
  - recomputing geometry inside prediction loop
  - not registered in `interactive.py`
  - no CLI / benchmark / test exposure yet

### 2026-03-21T10:48Z semh residual-student integration

- Landed a real semh transcript-conditioned student module:
  - `src/astar/student/predictor/smh_student.py`
- Current structure:
  - residuals are fit against an evidence-conditioned semh prior, not the old historical-bucket prior
  - regime head is fit from transcript-derived summaries
  - residual head predicts log-prob deltas around the semh prior
  - exact observed cells still get explicit blending
  - teacher blend is locality-gated
- Registered first benchmarkable variants:
  - `smh_coeffbank_z0_h0_covlike_calbase_resid_v001`
  - `smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_resid_v001`
  - `smh_coeffbank_z0_h0_covlike_hbblend60_exactobs_resid_v001`
- Exposed those names in:
  - `src/astar/student/predictor/interactive.py`
  - `src/astar/workflows/historical_benchmark.py`
  - `src/astar/cli.py`
  - `tests/test_historical_benchmark.py`
- Validation after integration:
  - `python3 -m py_compile src/astar/student/predictor/interactive.py src/astar/student/predictor/smh_student.py src/astar/cli.py src/astar/workflows/historical_benchmark.py tests/test_historical_benchmark.py`
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -k 'smh_coeffbank or smh_resid'`
  - result: `14 passed`
- Active Tier-2 dev screens launched on hard path4 holdout:
  - `agent2_dev10_smh_calbase_resid_path4_b50_coverage_20260321`
  - `agent2_dev10_smh_hbblend50_exactobs_resid_path4_b50_coverage_20260321`

### 2026-03-21T11:12Z first semh residual-student benchmark signal

- Added one infra hardening change after a parallel-run failure:
  - widened DuckDB catalog lock retry window in `src/astar/infra/catalog/db.py`
  - reason: parallel semh materialization was failing too early on shared catalog lock contention
- Important runtime finding:
  - the existing scoped synthetic-live dataset dir for coverage/1-sample/all-rounds was partial
  - it had episode JSONs but no `index.parquet` or `summary.json`
  - first residual-student benchmark therefore spent most of its runtime finishing that cache
- Completed Tier-2 hard path4 benchmark:
  - command:
    - `uv run astar run-historical-benchmark --model smh_coeffbank_z0_h0_covlike_calbase_resid_v001 --mode online_interactive --policy coverage --budget 50 --episode-seed 0 --with-png none --name agent2_dev10_smh_calbase_resid_path4_b50_coverage_20260321 --round-id 8e839974-b13b-407b-a5e7-fc749d877195 --round-id ae78003a-4efe-425a-881a-d16a39bca0ad --round-id c5cdf100-a876-4fb7-b5d8-757162c97989 --round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
  - result:
    - mean score: `74.3819`
    - mean weighted KL: `0.098890`
    - runtime: `1380.731s`
    - artifact: `data/artifacts/benchmarks/agent2_dev10_smh_calbase_resid_path4_b50_coverage_20260321/result.json`
  - interpretation:
    - first real semh residual-student result is dramatically above the previous semh exactobs dev lines (`~66.5`)
    - this is the first strong evidence that the semh-native transcript student is the right branch
- Parallel hybrid residual run failed for infra reasons, not score reasons:
  - model: `smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_resid_v001`
  - failure: DuckDB catalog lock while the calbase residual run was still materializing the scoped synthetic-live cache
  - action taken:
    - let the calbase run finish the shared dataset build
    - re-run hybrid residual variants serially now that cache exists

### 2026-03-21T11:48Z full promotion read + rescue branch

- Completed full promotion of pure semh residual student:
  - experiment: `agent2_full_smh_calbase_resid_8rounds_coverage_20260321`
  - model: `smh_coeffbank_z0_h0_covlike_calbase_resid_v001`
  - result: `72.0272 / 0.111177`
  - artifact: `data/artifacts/benchmarks/agent2_full_smh_calbase_resid_8rounds_coverage_20260321/result.json`
- Full-read interpretation:
  - path4 dev win was real but over-specialized
  - pure residual student massively improved:
    - `ae78003a...`
    - `f1dac9a9...`
  - but gave back too much on:
    - `fd3c92ff...`
    - `8e839974...`
    - `71451d74...`
    - `76909e29...`
  - net effect: worse than current standalone semh full best `hbblend50_exactobs`
- Completed direct comparison rerun:
  - `agent2_dev10_smh_hbblend50_exactobs_resid_path4_b50_coverage_20260321`
  - result: `73.8420 / 0.103312`
  - conclusion: hybrid exactobs residual student is clearly weaker than pure calbase residual on the hard dev slice
- New branch opened from the full-read:
  - keep both strong semh lines
    - stable full-line anchor: `smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_v001`
    - hard-round specialist: `smh_coeffbank_z0_h0_covlike_calbase_resid_v001`
  - test semh-to-semh outer blends instead of abandoning the student branch
- Added new semh rescue blend model names:
  - `smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend025_v001`
  - `smh_coeffbank_z0_h0_covlike_hbexact_calresid_adapt025_v001`
- Validation after adding rescue blends:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -k 'smh_coeffbank or smh_resid'`
  - result: `16 passed`
- Active run now:
  - `agent2_full_smh_hbexact_calresid_blend025_8rounds_coverage_20260321`

## 2026-03-21 Standalone Semimech Pivot

### 2026-03-21T09:27:36Z intent correction

- User clarified that `query_residual` is only a baseline/reference and the main assignment is a genuinely new `smh_*` family exploration from the handoff.
- Working rule from this point:
  - keep `query_residual_*` only as score reference / fallback,
  - spend new development on standalone semimechanistic family members,
  - use hybrids only when they materially test semimechanistic complementarity rather than replacing the family with the old baseline.

### Machine / runtime state checked before scaling up

- Host has `384` logical CPUs and about `2.9 TiB` RAM with only about `14 GiB` used at check time.
- Machine was lightly loaded by other Codex/tmux processes.
- Conclusion:
  - heavy parallel experimentation is feasible,
  - but concurrent benchmark/materialization jobs can still collide on shared DuckDB catalog writes and checkpoint paths if not managed.

### Infra / runtime fixes landed for standalone semimech work

- Added `HazardTeacher.load_checkpoint(...)`.
- Added `HazardTeacher.terminal_tensor_from_coefficients(...)`.
- Added fold-keyed checkpoint/caching path for `smh_knn*` and `smh_coeffbank*` models.
- Added shared synthetic-live dataset naming for `smh_knn*` so variant sweeps reuse the same transcript dataset instead of rebuilding it.
- Added precomputed `teacher_terminal_bank` for `SemimechKnnPredictor` so interactive inference no longer decodes teacher terminals repeatedly.
- Added probability-floor normalization to `smh_knn*` and `smh_coeffbank*` outputs to prevent pathological `inf` / `nan` KL.
- Added best-effort catalog logging:
  - `src/astar/infra/catalog/db.py` now exposes `try_log_event(...)`
  - historical/synthetic benchmark workflows use it so completed artifact writes are not lost to final DuckDB lock conflicts during parallel runs.

## New Family Exploration Log

### 2026-03-21 `smh_knn*` summary-bank scaffold

- Implemented first standalone summary-conditioned semimechanistic family:
  - `smh_knn5_z12_h0_covsum_calbase_v001`
  - `smh_knn5_z12_h0_covaug_calbase_v001`
  - `smh_knn5_z12_h0_covaug_calbank_v001`
  - `smh_knn5_z3_h0_covaug_calbase_v001`
  - `smh_knn5_z3_h0_covaug_calblend35_v001`
- Structural idea:
  - fit replay-backed per-round semimechanistic coefficients,
  - summarize legal query transcript into a low-dimensional vector,
  - use kNN over synthetic-live summaries to infer regime/latent neighbors,
  - decode neighbor-weighted teacher or replay terminal tensors.
- Fast 2-round coverage screen on `ae78003a...` + `c5cdf100...`, `budget=20`, `samples_per_round=1`:
  - `smh_knn5_z3_h0_covaug_calbase_v001`:
    - mean score `4.6773`
    - mean weighted KL `1.028932`
    - runtime `41.203s`
    - artifact: `data/artifacts/benchmarks/agent2_dev2b_smh_knn5_z3_covaug_calbase_ae780_c5_spr1_b20_coverage_20260321/result.json`
  - `smh_knn5_z3_h0_covaug_calblend35_v001`:
    - mean score `4.6763`
    - mean weighted KL `1.030489`
    - runtime `41.997s`
    - artifact: `data/artifacts/benchmarks/agent2_dev2b_smh_knn5_z3_covaug_calblend35_ae780_c5_spr1_b20_coverage_20260321/result.json`
  - `smh_knn5_z12_h0_covaug_calbase_v001`:
    - mean score `4.6773`
    - mean weighted KL `1.028932`
    - runtime `334.277s`
    - artifact: `data/artifacts/benchmarks/agent2_dev2b_smh_knn5_z12_covaug_calbase_ae780_c5_spr1_b20_coverage_20260321/result.json`
  - `smh_knn5_z12_h0_covaug_calbank_v001`:
    - mean score `3.5254`
    - mean weighted KL `1.150352`
    - runtime `293.840s`
    - artifact: `data/artifacts/benchmarks/agent2_dev2b_smh_knn5_z12_covaug_calbank_ae780_c5_spr1_b20_coverage_20260321/result.json`
- Read:
  - this first summary-bank student formulation is decisively bad,
  - not worth polishing further before changing the underlying posterior structure.

### 2026-03-21 `smh_coeffbank*` discrete round-law posterior family

- Implemented `SemimechCoefficientBankPredictor` as a new standalone family member.
- Structural idea:
  - fit semimechanistic coefficient vectors for each replay-backed historical round,
  - treat each historical round law as a discrete candidate law,
  - decode each candidate onto the new round map,
  - update posterior directly from observed viewport cell-class likelihoods,
  - output posterior-weighted year-50 tensors.
- First registered variants:
  - `smh_coeffbank_z0_h0_covlike_calbase_v001`
  - `smh_coeffbank_z0_h0_covlike_builtfocus_v001`
  - `smh_coeffbank_z0_h0_covlike_builtsharp_v001`

### Important validation caveat discovered immediately

- A 2-round leave-one-round-out screen is invalid for posterior-over-round-law models.
- Reason:
  - each fold leaves only `1` training round,
  - posterior competition disappears,
  - class weights / temperature cannot change the selected law in any meaningful way.
- Therefore:
  - 2-round coeff-bank scores are only smoke checks,
  - real model selection for this family needs at least `4` rounds in the dev slice.

### 2026-03-21 coeff-bank smoke checks on 2-round slice

- Slice:
  - `ae78003a-4efe-425a-881a-d16a39bca0ad`
  - `c5cdf100-a876-4fb7-b5d8-757162c97989`
- Config:
  - `policy=coverage`
  - `budget=20`
  - `samples_per_round=1`
  - `episode_seed=0`
- Results:
  - `smh_coeffbank_z0_h0_covlike_calbase_v001`:
    - mean score `26.3349`
    - mean weighted KL `0.463163`
    - runtime `97.463s`
    - artifact: `data/artifacts/benchmarks/agent2_dev3_smh_coeffbank_calbase_ae780_c5_spr1_b20_coverage_20260321/result.json`
  - `smh_coeffbank_z0_h0_covlike_builtfocus_v001`:
    - mean score `26.3349`
    - mean weighted KL `0.463163`
    - runtime `85.345s`
    - artifact: `data/artifacts/benchmarks/agent2_dev3_smh_coeffbank_builtfocus_ae780_c5_spr1_b20_coverage_20260321/result.json`
  - `smh_coeffbank_z0_h0_covlike_builtsharp_v001`:
    - mean score `26.3349`
    - mean weighted KL `0.463163`
    - runtime `40.613s`
    - artifact: `data/artifacts/benchmarks/agent2_dev3b_smh_coeffbank_builtsharp_ae780_c5_spr1_b20_coverage_20260321/result.json`
- Interpretation:
  - smoke test passed,
  - near-identity across variants is explained by the one-candidate-per-fold issue above.

### 2026-03-21 coeff-bank real dev benchmark on 4-round slice

- Slice:
  - `8e839974-b13b-407b-a5e7-fc749d877195`
  - `ae78003a-4efe-425a-881a-d16a39bca0ad`
  - `c5cdf100-a876-4fb7-b5d8-757162c97989`
  - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
- Config:
  - `policy=coverage`
  - `budget=20`
  - `samples_per_round=1`
  - `episode_seed=0`
- Results:
  - `smh_coeffbank_z0_h0_covlike_calbase_v001`:
    - mean score `57.1899`
    - mean weighted KL `0.190069`
    - runtime `307.882s`
    - artifact: `data/artifacts/benchmarks/agent2_dev4_smh_coeffbank_calbase_path4_b20_coverage_20260321/result.json`
  - `smh_coeffbank_z0_h0_covlike_builtfocus_v001`:
    - mean score `54.9239`
    - mean weighted KL `0.202463`
    - runtime `300.297s`
    - artifact: `data/artifacts/benchmarks/agent2_dev4_smh_coeffbank_builtfocus_path4_b20_coverage_20260321/result.json`
  - `smh_coeffbank_z0_h0_covlike_builtsharp_v001`:
    - mean score `54.9239`
    - mean weighted KL `0.202463`
    - runtime `312.164s`
    - artifact: `data/artifacts/benchmarks/agent2_dev4_smh_coeffbank_builtsharp_path4_b20_coverage_20260321/result.json`
- Per-round mean for `calbase`:
  - `8e839974...`: `59.0675 / 0.175678`
  - `ae78003a...`: `45.9096 / 0.262312`
  - `c5cdf100...`: `67.1043 / 0.132991`
  - `f1dac9a9...`: `56.6781 / 0.189294`

### 2026-03-21 reference comparison on same 4-round slice

- `historical_bucket_prior`
  - mean score `58.5892`
  - mean weighted KL `0.231346`
  - runtime `62.695s`
  - artifact: `data/artifacts/benchmarks/agent2_dev4_histbucket_path4_b20_coverage_20260321/result.json`
- Per-round mean:
  - `8e839974...`: `88.6466 / 0.040175`
  - `ae78003a...`: `22.3023 / 0.546202`
  - `c5cdf100...`: `73.7242 / 0.101845`
  - `f1dac9a9...`: `49.6836 / 0.237163`

### Standalone family read after coeff-bank dev run

- `smh_coeffbank_z0_h0_covlike_calbase_v001` is the first new standalone semimechanistic line in this session that looks alive.
- It is still below `historical_bucket_prior` on mean score on the 4-round dev slice:
  - `57.1899` vs `58.5892`
- But it is materially better on weighted KL:
  - `0.190069` vs `0.231346`
- Complementarity is strong and structured:
  - coeff-bank much better on `ae78003a...` and better on `f1dac9a9...`
  - historical bucket much better on `8e839974...` and `c5cdf100...`
- Immediate implication:
  - next family branch should test semimechanistic/bucket hybrids and adaptive posterior calibration,
  - not more class-weight sharpening on the pure coeff-bank alone.

## Verification Added During This Pivot

- `uv run --extra dev pytest tests/test_historical_benchmark.py -k 'smh_knn or smh_resid or smh_coeffbank'`
  - `9 passed, 14 deselected`
- Earlier after the checkpoint/floor fixes:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py`
    - `19 passed`

## Immediate Next Branch

1. Add fold-cached `historical_bucket_prior` loading for repeated dev/full sweeps.
2. Add semimechanistic hybrid models using:
   - left: `historical_bucket_prior`
   - right: `smh_coeffbank_z0_h0_covlike_calbase_v001`
3. Start with:
   - fixed blends,
   - disagreement-adaptive blends,
   - then any transcript-derived round-target gating only if needed.
4. Promote only if the hybrid beats both pure coeff-bank and pure historical-bucket on the fixed 4-round dev slice, then re-run on a broader benchmark.

## 2026-03-21 Semimech + Historical Hybrid Sweep

### Code additions for this branch

- Added fold-keyed checkpoint caching for `historical_bucket_prior` in `build_online_predictor(...)`.
- Added generic blend fallback so blended predictors can combine components that do or do not implement `build_prediction_bundle_from_context(...)`.
- Added round-local candidate tensor memoization to `SemimechCoefficientBankPredictor`.
- Added new standalone hybrid model names:
  - `smh_coeffbank_z0_h0_covlike_hbblend25_v001`
  - `smh_coeffbank_z0_h0_covlike_hbblend40_v001`
  - `smh_coeffbank_z0_h0_covlike_hbblend50_v001`
  - `smh_coeffbank_z0_h0_covlike_hbblend60_v001`
  - `smh_coeffbank_z0_h0_covlike_hbadapt25_v001`

### Verification after hybrid wiring

- `uv run --extra dev pytest tests/test_historical_benchmark.py -k 'historical_bucket_prior or smh_coeffbank or smh_knn'`
  - `11 passed, 15 deselected`
- `uv run --extra dev pytest tests/test_historical_benchmark.py -k 'smh_coeffbank or historical_bucket_prior'`
  - `8 passed, 20 deselected`
- `uv run --extra dev pytest tests/test_historical_benchmark.py tests/test_online_episode.py`
  - `29 passed`

### Fixed 4-round dev slice retained

- Rounds:
  - `8e839974-b13b-407b-a5e7-fc749d877195`
  - `ae78003a-4efe-425a-881a-d16a39bca0ad`
  - `c5cdf100-a876-4fb7-b5d8-757162c97989`
  - `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
- Mode/config:
  - `online_interactive`
  - `policy=coverage`
  - `budget=20`
  - `episode_seed=0`

### Hybrid results on the 4-round dev slice

- `smh_coeffbank_z0_h0_covlike_hbblend25_v001`
  - mean score `62.9456`
  - mean weighted KL `0.182315`
  - runtime `79.349s`
  - artifact: `data/artifacts/benchmarks/agent2_dev5_smh_coeffbank_hbblend25_path4_b20_coverage_20260321/result.json`
- `smh_coeffbank_z0_h0_covlike_hbadapt25_v001`
  - mean score `61.8146`
  - mean weighted KL `0.185580`
  - runtime `66.256s`
  - artifact: `data/artifacts/benchmarks/agent2_dev5_smh_coeffbank_hbadapt25_path4_b20_coverage_20260321/result.json`
- `smh_coeffbank_z0_h0_covlike_hbblend40_v001`
  - mean score `64.3401`
  - mean weighted KL `0.167346`
  - runtime `75.788s`
  - artifact: `data/artifacts/benchmarks/agent2_dev5_smh_coeffbank_hbblend40_path4_b20_coverage_20260321/result.json`
- `smh_coeffbank_z0_h0_covlike_hbblend50_v001`
  - mean score `64.7681`
  - mean weighted KL `0.161315`
  - runtime `81.640s`
  - artifact: `data/artifacts/benchmarks/agent2_dev5_smh_coeffbank_hbblend50_path4_b20_coverage_20260321/result.json`
- `smh_coeffbank_z0_h0_covlike_hbblend60_v001`
  - mean score `64.7502`
  - mean weighted KL `0.158263`
  - runtime `79.344s`
  - artifact: `data/artifacts/benchmarks/agent2_dev5_smh_coeffbank_hbblend60_path4_b20_coverage_20260321/result.json`

### Hybrid sweep interpretation

- The semimechanistic + historical hybrid branch is decisively real.
- Every fixed blend handily beat both parent models on the dev slice:
  - `historical_bucket_prior`: `58.5892 / 0.231346`
  - `smh_coeffbank_calbase`: `57.1899 / 0.190069`
- Fixed blend beat adaptive on this axis.
- The blend curve improved monotonically from `25%` to `50%` coeff-bank weight on score:
  - `62.9456 -> 64.3401 -> 64.7681`
- `60%` coeff-bank weight gave slightly lower score than `50%` but slightly better weighted KL:
  - `64.7502 / 0.158263`
- Current dev best on score:
  - `smh_coeffbank_z0_h0_covlike_hbblend50_v001`
- Current dev best on weighted KL:
  - `smh_coeffbank_z0_h0_covlike_hbblend60_v001`

### Per-round read for the leading fixed blends

- `hbblend40`:
  - `8e839974...`: `83.1702 / 0.061440`
  - `ae78003a...`: `35.7463 / 0.353305`
  - `c5cdf100...`: `79.7010 / 0.075844`
  - `f1dac9a9...`: `58.7428 / 0.178796`
- `hbblend50`:
  - `8e839974...`: `80.6632 / 0.071647`
  - `ae78003a...`: `38.2252 / 0.328623`
  - `c5cdf100...`: `80.0741 / 0.074272`
  - `f1dac9a9...`: `60.1099 / 0.170717`
- `hbblend60`:
  - `8e839974...`: `77.6881 / 0.084181`
  - `ae78003a...`: `40.4075 / 0.308439`
  - `c5cdf100...`: `79.8999 / 0.074976`
  - `f1dac9a9...`: `61.0053 / 0.165454`

### Strong structural lesson from the hybrid sweep

- The bucket prior was not just a crude baseline.
- It is carrying real high-confidence structure on some rounds, while coeff-bank posterior inference is recovering complementary regime signal on others.
- The best current standalone family member is therefore not pure coeff-bank but a disciplined semimechanistic/bucket hybrid.
- This is consistent with the handoff:
  - strong semimechanistic teacher/posterior family,
  - plus hybridization only where it improves held-out score materially.

### Policy / budget checks on the current dev best

- `smh_coeffbank_z0_h0_covlike_hbblend50_v001` with `policy=exploration_v2`, same 4-round slice, `budget=20`:
  - exact same result as coverage:
    - `64.7681 / 0.161315`
  - artifact: `data/artifacts/benchmarks/agent2_dev6_smh_coeffbank_hbblend50_path4_b20_exploration_20260321/result.json`
- `smh_coeffbank_z0_h0_covlike_hbblend50_v001` with `budget=50`, `policy=coverage`:
  - exact same result as `budget=20` on this slice:
    - `64.7681 / 0.161315`
  - artifact: `data/artifacts/benchmarks/agent2_dev7_smh_coeffbank_hbblend50_path4_b50_coverage_20260321/result.json`
- `smh_coeffbank_z0_h0_covlike_hbblend60_v001` with `budget=50`, `policy=coverage`:
  - exact same result as `budget=20` on this slice:
    - `64.7502 / 0.158263`
  - artifact: `data/artifacts/benchmarks/agent2_dev7_smh_coeffbank_hbblend60_path4_b50_coverage_20260321/result.json`
- Read:
  - on this dev slice, extra budget and `exploration_v2` are not adding value for the current hybrid family,
  - so the next meaningful promotion step is a broader 8-round serious benchmark, not more local policy tuning on the same slice.

## 2026-03-21 Full Promotion + Exact-Observation Student

### First full serious benchmark for fixed hybrid

- `smh_coeffbank_z0_h0_covlike_hbblend50_v001`
  - full 8-round result:
    - mean score `71.3164`
    - mean weighted KL `0.116452`
    - runtime `1394.942s`
    - artifact: `data/artifacts/benchmarks/agent2_full_smh_coeffbank_hbblend50_8rounds_coverage_20260321/result.json`
- Interpretation:
  - the semimech/bucket hybrid generalizes,
  - but it is still well below the old residual line (`74.4010`) and far below the best local residual artifact (`74.6943`),
  - so the next bottleneck is the student update mechanism, not the round-law family itself.

### Structural diagnosis from the first full run

- Versus `query_residual_v7 + exploration_v2`, the semh hybrid only clearly wins on:
  - `c5cdf100...` by `+8.4141`
  - `f1dac9a9...` by `+0.5504`
- It loses badly on:
  - `ae78003a...` by `-9.5887`
  - `71451d74...` by `-6.7030`
  - `8e839974...` by `-3.5035`
  - `fd3c92ff...` by `-2.8865`
- This read suggested:
  - the semh hybrid prior is useful,
  - but it still underuses local transcript evidence relative to the residual family.

### New student branch: exact-observation conditioning on top of semh hybrid

- Implemented generic `ExactObservationBlendPredictor`.
- Applied it to the best semh fixed blends:
  - `smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_v001`
  - `smh_coeffbank_z0_h0_covlike_hbblend60_exactobs_v001`
- Mechanism:
  - keep the semh hybrid predictive tensor,
  - then blend exact observed per-cell class counts into directly observed cells with entropy-scaled pseudo-count strength.

### Exact-observation dev results on the fixed 4-round slice

- `smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_v001`
  - mean score `66.4867`
  - mean weighted KL `0.148727`
  - runtime `73.893s`
  - artifact: `data/artifacts/benchmarks/agent2_dev8_smh_coeffbank_hbblend50_exactobs_path4_b50_coverage_20260321/result.json`
- `smh_coeffbank_z0_h0_covlike_hbblend60_exactobs_v001`
  - mean score `66.5158`
  - mean weighted KL `0.146162`
  - runtime `78.536s`
  - artifact: `data/artifacts/benchmarks/agent2_dev8_smh_coeffbank_hbblend60_exactobs_path4_b50_coverage_20260321/result.json`
- Improvement vs non-exact `hbblend50` on same slice:
  - score `64.7681 -> 66.4867`
  - weighted KL `0.161315 -> 0.148727`
- Read:
  - exact local observation conditioning is a real missing piece,
  - much more important than the previous policy/budget sweeps.

### Exact-observation full 8-round promotion results

- `smh_coeffbank_z0_h0_covlike_hbblend60_exactobs_v001`
  - mean score `72.2646`
  - mean weighted KL `0.110844`
  - runtime `207.638s`
  - artifact: `data/artifacts/benchmarks/agent2_full_smh_coeffbank_hbblend60_exactobs_8rounds_coverage_20260321/result.json`
- `smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_v001`
  - mean score `72.4834`
  - mean weighted KL `0.110286`
  - runtime `213.990s`
  - artifact: `data/artifacts/benchmarks/agent2_full_smh_coeffbank_hbblend50_exactobs_8rounds_coverage_20260321/result.json`
- Current semh full-score leader:
  - `smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_v001`
- Delta vs prior non-exact full leader `hbblend50`:
  - score `+1.1670`
  - weighted KL `-0.006166`
- This is still below the old best local residual line:
  - score gap vs `query_residual_v9_v10_builtfreqgatexwide_v001`: `-2.2109`
  - weighted KL gap: `+0.009896`

### One failed follow-up after exact-observation success

- Built-frequency-gated semh exactobs probe:
  - `smh_coeffbank_z0_h0_covlike_hbbuiltfreq_exactobs_v001`
  - 4-round dev result:
    - `64.2903 / 0.162718`
    - artifact: `data/artifacts/benchmarks/agent2_dev9_smh_coeffbank_hbbuiltfreq_exactobs_path4_b50_coverage_20260321/result.json`
- Read:
  - the exactobs branch does not want the same monotone built-frequency round gate that helped the residual family,
  - code path removed after the probe; only experiment record retained here.

### Current semh state after this sweep

- Best full standalone semh family result so far:
  - `smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_v001`
  - `72.4834 / 0.110286`
- Family status:
  - clearly viable and much stronger than the first pure coeff-bank line,
  - but still not yet strong enough to replace the old residual line on full local holdout,
  - the remaining gap appears to be richer transcript-conditioned student structure, not basic semimech prior quality.
  - interpretation:
    - `exploration_v2` improves over repaired `coverage` baseline on the same 3-round probe
    - delta vs `query_residual + coverage`:
      - score: `+0.5027`
      - weighted KL: `-0.002310`
    - policy is therefore a confirmed immediate lever, not just a hypothesis

### Interruption recovery note

- The first `exploration` run was interrupted by the user turn abort.
- Verified after resuming:
  - no surviving background process for `agent2_dev_query_residual_3rounds_exploration_20260320`
  - no benchmark artifact files created under `data/artifacts/benchmarks/agent2_dev_query_residual_3rounds_exploration_20260320/`
- Action:
  - restart the benchmark from a clean state after pushing current verified checkpoint commit `fbfa76c`

## New Model Branch Added

- Added benchmarkable online model:
  - `smh_resid_z12_h0_covbase_locgate_v001`
- Current intent:
  - keep the same residual family / hazard-teacher backbone as `query_residual_v7`
  - remove forced minimum correction by setting `min_delta_scale=0.0`
  - localize the teacher blend to observed regions using blurred coverage, instead of a constant global teacher contribution on all unobserved cells
- Reason:
  - current evidence suggests `query_residual_v7` can over-correct easy rounds because it never fully turns off residual action and always injects a weak global teacher prior

## Current Experiment State

- Policy-only probe:
  - complete
  - winner over repaired coverage baseline on the fixed 3-round dev subset
- Model-only probe:
  - previous run was interrupted and left no benchmark artifact under `data/artifacts/benchmarks/agent2_dev_smh_resid_locgate_3rounds_coverage_20260320/`
  - rerun needed from the now-cached coverage dataset state

### 2026-03-21T08:12:00Z

- Re-checked current checkout state before resuming heavy runs:
  - `git status --short --branch` still shows branch `agent2` diverged from `origin/agent2` with local dirty artifacts
  - no active historical benchmark process in this checkout
  - `br list` still unavailable in this environment (`br: command not found`)
- Important cache/validation finding from code inspection:
  - `QueryResidualPredictor.fit_from_workspace(...)` always materializes the synthetic-live dataset over all locally available replay-backed analyzed rounds, then filters the index down to the selected training rounds
  - therefore the existing `exploration` cache at `data/artifacts/datasets/query_residual_synthetic_live__policy=exploration__samples=1__rounds=n=8__sha1=ea07400de1/` is valid for full 8-round leave-one-round-out historical benchmarking without holdout leakage
  - implication: the next full `query_residual + exploration` benchmark should reuse the already-built dataset instead of paying the initial 8-round synthetic transcript build again
- Cleanup/follow-up patch prepared before next run:
  - preserve `samples_per_round` in query-residual-family checkpoint directory names after the new shared builder refactor
  - make `run-historical-benchmark` report `samples_per_round` consistently for `smh_resid_z12_h0_covbase_locgate_v001`

### 2026-03-21T08:47:00Z

- Verified the benchmark metadata / checkpoint cleanup:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py` -> `6 passed`
  - `uv run --extra dev pytest tests/test_online_episode.py` -> `1 passed`
- Completed Tier-3 full leave-one-round-out benchmark on all `8` local analyzed rounds:
  - command:
    - `uv run astar run-historical-benchmark --model query_residual --mode online_interactive --policy exploration --samples-per-round 1 --budget 50 --episode-seed 0 --with-png none --name agent2_full_query_residual_8rounds_exploration_20260321`
  - result:
    - mean score: `74.4010`
    - mean weighted KL: `0.101998`
    - runtime: `1553.087s`
    - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_8rounds_exploration_20260321/result.json`
- Promotion decision:
  - this beats the best pre-existing full local online artifact `dev_query_residual_online50_v7`
  - score delta: `+0.4505`
  - weighted KL delta: `-0.004328`
  - runtime delta vs old artifact: `-283.502s`
- Important interpretation:
  - `exploration_v2` is not uniformly better by round
  - it is slightly worse on `7/8` rounds, but massively improves the catastrophic `f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb` round
  - dominant swing on that round:
    - score delta vs old coverage benchmark: `+9.3641`
    - weighted KL delta: `-0.061395`
  - net effect is therefore a real robustness win, not benchmark noise

## Updated Best Known Local Line

- Previous best full local historical-online result in this checkout:
  - experiment: `agent2_full_query_residual_8rounds_exploration_20260321`
  - model: `query_residual_v7`
  - policy: `exploration_v2`
  - mean score: `74.4010`
  - mean weighted KL: `0.101998`

### 2026-03-21T09:18:00Z

- Completed Tier-3 full leave-one-round-out benchmark for the new model branch under the promoted exploration policy:
  - command:
    - `uv run astar run-historical-benchmark --model smh_resid_z12_h0_covbase_locgate_v001 --mode online_interactive --policy exploration --samples-per-round 1 --budget 50 --episode-seed 0 --with-png none --name agent2_full_smh_resid_locgate_8rounds_exploration_20260321`
  - result:
    - mean score: `74.4053`
    - mean weighted KL: `0.101981`
    - runtime: `1507.368s`
    - artifact: `data/artifacts/benchmarks/agent2_full_smh_resid_locgate_8rounds_exploration_20260321/result.json`
- Comparison vs prior promoted line `query_residual_v7 + exploration_v2`:
  - score delta: `+0.0043`
  - weighted KL delta: `-0.000017`
  - runtime delta: `-45.719s`
- Important interpretation:
  - the improvement is extremely localized
  - `7/8` rounds are bit-for-bit unchanged relative to `query_residual_v7 + exploration_v2`
  - only round `8e839974-b13b-407b-a5e7-fc749d877195` moved:
    - score delta: `+0.034415`
    - weighted KL delta: `-0.000134219`
  - therefore the localized teacher gating variant is a valid but very small refinement, not a major behavioral shift

## Historical Checkpoint After Localgate Sweep

- Current best full local historical-online result in this checkout:
  - experiment: `agent2_full_smh_resid_locgate_8rounds_exploration_20260321`
  - model: `smh_resid_z12_h0_covbase_locgate_v001`
  - policy: `exploration_v2`
  - mean score: `74.4053`
  - mean weighted KL: `0.101981`

## Next Actions Planned At That Stage

1. Commit and push the promoted `smh_resid_z12_h0_covbase_locgate_v001 + exploration_v2` line plus supporting code/test/doc updates.
2. Leave the large generated replay/episode cache churn unstaged unless specifically needed in a future follow-up.
3. If continuing later, search for higher-leverage teacher-weight / gating variants rather than more policy churn, because policy is now the dominant settled gain.

### 2026-03-21T09:35:00Z

- Resumed after push on synced branch `agent2`; remote now matches local commit `33c0f2e`.
- Confirmed current worktree still has only unstaged generated cache churn under:
  - `data/artifacts/episodes/`
  - `data/artifacts/replays/`
  - `data/derived/replay_summaries/`
  - partial synthetic dataset materializations
- Inspected parallel local branch work before launching more blind benchmarks:
  - `agent7` manifold / novelty-gated `query_residual_v8/v9` variants are already dominated by current `agent2` exploration line
    - `agent7` full `v8 + coverage`: `73.0354`
    - `agent7` full `v9 + coverage`: `73.4065`
  - `agent3` exact-local-residual + entropy-stratification family remains interesting
    - corrected full `query_residual_v8 + coverage`: `74.3226`
    - still below current `agent2` best `74.4053`, but the mechanism directly targets the same pathological barren/static round family
    - targeted 2-round holdout evidence from `agent3` suggests:
      - `v8` strongly helps `f1dac9...`
      - `v10` softens `36e581...` but gives back too much on `f1dac9...`
- Decision:
  - port only the minimal `agent3` mechanics needed to benchmark `query_residual_v8 + exploration_v2` in this branch
  - skip `agent7` manifold variants for now because they are already clearly worse than the current branch champion under honest full-dev evaluation

### 2026-03-21T09:49:00Z

- Began the minimal `agent3` mechanic port on top of current `agent2` winner branch.
- Patch scope:
  - add `query_residual_v8/v9/v10` named variants to this branch
  - add entropy-stratified cell selection for residual regression sampling
  - add optional exact local residual channels
  - keep current `agent2` `teacher_locality_blend` work, but fix its coverage-channel lookup so extra local channels cannot silently corrupt the gate
  - expose the variants through online predictor dispatch, CLI model choices, and historical benchmark sample metadata
  - add smoke coverage for the three new named variants in `tests/test_historical_benchmark.py`
- Validation plan after patch:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py`
  - `uv run --extra dev pytest tests/test_online_episode.py`
  - then choose the best full benchmark candidate under `exploration_v2`

### 2026-03-21T11:36:00Z

- Completed the `agent3`-mechanic variant sweep under the promoted `exploration_v2` policy:
  - hard 3-round screen (`36e581`, `8e839`, `f1dac9`):
    - `smh_resid_z12_h0_covbase_locgate_v001`: `61.9581 / 0.164532`
    - `query_residual_v8`: `62.3290 / 0.162720`
    - `query_residual_v10`: `62.8964 / 0.159491`
  - interpretation:
    - `v10` clearly won the targeted screen by improving both `8e839...` and `f1dac9...`, with only a modest giveback on `36e581...`
- Full 8-round leave-one-round-out follow-up results:
  - `query_residual_v10 + exploration_v2`:
    - `74.3810 / 0.101476`
    - better weighted KL than current winner, but lower score because it gave back too much on easier rounds (`ae78003a`, `76909e29`, `71451d74`)
  - `query_residual_v9 + exploration_v2`:
    - `74.4773 / 0.101601`
    - new best score in this checkout so far
    - beats prior promoted `smh` line by `+0.0720` score and `-0.000380` weighted KL
- New follow-up decision:
  - expose and test one final stacked variant `query_residual_v9_locgate_v001`
  - rationale:
    - local teacher gating was already a small positive on top of `v7`
    - the channel-index bug that would have broken this on exact-local-residual variants is now fixed
    - this is the last obvious non-redundant combination before stopping the sweep

### 2026-03-21T12:04:00Z

- Validation after exposing `query_residual_v9_locgate_v001`:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py` -> `10 passed`
  - `uv run --extra dev pytest tests/test_online_episode.py` -> `1 passed`
- Final full 8-round leave-one-round-out result for the stacked variant:
  - command:
    - `uv run astar run-historical-benchmark --model query_residual_v9_locgate_v001 --mode online_interactive --policy exploration --samples-per-round 1 --budget 50 --episode-seed 0 --with-png none --name agent2_full_query_residual_v9_locgate_8rounds_exploration_20260321`
  - result:
    - mean score: `74.4815`
    - mean weighted KL: `0.101584`
    - runtime: `1631.958s`
    - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_v9_locgate_8rounds_exploration_20260321/result.json`
- Comparison vs prior best `query_residual_v9 + exploration_v2`:
  - score delta: `+0.004244`
  - weighted KL delta: `-0.000016549`
  - runtime delta: `+42.458s`
  - only round `8e839974-b13b-407b-a5e7-fc749d877195` changed:
    - score delta: `+0.033953`
    - weighted KL delta: `-0.000132395`
- Comparison vs previous promoted branch winner `smh_resid_z12_h0_covbase_locgate_v001 + exploration_v2`:
  - score delta: `+0.076235`
  - weighted KL delta: `-0.000397168`
- Sweep conclusion for this turn:
  - `query_residual_v8` helped the hard screen but did not earn a full promotion
  - `query_residual_v10` improved weighted KL materially, but lost too much score on easier rounds
  - `query_residual_v9` was the major win
  - `query_residual_v9_locgate_v001` added the final small but real refinement on top

## Current Best Known Local Line

- Current best full local historical-online result in this checkout:
  - experiment: `agent2_full_query_residual_v9_v10_adaptive025_8rounds_exploration_20260321`
  - model: `query_residual_v9_v10_adaptive025_v001`
  - policy: `exploration_v2`
  - mean score: `74.5181`
  - mean weighted KL: `0.101208`

### 2026-03-21T12:16:00Z

- Post-sweep comparative analysis before stopping:
  - `v10` remains meaningfully complementary to the promoted `v9_locgate` line
  - full-round deltas `v10 - v9_locgate`:
    - wins:
      - `c5cdf100...`: `+2.505296` score, `-0.011812027` KL
      - `f1dac9a9...`: `+2.634049` score, `-0.015378347` KL
      - `8e839974...`: `+0.161152` score, `-0.000628098` KL
    - losses:
      - `ae78003a...`: `-3.857902` score, `+0.016966713` KL
      - `76909e29...`: `-1.147920` score, `+0.004586088` KL
      - `36e581f1...`: `-0.690795` score, `+0.003704263` KL
      - `71451d74...`: `-0.355043` score, `+0.001473651` KL
- New targeted follow-up:
  - expose one final regularized `v10` variant:
    - `query_residual_v10_pb040_v001`
    - same top-heavy exact-local-residual structure as `v10`
    - stronger `prior_blend=0.40` to damp the easy-round overcorrection without discarding the hard-round gains entirely
  - decision rule:
    - run smoke tests
    - run one full 8-round historical benchmark
    - if it does not beat `v9_locgate`, stop this branch sweep for now instead of adding more near-duplicate knobs

### 2026-03-21T12:49:00Z

- Validation for the temporary `v10_pb040` probe:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py` -> `11 passed`
  - `uv run --extra dev pytest tests/test_online_episode.py` -> `1 passed`
- Final full benchmark result for the regularized `v10` probe:
  - command:
    - `uv run astar run-historical-benchmark --model query_residual_v10_pb040_v001 --mode online_interactive --policy exploration --samples-per-round 1 --budget 50 --episode-seed 0 --with-png none --name agent2_full_query_residual_v10_pb040_8rounds_exploration_20260321`
  - result:
    - mean score: `73.9346`
    - mean weighted KL: `0.103787`
    - runtime: `1581.968s`
    - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_v10_pb040_8rounds_exploration_20260321/result.json`
- Outcome:
  - the stronger prior fallback over-regularized the exact-local-residual / top-heavy line
  - versus current winner `query_residual_v9_locgate_v001`, this probe is clearly dominated on both score and weighted KL
  - removed the temporary model registration after the benchmark so the branch only keeps winning or reusable code paths
- Practical stopping point for this turn:
  - current local search over the residual family has covered:
    - base `v7`
    - localized gating on `v7`
    - exact-local-residual variants `v8/v9/v10`
    - localized gating stacked on the exact-local-residual winner
    - one final regularized `v10` probe, which failed badly
  - no new high-signal residual-family variant remains obvious right now without moving to a qualitatively different model or blend family

### 2026-03-21T13:02:00Z

- Switched from single-model residual sweeps to a qualitatively different follow-up family:
  - fixed prediction blending between the promoted `query_residual_v9_locgate_v001` line and the complementary `query_residual_v10` line
- Motivation:
  - full-round deltas show a strong complementarity pattern:
    - `v10` materially wins on `c5cdf100...`, `f1dac9...`, and still slightly on `8e839...`
    - `v9_locgate` remains much better on `ae78003a...`, `76909e29...`, `36e581...`, `71451...`
  - this is the first post-sweep idea that is not just another near-duplicate residual knob
  - KL convexity makes convex prediction blends a plausible way to improve over both constituent models even when one constituent has lower score in aggregate
- First blend candidate exposed:
  - `query_residual_v9_v10_blend025_v001`
  - definition:
    - `75%` `query_residual_v9_locgate_v001`
    - `25%` `query_residual_v10`
- Validation plan:
  - rerun smoke tests
  - if green, run one full 8-round historical benchmark before deciding whether the blend family is worth deeper follow-up

### 2026-03-21T13:54:00Z

- Completed first full fixed-blend benchmark:
  - command:
    - `uv run astar run-historical-benchmark --model query_residual_v9_v10_blend025_v001 --mode online_interactive --policy exploration --samples-per-round 1 --budget 50 --episode-seed 0 --with-png none --name agent2_full_query_residual_v9_v10_blend025_8rounds_exploration_20260321`
  - result:
    - mean score: `74.5110`
    - mean weighted KL: `0.101290`
    - runtime: `2968.885s`
    - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_v9_v10_blend025_8rounds_exploration_20260321/result.json`
- Comparison vs current promoted single-model line `query_residual_v9_locgate_v001`:
  - score delta: `+0.029414`
  - weighted KL delta: `-0.000294587`
  - dominant round moves:
    - gains:
      - `c5cdf100...`: `+0.686885` score, `-0.003278396` KL
      - `f1dac9a9...`: `+0.702416` score, `-0.004166179` KL
      - `8e839974...`: `+0.042858` score, `-0.000167146` KL
    - givebacks:
      - `ae78003a...`: `-0.829574` score, `+0.003576424` KL
      - `36e581f1...`: `-0.152744` score, `+0.000815458` KL
      - `76909e29...`: `-0.151299` score, `+0.000600729` KL
- Decision:
  - fixed blends are a live positive result, not a dead-end probe
  - the `25%` weight is probably not obviously optimal because the remaining giveback is concentrated in `ae78003a...`
  - expose exactly one lighter follow-up candidate:
    - `query_residual_v9_v10_blend020_v001`
    - rationale:
      - preserve most of the `c5cdf100...` / `f1dac9a9...` recovery while reducing the biggest easy-round penalty
  - validation plan:
    - rerun smoke tests
    - run one full 8-round benchmark for the `20%` blend

### 2026-03-21T14:48:00Z

- Completed the one lighter follow-up benchmark:
  - command:
    - `uv run astar run-historical-benchmark --model query_residual_v9_v10_blend020_v001 --mode online_interactive --policy exploration --samples-per-round 1 --budget 50 --episode-seed 0 --with-png none --name agent2_full_query_residual_v9_v10_blend020_8rounds_exploration_20260321`
  - result:
    - mean score: `74.5077`
    - mean weighted KL: `0.101335`
    - runtime: `2916.893s`
    - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_v9_v10_blend020_8rounds_exploration_20260321/result.json`
- Comparison vs current blend winner `query_residual_v9_v10_blend025_v001`:
  - score delta: `-0.003219`
  - weighted KL delta: `+0.000045829`
  - runtime delta: `-51.992s`
  - pattern:
    - `20%` does reduce the biggest `ae78003a...` giveback (`+0.172664` score vs `25%`)
    - but it gives back slightly too much on the recovered hard rounds:
      - `c5cdf100...`: `-0.134643`
      - `f1dac9a9...`: `-0.138437`
- Outcome:
  - `25%` remains the best tested fixed blend
  - the immediate lighter-weight follow-up did not beat it, so the fixed-blend family now has at least a minimal local bracketing check rather than a single ad hoc win
  - keep the reusable fixed-blend machinery
  - removed the losing `query_residual_v9_v10_blend020_v001` registration after recording the result, mirroring the cleanup used for the failed `v10_pb040` probe

### 2026-03-21T15:22:00Z

- New follow-up direction after the fixed-weight bracketing check:
  - avoid spending more full runs on near-identical scalar blend weights
  - add held-out-fold checkpoint caching for query-residual-family predictors keyed by the exact training-round set
  - expose one adaptive blend candidate:
    - `query_residual_v9_v10_adaptive025_v001`
- Rationale:
  - `25%` fixed blending already won; `20%` confirmed the residual trade-off is localized, not just a globally too-large `v10` weight
  - the next plausible gain is to reallocate `v10` mass toward cells where the two models disagree and uncertainty is high, while reducing `v10` on easy/agreeing cells
  - fold-keyed checkpoints do not change validation semantics, but should materially improve iteration speed for any further blend-family probes
- Adaptive blend design:
  - compute per-cell normalized entropy from the midpoint prediction
  - compute per-cell total-variation disagreement between `v9_locgate` and `v10`
  - set the `v10` weight proportional to `entropy * disagreement`, then renormalize back toward a `25%` mean target with clipping
- Validation plan:
  - rerun smoke tests
  - run a targeted 4-round complementarity probe on:
    - `8e839974...`
    - `ae78003a...`
    - `c5cdf100...`
    - `f1dac9a9...`
  - only run the full 8-round benchmark if the targeted probe looks genuinely promising

### 2026-03-21T15:48:00Z

- Validation after exposing `query_residual_v9_v10_adaptive025_v001`:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py` -> `12 passed`
  - `uv run --extra dev pytest tests/test_online_episode.py` -> `1 passed`
- Completed the targeted 4-round complementarity probe:
  - command:
    - `uv run astar run-historical-benchmark --model query_residual_v9_v10_adaptive025_v001 --mode online_interactive --policy exploration --samples-per-round 1 --budget 50 --episode-seed 0 --with-png none --name agent2_dev_query_residual_v9_v10_adaptive025_path4_exploration_20260321 --round-id 8e839974-b13b-407b-a5e7-fc749d877195 --round-id ae78003a-4efe-425a-881a-d16a39bca0ad --round-id c5cdf100-a876-4fb7-b5d8-757162c97989 --round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
  - result:
    - mean score: `72.4575`
    - mean weighted KL: `0.111134`
    - runtime: `565.427s`
    - artifact: `data/artifacts/benchmarks/agent2_dev_query_residual_v9_v10_adaptive025_path4_exploration_20260321/result.json`
- Comparison vs fixed `query_residual_v9_v10_blend025_v001` on the same 4 rounds:
  - score delta: `+0.038175`
  - weighted KL delta: `-0.000314`
  - detailed pattern:
    - wins:
      - `8e839974...`: `+2.460528` score, `-0.009451375` KL
      - `c5cdf100...`: `+2.422759` score, `-0.011169313` KL
      - `f1dac9a9...`: `+4.919060` score, `-0.026955606` KL
    - loss:
      - `ae78003a...`: `-9.649557` score, `+0.046319157` KL
- Interpretation:
  - the adaptive gate is clearly more aggressive than the fixed `25%` blend
  - it is not a uniformly safer replacement, but the exact targeted screen it was meant to attack is still net-positive
  - therefore it has earned one honest full 8-round benchmark, rather than being promoted from the dev probe alone
- Runtime / validation improvement confirmed:
  - the new held-out-fold checkpoint caching is already materializing `n=3` and `n=7` component checkpoints keyed by the training-round set
  - implication:
    - the first adaptive full run is the expensive cache-building run
    - any immediate follow-up blend-family rerun should now be materially cheaper without changing the holdout protocol

### 2026-03-21T16:41:00Z

- Completed the first full adaptive-blend benchmark:
  - command:
    - `uv run astar run-historical-benchmark --model query_residual_v9_v10_adaptive025_v001 --mode online_interactive --policy exploration --samples-per-round 1 --budget 50 --episode-seed 0 --with-png none --name agent2_full_query_residual_v9_v10_adaptive025_8rounds_exploration_20260321`
  - result:
    - mean score: `74.5181`
    - mean weighted KL: `0.101208`
    - runtime: `3005.827s`
    - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_v9_v10_adaptive025_8rounds_exploration_20260321/result.json`
- Comparison vs current best fixed blend `query_residual_v9_v10_blend025_v001`:
  - score delta: `+0.007162`
  - weighted KL delta: `-0.000081729`
  - dominant wins:
    - `c5cdf100...`: `+0.220215` score, `-0.001041433` KL
    - `f1dac9a9...`: `+0.219356` score, `-0.001264388` KL
    - `8e839974...`: `+0.015009` score, `-0.000058469` KL
  - main givebacks:
    - `ae78003a...`: `-0.274970` score, `+0.001192964` KL
    - `76909e29...`: `-0.081473` score, `+0.000323209` KL
- Interpretation:
  - the adaptive gate is a real full promotion signal, not just a dev-probe artifact
  - but the linear weighting rule still appears sharper than ideal; it likely over-concentrates `v10` mass on a subset of cells in `ae78003a...`
- New immediate follow-up:
  - expose one milder variant:
    - `query_residual_v9_v10_adaptive025sqrt_v001`
  - change:
    - keep the same entropy-times-disagreement adaptive rule
    - compress the per-cell weight spread with a square-root exponent before scaling back to the `25%` target
  - rationale:
    - preserve the proven adaptive gain direction
    - reduce the residual over-shoot on `ae78003a...` and the smaller easy-round regressions

### 2026-03-21T16:58:00Z

- Completed the cached sqrt-compressed adaptive follow-up:
  - targeted 4-round result:
    - `72.4570 / 0.111125` in `66.163s`
  - full 8-round result:
    - `74.5158 / 0.101245` in `180.440s`
    - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_v9_v10_adaptive025sqrt_8rounds_exploration_20260321/result.json`
- Read:
  - the cache-keyed held-out checkpoints work extremely well; repeat full blend-family runs are now cheap enough for tighter local search
  - `adaptive025sqrt` remains better than fixed `blend025`, but it does not beat linear `adaptive025`
- New final cheap follow-up:
  - expose `query_residual_v9_v10_adaptive020_v001`
  - rationale:
    - the remaining failure mode of linear `adaptive025` is still excess loss on `ae78003a...`
    - lowering the adaptive target mean from `25%` to `20%` is the most plausible remaining way to keep the adaptive hard-round allocation while softening that over-shoot

### 2026-03-21T17:14:00Z

- Validation after exposing `query_residual_v9_v10_adaptive020_v001`:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py` -> `14 passed`
  - `uv run --extra dev pytest tests/test_online_episode.py` -> `1 passed`
- Completed the cached `adaptive020` sweep:
  - targeted 4-round result:
    - `72.4935 / 0.110934` in `66.806s`
    - strongest path4 screen result among tested adaptive variants
  - full 8-round result:
    - `74.5164 / 0.101253` in `183.862s`
    - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_v9_v10_adaptive020_8rounds_exploration_20260321/result.json`
- Comparison across the cached follow-up adaptive variants:
  - `adaptive025`:
    - full `74.5181 / 0.101208`
    - current winner
  - `adaptive025sqrt`:
    - full `74.5158 / 0.101245`
    - slightly below `adaptive025`
  - `adaptive020`:
    - full `74.5164 / 0.101253`
    - slightly below `adaptive025`, despite the best path4 screen
- Sweep conclusion for this turn:
  - the adaptive family is real:
    - it beats fixed `blend025` on full 8-round eval
  - cached held-out-fold checkpoints are also real:
    - first full adaptive run: `3005.827s`
    - later full reruns with cached components: about `180s`
  - among the tested adaptive variants, `query_residual_v9_v10_adaptive025_v001` remains the best local full result
  - removed the losing temporary registrations `adaptive025sqrt` and `adaptive020` after recording them, keeping only the winning adaptive path plus the reusable checkpoint caching improvement

### 2026-03-21T18:02:00Z

- New diagnostic read before the next blend-family sweep:
  - compared `v10` vs `v9_locgate` on the decisive rounds using actual held-out online transcripts
  - key finding:
    - the sign of the `v10` effect is mostly round-level, not cell-level
    - on harsh rounds `c5cdf100...` and `f1dac9a9...`, the high entropy-disagreement cells are exactly where `v10` helps most
    - on prosperous round `ae78003a...`, those same high-signal cells are exactly where `v10` hurts most
  - crucial separator found in the legal transcript itself:
    - observed built-frequency in the queried year-50 maps
    - `ae78003a...`: about `0.2723`
    - `8e839974...`: about `0.1024`
    - `c5cdf100...`: about `0.0295`
    - `f1dac9a9...`: about `0.0035`
- Hypothesis:
  - `v10` is the better conservative/destructive residual on low-built harsh rounds
  - `v9_locgate` is better on high-built prosperous rounds
  - therefore the next blend should keep the existing per-cell entropy-disagreement allocation but adapt the round-level mean `v10` target from the observed built-frequency

### 2026-03-21T18:10:00Z

- Implemented the built-frequency-gated blend family:
  - added `query_residual_v9_v10_builtfreqgate_v001`
  - added `query_residual_v9_v10_builtfreqgatewide_v001`
  - added `query_residual_v9_v10_builtfreqgatexwide_v001`
  - structure:
    - reuse cached held-out `v9_locgate` and `v10` component predictors
    - keep the adaptive per-cell entropy-times-disagreement shape
    - replace the fixed `25%` round mean target with a built-frequency-driven target computed from `RoundEvidenceBundle`
  - current strongest variant spans the full existing per-cell clip range:
    - round target in `[0.05, 0.45]`
- Validation while exposing the new family:
  - first addition: `uv run --extra dev pytest tests/test_historical_benchmark.py` -> `13 passed`
  - second addition: `uv run --extra dev pytest tests/test_historical_benchmark.py` -> `14 passed`
  - final addition: `uv run --extra dev pytest tests/test_historical_benchmark.py` -> `15 passed`
  - `uv run --extra dev pytest tests/test_online_episode.py` stayed `1 passed`

### 2026-03-21T18:18:00Z

- Completed the first built-frequency-gated targeted probe:
  - command:
    - `uv run astar run-historical-benchmark --model query_residual_v9_v10_builtfreqgate_v001 --mode online_interactive --policy exploration --samples-per-round 1 --budget 50 --episode-seed 0 --with-png none --name agent2_dev_query_residual_v9_v10_builtfreqgate_path4_exploration_20260321 --round-id 8e839974-b13b-407b-a5e7-fc749d877195 --round-id ae78003a-4efe-425a-881a-d16a39bca0ad --round-id c5cdf100-a876-4fb7-b5d8-757162c97989 --round-id f1dac9a9-5cf1-49a9-8f17-d6cb5d5ba5cb`
  - result:
    - mean score: `72.6395`
    - mean weighted KL: `0.110194`
    - runtime: `66.594s`
    - artifact: `data/artifacts/benchmarks/agent2_dev_query_residual_v9_v10_builtfreqgate_path4_exploration_20260321/result.json`
- Read:
  - this is materially stronger than the previous adaptive screens on the same 4 rounds
  - therefore the built-frequency gate earned a direct full benchmark

### 2026-03-21T18:24:00Z

- Completed the first full built-frequency-gated benchmark:
  - command:
    - `uv run astar run-historical-benchmark --model query_residual_v9_v10_builtfreqgate_v001 --mode online_interactive --policy exploration --samples-per-round 1 --budget 50 --episode-seed 0 --with-png none --name agent2_full_query_residual_v9_v10_builtfreqgate_8rounds_exploration_20260321`
  - result:
    - mean score: `74.6341`
    - mean weighted KL: `0.100659`
    - runtime: `173.201s`
    - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_v9_v10_builtfreqgate_8rounds_exploration_20260321/result.json`
- Comparison vs prior best `query_residual_v9_v10_adaptive025_v001`:
  - score delta: `+0.1160`
  - weighted KL delta: `-0.000548`
  - win rate: `0.975`
  - score delta CI95: `[0.0714, 0.1624]`
  - important pattern:
    - improved every round mean, not just the hard pair
    - largest round lifts:
      - `ae78003a...`: `+0.446449`
      - `c5cdf100...`: `+0.197509`
      - `f1dac9a9...`: `+0.189090`
- Interpretation:
  - the missing signal was round harshness, not another local-only weighting tweak
  - observed built-frequency is a real online-safe proxy for that harshness

### 2026-03-21T18:36:00Z

- Ran the first spread bracketing follow-up:
  - command:
    - `uv run astar run-historical-benchmark --model query_residual_v9_v10_builtfreqgatewide_v001 --mode online_interactive --policy exploration --samples-per-round 1 --budget 50 --episode-seed 0 --with-png none --name agent2_full_query_residual_v9_v10_builtfreqgatewide_8rounds_exploration_20260321`
  - result:
    - mean score: `74.6677`
    - mean weighted KL: `0.100508`
    - runtime: `164.123s`
    - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_v9_v10_builtfreqgatewide_8rounds_exploration_20260321/result.json`
- Comparison vs `builtfreqgate_v001`:
  - score delta: `+0.0336`
  - weighted KL delta: `-0.000151`
  - dominant wins remained concentrated in the same harsh-vs-prosperous separator rounds:
    - `ae78003a...`
    - `c5cdf100...`
    - `f1dac9a9...`
- Decision:
  - the spread sweep was still moving in the right direction
  - one last stronger bracket was justified

### 2026-03-21T18:48:00Z

- Completed the final stronger spread bracket:
  - command:
    - `uv run astar run-historical-benchmark --model query_residual_v9_v10_builtfreqgatexwide_v001 --mode online_interactive --policy exploration --samples-per-round 1 --budget 50 --episode-seed 0 --with-png none --name agent2_full_query_residual_v9_v10_builtfreqgatexwide_8rounds_exploration_20260321`
  - result:
    - mean score: `74.6943`
    - mean weighted KL: `0.100390`
    - runtime: `168.281s`
    - artifact: `data/artifacts/benchmarks/agent2_full_query_residual_v9_v10_builtfreqgatexwide_8rounds_exploration_20260321/result.json`
- Comparison vs `query_residual_v9_v10_builtfreqgatewide_v001`:
  - score delta: `+0.0266`
  - weighted KL delta: `-0.000118`
  - win rate: `0.850`
  - score delta CI95: `[0.0128, 0.0433]`
- Comparison vs prior adaptive best `query_residual_v9_v10_adaptive025_v001`:
  - score delta: `+0.1761`
  - weighted KL delta: `-0.000817`
  - win rate: `0.975`
  - score delta CI95: `[0.1045, 0.2581]`
- Sweep conclusion for this turn:
  - built-frequency-gated round targeting is the strongest result found so far in this checkout
  - the monotone spread sweep kept improving through `xwide`
  - stopping point for this turn:
    - `xwide` already uses the full existing round-target clip range `[0.05, 0.45]`
    - further gains now likely require a new axis such as per-cell floor/cap changes or a learned round-target map, not just more of the same spread increase
  - current best full local result is now:
    - `query_residual_v9_v10_builtfreqgatexwide_v001 + exploration_v2`
    - `74.6943 / 0.100390`

### 2026-03-21T19:20:00Z

- User clarified the intended assignment more sharply:
  - `query_residual` should be treated only as an initial baseline/reference
  - the real task is standalone new-family development from the semimechanistic hazard/state-space handoff
- Immediate pivot decisions:
  - freeze the pushed `query_residual` result as baseline only
  - stop extending residual variants
  - remove the uncommitted off-mission temp residual variant `query_residual_v9_v10_builtfreqgatexwide_nofloor_cap050_v001`
  - begin a real standalone `smh_*` family implementation
- Re-read / inspected the in-tree semimechanistic scaffold:
  - `src/astar/teacher/dynamics/hazard_teacher.py`
  - `src/astar/student/posterior/deepset_student.py`
  - `src/astar/history/summaries/round_coefficients.py`
  - `src/astar/history/summaries/manifold.py`
  - `src/astar/history/datasets/synthetic_live.py`
  - `src/astar/workflows/train_student.py`
- Main structural conclusion:
  - the strongest legitimate starting seam is not `query_residual`
  - it is the replay-derived `HazardTeacher` + synthetic-live student path, but it was not yet a first-class online predictor family

### 2026-03-21T19:35:00Z

- Implemented the first real standalone semimechanistic family scaffold:
  - new predictor module: `src/astar/student/predictor/smh.py`
  - new family variants exposed:
    - `smh_knn5_z12_h0_covsum_calbase_v001`
    - `smh_knn5_z12_h0_covaug_calbase_v001`
    - `smh_knn5_z3_h0_covaug_calbase_v001`
    - `smh_knn5_z3_h0_covaug_calblend35_v001`
- Family structure:
  - training data = replay-backed synthetic-live transcripts only
  - online-safe summary vector from legal evidence only
  - standardized kNN posterior over either:
    - raw round regime vectors (`z12`)
    - low-rank manifold coordinates (`z3`)
  - terminal decoder = `HazardTeacher`
  - strongest new variant candidate in this first scaffold adds a replay-terminal blend on top of the manifold decoder
- New engineering work included:
  - added `HazardTeacher.load_checkpoint(...)`
  - added public coefficient-decoder entrypoint `terminal_tensor_from_coefficients(...)`
  - added per-fold checkpointing / caching for the standalone `smh_*` family
  - registered the new family in:
    - `src/astar/student/predictor/interactive.py`
    - `src/astar/cli.py`
    - `src/astar/workflows/historical_benchmark.py`
    - `tests/test_historical_benchmark.py`
- In-progress validation state at this point:
  - residual temp variant registry lines removed from the code surface
  - next step is test/benchmark verification of the new standalone family only

### 2026-03-21T22:30:00Z

- Re-read the semimechanistic handoff again with focus on:
  - continuous settlement-mark dynamics
  - tiny round-latent / posterior model
  - legal online evidence use beyond raw cell classes
- Read back the current standalone `smh_*` code path and identified the main structural gap:
  - `smh_coeffbank*` posterior still only scores observed cell classes
  - it ignores most of the legal query payload:
    - mean population
    - mean food
    - mean wealth
    - mean defense
    - transcript-level coverage / repeat structure
- New branch opened now:
  - add a semh-native evidence-summary posterior to `smh_coeffbank*`
  - use synthetic-live transcript distributions per historical round law as a round-posterior term
  - keep it standalone semh:
    - no `query_residual`
    - no dependence on historical-bucket outer blend for the core model
- Planned immediate sweep after code lands:
  - `covmark` summary posterior variants with a small weight bracket
  - Tier-2 path4 coverage screen first
  - promote only if the new standalone line beats current standalone semh best `hbexact_calresid_blend045`

### 2026-03-22T00:20:00Z

- Negative result / infra read on the `covmark` summary-posterior coeffbank branch:
  - core idea:
    - keep the standalone semh coeffbank candidate bank
    - add a synthetic-live transcript-summary posterior term using legal evidence only
    - summary focused on:
      - coverage / repeats
      - built share
      - mean population / food / wealth / defense
  - engineering added:
    - summary-aware `smh_coeffbank*` variants:
      - `smh_coeffbank_z0_h0_covmarkpostw06_v001`
      - `smh_coeffbank_z0_h0_covmarkpostw12_v001`
      - `smh_coeffbank_z0_h0_covmarkpostw24_v001`
    - best-effort catalog logging through replay/materialization/synthetic dataset paths
    - atomic `.npz` writes plus retry-on-read for shared replay-summary artifacts
  - concrete benchmark read so far:
    - `agent2_dev12_smh_covmarkpostw24_path4_b50_coverage_20260321_retry2`
    - result: `57.1899 / 0.190069`
    - artifact: `data/artifacts/benchmarks/agent2_dev12_smh_covmarkpostw24_path4_b50_coverage_20260321_retry2/result.json`
    - interpretation: decisively bad; strong summary posterior over-concentrates on the wrong round laws
    - faster sidecar `w12` 2-round probe also came back bad:
      - `agent2_dev12b_smh_covmarkpostw12_path2_b50_coverage_20260321`
      - result: `60.2595 / 0.169219`
  - decision:
    - stop this branch before full promotion
    - do not spend more time on stronger summary weights
    - next pivot should stay semh-only but use cheaper, lower-risk online gating on the already strong anchor/student pair

### 2026-03-22T01:05:00Z

- Cheap semh-only built-frequency gate sweep on the strong rescue pair:
  - left anchor:
    - `smh_coeffbank_z0_h0_covlike_hbblend50_exactobs_v001`
  - right specialist:
    - `smh_coeffbank_z0_h0_covlike_calbase_resid_v001`
  - new variants:
    - `smh_coeffbank_z0_h0_covlike_hbexact_calresid_builtfreqgate_v001`
    - `smh_coeffbank_z0_h0_covlike_hbexact_calresid_builtfreqgatewide_v001`
    - `smh_coeffbank_z0_h0_covlike_hbexact_calresid_builtfreqgatexwide_v001`
- Tier-2 path4 coverage results:
  - `builtfreqgate`: `72.1278 / 0.110826`
  - `builtfreqgatewide`: `72.2246 / 0.110182`
  - `builtfreqgatexwide`: `72.3808 / 0.109225`
- Read:
  - this gate family is operationally cheap and clean
  - but it is decisively weaker than the raw semh student on the hard slice
  - not worth promoting to full benchmark

### 2026-03-22T01:20:00Z

- Exact-observation wrapper sweep on semh student-heavy lines:
  - new variants:
    - `smh_coeffbank_z0_h0_covlike_calbase_resid_exactobs_v001`
    - `smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend045_exactobs_v001`
    - `smh_coeffbank_z0_h0_covlike_hbexact_calresid_blend050_exactobs_v001`
- Tier-2 path4 coverage results:
  - `calbase_resid_exactobs`:
    - `74.6782 / 0.097572`
    - major positive read; clearly above the old pure `calbase_resid` path4 result `74.3819 / 0.098890`
  - `blend045_exactobs`:
    - `72.3918 / 0.109980`
  - `blend050_exactobs`:
    - `72.7750 / 0.107844`
- Read:
  - the right place for exact observation handling is the pure semh residual-student line, not the outer rescue blend
  - this is the first semh-only refinement this round with a strong positive path4 delta
  - full 8-round promotion launched immediately:
    - `agent2_full_smh_calbase_resid_exactobs_8rounds_coverage_20260322`

### 2026-03-21T14:20:00Z

- Re-read the family-specific handoff again with focus on the early ladder:
  - `smh_glmm_*` pooled teacher first
  - replay-to-transition dataset before more student-side patching
  - roundfit/manifold later, not more coeffbank-only tuning first
- Confirmed the current repo gap against that plan:
  - `src/astar/history/datasets/teacher_transition.py` is still only coarse aggregate counts
  - it is not the replay-derived cell/year transition table the handoff calls for
- Closed the `residshrink_exactobs` side branch after the pending slice runs finished:
  - bad-half 4-round result:
    - baseline `smh_coeffbank_z0_h0_covlike_calbase_resid_exactobs_v001`
    - `68.3887 / 0.129666`
    - artifact: `data/artifacts/benchmarks/agent2_dev15_smh_calbase_resid_exactobs_badhalf_b50_coverage_20260322/report.md`
  - bad-half 4-round shrink result:
    - `smh_coeffbank_z0_h0_covlike_calbase_residshrink_exactobs_v001`
    - `68.3742 / 0.129513`
    - artifact: `data/artifacts/benchmarks/agent2_dev15_smh_calbase_residshrink_exactobs_badhalf_b50_coverage_20260322/report.md`
  - good path4 shrink result:
    - `73.1593 / 0.104567`
    - artifact: `data/artifacts/benchmarks/agent2_dev15c_smh_calbase_residshrink_exactobs_path4_b50_coverage_20260322/report.md`
  - read:
    - shrink gives a tiny KL improvement on the hard half but loses score
    - shrink also clearly degrades the strong path4 slice versus prior exactobs `74.6782 / 0.097572`
    - decision: kill this line; do not promote or tune further
- New semh-native teacher branch implemented now:
  - new cached replay transition dataset:
    - `src/astar/history/datasets/cell_transition.py`
    - one parquet part per round/seed
    - rows are per-cell per-year aggregated current-class -> next-class counts across replay runs
    - includes static semimechanistic geometry features from `seed_feature_dict(...)`
  - new pooled visible-state Markov teacher:
    - `src/astar/student/predictor/smh_glmm.py`
    - model name: `smh_glmm_z0_h0_covbase_calnone_v001`
    - separate softmax transition head per current class
    - pooled across historical rounds
    - trained from replay transition counts with ridge-regularized Adam in pure NumPy
    - rolled forward for `50` yearly steps to produce the terminal tensor
    - hard constraints retained for initial ocean and mountain cells
  - framework wiring landed in:
    - `src/astar/student/predictor/interactive.py`
    - `src/astar/cli.py`
    - `src/astar/workflows/historical_benchmark.py`
    - `tests/test_historical_benchmark.py`
- Validation state:
  - `python3 -m py_compile` passed on the new dataset/predictor/wiring files
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -k 'smh_glmm_z0_h0_covbase_calnone_v001' -q`
    - `1 passed`
- Benchmarks launched and running:
  - `agent2_dev16_smh_glmm_path4_b50_coverage_20260322`
  - `agent2_dev16_smh_glmm_badhalf_b50_coverage_20260322`

### 2026-03-21T14:35:00Z

- First true `smh_glmm_*` pooled-teacher read completed.
- Tier-2 path4 coverage result:
  - experiment:
    - `agent2_dev16_smh_glmm_path4_b50_coverage_20260322`
  - model:
    - `smh_glmm_z0_h0_covbase_calnone_v001`
  - result:
    - `63.6771 / 0.197350`
  - artifact:
    - `data/artifacts/benchmarks/agent2_dev16_smh_glmm_path4_b50_coverage_20260322/report.md`
  - round decomposition:
    - `8e839974...`: `90.3867 / 0.033697`
    - `ae78003a...`: `20.6336 / 0.527482`
    - `c5cdf100...`: `82.5591 / 0.064026`
    - `f1dac9a9...`: `61.1290 / 0.164193`
- Tier-2 bad-half coverage result:
  - experiment:
    - `agent2_dev16_smh_glmm_badhalf_b50_coverage_20260322`
  - model:
    - `smh_glmm_z0_h0_covbase_calnone_v001`
  - result:
    - `69.5653 / 0.125860`
  - artifact:
    - `data/artifacts/benchmarks/agent2_dev16_smh_glmm_badhalf_b50_coverage_20260322/report.md`
  - round decomposition:
    - `36e581f1...`: `51.1213 / 0.224064`
    - `71451d74...`: `79.0880 / 0.078259`
    - `76909e29...`: `73.8337 / 0.101401`
    - `fd3c92ff...`: `74.2182 / 0.099717`
- Scientific read:
  - this is the handoff hypothesis in action:
    - a pooled visible-state semimechanistic transition law is clearly not hopeless
    - it is excellent on several rounds and catastrophically wrong on a few others
  - therefore the main issue is not “semh GLMM has no signal”
  - the main issue is “round law variation is real and pooled `z0` is too restrictive”
  - this is strong evidence to move immediately from pooled `smh_glmm_z0_*` to round-specific / candidate-law inference instead of spending another loop on pooled-only tuning
- Immediate follow-up branch opened from this result:
  - new model name:
    - `smh_glmmbank_zhist_h0_covbase_calnone_v001`
  - structure:
    - fit one GLMM transition teacher per historical round law
    - roll each candidate teacher forward on the new map
    - use online patch likelihood to posterior-weight candidate round laws
  - smoke validation:
    - `uv run --extra dev pytest tests/test_historical_benchmark.py -k 'smh_glmmbank_zhist_h0_covbase_calnone_v001' -q`
    - `1 passed`
  - benchmarks launched and running:
    - `agent2_dev17_smh_glmmbank_path4_b50_coverage_20260322`
    - `agent2_dev17_smh_glmmbank_badhalf_b50_coverage_20260322`

### 2026-03-21T15:05:00Z

- `smh_glmmbank_*` results completed and clarified the next move.
- Tier-2 path4 coverage result:
  - experiment:
    - `agent2_dev17_smh_glmmbank_path4_b50_coverage_20260322`
  - model:
    - `smh_glmmbank_zhist_h0_covbase_calnone_v001`
  - result:
    - `72.5515 / 0.119122`
  - artifact:
    - `data/artifacts/benchmarks/agent2_dev17_smh_glmmbank_path4_b50_coverage_20260322/report.md`
- Tier-2 bad-half coverage result:
  - experiment:
    - `agent2_dev17_smh_glmmbank_badhalf_b50_coverage_20260322`
  - model:
    - `smh_glmmbank_zhist_h0_covbase_calnone_v001`
  - result:
    - `69.5736 / 0.127049`
  - artifact:
    - `data/artifacts/benchmarks/agent2_dev17_smh_glmmbank_badhalf_b50_coverage_20260322/report.md`
- Scientific read:
  - round-specific law bank is the right direction
  - it massively fixes the path4 pooled-law failure
  - but it is still too jagged / overfit on the tougher bad-half slice
  - therefore the next branch should be regime-manifold compression, not more pooled-only work
- Negative calibration follow-up closed immediately:
  - model:
    - `smh_glmmbank_zhist_h0_covbase_calobs_v001`
  - path4 result:
    - `70.8331 / 0.124272`
    - artifact: `data/artifacts/benchmarks/agent2_dev18_smh_glmmbank_calobs_path4_b50_coverage_20260322/report.md`
  - bad-half result:
    - `68.7955 / 0.129639`
    - artifact: `data/artifacts/benchmarks/agent2_dev18_smh_glmmbank_calobs_badhalf_b50_coverage_20260322/report.md`
  - read:
    - naive exact-observation wrapping hurts both dev slices
    - do not continue this wrapper line

### 2026-03-21T15:22:00Z

- New manifold branch implemented:
  - new model family members:
    - `smh_glmmlatent_z2_h0_covbase_calnone_v001`
    - `smh_glmmlatent_z4_h0_covbase_calnone_v001`
    - `smh_glmmlatent_z6_h0_covbase_calnone_v001`
  - code:
    - `src/astar/student/predictor/smh_glmm.py`
  - structure:
    - fit one GLMM transition law per historical round
    - flatten coefficient tensors
    - fit a low-rank PCA-style round manifold
    - reconstruct denoised candidate round laws in that manifold
    - infer posterior over historical round laws from online patch likelihood
    - roll forward the posterior-mean latent law once, instead of mixing terminal tensors directly
  - motivation:
    - this is the first true `z_r` branch aligned with handoff Phases 4-6
    - it tests whether low-rank regime compression can keep the path4 bank gain while smoothing the bad-half failures
- Framework wiring updated in:
  - `src/astar/student/predictor/interactive.py`
  - `src/astar/cli.py`
  - `src/astar/workflows/historical_benchmark.py`
  - `tests/test_historical_benchmark.py`
- Validation:
  - `python3 -m py_compile src/astar/student/predictor/smh_glmm.py src/astar/student/predictor/interactive.py src/astar/workflows/historical_benchmark.py src/astar/cli.py tests/test_historical_benchmark.py`
    - passed
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -k 'smh_glmmlatent' -q`
    - `3 passed`
- Benchmarks launched:
  - `agent2_dev19_smh_glmmlatent_z2_path4_b50_coverage_20260322`
  - `agent2_dev19_smh_glmmlatent_z2_badhalf_b50_coverage_20260322`
  - `agent2_dev20_smh_glmmlatent_z2_path6_b50_coverage_20260322`
  - `agent2_dev20_smh_glmmlatent_z4_path6_b50_coverage_20260322`
- Important evaluation note:
  - 4-round leave-one-round-out only permits at most `2` latent dimensions per fold
  - therefore latent-dimension comparison needs at least a 6-round serious slice or the full 8-round benchmark

### 2026-03-21T15:40:00Z

- `smh_glmmlatent_*` serious-screen results are now in and they are the strongest pure semh teacher signal so far.
- Tier-2 path4 coverage:
  - experiment:
    - `agent2_dev19_smh_glmmlatent_z2_path4_b50_coverage_20260322`
  - model:
    - `smh_glmmlatent_z2_h0_covbase_calnone_v001`
  - result:
    - `74.1727 / 0.112785`
  - artifact:
    - `data/artifacts/benchmarks/agent2_dev19_smh_glmmlatent_z2_path4_b50_coverage_20260322/report.md`
  - read:
    - clear gain over raw round bank `72.5515 / 0.119122`
    - most of the gain comes from rescuing `8e839974...` while holding the other path4 rounds roughly flat
- Tier-2 bad-half coverage:
  - experiment:
    - `agent2_dev19_smh_glmmlatent_z2_badhalf_b50_coverage_20260322`
  - result:
    - `69.5736 / 0.127049`
  - artifact:
    - `data/artifacts/benchmarks/agent2_dev19_smh_glmmlatent_z2_badhalf_b50_coverage_20260322/report.md`
  - read:
    - exactly flat to the raw bank on this slice
    - important because the path4 gain is real and not paid for by an immediate bad-half collapse
- Tier-3 serious 6-round coverage comparison:
  - `smh_glmmlatent_z2_h0_covbase_calnone_v001`
    - experiment: `agent2_dev20_smh_glmmlatent_z2_path6_b50_coverage_20260322`
    - result: `72.8255 / 0.116068`
    - artifact: `data/artifacts/benchmarks/agent2_dev20_smh_glmmlatent_z2_path6_b50_coverage_20260322/report.md`
  - `smh_glmmlatent_z4_h0_covbase_calnone_v001`
    - experiment: `agent2_dev20_smh_glmmlatent_z4_path6_b50_coverage_20260322`
    - result: `70.5723 / 0.127226`
    - artifact: `data/artifacts/benchmarks/agent2_dev20_smh_glmmlatent_z4_path6_b50_coverage_20260322/report.md`
  - read:
    - tiny manifold wins clearly; larger latent hurts badly
    - this directly supports the handoff’s “tiny regime manifold” thesis
    - `z2` is the only latent setting worth promoting right now
- Round-level read from the 6-round `z2` serious slice:
  - huge lifts on:
    - `8e839974...` -> `92.4099 / 0.026312`
    - `ae78003a...` -> `59.1982 / 0.175931`
    - `c5cdf100...` -> `87.7144 / 0.043752`
  - acceptable/improved on:
    - `fd3c92ff...` -> `73.4843 / 0.102722`
  - remaining pathology:
    - `36e581f1...` -> `44.1223 / 0.273255`
  - implication:
    - the new teacher is good enough that the next improvement target is the prior/posterior over `z_r`, not more latent capacity
- Query policy check on the serious slice:
  - experiment:
    - `agent2_dev21_smh_glmmlatent_z2_path6_b50_exploration_20260322`
  - result:
    - identical to coverage at `72.8255 / 0.116068`
  - artifact:
    - `data/artifacts/benchmarks/agent2_dev21_smh_glmmlatent_z2_path6_b50_exploration_20260322/report.md`
  - read:
    - current policy is not binding for this branch
    - no reason to spend more time on policy before improving the regime prior
- Promotion / follow-up state:
  - full 8-round promotion launched:
    - `agent2_full_smh_glmmlatent_z2_8rounds_coverage_20260322`
  - full `z4` promotion was intentionally killed after the 6-round loss
  - new follow-up branch launched:
    - `smh_glmmlatent_z2_h0_covprior_calnone_v001`
  - purpose of the new branch:
    - use initial-map semimechanistic summaries to form a prior over round latent `z_r`
    - target the remaining harsh-round failure on `36e581f1...`

### 2026-03-21T16:20:00Z

- Final manifold results for this cycle:
  - full 8-round coverage promotion:
    - experiment: `agent2_full_smh_glmmlatent_z2_8rounds_coverage_20260322`
    - model: `smh_glmmlatent_z2_h0_covbase_calnone_v001`
    - result: `77.8193 / 0.089306`
    - runtime: `1688.115s`
    - artifact: `data/artifacts/benchmarks/agent2_full_smh_glmmlatent_z2_8rounds_coverage_20260322/result.json`
  - warmed-cache full exploration follow-up:
    - experiment: `agent2_full_smh_glmmlatent_z2_8rounds_exploration_20260322`
    - model: `smh_glmmlatent_z2_h0_covbase_calnone_v001`
    - result: `78.3805 / 0.086960`
    - runtime: `208.366s`
    - artifact: `data/artifacts/benchmarks/agent2_full_smh_glmmlatent_z2_8rounds_exploration_20260322/result.json`
- This is now the dominant local line in the entire checkout:
  - vs prior best residual exploration line `query_residual_v9_v10_builtfreqgatexwide_v001` (`74.6943 / 0.100390`)
  - delta:
    - `+3.6862` score
    - `-0.013430` weighted KL
- Paired same-policy compare artifact:
  - command:
    - `uv run astar compare-historical-benchmarks --baseline data/artifacts/benchmarks/agent2_full_query_residual_v9_v10_builtfreqgatexwide_8rounds_exploration_20260321/result.json --candidate data/artifacts/benchmarks/agent2_full_smh_glmmlatent_z2_8rounds_exploration_20260322/result.json --bootstrap-samples 2000`
  - result:
    - mean score delta: `+3.6863`
    - mean weighted KL delta: `-0.013431`
    - win rate: `0.625`
    - CI95: `[0.3465, 7.3703]`
  - artifact:
    - `data/artifacts/comparisons/historical__mode=online_interactive__policy=exploration_v2__budget=50__episode_seed=0__baseline=query_residual_v9_v10_builtfreqgatexwide_v001__candidate=smh_glmmlatent_z2_h0_covbase_calnone_v001.json`
  - interpretation:
    - wins are large enough on most rounds to overwhelm the still-bad `36e581f1...` losses
    - round manifold teacher is now decisively better than the old residual baseline overall
- Dead follow-up after the win:
  - `smh_glmmlatent_z2_h0_covprior_calnone_v001`
  - serious 6-round result:
    - `72.8255 / 0.116068`
    - exactly identical to plain `z2 covbase`
  - read:
    - simple ridge prior from initial-map summaries into `z_r` did nothing
    - do not promote this branch as implemented
- Small bug fix learned from the promotion cycle:
  - adding optional feature-prior fields broke loading of already-written latent checkpoints
  - fix:
    - backward-compatible default added for `feature_prior_ridge_lambda` in `SemhGlmmLatentPredictorCheckpoint`
  - this was required to reuse the warm `z2` fold checkpoints for the fast full exploration rerun
- Final validation after the compatibility fix:
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -q`
    - `59 passed`
  - `uv run --extra dev pytest tests/test_online_episode.py -q`
    - `1 passed`

### 2026-03-21T15:57:48Z

- Resumed from the `z2 h0` win with the next handoff-mandated axis:
  - hidden memory / Markov sufficiency test
  - target model family member: `smh_glmmlatent_z2_h1_covbase_calnone_v001`
- Re-read `instructions/agent2.md` and verified the relevant path in Part B:
  - after tiny low-rank round latent works, test small hidden memory before spending more time on larger latent dimension or policy
  - this matches the observed remaining failure concentration on `36e581f1...`
- Checked machine state before launching heavier work:
  - load average: `24.77 / 49.42 / 62.31`
  - available RAM: about `2.0 TiB`
  - implication:
    - enough headroom for parallel benchmarks later, but start with one serious gate until the new branch is correct
- Implemented the first `h1` branch plumbing:
  - replay transition dataset can now optionally emit collapsed-state EMA memory covariates:
    - `occupied_recent`
    - `ruin_recent`
    - `port_recent`
  - added dataset metadata/version checks for:
    - `include_memory_features`
    - `memory_decay`
  - threaded memory features through the full GLMM family:
    - pooled `smh_glmm`
    - candidate-bank `smh_glmmbank`
    - latent-manifold `smh_glmmlatent`
  - added backward-compatible checkpoint fields:
    - `memory_feature_names`
    - `memory_decay`
  - registered new benchmarkable model:
    - `smh_glmmlatent_z2_h1_covbase_calnone_v001`
- Smoke testing exposed a real GLMM bug unrelated to the new memory idea:
  - `_transition_probs_for_class(...)` initialized intercept logits with an in-place broadcast that is invalid
  - fixed by explicitly materializing the broadcasted spatial intercept tensor
  - this bug affects the whole GLMM family, so fixing it before promotion was mandatory
- Validation after the memory wiring + broadcast fix:
  - `python3 -m py_compile src/astar/student/predictor/smh_glmm.py src/astar/history/datasets/cell_transition.py`
    - passed
  - `python3 -m py_compile src/astar/student/predictor/interactive.py src/astar/student/predictor/smh_glmm.py src/astar/history/datasets/cell_transition.py src/astar/cli.py src/astar/workflows/historical_benchmark.py tests/test_historical_benchmark.py`
    - passed
  - `uv run --extra dev pytest tests/test_historical_benchmark.py -k 'smh_glmmlatent_z2_h1_covbase_calnone_v001 or smh_glmmlatent_z2_h0_covbase_calnone_v001' -q`
    - `2 passed`
- Next action from here:
  - run the serious 6-round gate for `smh_glmmlatent_z2_h1_covbase_calnone_v001`
  - only promote to full 8-round if it clears the incumbent `z2 h0` serious baseline `72.8255 / 0.116068`
