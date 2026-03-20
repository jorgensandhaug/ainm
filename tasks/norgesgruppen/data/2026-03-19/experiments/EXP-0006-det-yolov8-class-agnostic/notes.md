# EXP-0006 det-yolov8-class-agnostic

## Metadata

- id: `EXP-0006`
- slug: `det-yolov8-class-agnostic`
- status: `in_progress`
- phase: `M2`
- priority: `6`

## Question

What is the fastest submission-friendly class-agnostic localization baseline?

## Prerequisites

- `EXP-0001`

## Success Gate

Overfit sanity passes and blocked-split class-agnostic AP50 is strong enough to anchor later pipeline work.

## Run Notes

- owner:
- code path:
- split:
- slices:
- seed:
- prep command:
  - `python scripts/export_norgesgruppen_yolo.py --class-agnostic`
- expected training view:
  - `data/2026-03-19/derived/yolo-class-agnostic/dataset.yaml`
- runtime:
  - [detection-runtime.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/detection-runtime.md)
- canonical code path:
  - `scripts/run_norgesgruppen_yolov8.py`
  - `scripts/convert_yolo_txt_predictions.py`
  - `scripts/eval_norgesgruppen_class_agnostic_detection.py`
- reminder:
  - this experiment is about localization only, so every box should train as class `0`

## Results

- primary metrics:
  - evaluator sanity:
    - empty predictions -> `ap50_ignore_class 0.0`, `map50_95_ignore_class 0.0`
    - oracle val GT predictions -> `ap50_ignore_class 1.0`, `map50_95_ignore_class 1.0`
  - runtime smoke:
    - `.venv-det` boots with `torch 2.6.0+cu124`, `ultralytics 8.1.0`
    - one-image `yolov8n.pt` predict smoke ran through the canonical runner
- bucketed metrics:
  - not meaningful yet for model quality; only smoke artifacts exist
- key error read:
  - local runtime needed two fixes:
    - replace GUI OpenCV with `opencv-python-headless`
    - patch local YOLO runner for `torch 2.6` `weights_only=True` checkpoint loading
  - end-to-end smoke chain now works:
    - `run_norgesgruppen_yolov8.py predict`
    - `convert_yolo_txt_predictions.py`
    - `eval_norgesgruppen_class_agnostic_detection.py`
- next action:
  - run a tiny overfit train sanity on the class-agnostic export
  - then run the first real blocked-split `YOLOv8n` localization baseline
