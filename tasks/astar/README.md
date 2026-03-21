# Astar Island

CLI-first research and operations repo for the Astar Island competition.

This repo does four things:

- runs legal live rounds against the official API
- stores immutable raw round/query/replay/analysis artifacts
- materializes reproducible derived tensors and summaries
- trains and evaluates offline priors, teachers, students, and policies

`README.md` is the canonical doc for this repo. Treat files under `docs/` as supplementary notes, backlog, or historical context unless they explicitly say otherwise.

Canonical challenge-facts doc: [game_facts.md](/home/jorge/repos/ainm/tasks/astar/docs/game_facts.md)

- read it before making claims about mechanics, API surface, scoring, or replay
- it explicitly separates official public-doc facts from richer replay facts observed from direct platform use

## Reader Guide

- If you are new: read [game_facts.md](/home/jorge/repos/ainm/tasks/astar/docs/game_facts.md), then `Competition`, `Mental Model`, `Pipelines`, `Common Commands`.
- If you are working on models: read `Current Model Stack`, `Data Layout`, `Agent Notes`.
- If you are operating live rounds: read `Live Pipeline`, `Common Commands`, `Data Policy`.

## Competition

The task is not standard supervised classification.

You see:

- 5 seeds per round sharing one hidden round parameter set
- a full initial map for each exposed seed
- initial settlement positions and port flags
- up to `50` total `simulate` queries per round across all seeds
- each query reveals one stochastic year-50 viewport, max `15 x 15`

You submit:

- one `H x W x 6` probability tensor per seed

You are scored by:

- entropy-weighted KL between your prediction tensor and organizer ground-truth final-state marginals

Important class mapping:

| Internal code | Meaning | Scored class |
| --- | --- | --- |
| `10` | ocean | `0` empty |
| `11` | plains | `0` empty |
| `0` | empty | `0` empty |
| `1` | settlement | `1` settlement |
| `2` | port | `2` port |
| `3` | ruin | `3` ruin |
| `4` | forest | `4` forest |
| `5` | mountain | `5` mountain |

Operationally important facts:

- mountains are static
- forests are mostly slow-moving
- settlements, ports, ruins carry most score-relevant uncertainty
- zero probability on a class is dangerous; use a floor

The local scorer is implemented in [score.py](/home/jorge/repos/ainm/tasks/astar/src/astar/core/score.py).

For exact challenge facts, source tiers, and replay caveats, use [game_facts.md](/home/jorge/repos/ainm/tasks/astar/docs/game_facts.md).

## Mental Model

The native object in this repo is a round episode:

- `M_r`: known initial maps and settlements for the exposed seeds
- `D_r`: live query transcript
- `P_r`: final truth tensors when analyses exist

The architecture is built around two learning problems:

1. Offline across historical rounds: learn stable structure, priors, replay summaries, teacher models.
2. Online within the current round: infer a small round-specific regime from legal live evidence and build final predictions.

Short thesis:

- historical rounds learn `phi`
- live rounds infer small `z_r`
- replay is privileged offline information
- online predictors must use only initial maps plus legal transcript evidence

## Repo Map

- `src/astar/core`
  Pure contracts and math: terrain semantics, prediction objects, validation, scoring.
- `src/astar/infra`
  API DTOs/client, artifact paths/store, catalog/event logging.
- `src/astar/history`
  Replay ingestion, episode building, materialized learning views, synthetic datasets, historical summaries.
- `src/astar/envs`
  Oracle contracts and live/synthetic/historical environment adapters.
- `src/astar/features`
  Deterministic geometry/topology features from initial maps only.
- `src/astar/observe`
  Query/evidence logic over live transcripts.
- `src/astar/student`
  Online-safe predictors and posterior logic.
- `src/astar/teacher`
  Privileged offline models and decoders.
- `src/astar/policy`
  Interactive query policies.
- `src/astar/eval`
  Diagnostics, backtests, synthetic benchmark evaluation, reports.
- `src/astar/viz`
  Plotting and rendered artifacts only.
- `src/astar/workflows`
  End-to-end operational and research entrypoints.

## Pipelines

### Live Pipeline

Canonical live path:

```bash
uv run astar run-live-online --round-id <round-id> --model latent_regime --policy coverage
```

That path does:

1. sync round metadata from the API
2. construct round context from initial states
3. iterate `policy.select -> /simulate -> predictor.update`
4. rebuild geometry + evidence from transcript
5. predict all seeds
6. validate tensors
7. persist predictions/submission records
8. optionally submit them
9. log the run to the DuckDB catalog

Key seams:

- live oracle: [live.py](/home/jorge/repos/ainm/tasks/astar/src/astar/envs/live.py)
- online episode runner: [online_episode.py](/home/jorge/repos/ainm/tasks/astar/src/astar/workflows/online_episode.py)
- live workflow wrapper: [live_online.py](/home/jorge/repos/ainm/tasks/astar/src/astar/workflows/live_online.py)

### Historical Data Pipeline

Historical/offline work starts from raw immutable artifacts:

- rounds from `/rounds/{id}`
- query logs from `/simulate`
- replay captures from the site replay flow for completed rounds
- post-round analyses from `/analysis/{round_id}/{seed_index}`

Then:

1. build a `RoundEpisode`
2. summarize replay runs if present
3. compute deterministic geometry features
4. aggregate transcript evidence
5. save per-seed feature/evidence/replay tensors
6. expose a `RoundLearningEpisode` for training/eval

Key seams:

- episode builder: [build.py](/home/jorge/repos/ainm/tasks/astar/src/astar/history/episodes/build.py)
- replay capture: [replay_capture.py](/home/jorge/repos/ainm/tasks/astar/src/astar/workflows/replay_capture.py)
- replay summarization: [summarize_replays.py](/home/jorge/repos/ainm/tasks/astar/src/astar/workflows/summarize_replays.py)
- episode materialization: [materialize_episode.py](/home/jorge/repos/ainm/tasks/astar/src/astar/workflows/materialize_episode.py)
- learning view loader: [learning.py](/home/jorge/repos/ainm/tasks/astar/src/astar/history/learning.py)

### Offline Training Pipeline

There are currently two distinct offline branches.

#### 1. Direct Historical Prior

Train a cellwise empirical-Bayes prior directly from saved analyses:

```bash
uv run astar train-historical-bucket-prior
```

This produces `historical_bucket_prior_v1`, a hierarchical bucketed prior over final cell marginals.

#### 2. Replay-Driven Teacher/Student Stack

Replay branch:

1. harvest many replay trajectories from completed rounds
2. summarize their terminal/hazard behavior
3. fit a replay-backed teacher:
   - `HazardTeacher` for the terminal-decoder baseline
   - `StateSpaceTeacher` for the event-head yearly rollout model
4. build synthetic live-query episodes from replay-backed rounds
5. fit a replay-safe student:
   - `SummaryBankStudent` as the grouped-transcript kNN baseline
   - `StateSpaceStudent` as the probabilistic regime posterior student for `StateSpaceTeacher`

This stack exists and is testable, but it is still experimental and not yet wired into the live serving path.

Training entrypoints:

```bash
uv run astar train-hazard-teacher
uv run astar train-summary-student
uv run astar train-state-space-teacher
uv run astar train-state-space-student
```

### Synthetic Evaluation Pipeline

Synthetic evaluation uses the same online episode loop as live, but swaps the oracle:

- live: official API-backed oracle
- synthetic: replay-backed oracle with live-matching semantics

This is the main safe place to compare policy/predictor combinations.

Entry points:

```bash
uv run astar run-synthetic-tournament --round-id <round-id>
uv run astar run-synthetic-benchmark --manifest data/artifacts/benchmarks/smoke.json
uv run astar compare-synthetic-benchmarks --baseline <a.json> --candidate <b.json>
```

## Current Model Stack

### Live-Exposed Predictors

These are the models currently available through `build_online_predictor()`:

- `geometry_prior`
  Hand-built geometry-conditioned prior over final `H x W x 6` tensor.
- `historical_bucket_prior`
  Historical empirical-Bayes prior learned from saved analyses.
- `latent_regime`
  `geometry_prior` plus a 5-dimensional residual regime inferred from transcript evidence:
  - expansion
  - maritime
  - conflict
  - winter
  - reclamation

Live predictor wiring: [interactive.py](/home/jorge/repos/ainm/tasks/astar/src/astar/student/predictor/interactive.py)

### Experimental Offline Stack

- `HazardTeacher`
  Fits semimechanistic round coefficients from replay-backed episodes, then decodes a regime vector into final tensors.
- `StateSpaceTeacher`
  Fits latent-modulated yearly event heads and rolls them forward into terminal tensors.
- `SummaryBankStudent`
  kNN-style posterior model over grouped transcript summaries, using synthetic-live episodes plus the teacher decoder.
- `StateSpaceStudent`
  Probabilistic posterior student over teacher regime coordinates, using grouped transcript summaries, ridge proposal inference, and prototype particle correction.

Important current-state note:

- this teacher/student path exists for offline research
- it is not yet exposed via `run-live-online`
- student implementation notes live in [student_model_implementation_plan.md](/home/jorge/ainm/tasks/astar/docs/student_model_implementation_plan.md)

## Data Layout

Canonical path layout lives in [paths.py](/home/jorge/repos/ainm/tasks/astar/src/astar/infra/artifacts/paths.py).

High-level contract:

- `data/raw/**`
  Immutable source-of-truth API payloads and replay captures.
- `data/derived/**`
  Reproducible tensors/parquet derived from raw artifacts.
- `data/artifacts/**`
  Reports, model checkpoints, datasets, benchmark outputs, run manifests, and other shareable run outputs.
- `data/catalog.duckdb`
  Event log / observability catalog.

Most important subtrees:

- `data/raw/rounds/*.json`
- `data/raw/queries/<round_id>/*.json`
- `data/raw/replays/<round_id>/seed_index=<k>/*.json`
- `data/raw/submissions/<round_id>/seed_index=<k>.json`
- `data/raw/analyses/<round_id>/seed_index=<k>.json`
- `data/derived/features/round_id=<round_id>/seed_index=<k>.npz`
- `data/derived/evidence/round_id=<round_id>/seed_index=<k>.npz`
- `data/derived/replay_summaries/round_id=<round_id>/seed_index=<k>.npz`
- `data/derived/predictions/round_id=<round_id>/seed_index=<k>.npz`
- `data/artifacts/datasets/*`
- `data/artifacts/models/*`
- `data/artifacts/benchmarks/*`

## Data Policy

This project intentionally versions raw data in git and selectively versions useful artifacts.

Committed:

- `data/raw/**`
- selected `data/artifacts/**` outputs that are worth reviewing or sharing

Not committed:

- new `data/derived/**` outputs; they are reproducible and ignored by default
- `.env`
- auth tokens
- local env/cache directories

Repo invariant:

- raw artifacts are immutable
- derived artifacts should be reproducible from raw inputs plus code
- do not add new derived outputs to git; regenerate them locally as needed

## Common Commands

Bootstrap:

```bash
uv sync --extra dev
uv run pytest
```

Inspect/sync rounds:

```bash
uv run astar list-rounds
uv run astar active-round
uv run astar sync-round --round-id <round-id>
uv run astar show-round --round-id <round-id>
```

Live usage:

```bash
uv run astar run-live-online --round-id <round-id> --model latent_regime --policy coverage --no-submit-predictions
uv run astar submit --round-id <round-id> --seed-index 0
```

Historical data:

```bash
uv run astar harvest-replays --samples-per-seed 10 --max-new-replays 50
uv run astar ingest-replays --round-id <round-id>
uv run astar summarize-replays --round-id <round-id>
uv run astar fetch-round-analyses --round-id <round-id>
uv run astar materialize-episode --round-id <round-id>
uv run astar episode-summary --round-id <round-id>
uv run astar dataset-summary
uv run astar corpus-summary
```

Offline training and eval:

```bash
uv run astar train-historical-bucket-prior
uv run astar train-hazard-teacher
uv run astar train-summary-student
uv run astar run-synthetic-tournament --round-id <round-id>
uv run astar run-synthetic-benchmark --manifest data/artifacts/benchmarks/smoke.json
uv run astar backtest-round --round-id <round-id>
```

## Human Notes

- The repo is intentionally CLI-first. Notebooks are optional views, not source of truth.
- The real system shape is replay-driven, but live inference must remain legal and online-safe.
- Replay is an observed offline data source, not a documented public replay API contract. See [game_facts.md](/home/jorge/repos/ainm/tasks/astar/docs/game_facts.md).
- If you are trying to understand "what matters", start with:
  - [cli.py](/home/jorge/repos/ainm/tasks/astar/src/astar/cli.py)
  - [live_online.py](/home/jorge/repos/ainm/tasks/astar/src/astar/workflows/live_online.py)
  - [materialize_episode.py](/home/jorge/repos/ainm/tasks/astar/src/astar/workflows/materialize_episode.py)
  - [historical_bucket.py](/home/jorge/repos/ainm/tasks/astar/src/astar/student/predictor/historical_bucket.py)
  - [heuristic.py](/home/jorge/repos/ainm/tasks/astar/src/astar/student/predictor/heuristic.py)

## Agent Notes

This section is intentionally direct.

- `README.md` is canonical. Prefer updating it over creating new overlapping docs.
- `docs/game_facts.md` is canonical for external challenge facts. Update it first if rules/mechanics/API/scoring/replay facts change.
- Keep one obvious story:
  - one live loop
  - one historical materialization path
  - one synthetic benchmark path
- Preserve information boundaries:
  - online/student/policy code must not consume replay trajectories directly
  - replay and analysis are privileged offline data
- When adding docs:
  - describe the real system, not historical refactor steps
  - separate current behavior from future ideas
  - prefer concrete commands and file paths over vague prose
- When adding code:
  - raw artifacts immutable
  - derived artifacts reproducible
  - CLI is operational surface
  - avoid notebook-only logic
- If a new model is offline-only, say so explicitly in docs.

Useful starting files for agents:

- [cli.py](/home/jorge/repos/ainm/tasks/astar/src/astar/cli.py)
- [paths.py](/home/jorge/repos/ainm/tasks/astar/src/astar/infra/artifacts/paths.py)
- [store.py](/home/jorge/repos/ainm/tasks/astar/src/astar/infra/artifacts/store.py)
- [interactive.py](/home/jorge/repos/ainm/tasks/astar/src/astar/student/predictor/interactive.py)
- [coverage.py](/home/jorge/repos/ainm/tasks/astar/src/astar/policy/coverage.py)

## Docs Directory

`docs/` is now for supplementary material only:

- `cleanup_matrix.md`
  cleanup/refactor decision record
- `game_facts.md`
  canonical external challenge facts and replay caveats
- `handoff_from_high_level_agent.md`
  historical architecture handoff brief
- `student_model_implementation_plan.md`
  current student-role, schema, and implementation notes
- `research_operating_system_backlog.md`
  long-horizon backlog
- `ideas.md`
  raw notes

If any of those disagree with this README, trust this README first, then verify in code.
