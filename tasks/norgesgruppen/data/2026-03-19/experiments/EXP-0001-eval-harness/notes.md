# EXP-0001 eval-harness

## Metadata

- id: `EXP-0001`
- slug: `eval-harness`
- status: `completed`
- phase: `M0`
- priority: `1`

## Question

Can we reproduce the blocked validation split and compute the canonical bucketed competition-proxy metrics locally?

## Prerequisites

- none

## Success Gate

One command produces primary metrics, bucketed metrics, and a fixed-format error report for a saved prediction file.

## Run Notes

- owner: `codex`
- code path: `scripts/eval_norgesgruppen_predictions.py`
- split: `blocked_val`
- slices: `full val`, image dominant theme buckets, image difficulty buckets, category theme buckets, readiness buckets
- seed:

## Results

- primary metrics: empty case -> all zeros; oracle case -> all ones
- bucketed metrics: oracle case also returns `1.0` across theme, readiness, and image difficulty buckets
- key error read: evaluator writes both `metrics.json` and `error_summary.json` to a chosen output dir and correctly filters out-of-split predictions
- next action: build GT-crop benchmark harness for `EXP-0002`
