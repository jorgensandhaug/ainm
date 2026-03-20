# Detection Runtime

This is the practical runbook for class-agnostic localization work.

## What Is Frozen

- blocked split: [training-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/training-manifest.json)
- class-agnostic YOLO export: [dataset.yaml](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo-class-agnostic/dataset.yaml)
- detector evaluator: [eval_norgesgruppen_class_agnostic_detection.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/eval_norgesgruppen_class_agnostic_detection.py)
- YOLO txt converter: [convert_yolo_txt_predictions.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/convert_yolo_txt_predictions.py)
- canonical YOLO runner: [run_norgesgruppen_yolov8.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/run_norgesgruppen_yolov8.py)

## Environment Setup

Create a detector env:

```bash
./scripts/setup_norgesgruppen_det_env.sh --venv .venv-det
```

GPU local setup if desired:

```bash
./scripts/setup_norgesgruppen_det_env.sh --venv .venv-det --cuda-index-url https://download.pytorch.org/whl/cu124
```

NixOS wheel wrapper:

```bash
PYTHONPATH=scripts ./scripts/run_norgesgruppen_det_python.sh ...
```

Local compatibility notes:

- [setup_norgesgruppen_det_env.sh](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/setup_norgesgruppen_det_env.sh) force-swaps `opencv-python` for `opencv-python-headless` to avoid `libxcb.so.1` failures on this host
- [run_norgesgruppen_yolov8.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/run_norgesgruppen_yolov8.py) patches local `torch 2.6` checkpoint loading so trusted `ultralytics 8.1.0` `.pt` files load cleanly

## Canonical `EXP-0006` Sequence

1. Build the one-class export:

```bash
python scripts/export_norgesgruppen_yolo.py --class-agnostic
```

2. Train a YOLOv8 baseline:

```bash
PYTHONPATH=scripts ./scripts/run_norgesgruppen_det_python.sh scripts/run_norgesgruppen_yolov8.py train \
  --model yolov8n.pt \
  --data /home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo-class-agnostic/dataset.yaml \
  --epochs 50 \
  --imgsz 1280 \
  --batch 8 \
  --device cpu \
  --workers 0 \
  --project /home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts \
  --name yolov8n-train
```

3. Run val prediction export:

```bash
PYTHONPATH=scripts ./scripts/run_norgesgruppen_det_python.sh scripts/run_norgesgruppen_yolov8.py predict \
  --model /home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/yolov8n-train/weights/best.pt \
  --source /home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo-class-agnostic/images/val \
  --conf 0.001 \
  --iou 0.7 \
  --imgsz 1280 \
  --device cpu \
  --project /home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts \
  --name yolov8n-val-predict
```

4. Convert YOLO txt to evaluator json:

```bash
python scripts/convert_yolo_txt_predictions.py \
  --input-dir /home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/yolov8n-val-predict/labels \
  --output-json /home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/yolov8n-val-predictions.json \
  --force-category-id 0
```

5. Score the run:

```bash
python scripts/eval_norgesgruppen_class_agnostic_detection.py \
  --predictions /home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/yolov8n-val-predictions.json \
  --output-dir /home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/eval-yolov8n \
  --label yolov8n_class_agnostic
```

## What To Read

- primary detector metric: `ap50_ignore_class`
- also inspect:
  - `map50_95_ignore_class`
  - `miss_rate_iou50`
  - `duplicate_box_rate_iou50`
  - `count_mae`
- bucket reads that matter:
  - `by_image_dominant_theme`
  - `by_image_difficulty_bucket`
  - `gt_hit_rate_iou50.theme`
  - `gt_hit_rate_iou50.readiness_bucket`
  - `gt_hit_rate_iou50.area_bucket`
  - `gt_hit_rate_iou50.edge_bucket`

## Reality Check

- do not treat detector progress as classification progress
- detector promotion is still blocked on:
  - overfit sanity
  - bucket-safe gains
  - no catastrophic duplicate inflation
- class-agnostic export is for localization only
