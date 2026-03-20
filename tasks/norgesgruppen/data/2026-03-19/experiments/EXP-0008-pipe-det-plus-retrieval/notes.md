# EXP-0008 pipe-det-plus-retrieval

## Metadata

- id: `EXP-0008`
- slug: `pipe-det-plus-retrieval`
- status: `completed`
- phase: `M3`
- priority: `8`

## Question

Does the decomposition stack already beat simple closed-set baselines end-to-end?

## Prerequisites

- `EXP-0003`
- `EXP-0006`

## Success Gate

Hybrid proxy beats the simplest monolithic baseline and failures are understandable by bucket.

## Run Notes

- owner:
- code path:
  - `scripts/run_norgesgruppen_det_plus_retrieval.py`
  - `scripts/eval_norgesgruppen_predictions.py`
  - `scripts/eval_norgesgruppen_oracle_class_bound.py`
- split:
  - blocked val
- slices:
  - full gallery-supported pipeline surface
- seed:
- detector source:
  - `EXP-0006`
  - `yolov8n-blocked-val-10ep-cpu-baseline`
- recognizer source:
  - `EXP-0003`
  - `PE-Core`
- first run:
  - label:
    - `pe_core_b16_ms0.4_rep`
  - detector filter:
    - `min_score 0.4`
    - `max_det_per_image none`
  - gallery mode:
    - `representative`
  - retrieval crop padding:
    - `0`
  - command:
    - `PYTHONPATH=scripts ./scripts/run_norgesgruppen_crop_python.sh scripts/run_norgesgruppen_det_plus_retrieval.py --detector-predictions data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/yolov8n-blocked-val-10ep-cpu-baseline-predict/predictions.json --output-dir data/2026-03-19/experiments/EXP-0008-pipe-det-plus-retrieval/artifacts/pe-core-b16-ms0.4-representative --backend pe_core_openclip --model-id hf-hub:timm/PE-Core-B-16 --gallery-mode representative --min-score 0.4 --ranking-top-k 5 --batch-size 32 --device auto --experiment-id EXP-0008 --label pe_core_b16_ms0.4_rep`

## Intended Interpretation

- detector-only eval on the filtered predictions tells us the exact localization operating point we chose
- pipeline eval tells us what retrieval adds without changing detector scores
- same-filter oracle-class bound tells us how much recognition/calibration gap remains after that exact detector filter
- if pipeline sits near oracle, retrieval is good enough and next work is detector/calibration
- if pipeline is far below oracle, next work is recognizer or recognizer+fallback

## Results

- primary metrics:
  - filtered detector-only operating point:
    - `4906` predictions
    - detection `AP50 0.797113`
    - classification `mAP50 0.000005`
    - hybrid `0.557981`
  - first real detector + retrieval stack:
    - classification `mAP50 0.452121`
    - hybrid `0.693615`
  - same-box oracle-class bound:
    - classification `mAP50 0.865195`
    - hybrid `0.817538`
- bucketed metrics:
  - pipeline classification by theme:
    - `egg 0.208371`
    - `frokost 0.507062`
    - `knekkebrod 0.379309`
    - `other 0.329942`
    - `varmedrikker 0.526872`
  - readiness failures remain structural:
    - `missing_reference 0.0`
    - `sibling_variant_trap 0.0`
    - `unknown_sentinel 0.0`
- key error read:
  - matched true-positive detector crops:
    - top-1 `0.627225`
    - top-5 `0.825916`
  - supported/reference-like matched crops:
    - top-1 `0.658966`
    - top-5 `0.867712`
  - cheap score fusion already helps:
    - `detector_score * retrieval_top1_score` -> hybrid `0.717616`
- next action:
  - freeze `detector_score * retrieval_top1_score` as the next cheap baseline
  - build GT-crop closed-set classifier
  - then run detector + retrieval + classifier fallback
