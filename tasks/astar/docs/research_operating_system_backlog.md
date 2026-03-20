# Astar Research Operating System Backlog

This file is the long-horizon execution ledger for the Astar Island codebase.

It exists to keep work coherent across many rounds, many refactors, and many model ideas.

## Core Thesis

- Native object: episode
- Historical rounds learn `phi`
- Current live rounds infer small `z_r`
- Replay is privileged offline information
- Live rounds must use only legal active-round information
- Synthetic active benchmarks must match live API semantics
- Round is the independent unit for training/eval
- Every hypothesis must have a falsifier
- Every experiment must be reproducible and comparable under paired evaluation

## Current State

### Done

- replay ingestion and inspection
- replay-aware `RoundEpisode`
- replay summaries / hazard summaries / semimechanistic round coefficients
- low-rank factorization over round coefficient vectors
- teacher transition / terminal / synthetic-live dataset builders
- first semimechanistic hazard teacher
- first summary-bank student
- offline policy env primitive
- CLI commands for ingest / summarize / factorize / dataset build / teacher train / student train
- replay-aware materialization and corpus diagnostics
- oracle protocols + first active/live/replay adapters
- first interactive predictor/policy adapters
- generic online episode runner shared by synthetic + live oracles
- first synthetic tournament harness + CLI
- first synthetic benchmark runner + CLI
- default smoke/dev/full/blind benchmark manifests
- paired benchmark comparison + bootstrap CI helper
- live-online CLI path on shared oracle/belief loop
- benchmark/comparison markdown scorecards
- explicit online-safe transcript/context separation in student-facing interfaces
- first teacher science evaluation workflow and report path

### In Progress

- oracle/environment boundary
- offline tournament harness
- science evaluation / trajectory criticism

### Not Done

- grey-box teacher dynamics model
- proper observation emulator
- score-aligned learned policy
- rigorous split manifests + frozen benchmark banks
- full experiment scorecards + paired statistical reports
- strong no-leakage enforcement by dataset/type boundary
- richer geometry / topology / spectral features
- full model lineage catalog

## Non-Negotiable Boundaries

### Information Regimes

1. Privileged historical
   - full replay trajectories
   - terminal truth
   - submissions
   - live transcripts captured at the time

2. Synthetic active
   - initial maps visible
   - finite query budget
   - each query samples fresh year-50 stochastic viewport
   - ground truth hidden until evaluation

3. Real live
   - same interface as synthetic active
   - backed by official API

4. Post-round scoring
   - final tensor only
   - official entropy-weighted KL / score

### Hard Rules

- Online models must never consume replay trajectories directly
- Round-based splits only; never split by seed inside round for final eval
- Synthetic active env must match live semantics
- Raw payloads immutable
- Canonical layer required before model-ready layer
- Important logic never lives only in notebooks

## Architecture Target

```text
astar/
  core/
  infra/
  history/
    replay/
    episodes/
    datasets/
    summaries/
  envs/
  features/
  observe/
  teacher/
    dynamics/
    decoder/
    regime/
  student/
    posterior/
    predictor/
    distill/
  policy/
  eval/
  viz/
  workflows/
```

## Workstreams

### 1. Oracle / Environment Layer

Goal: make offline and live interaction use the same contract.

#### Must Do

- [x] create `envs/base.py` protocols:
  - `ActiveOracle`
  - `PrivilegedOracle`
  - `OnlinePredictor`
  - `InteractiveQueryPolicy`
  - `Evaluator`
- [x] create online-safe domain objects:
  - `RoundContext`
  - `SeedContext`
  - `GroundTruthBundle`
  - `OnlineEpisodeSample`
  - `BeliefState` seam
- [x] create `HistoricalReplayOracle`
- [x] create `SyntheticActiveOracle`
- [x] create `LiveApiOracle`
- [x] ensure `SyntheticActiveOracle.sample_view()` matches live `/simulate` semantics:
  - year-50 only
  - fresh stochastic sample each call
  - viewport-only settlements returned
- [x] ensure live oracle logs raw observations through existing immutable artifact store

#### Nice To Have

- [x] deterministic episode seeds for reproducible synthetic tournaments
- [ ] budget-aware oracle wrapper
- [ ] cached synthetic query responses for benchmark banks

### 2. Type-Safe Information Boundaries

Goal: make leakage difficult by construction.

#### Must Do

- [x] separate types:
  - `PrivilegedRoundEpisode`
  - `OnlineRoundContext`
  - `OnlineTranscript`
  - `GroundTruthBundle`
- [x] make student/policy code accept online-safe types only
- [x] keep teacher decode path compatible with online-safe seed contexts
- [x] split eval into:
  - `eval/competition.py`
  - `eval/science.py`
- [x] add tests proving online paths cannot accidentally require replay-only fields

### 3. Synthetic Active Tournament Harness

Goal: create the real battlefield for iteration.

#### Must Do

- [x] build runner:
  - initialize belief
  - select query
  - sample view
  - update belief
  - stop at budget
  - predict all 5 seeds
  - score by official metric
- [x] make same predictor/policy code run against synthetic and live
- [x] support fixed benchmark episode seeds
- [x] support paired experiment comparison on same benchmark episodes
- [x] support baseline tournament reports

#### Outputs

- [x] smoke benchmark
- [ ] dev benchmark
- [ ] full benchmark
- [ ] blind benchmark
  - manifests exist; benchmark runs not yet frozen/operationalized

### 4. Split Manifests And Benchmark Discipline

Goal: stop data leakage and overfitting to dev.

#### Must Do

- [x] add `splits/`
- [ ] rolling-origin time splits
- [ ] leave-one-round-out CV
- [ ] regime-cluster holdout splits
- [x] frozen synthetic active benchmark manifests
- [x] paired delta evaluation helpers
- [ ] bootstrap confidence intervals by round and by episode
  - partial: episode-level bootstrap CI implemented

### 5. Canonical Storage / Catalog

Goal: full reproducibility and lineage.

#### Must Do

- [ ] expand catalog beyond current event summary
- [ ] tables for:
  - `replay_runs`
  - `dataset_builds`
  - `training_runs`
  - `checkpoints`
  - `metric_events`
  - `report_events`
  - `split_manifests`
- [ ] store git SHA + data snapshot hash + split id + feature manifest on every training run
- [ ] add feature manifest/version object
- [ ] add model checkpoint metadata beyond current JSON

#### Nice To Have

- [ ] chunked/zarr store for large trajectory tensors
- [ ] content-addressed dataset manifests

### 6. Geometry / Topology Features

Goal: stronger deterministic inductive bias.

#### Must Do

- [ ] mixed mobility graph
- [ ] coastline/fjord penetration metrics
- [ ] chokepoint / corridor metrics
- [ ] settlement basin tie margins
- [ ] owner-relational invariant features
- [ ] spectral basis features
- [ ] feature manifest / digest

#### Nice To Have

- [ ] effective resistance summaries
- [ ] maritime centrality
- [ ] harmonic basin summaries

### 7. Historical Summary Pipeline

Goal: discover low-rank round variation and strong semimechanistic priors.

#### Must Do

- [x] event extraction from replay
- [x] hazard summaries
- [x] semimechanistic round coefficient fitting
- [x] low-rank factorization over round coefficient vectors
- [ ] richer round coefficient family:
  - birth
  - port
  - ruin
  - reclaim
  - owner flip
  - survival duration
- [ ] PPC summaries for historical fit
- [ ] regime-cluster derivation from fitted coefficients

### 8. Teacher Models

Goal: privileged offline models.

#### Must Do

- [x] first semimechanistic hazard teacher
- [ ] improve hazard teacher calibration and coefficient fit quality
- [ ] add terminal decoder diagnostics
- [ ] add grey-box recurrent teacher
- [x] add trajectory rollout scoring / first science evaluation pass
- [ ] keep semimechanistic teacher as baseline permanently

### 9. Student Models

Goal: live-round legal inference only.

#### Must Do

- [x] first summary-bank student
- [x] true online predictor protocol:
  - `init_belief`
  - `update`
  - `predict`
- [ ] deepset / set-encoder transcript student
- [ ] direct tensor student baseline
- [ ] teacher distillation loss pipeline
- [ ] posterior collapse diagnostics by query count

### 10. Observation Model

Goal: emulate legal live queries offline.

#### Must Do

- [ ] explicit `G_phi` interface
- [ ] patch likelihood / sample API
- [ ] replay-derived empirical patch model
- [ ] teacher-induced patch sampler
- [ ] comparison between empirical replay patch law and teacher sampler

### 11. Query Policies

Goal: score-aligned query acquisition.

#### Must Do

- [ ] re-home policy code under new env contracts
  - partial: legacy interactive adapter exists
- [x] coverage baseline
- [x] diagnostic-then-replicate
- [ ] score-aligned heuristic
- [ ] offline policy evaluation curves
- [ ] policy utility attribution maps

#### Later

- [ ] learned policy from synthetic active env

### 12. Evaluation

Goal: competition-facing + science-facing evaluation.

#### Competition

- [ ] mean official score
- [ ] paired delta vs baseline
- [ ] round win rate
- [ ] worst-round delta
- [ ] entropy-bucketed KL
- [ ] per-class KL
- [ ] calibration diagnostics

#### Science

- [x] first trajectory criticism pass
- [ ] posterior predictive checks
- [ ] settlement count trajectories
- [ ] port count trajectories
- [ ] ruin-age / rebuild / reclaim timing
- [ ] owner concentration and turnover
- [ ] coastal vs inland expansion mismatch

### 13. Reports / Experiment Tracking

Goal: every experiment yields a reusable scorecard.

#### Must Do

- [ ] experiment scorecard template
- [ ] config diff vs baseline
- [ ] split/data hashes
- [ ] paired deltas + CIs
- [ ] per-round breakdown
- [ ] entropy bucket breakdown
- [ ] science diagnostics
- [ ] decision log linking hypotheses to experiments

### 14. Workflow Cleanup

Goal: make repo coherent under long-term use.

#### Must Do

- [ ] move live/offline mainline to env-based loop
- [ ] deprecate old terminal-only live workflow path
- [ ] reduce legacy package surface
- [ ] unify live exploration and tournament language
- [ ] make `workflows/` reflect actual use cases, not historical accretion

## Immediate Priority Order

1. oracle/env boundary
2. synthetic tournament harness
3. split manifests + frozen benchmarks
4. refactor live workflow to same predictor/policy loop
5. richer evaluation + scorecards
6. stronger geometry features
7. improved hazard teacher
8. richer student
9. observation model
10. learned policy
11. grey-box teacher

## Current Immediate Tasks

- [x] add `envs/` package with active/live/replay oracle contracts
- [x] add online-safe round context types
- [x] add synthetic tournament runner
- [x] adapt one current student + one current policy into new runner
- [x] add CLI for synthetic benchmark run
- [x] add benchmark result artifacts + report
  - JSON artifacts + CLI summaries exist

## Runtime Notes

- DuckDB catalog writes do not like parallel benchmark writers; run synthetic benchmarks sequentially for now.

## Notes

- Do not trust improvements not shown under paired synthetic active evaluation.
- Do not use seeds within a round as independent holdout units for final claims.
- Do not let replay-only fields flow into student/policy code.
- Keep this file updated whenever architecture or priority changes.
