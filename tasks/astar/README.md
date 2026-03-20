# Astar Island

Single-repo Python scaffold for Astar Island: typed API models, immutable raw logs, replayable derived tables, baseline submissions, and round reports.

## Principles

- Python only until real bottleneck
- raw artifacts immutable
- derived tables/tensors reproducible
- CLI-first, notebook-friendly, thin dashboard
- simple code, strict types, Pydantic at boundaries
- all Astar data/versioned artifacts live in git

## Layout

The repo is organized around:

- `src/astar/core`: pure math kernel, terrain semantics, scoring, prediction objects
- `src/astar/infra`: API, artifact paths, blob metadata, DuckDB catalog
- `src/astar/features`: deterministic geometry, reachability, influence, motifs
- `src/astar/observe`: evidence aggregation, policy planning, query execution
- `src/astar/student`: online-safe predictors and posterior logic
- `src/astar/teacher`: privileged offline models
- `src/astar/eval`: diagnostics, backtests, reports
- `src/astar/workflows`: live round orchestration, analysis harvest, episode materialization
- `src/experiments`: typed Python run specs
- `data/raw`: immutable round/query/submission/analysis payloads
- `data/derived`: parquet + tensor outputs
- `data/artifacts`: plans, reports, live spec artifacts, episode summaries
- `data/catalog.duckdb`: event log and episode observability metadata

## Quickstart

```bash
uv sync --extra dev
uv run pytest
uv run astar show-round --round-id 00000000-0000-0000-0000-000000000001
uv run astar fetch-replay --round-id 00000000-0000-0000-0000-000000000001 --seed-index 0
uv run astar harvest-replays --samples-per-seed 10 --max-new-replays 50
uv run astar harvest-replays --samples-per-seed 10 --random-delay-min-seconds 60 --random-delay-max-seconds 180
uv run astar build-submission --round-id 00000000-0000-0000-0000-000000000001 --model static_semantic
uv run astar validate-submission --round-id 00000000-0000-0000-0000-000000000001 --seed-index 0
uv run astar round-report --round-id 00000000-0000-0000-0000-000000000001 --seed-index 0
uv run astar dataset-summary
uv run astar corpus-summary
uv run astar episode-summary --round-id 00000000-0000-0000-0000-000000000001
uv run astar materialize-episode --round-id 00000000-0000-0000-0000-000000000001
uv run astar run-live-online --round-id <active-round-id> --model latent_regime --policy coverage --no-submit-predictions
```

On most machines, plain `uv run ...` should just work. On stricter Linux hosts,
the repo bootstraps runtime library dirs automatically when the host exposes
them through env vars such as `ASTAR_EXTRA_LIBRARY_DIRS` or `NIX_LD_LIBRARY_PATH`.

## Config

Copy `.env.example` and set:

- `ASTAR_BASE_URL`
- `ASTAR_BEARER_TOKEN`

Cookie auth is also supported with `ASTAR_ACCESS_TOKEN`.

## Data Policy

Everything under this project is meant to be shared through git, including:

- `data/raw/**`
- `data/derived/**`
- `data/artifacts/**`
- plans, reports, tensors, parquet tables, query logs

This is intentional. The observation log is critical and losing it is unacceptable.

What is **not** committed:

- `.env`
- secrets/tokens
- local caches like `.venv`, `.pytest_cache`, `.ruff_cache`, `.mypy_cache`

Useful commands:

```bash
make status-project
make stage-data
make stage-project
make check-data-tracked
```

`make stage-project` stages only this Astar project subtree, not unrelated repo changes outside it.

## Current Scope

Stage 1 scaffold includes:

- Pydantic API schemas
- query/raw artifact logger
- terrain mapping + local validator
- entropy-weighted KL scorer
- parquet replay for query/cell/settlement observations
- uniform + static-semantic baselines
- fixture-backed sample report

The current playground layer now also includes:

- mainline query planning from Python policies plus JSON plan artifacts
- deterministic geometry feature bundles per seed
- round evidence aggregation from raw query logs
- raw full-rollout replay capture under `data/raw/replays/<round_id>/seed_index=<seed>/`
- episode materialization into reusable feature/evidence tensors
- a typed historical round loader for offline learning experiments
- a typed corpus summary for leave-one-seed-out and multi-seed holdout experiments
- a geometry prior predictor
- a shared round-latent heuristic predictor seam
- round episode diagnostics and local dataset diagnostics
- a DuckDB event catalog for live and offline observability
- `run-live-online` as the only live execution path

See [architecture.md](/home/jorge/repos/ainm/tasks/astar/docs/architecture.md) for the target design.
