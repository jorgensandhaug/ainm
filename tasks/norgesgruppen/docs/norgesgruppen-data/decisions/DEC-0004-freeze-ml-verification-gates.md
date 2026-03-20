# DEC-0004 Freeze ML Verification Gates

## Metadata

- id: `DEC-0004`
- status: accepted
- date: `2026-03-20`
- owners: modeling / evaluation

## Decision

Freeze the ML verification ladder for this task.

Every serious model or pipeline change must be verified through these stages:

1. data/split truth
2. evaluator empty/oracle controls
3. trivial baselines on the same harness
4. learning sanity
5. oracle bounds
6. bucketed error review

This is now the canonical automation entrypoint:

- [verify_norgesgruppen_ml_pipeline.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/verify_norgesgruppen_ml_pipeline.py)

This is the canonical human/agent operating guide:

- [ml-verification-playbook.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/ml-verification-playbook.md)

## Context

This project is vulnerable to exactly the kinds of silent ML failures that waste time:

- docs/payload drift
- split leakage
- evaluator drift
- lucky-seed overinterpretation
- detector-vs-recognizer bottleneck confusion
- apparent gains caused by threshold tricks rather than model quality

The task is also small enough that one bad assumption can poison weeks of iteration.

## Hard Gates

Before trusting a model family:

- empty/oracle evaluator controls must still pass
- exported training views must still round-trip to audited source data
- relevant trivial baselines must still be weak
- the model must beat those baselines on the frozen validation surface

Before trusting a detector:

- tiny overfit sanity must pass
- zero-shot floor must be recorded
- trained smoke must materially beat zero-shot
- detector-box oracle-class bound must be computed

Before trusting a recognizer:

- oracle rankings must score `1`
- random/hash floors must be recorded
- the model must beat them on the strict slice

Before trusting an end-to-end stack:

- oracle-box and oracle-class bounds must already exist
- bucketed metrics must be reported
- improvements must hold beyond head classes and easy themes

## Important Non-Blocking Gaps

These are required soon, but do not yet hard-fail the pipeline verifier:

- actual shuffled-label training runs for supervised models
- supervised crop-classifier tiny-overfit control
- multi-seed stability before promotion
- submission-contract dry-run

## Consequences

This enables:

- autonomous model iteration without losing rigor
- faster localization of the real bottleneck
- cleaner handoff across agents

This rules out:

- promoting results from a single scalar
- trusting downstream experiments when upstream controls drift
- spending cycles on OCR/fusion when localization is still unproven

## Supersedes / Superseded By

- supersedes: none
- superseded by: none
