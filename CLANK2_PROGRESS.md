# CLANK2 Progress — Norgesgruppen Grocery Shelf Detection

## Task
Maximize hybrid score: `0.7 * detection_mAP@50 + 0.3 * classification_mAP@50`
- Constraints: < 420 MB total, < 300s on L4 GPU, offline
- Team best: ~0.89, top performers: ~0.93

## Current Best Model

**Model:** 6-stage 960px YOLO26x pipeline (single model, no ensemble)
**Weights:** `runs/960_confcurr_s2_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt` (120 MB)
**Eval config:** conf=0.0005, iou=0.55, imgsz=960

| Metric | Score |
|--------|-------|
| Detection AP@0.5 (class-agnostic) | 0.9295 |
| Classification mAP@0.5 (present 278 classes) | 0.7885 |
| Classification mAP@0.5 (all 356 classes) | 0.6157 |
| **Hybrid (present classes)** | **0.8872** |
| Hybrid (all 356 classes) | 0.8353 |

### Training Pipeline (6-stage, all on GPU 1)
1. sweep_precision: 30 epochs, lr0=0.0035, from yolo26x.pt
2. hardopt: 70 epochs, lr0=0.002, mixup=0.15, copy-paste=0.15
3. rebalanceft: 25 epochs (early stopped at 18), balanced data
4. finalfull: 20 epochs, train+val data
5. confcurr_s1: 12 epochs, confusion curriculum
6. confcurr_s2: 18 epochs, final fine-tune on original data

## Analysis

**Detection is strong (0.93), classification is the bottleneck (0.79).**

To reach 0.93 hybrid:
- If det stays at 0.93: cls needs ~0.93
- If det improves to 0.95: cls needs ~0.88

Key classification issues:
- 78 classes have 0 GT in val (score 0 if using all-classes metric)
- Many similar products (eggs, knekkebrød, coffee variants)
- Confusion between visually similar SKUs

## Experiment Log

### EXP-001: Baseline 6-stage 960px pipeline
- Date: 2026-03-22
- Result: Hybrid(present)=0.8872, Det=0.9295, Cls(present)=0.7885
- Notes: Replication of the known best single-model pipeline

### EXP-002: Confidence/NMS threshold sweep
- Date: 2026-03-22
- Status: DONE — no improvement
- Result: Score flat at 0.8872 across conf=[0.0001-0.3] and nms_iou=[0.4-0.7]
- Conclusion: Threshold tuning is saturated. Need model-level improvements.

### EXP-003: TTA (multi-scale + flip inference)
- Date: 2026-03-22
- Status: Starting
- Goal: Multi-scale inference (640, 960, 1280) + horizontal flip, merge via WBF

## IMPORTANT
- Git remote branch: **clank2** (not clank4!)
- GPU assignment: device 1

## Ideas Queue
1. ~~Threshold sweep~~ — no gain
2. TTA (multi-scale, flip) — moderate effort
3. Higher resolution (1280px) training — moderate effort
4. Ensemble (960 + 1280 models via WBF) — moderate effort
5. Two-stage: YOLO detector + separate classifier on crops — high effort, high potential
6. Better augmentation (more aggressive mosaic, mixup variations)
7. Class-frequency-weighted loss
8. Knowledge distillation from larger model
