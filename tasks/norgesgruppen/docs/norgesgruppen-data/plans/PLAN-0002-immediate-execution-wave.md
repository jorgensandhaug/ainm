# PLAN-0002 Immediate Execution Wave

## Metadata

- id: `PLAN-0002`
- status: active
- date: `2026-03-20`
- scope: first concrete build wave toward trustworthy experiments

## Goal

Turn the planning system into actual runnable experimentation with minimal ambiguity.

This wave is intentionally narrow.

It does not try to solve the whole project.

It tries to make the first serious experiments inevitable.

Current status:

- `EXP-0001` completed with evaluator sanity checks
- `EXP-0002` completed with non-random crop-floor baselines
- `EXP-0003` completed with strong `PE-Core` crop retrieval
- front of queue is now `EXP-0004`

## Wave Scope

This plan covers:

- `EXP-0001` evaluation harness
- `EXP-0002` crop floor baseline
- `EXP-0003` crop `PE-Core`

These are enough to answer the first crucial question:

- is recognition the bottleneck or not?

## Why This Wave First

Because almost every wrong path starts with one of these failures:

- untrustworthy evaluator
- unclear slices
- no trivial baseline
- heavy model comparisons before we know what is hard

This wave removes those risks first.

## Deliverable 1: `EXP-0001` Evaluation Harness

What must exist:

- a script that reads predictions and scores them on the blocked split
- detection-only proxy
- classification-only proxy
- hybrid proxy
- bucketed reports by theme, readiness bucket, and image difficulty bucket
- fixed-format error outputs

Inputs it should use:

- [training-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/training-manifest.json)
- [category-strategy-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/category-strategy-manifest.json)
- [image-sampling-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/image-sampling-manifest.json)
- [val.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/coco-splits/val.json)

Output shape:

- `metrics.json`
- `error_summary.json`
- optional `artifacts/` prediction diagnostics

Success check:

- one command
- deterministic
- understandable without reading code

## Deliverable 2: `EXP-0002` Crop Floor

What must exist:

- GT-crop evaluation harness
- strict / extended / full slice support
- random baseline
- nearest-neighbor packshot baseline

Inputs it should use:

- [gt-crop-manifest.jsonl](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/gt-crop-manifest.jsonl)
- [packshot-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/packshot-manifest.json)
- [manual-review-decisions.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/manual-review-decisions.json)

Success check:

- random baseline is bad
- nearest-neighbor is better than random
- outputs expose which classes/slices fail

Current read:

- strict hash top-1 `0.068176` vs random `0.004383`
- full evaluable fraction `0.954814`
- `egg` and low-view buckets remain near-dead
- the crop lane has real signal, but the floor is still weak enough to justify stronger embedders

## Deliverable 3: `EXP-0003` `PE-Core`

What must exist:

- a reproducible embedding/retrieval benchmark on GT crops
- same slices as `EXP-0002`
- same reporting format as `EXP-0002`

Success check:

- clearly beats `EXP-0002` on strict slice
- macro top-1 improves, not only head-class micro averages

## Implementation Shape

Preferred code organization:

- one scoring module for image-level detection metrics
- one scoring module for crop-level retrieval metrics
- one report module for bucket breakdowns
- one experiment folder per run

Do not bury logic inside notebooks or ad hoc shell history.

## Exit Criteria

This plan is complete when:

1. `EXP-0001`, `EXP-0002`, and `EXP-0003` folders all exist
2. the evaluator code exists
3. the crop-benchmark code exists
4. at least one real run can be recorded under the experiment registry

Current read:

- this plan is now effectively complete
- `PE-Core` proved GT-crop recognition is strong on reference-safe classes
- the next branch decision is whether `DINOv3` is better, complementary, or unnecessary before OCR fusion

## Non-Goals

Not in this wave:

- `Co-DETR`
- `T-Rex2`
- pseudo-labeling
- submission packaging

Those only matter after we trust the measurements.
