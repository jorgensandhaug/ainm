# Cleanup Matrix

This document defines the intended end-state ownership of the codebase.

Status as of current refactor pass:

- `api/` deleted
- `domain/` deleted
- `storage/` deleted
- `ops/` deleted
- `legacy/` deleted
- `policies/` deleted
- `models/` deleted
- old `live-run` / spec-loader / `experiments/live` surface deleted
- old `explore-*` and `replay-round` surface deleted
- zero tolerated legacy imports remain in `src/astar/`

It is not a wishlist.

It is the package-by-package decision record for what to:

- keep and build on
- migrate into a different bounded context
- quarantine as compat
- delete last

The governing architecture is:

- native object: episode
- historical offline learns `phi`
- current online infers small `z_r`
- synthetic active must match live API semantics
- privileged replay data must never leak into online inference

## Mainline End State

These are the packages that define the world-class target system and should remain the trunk:

| Package | Status | Purpose |
|---|---|---|
| `core/` | keep | pure domain contracts, scoring, terrain/state/tensor invariants |
| `infra/` | keep | API clients, replay sources, artifact storage, catalog, serialization |
| `history/` | keep | replay ingestion, episodes, datasets, historical summaries |
| `envs/` | keep | oracle contracts and synthetic/live/historical environments |
| `features/` | keep | deterministic geometry/topology features |
| `observe/` | keep | live query planning, execution, evidence aggregation |
| `teacher/` | keep | privileged offline models |
| `student/` | keep | online-safe inference models |
| `policy/` | keep | online policy and offline policy-eval layer |
| `eval/` | keep | competition metrics, science eval, diagnostics, comparison |
| `viz/` | keep | plotting/report rendering only |
| `workflows/` | keep | operational entrypoints and experiment workflows |
| `src/experiments/` | keep | typed Python experiment specs |

## Removed Legacy Surfaces

These packages were transitional and are now removed from the tracked codebase.

| Package | Status | Why |
|---|---|---|
| `api/` | deleted | superseded by `infra/api` |
| `domain/` | deleted | superseded by `core/` |
| `storage/` | deleted | superseded by `infra/artifacts` |
| `ops/` | deleted | superseded by `workflows/` and `observe/` |
| `legacy/` | deleted | shims removed |
| `policies/` | deleted | duplicate YAML namespace removed |
| `models/` | deleted | split into `student/` and `history/` |

## Correct Ownership By Concern

### API / DTOs / Auth

- canonical home: `infra/api/`

### Geometry / Terrain / Scoring / Validation

- canonical home: `core/`

### Raw / Derived / Artifact Persistence

- canonical home: `infra/artifacts/`

### Live + Offline Operational Commands

- canonical home: `workflows/`

### Query Acquisition

- canonical online policy namespace: `policy/`
- query-plan builders also live in `policy/`

### Submission / Prior Predictors

- canonical home: `student/predictor/`

### Predictive Modeling

- privileged offline models: `teacher/`
- online-safe models: `student/`
- historical learning/corpus loaders: `history/`

## Workflow Surface: Correct Final Shape

There should be three first-class workflow families only.

### 1. Data / History

- ingest replay
- inspect replay
- summarize replay
- materialize episode
- build datasets

### 2. Offline Research

- train teacher
- train student
- run synthetic tournament
- run synthetic benchmark
- compare benchmarks
- evaluate science realism

### 3. Live Operations

- inspect active round
- run legal online round
- submit predictions
- fetch analyses

Anything else is either:

- internal library code
- compat shim
- migration debt

## Cleanup Order

Do cleanup in this order.

### Phase 1: Freeze Mainline

Declare these as trunk:

- `envs/`
- `history/`
- `teacher/`
- `student/`
- `policy/`
- `eval/`
- `workflows/online_episode.py`
- `workflows/synthetic_tournament.py`
- `workflows/synthetic_benchmark.py`
- `workflows/live_online.py`
- `eval/science.py`

Everything else must either migrate toward that or move behind compat.

### Phase 2: Stop The Bleeding

No new mainline file may import:

- `astar.api`
- `astar.domain`
- `astar.storage`
- `astar.ops`
- `astar.legacy`
- `astar.policies`

Legacy import count in `src/astar/` should remain exactly zero.

### Phase 3: Collapse Duplicate Namespaces

1. eliminate top-level `policies/`
2. remove catch-all model namespace
3. remove older live/spec execution path once env/oracle loop fully replaces it

### Phase 4: Replace Bridges With Native Implementations

Bridge files should be rewritten natively, not preserved as wrappers.

Examples of transitional bridge zones:

- `infra/api/dto.py`
- `infra/artifacts/store.py`
- `infra/artifacts/tables.py`
- `workflows/replay_capture.py`
- `workflows/round_report.py`

These should become true native implementations.

### Phase 5: Keep The Graph Clean

After legacy package removal:

- keep import-boundary tests strict
- refuse new shim packages
- only permit direct imports from the mainline bounded contexts

## Definition Of Clean

The repo is clean when all of the following are true:

- one obvious online loop
- one obvious offline benchmark loop
- one obvious science evaluation loop
- one policy namespace
- one modeling stack story
- compat layer is explicit and small
- docs describe the real system, not history
- mainline imports never touch old layers

## Current Migration Priority

1. strengthen split discipline and frozen benchmark banks
2. expand science evaluation / PPC coverage
3. strengthen geometry/topology feature stack
4. expand catalog/model-lineage layer
