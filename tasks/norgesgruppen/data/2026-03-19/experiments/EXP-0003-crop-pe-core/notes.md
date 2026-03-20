# EXP-0003 crop-pe-core

## Metadata

- id: `EXP-0003`
- slug: `crop-pe-core`
- status: `completed`
- phase: `M1`
- priority: `3`

## Question

How strong is PE-Core as the primary catalog retrieval embedder on GT crops?

## Prerequisites

- `EXP-0001`
- `EXP-0002`

## Success Gate

Clearly beats EXP-0002 on strict-slice top-1, Recall@5, and macro top-1.

## Run Notes

- owner:
- code path:
- split: blocked validation GT crops
- slices: `strict`, `extended`, `full`
- gallery mode: `representative`
- seed: `20260320`
- required artifact:
  - `artifacts/rankings.json` with `annotation_id` + ranked category ids or scored candidates
- canonical run command:
  - `PYTHONPATH=scripts ./scripts/run_norgesgruppen_crop_python.sh scripts/run_norgesgruppen_crop_retrieval.py --backend pe_core_openclip --model-id hf-hub:timm/PE-Core-B-16 --output-dir data/2026-03-19/experiments/EXP-0003-crop-pe-core --experiment-id EXP-0003 --label pe_core_b16`
- floor to beat from `EXP-0002`:
  - strict top-1 `0.068176`
  - strict top-5 `0.152666`
  - strict `mAP@20` `0.108862`
  - full evaluable fraction reference `0.954814`
- bucket checks that matter:
  - `egg`
  - `exact_reference_low_view`
  - `sibling_variant_trap`
  - `missing_reference`
- local smoke:
  - `artifacts/pe-core-smoke/artifacts/run-manifest.json` already proves backend/model/env path boots on this machine

## Results

- primary metrics:
  - strict top-1 `0.627952`
  - strict top-5 `0.835159`
  - strict top-10 `0.873387`
  - strict `mAP@20` `0.721652`
  - full top-1 overall `0.586058`
  - full top-1 evaluable-only `0.613793`
  - full evaluable fraction `0.954814`
- bucketed metrics:
  - strict theme top-1:
    - `egg` `0.643443`
    - `frokost` `0.739504`
    - `knekkebrod` `0.522353`
    - `varmedrikker` `0.683519`
  - strict readiness top-1:
    - `exact_reference_high_view` `0.632023`
    - `exact_reference_medium_view` `0.684375`
    - `exact_reference_low_view` `0.536932`
  - full hard buckets:
    - `provisional_alias_reference` top-1 `0.319149`
    - `missing_reference` `65` unevaluable
    - `needs_manual_review` `9` unevaluable
    - `sibling_variant_trap` `35` unevaluable
    - `unknown_sentinel` `90` unevaluable
- key error read:
  - biggest confusions are sibling/size variants, especially WASA, HUSMAN, egg-family, Leksands, and AXA naming variants
  - retrieval is strong on reference-safe classes and weak where catalog coverage is structurally incomplete
  - warm-cache full rerun is about `13.99s` on CPU; cold run is dominated by query embedding
- next action:
  - run `EXP-0004`
  - compare complementarity, not just overall score
  - if DINOv3 is not clearly better, move to fusion/OCR before spending more time on pure crop embedders
