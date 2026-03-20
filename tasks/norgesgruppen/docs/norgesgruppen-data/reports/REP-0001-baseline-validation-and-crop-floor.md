# REP-0001 Baseline Validation And Crop Floor

## Scope

- `EXP-0001` local competition-proxy evaluator
- `EXP-0002` GT-crop random + nearest-neighbor floor

## What Is Now Trusted

- [eval_norgesgruppen_predictions.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/eval_norgesgruppen_predictions.py) is sane:
  - empty predictions -> hybrid `0.0`
  - oracle val GT predictions -> hybrid `1.0`
- [benchmark_norgesgruppen_crops.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/benchmark_norgesgruppen_crops.py) produces stable strict / extended / full crop slices
- future crop models now have a fixed evaluator contract via [eval_norgesgruppen_crop_rankings.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/eval_norgesgruppen_crop_rankings.py)

## `EXP-0002` Key Numbers

Nearest-neighbor hash baseline vs random:

- strict:
  - random top-1 `0.004383`
  - hash top-1 `0.068176`
  - hash top-5 `0.152666`
  - hash top-10 `0.205016`
  - hash `mAP@20` `0.108862`
- extended:
  - random top-1 `0.003611`
  - hash top-1 `0.066683`
  - hash top-5 `0.149976`
  - hash top-10 `0.202455`
  - hash `mAP@20` `0.10682`
- full:
  - random top-1 `0.002725`
  - hash top-1 overall `0.062897`
  - hash top-1 evaluable-only `0.065874`
  - hash evaluable fraction `0.954814`
  - unevaluable queries `199`

## Important Buckets

- strict theme top-1:
  - `egg` `0.004098`
  - `frokost` `0.085878`
  - `knekkebrod` `0.065882`
  - `varmedrikker` `0.063701`
- strict readiness top-1:
  - `exact_reference_high_view` `0.065793`
  - `exact_reference_medium_view` `0.15625`
  - `exact_reference_low_view` `0.011364`
- full unevaluable mass is dominated by:
  - `unknown_product` `90`
  - `SJOKORINGER 375G ELDORADO` `26`
  - `EVERGOOD CLASSIC PRESSMALT 250G` `14`
  - `Eldorado Økologiske Gårdsegg` `13`

## Interpretation

- retrieval is not random even with a crude hash floor, so the crop-recognition lane is worth pursuing
- the floor is still weak enough that stronger embedders should have a large improvement ceiling
- `egg` and low-view references remain the clearest structural weak points
- full-slice metrics are capped by real no-reference / unresolved categories, not only model weakness

## Immediate Next Step

Run `EXP-0003` on the same crop-eval surface:

- emit ranked category predictions by `annotation_id`
- score with [eval_norgesgruppen_crop_rankings.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/eval_norgesgruppen_crop_rankings.py)
- promote only if strict-slice gains are real and bucket-safe
