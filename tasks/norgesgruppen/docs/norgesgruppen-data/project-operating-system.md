# Project Operating System

Purpose: define where future plans, decisions, experiments, and reports should live so new agents can continue without thread history.

## Core Rule

Do not treat the conversation as the source of truth.

The source of truth is the file structure below.

## Canonical Front Door

A new human or agent should start here:

1. [README.md](/home/jorge/repos/ainm/tasks/norgesgruppen/README.md)
2. [prep-playbook.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/prep-playbook.md)
3. [INDEX.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/INDEX.md)
4. [modeling-experiment-plan.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/modeling-experiment-plan.md)
5. [PLAN-0001-roadmap-to-first-competitive-submission.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/plans/PLAN-0001-roadmap-to-first-competitive-submission.md)

## Stable Top-Level Docs

Keep these flat and stable:

- [README.md](/home/jorge/repos/ainm/tasks/norgesgruppen/README.md): shortest human/agent handoff
- [prep-playbook.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/prep-playbook.md): operational sequence
- [INDEX.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/INDEX.md): generated doc + artifact map
- [deep-audit-summary.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/deep-audit-summary.md): proof / anomalies
- [modeling-experiment-plan.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/modeling-experiment-plan.md): experiment order and validation logic

Do not bury these in subfolders.

## Where New Things Go

### Plans

Put forward-looking execution docs in:

- `docs/norgesgruppen-data/plans/`

Use for:

- milestone plans
- phase-specific roadmaps
- strategy revisions

### Decisions

Put durable decisions in:

- `docs/norgesgruppen-data/decisions/`

Use for:

- validation policy changes
- class-join decisions
- model-family selections
- threshold / calibration policies

Each decision should explain:

- what was decided
- why
- what evidence supported it
- what it supersedes

### Reports

Put one-off analyses and experiment readouts in:

- `docs/norgesgruppen-data/reports/`

Use for:

- ablation summaries
- error-analysis writeups
- comparison reports
- section/theme deep dives

### Templates

Keep reusable templates in:

- `docs/norgesgruppen-data/templates/`

## Data / Artifact Layout

Use the dated data snapshot as the root for machine-readable artifacts:

- `data/2026-03-19/derived/`: stable derived manifests and exports
- `data/2026-03-19/experiments/`: per-experiment artifacts and outputs
- `data/2026-03-19/experiments/experiment-registry.json`: canonical queue of serious experiments

Do not mix experiment-specific outputs into `derived/`. `derived/` is for stable shared prep artifacts.

## Experiment Folder Convention

Each serious experiment gets its own folder:

- `data/2026-03-19/experiments/EXP-0001-short-slug/`

Every experiment should also exist in:

- [experiment-registry.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/experiments/experiment-registry.json)

To create the folder skeleton from the registry, use:

- `python scripts/scaffold_norgesgruppen_experiment.py --id EXP-0001`
- or `python scripts/scaffold_norgesgruppen_experiment.py --all`

Expected contents:

- `config.json`: exact model/data/config used
- `metrics.json`: scalar metrics + bucketed metrics
- `notes.md`: short human summary
- `artifacts/`: optional predictions, plots, confusion matrices, sample outputs

Optional:

- `train.log`
- `eval.json`
- `errors/`

## Naming Convention

Use stable ids:

- experiments: `EXP-0001`, `EXP-0002`, ...
- decisions: `DEC-0001`, `DEC-0002`, ...
- reports: `REP-0001`, `REP-0002`, ...

Then append a short slug:

- `EXP-0003-crop-pe-core`
- `DEC-0002-use-blocked-val-split`
- `REP-0004-egg-error-analysis`

## Minimum Standard For Every Experiment

Every experiment record must answer:

- what question was being tested?
- what changed relative to the previous best baseline?
- which split and slices were used?
- what are the primary metrics?
- what are the bucketed metrics?
- what failed?
- what is the next action?

If those are missing, the experiment did not happen in a reusable way.

## File Types By Purpose

- `.md`: human-readable narrative and decisions
- `.json`: machine-readable config / metrics / manifests
- `.jsonl`: large row-wise machine-readable outputs
- `artifacts/`: images, plots, predictions, debug outputs

## What Not To Do

- do not rely on chat history for context
- do not overwrite stable top-level docs with experiment noise
- do not scatter results across random temp paths
- do not put run-specific outputs into `derived/`
- do not change split or evaluation rules silently

## First Directories To Use Going Forward

- [docs/norgesgruppen-data/templates](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/templates)
- [docs/norgesgruppen-data/decisions](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/decisions)
- [docs/norgesgruppen-data/reports](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/reports)
- [data/2026-03-19/experiments](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/experiments)
- [experiment-registry.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/experiments/experiment-registry.json)
