# Architecture

## Mental Model

The native object of this codebase is a **round episode**:

- `M_r`: known initial maps and initial settlements for the 5 seeds
- `D_r`: live query transcript
- `P_r`: final ground-truth probability tensors when analyses are available

The system is organized to learn two different things:

- offline across historical rounds: stable operator structure and priors
- online within the current round: the current round regime and local evidence corrections

## Bounded Contexts

- `core`
  Pure math kernel. Terrain semantics, scoring, validation, prediction objects.
- `infra`
  API client, artifact paths, blob metadata, DuckDB event catalog.
- `features`
  Deterministic geometry only. Coastlines, reachability, settlement influence, motifs.
- `observe`
  Live evidence acquisition. Query policy, planning, execution, transcript aggregation.
- `models`
  Predictors and calibration. Geometry prior first, latent regime on top.
- `eval`
  Diagnostics, dataset summaries, episode summaries, backtests.
- `workflows`
  End-to-end use cases that wire the pieces together.

## Design Rules

- Raw API payloads are immutable and versioned in `data/raw/**`.
- Derived tables and tensors are reproducible and versioned in `data/derived/**`.
- Artifacts and reports are versioned in `data/artifacts/**`.
- Experiments are Python specs under `src/experiments/**`.
- CLI is the operational surface.
- Notebooks are optional views over library code, never the only implementation.

## Current Model Stack

- `GeometryPriorPredictor`
  A geometry-conditioned conservative prior over the final `H x W x 6` tensor.
- `LatentRegimePredictor`
  A low-dimensional residual model on top of the geometry prior.
  It infers a round regime from current query evidence:
  - expansion
  - maritime
  - conflict
  - winter
  - reclamation

This is intentionally parsimonious. The goal is to encode the competition structure before adding capacity.

## Current Live Workflow

`astar live-run --spec experiments.live.explore_v1:spec`

1. sync the round
2. build a typed policy plan
3. execute or reuse logged queries
4. replay into parquet
5. aggregate round evidence
6. compute geometry features
7. build predictions with the selected predictor
8. optionally submit all seeds
9. log workflow events to DuckDB

## Observability

The current observability surface includes:

- `astar dataset-summary`
- `astar episode-summary --round-id ...`
- `data/catalog.duckdb`
- replayed parquet tables
- plan artifacts
- prediction tensors

The next layer should add:

- score decomposition once analyses are available
- historical episode atlas
- regime residual atlas
- backtests over saved analyses
- query utility attribution

## Why This Shape

This competition is not a single-round classifier.
It is a repeated empirical-Bayes / meta-learning problem with:

- shared hidden regime within a round
- geometry-dominated structure from the known initial maps
- stochastic viewport observations
- a final score on calibrated probability fields

The architecture is built around those facts.
