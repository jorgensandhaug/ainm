# DEC-0002 Freeze Crop Retrieval Eval Contract

## Metadata

- id: `DEC-0002`
- status: accepted
- date: `2026-03-20`

## Context

`PE-Core`, `DINOv3`, fusion, OCR, and later rerankers all need to be compared on the same crop-recognition surface.

If each experiment bakes its own slice logic, gallery policy, or metric code, we will get fake progress.

## Decision

All GT-crop recognition experiments must use the same contract:

- query identity is validation `annotation_id`
- label space is payload `category_id` `0..355`
- default gallery policy is `representative`
- slice definitions are fixed by prepared manifests:
  - `strict`
  - `extended`
  - `full`
- evaluation must run through [eval_norgesgruppen_crop_rankings.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/eval_norgesgruppen_crop_rankings.py)
- shared slice/gallery logic must come from [norgesgruppen_crop_benchmark_common.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/norgesgruppen_crop_benchmark_common.py)

Accepted prediction formats:

- JSON/JSONL rows with `annotation_id` + `ranked_category_ids`
- JSON/JSONL rows with scored `candidates`
- JSON/JSONL rows with `scores_by_category_id`

## Promotion Rules

Crop-model promotion order is frozen:

1. strict slice first
2. extended slice second
3. full slice third

Do not promote a model on full-slice optics if strict slice is weak.

## Scoring Semantics

- missing GT category from provided ranking counts as beyond the ranked window
- partial rankings are allowed
- provided rankings are filtered to the slice-eligible category set before scoring
- categories absent from the slice gallery remain unevaluable and must stay explicitly reported
- bucketed reporting by `theme` and `classification_readiness_bucket` is mandatory

## Consequences

Good:

- `EXP-0002`, `EXP-0003`, `EXP-0004`, and fusion runs become directly comparable
- model-specific code no longer owns slice logic
- future agents can generate rankings only, then reuse the same evaluator

Bad:

- experiment code must emit a ranking artifact, not only ad hoc notebook metrics
- gallery-policy changes must be treated as explicit ablations, not silent defaults
