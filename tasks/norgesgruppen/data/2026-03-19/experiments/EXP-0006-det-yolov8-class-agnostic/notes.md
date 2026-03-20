# EXP-0006 det-yolov8-class-agnostic

## Metadata

- id: `EXP-0006`
- slug: `det-yolov8-class-agnostic`
- status: `completed`
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

- finalized baseline:
  - run:
    - `yolov8n-blocked-val-10ep-cpu-baseline`
    - `10` epochs, `960`, batch `2`, cpu, cached images
  - train command:
    - `PYTHONPATH=scripts ./scripts/run_norgesgruppen_det_python.sh scripts/run_norgesgruppen_yolov8.py train --model yolov8n.pt --data data/2026-03-19/derived/yolo-class-agnostic/dataset.yaml --epochs 10 --imgsz 960 --batch 2 --device cpu --workers 0 --project data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts --name yolov8n-blocked-val-10ep-cpu-baseline --overrides-json '{"patience":20,"cache":true}'`
  - canonical finalizer:
    - `PYTHONPATH=scripts ./scripts/run_norgesgruppen_det_python.sh scripts/finalize_norgesgruppen_yolo_run.py --run-dir data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/yolov8n-blocked-val-10ep-cpu-baseline --source data/2026-03-19/derived/yolo-class-agnostic/images/val --predict-dir data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/yolov8n-blocked-val-10ep-cpu-baseline-predict --predictions-json data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/yolov8n-blocked-val-10ep-cpu-baseline-predict/predictions.json --eval-dir data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/eval-yolov8n-blocked-val-10ep-cpu-baseline --oracle-dir data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/oracle-class-yolov8n-blocked-val-10ep-cpu-baseline --summary-json data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/yolov8n-blocked-val-10ep-cpu-baseline-finalize-summary.json --conf 0.001 --iou 0.7 --imgsz 1280 --device cpu --force-category-id 0`
  - internal YOLO val at epoch `10`:
    - `precision 0.82112`, `recall 0.83152`
    - `mAP50 0.86653`, `mAP50-95 0.51964`
  - canonical class-agnostic eval:
    - `ap50_ignore_class 0.852028`
    - `ap75_ignore_class 0.530942`
    - `map50_95_ignore_class 0.494438`
    - `miss_rate_iou50 0.048592`
    - `duplicate_box_rate_iou50 0.132653`
    - `background_fp_rate_iou50 0.582313`
    - `count_mae 31.306122`
  - detector-box oracle-class bound:
    - `classification_map50 0.942574`
    - `hybrid_proxy 0.879192`
  - improvement over the 1-epoch smoke:
    - `ap50_ignore_class +0.162421`
    - `ap75_ignore_class +0.23387`
    - `map50_95_ignore_class +0.148766`
    - `miss_rate_iou50 -0.056313`
    - `duplicate_box_rate_iou50 -0.042449`
    - `count_mae -41.204082`
  - main hard regime still:
    - `knekkebrod ap50_ignore_class 0.799986`
    - `other ap50_ignore_class 0.623698`
  - major implication:
    - localization is now strong enough that the next highest-value experiment is the first real detector + recognizer pipeline, not another abstract detector-only preflight

- primary metrics:
  - evaluator sanity:
    - empty predictions -> `ap50_ignore_class 0.0`, `map50_95_ignore_class 0.0`
    - oracle val GT predictions -> `ap50_ignore_class 1.0`, `map50_95_ignore_class 1.0`
  - env/runtime:
    - detector env now pins `python 3.11`, `numpy 1.26.4`, `Pillow 10.2.0`, `opencv-python-headless 4.9.0.80`
    - local host is `cpu-only`
    - `.venv-det` boots with `torch 2.6.0+cu124`, `ultralytics 8.1.0`
  - overfit sanity:
    - 4-image class-agnostic subset, `40` epochs, no aug
    - best/final internal val metrics: `precision 0.88349`, `recall 0.63195`, `mAP50 0.78879`, `mAP50-95 0.59923`
    - artifact dir:
      - `data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/yolov8n-overfit-4img2`
  - zero-shot detector floor:
    - pretrained `yolov8n.pt` on blocked val, no fine-tuning
    - class-agnostic eval: `ap50_ignore_class 0.156996`, `ap75_ignore_class 0.059735`, `map50_95_ignore_class 0.07006`
    - `miss_rate_iou50 0.475023`, `duplicate_box_rate_iou50 0.109071`, `background_fp_rate_iou50 0.73193`, `count_mae 86`
    - eval artifact:
      - `data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/eval-yolov8n-coco-val-floor/metrics.json`
  - full-split 1-epoch smoke:
    - fine-tuned `yolov8n` on blocked split, `1` epoch, `960`, batch `2`, cpu
    - internal YOLO val: `precision 0.666516`, `recall 0.717302`, `mAP50 0.706996`, `mAP50-95 0.369238`
    - canonical class-agnostic eval: `ap50_ignore_class 0.689607`, `ap75_ignore_class 0.297072`, `map50_95_ignore_class 0.345672`
    - `miss_rate_iou50 0.104905`, `duplicate_box_rate_iou50 0.175102`, `background_fp_rate_iou50 0.556735`, `count_mae 72.510204`
    - eval artifact:
      - `data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/eval-yolov8n-blocked-val-1ep-cpu-smoke/metrics.json`
  - postprocess sweep on the 1-epoch smoke predictions:
    - swept `min_score {0.001, 0.05, 0.1, 0.2}` x `max_det_per_image {100, 150, 200}`
    - best `AP50` in the sweep was still worse than raw:
      - best sweep config: `min_score 0.001`, `max_det 200`
      - best sweep metrics: `ap50_ignore_class 0.668094`, `ap75_ignore_class 0.288552`, `map50_95_ignore_class 0.335315`
      - raw 1-epoch smoke stayed better on localization: `ap50_ignore_class 0.689607`, `map50_95_ignore_class 0.345672`
    - mild score filtering alone is almost AP-neutral:
      - `min_score 0.05`, `max_det 300` -> `ap50_ignore_class 0.687818`
      - predictions drop from `14700` to `11600`
      - background FP rate drops from `0.556735` to `0.501207`
    - sweep did reduce noise:
      - best sweep `background_fp_rate_iou50 0.468469` vs raw `0.556735`
      - best sweep `count_mae 57.816327` vs raw `72.510204`
    - conclusion:
      - calibration/top-k cleanup helps count behavior and false positives
      - it does not rescue localization quality enough to replace better detector weights
      - aggressive top-k truncation hurts more than a small confidence floor
    - sweep artifacts:
      - `data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/postprocess-sweep-yolov8n-blocked-val-1ep-cpu-smoke-small/sweep-summary.json`
      - `data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/postprocess-sweep-yolov8n-blocked-val-1ep-cpu-smoke-small/sweep-results.csv`
- bucketed metrics:
  - zero-shot `yolov8n.pt` is least bad on `egg`:
    - `egg` `ap50_ignore_class 0.386567`
  - it is much worse on the denser shelf themes:
    - `frokost` `0.123991`
    - `knekkebrod` low and noisy
- key error read:
  - local runtime needed two fixes:
    - replace GUI OpenCV with `opencv-python-headless`
    - patch local YOLO runner for `torch 2.6` `weights_only=True` checkpoint loading
  - the original blocker was env drift:
    - floating install pulled `numpy 2.4.3`, which broke `ultralytics 8.1.0` validation on `np.trapz`
  - stock COCO `yolov8n.pt` massively over-detects shelf scenes:
    - `14541` predictions on `49` val images
    - `10643` background false positives at IoU `0.5`
  - even after fine-tuning, the detector is still saturated:
    - raw 1-epoch smoke emits `300` predictions on every val image
    - simple threshold / top-k filtering trims noise but drops `AP50`
    - current bottleneck is still better localization, not cleverer postprocess
  - current miss profile is narrower than "generic small-object failure":
    - misses are concentrated in `knekkebrod` dense images, not spread evenly across themes
    - top miss images are all `knekkebrod`: `304, 298, 305, 297, 308, 310, 303, 306, 317, 313`
    - GT hit rate is strong on large boxes: `0.925635`
    - GT hit rate drops on medium boxes: `0.640523`
    - true COCO-small objects are only `5` GT boxes in val, so the immediate problem is not a classic tiny-object regime
    - edge-touch boxes are not the main failure mode:
      - `near_edge_1pct` hit rate `0.925651`
      - `interior` hit rate `0.893108`
- next action:
  - keep `YOLOv8n` as the current localization anchor
  - run detector + `PE-Core` next
  - keep postprocess tuning secondary
  - escalate detector family only if the first real pipeline still looks detector-limited
