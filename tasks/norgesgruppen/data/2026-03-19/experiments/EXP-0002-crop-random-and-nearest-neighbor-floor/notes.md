# EXP-0002 crop-random-and-nearest-neighbor-floor

## Metadata

- id: `EXP-0002`
- slug: `crop-random-and-nearest-neighbor-floor`
- status: `completed`
- phase: `M1`
- priority: `2`

## Question

What is the floor for GT-crop recognition before using stronger embedders?

## Prerequisites

- `EXP-0001`

## Success Gate

Strict, extended, and full recognition slices all produce sane non-random baselines and error reports.

## Run Notes

- owner: `codex`
- code path: `scripts/benchmark_norgesgruppen_crops.py`
- split: blocked validation GT crops from `gt-crop-manifest.jsonl`
- slices: `strict`, `extended`, `full`
- gallery mode: `representative`
- seed: `20260320`

## Results

- primary metrics:
  - strict random top-1 `0.004383` -> hash top-1 `0.068176`, top-5 `0.152666`, `mAP@20` `0.108862`
  - extended random top-1 `0.003611` -> hash top-1 `0.066683`, top-5 `0.149976`, `mAP@20` `0.10682`
  - full hash top-1 overall `0.062897`, evaluable-only `0.065874`, evaluable fraction `0.954814`
- bucketed metrics:
  - strict `egg` top-1 `0.004098`
  - strict `frokost` top-1 `0.085878`
  - strict `exact_reference_low_view` top-1 `0.011364`
  - strict `exact_reference_medium_view` top-1 `0.15625`
- key error read:
  - full slice has `199` unevaluable queries
  - biggest impossible categories start with `unknown_product` `90`, `SJOKORINGER 375G ELDORADO` `26`, `EVERGOOD CLASSIC PRESSMALT 250G` `14`, `Eldorado Økologiske Gårdsegg` `13`
  - hash floor is non-random but still far from usable classifier quality
- next action:
  - run `EXP-0003` with the same slices and score via `scripts/eval_norgesgruppen_crop_rankings.py`
