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

1. Keep family-1 bookkeeping/validation reproducible and versioned.
2. Keep Gate 1 open but no longer blocked: current proxy says common transitions are near-Markov, with targeted lag sensitivity around collapse/port.
3. Gate 2 result now says the current crude terminal-law parameterization is not predictively tiny-latent enough.
4. Next work should shift toward richer per-round effective laws:
   - replay event-ledger is now built; next missing piece is hazard-training support with eligible negatives, especially for build/birth
   - richer collapse-sensitive state if returning to Gate 1 refinement
   - only then revisit low-rank coupling / live regime inference

## Active Experiment

- Dataset complete: `f1_replay_event_ledger_v1`
- Hypothesis:
  - a clean replay event ledger is the decisive preprocessing layer needed before real family-1 hazard models
  - if the ledger shows sane event counts and no obvious invariant violations, the next step should be an eligible-cell hazard dataset rather than more terminal-law engineering
- Validation plan:
  - extract discrete structural events plus settlement stat deltas from full replay transitions
  - attach static geometry and local neighbor context
  - scan for basic impossibility violations in the same pass
  - build versioned artifact and inspect real-corpus event mix before designing hazard-training data

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
- `data/artifacts/family1/markov/f1_markov_sufficiency_cellproxy_v1/report.md`
- `data/artifacts/family1/lowrank/f1_round_dynamics_lowrank_oracle_v1/report.md`
- `data/artifacts/datasets/f1_replay_event_ledger_v1/summary.json`
- `src/astar/student/predictor/query_residual.py`
- `src/astar/student/predictor/interactive.py`
- `src/astar/history/datasets/event_ledger.py`
- `src/astar/workflows/model_eval.py`
- `src/astar/workflows/historical_benchmark.py`
- `src/astar/workflows/markov_sufficiency.py`
- `src/astar/workflows/round_dynamics_lowrank.py`
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
- Implemented `run-markov-sufficiency-audit` workflow and CLI entry:
  - command: `uv run astar run-markov-sufficiency-audit --name f1_markov_sufficiency_cellproxy_v1`
  - audit scope: `cell_local_dynamic_proxy__descriptor_t_vs_descriptor_t_plus_prev_class`
  - artifact root: `data/artifacts/family1/markov/f1_markov_sufficiency_cellproxy_v1/`
- Markov proxy audit completed on 9 replay-backed rounds / `157621632` transitions:
  - overall current_log_loss `0.06605459`
  - overall lag_log_loss `0.06576769`
  - overall gain from lag `0.00028690`
  - overall current_accuracy `0.98395490`
  - overall lag_accuracy `0.98397741`
  - accuracy gain `0.00002252`
- Event-slice lag gains:
  - `birth_or_found`: `0.00000352`
  - `portization`: `0.00073771`
  - `collapse`: `0.00306887`
  - `rebuild`: `-0.00023573`
  - `reclaim_forest`: `-0.00023513`
- Proxy interpretation:
  - evidence is weakly supportive of near-Markov sufficiency for common transitions
  - but `collapse` and, smaller, `portization` still benefit from one-step lag
  - do not treat Gate 1 as fully closed; next stronger audit should add richer lag/state context, not only previous class
- Implemented `run-round-dynamics-lowrank-audit` workflow and CLI entry:
  - command: `uv run astar run-round-dynamics-lowrank-audit --name f1_round_dynamics_lowrank_oracle_v1 --max-rank 5`
  - audit scope: leave-one-round-out low-rank compression of fitted semimechanistic terminal-law coefficient vectors
  - artifact root: `data/artifacts/family1/lowrank/f1_round_dynamics_lowrank_oracle_v1/`
  - note: projection is oracle holdout projection; this is a Gate 2 compressibility audit, not yet a live regime-inference test
- Added focused regression coverage for Gate 2 audit and reran broader replay/benchmark slice:
  - `tests/test_round_dynamics_lowrank.py`
  - `uv run pytest tests/test_round_dynamics_lowrank.py tests/test_markov_sufficiency.py tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_live_online.py -q`
  - result: `16 passed`
- Full-corpus Gate 2 audit completed:
  - artifact: `data/artifacts/family1/lowrank/f1_round_dynamics_lowrank_oracle_v1/result.json`
  - report: `data/artifacts/family1/lowrank/f1_round_dynamics_lowrank_oracle_v1/report.md`
  - rounds `9`
  - coefficient_dim `51`
  - regime_dim `12`
  - projection_mode `oracle_holdout_projection`
  - conclusion `cross_round_low_rank = unlikely`
- Gate 2 aggregate metrics:
  - mean_baseline_log_loss `0.181454`
  - oracle_full_log_loss `0.143772`
  - rank1_log_loss `0.184262` / capture `-0.0745`
  - rank2_log_loss `0.167039` / capture `0.3825`
  - rank3_log_loss `0.161234` / capture `0.5366`
  - rank5_log_loss `0.160643` / capture `0.5523`
- Gate 2 spectral summary:
  - singular values start `14.8155, 8.7525, 3.7519, 2.5494, 2.4784`
  - cumulative explained variance:
    - rank1 `0.6713`
    - rank2 `0.9055`
    - rank3 `0.9486`
    - rank5 `0.9873`
- Gate 2 interpretation:
  - coefficient variance is visually low-rank-ish, but predictive capture is much weaker than variance capture
  - rank2 explains ~`90.6%` of coefficient variance yet captures only ~`38%` of oracle predictive gain
  - rank5 explains ~`98.7%` of coefficient variance yet captures only ~`55%` of oracle predictive gain
  - therefore the bottleneck is not just latent dimension; the current semimechanistic terminal-law parameterization itself is too crude / misaligned
  - this audit downgrades the current terminal snapshot law, not the entire family
- Target-level note from Gate 2:
  - build target dominates mismatch
  - build log-loss: mean baseline `0.435386`, oracle `0.337201`, rank5 `0.385463`
  - port log-loss improves more cleanly: `0.039670 -> 0.032287` oracle, rank5 `0.033839`
  - ruin log-loss improves modestly: `0.069307 -> 0.061830` oracle, rank5 `0.062629`
- Updated next-step read:
  - strongest next family-1 baseline should be event-hazard / event-ledger based, especially for build dynamics
  - low-rank coupling should be revisited only after richer effective laws exist

### 2026-03-21 UTC

- Re-read family handoff sections for Phase 1 event ledger and Phase 3 hazard modeling.
- Inspected current `HazardTeacher`; confirmed it is a terminal snapshot law and not the right next mainline after Gate 2.
- Implemented canonical replay event names in `src/astar/core/events.py`.
- Added `build_replay_event_ledger_dataset` in `src/astar/history/datasets/event_ledger.py`.
  - emits structural event rows:
    - `birth`
    - `portization`
    - `collapse`
    - `rebuild`
    - `reclaim_forest`
    - `reclaim_empty`
    - `owner_switch`
  - also emits `settlement_delta` support rows with population / food / wealth / defense deltas
  - attaches static geometry + local neighbor context
  - scans basic invariants during extraction
- Added CLI entry:
  - `uv run astar build-event-ledger --dataset-name f1_replay_event_ledger_v1`
- Added regression test:
  - `tests/test_event_ledger.py`
- Validation rerun after event-ledger changes:
  - `uv run pytest tests/test_event_ledger.py tests/test_round_dynamics_lowrank.py tests/test_markov_sufficiency.py tests/test_history_datasets.py tests/test_historical_benchmark.py tests/test_live_online.py -q`
  - result: `17 passed`
- Built full-corpus event ledger artifact:
  - dataset dir: `data/artifacts/datasets/f1_replay_event_ledger_v1/`
  - rows: `16267769`
  - rounds: `9`
  - replay runs: `2313`
  - full parquet payload is large (`352M`) and kept as a reproducible local artifact; lightweight summary is the versioned git-side contract
- Full-corpus event counts:
  - `settlement_delta`: `13424383`
  - `collapse`: `942087`
  - `birth`: `754311`
  - `rebuild`: `514840`
  - `reclaim_empty`: `375422`
  - `reclaim_forest`: `176753`
  - `portization`: `42298`
  - `owner_switch`: `37675`
- Invariant scan result from ledger build:
  - no violations detected in the currently tracked basic checks
- Current interpretation:
  - the replay event ledger is now real, versioned, and large enough to support actual hazard-model work
  - build/birth and collapse remain the dominant structural event masses
  - next concrete step should be a hazard-training dataset with eligible negatives / risk sets, not more positive-only event summaries
