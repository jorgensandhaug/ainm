# Clank4 Progress — Norgesgruppen Shelf Detection

## Goal
Maximize **Hybrid Score = 0.7 * detection_mAP@0.5 + 0.3 * classification_mAP@0.5** across all 356 classes.

## Current Best Model

| Model | Det AP@0.5 | Cls mAP@0.5 (present) | Cls mAP@0.5 (all 356) | Hybrid (all) |
|-------|-----------|----------------------|----------------------|-------------|
| **960 pipeline v2 (YOLO26x, 6-stage, new seeds)** | **0.9429** | **0.8105** | **0.6328** | **0.8499** |
| 960 pipeline v1 (YOLO26x, 6-stage) | 0.9310 | 0.7993 | 0.6242 | 0.8389 |

**Best Weights:** `runs/v2_960s6_e20_img960_b4_lr8e-05_mix0_cp0_seed500/weights/best.pt`
**Reproducibility:** Run `/tmp/pipeline_v2.sh` (seeds: 99, 133, 200, 300, 400, 500)

## Baseline Details
- Model: YOLO26x backbone, 960px input, 356 classes
- Training: 6-stage curriculum pipeline (sweep_precision → hardopt → rebalanceft → finalfull → confcurr_s1 → confcurr_s2)
- Total epochs: 175 across all stages
- Data: 199 train / 49 val images, ~22K annotations
- Eval: conf=0.0003, iou=0.55, no NMS class-awareness
- GPU: Single A100-SXM4-40GB (device 3)

## Analysis
- Detection is very strong (0.931) — hard to improve significantly
- Classification is the bottleneck (0.624 across all 356 classes)
- 78 classes have zero GT in val but exist in the class list → 0 AP for those = drags down average
- Many visually similar products (knekkebrød variants, egg brands) get confused
- Product reference images available for ~327 products (clean background shots)

## Strategy

### Phase 1: External Classifier (highest expected ROI)
1. Extract GT bounding box crops from training images
2. Process product reference images → map to class IDs
3. Train lightweight classifier (MobileNetV3 or EfficientNet-B0, timm 0.9.12 compatible)
4. At inference: YOLO detects → classifier re-classifies crops
5. Fusion: use classifier on low-confidence YOLO predictions

### Phase 2: Advanced Improvements
- Embedding-based retrieval for rare classes
- Test-time augmentation
- Context-aware reranking with co-occurrence priors
- Better threshold optimization

## Submission Constraints
- Max 3 weight files, max 420 MB total uncompressed
- ONNX recommended (opset ≤ 20)
- Sandbox: Python 3.11, torch 2.6.0+cu124, timm 0.9.12, onnxruntime-gpu 1.20.0
- No `import os`, `import subprocess`
- 300s timeout on L4 GPU (24GB VRAM)
- YOLO inference alone: ~20s

## Experiment Log

### EXP-001: 960 Pipeline Baseline (2026-03-22)
- Trained 6-stage 960 pipeline on GPU 3
- **Hybrid: 0.8389** (det=0.9310, cls_all=0.6242)
- This is the baseline to beat

### EXP-002: Classifier Fusion Experiments (2026-03-22)
- MobileNetV3 classifier: 87% val crop accuracy → fusion barely helps (+0.0011)
- EfficientNet-B2 classifier: 90.3% val crop accuracy → still no improvement
- Tested: hard switch, threshold-based, logit blending, distribution blending
- Finding: YOLO's own classification > external classifier on detector crops
- YOLO uses full image context; classifier only sees the crop

### EXP-003: Threshold & NMS Sweep (2026-03-22)
- conf thresholds 0.0001 - 0.1: baseline (0.0003) already optimal
- NMS IoU 0.45/0.55/0.65: no difference (limited by max_det=300)
- Class-aware vs agnostic NMS: identical results

### EXP-004: 1280px Fine-tune (2026-03-22)
- 15 epochs from 960 best.pt, imgsz=1280, batch=2
- **Hybrid: 0.8186** — worse, resolution change hurts more than helps

### EXP-005: High Classification Loss (2026-03-22)
- cls_loss=1.5 (3x default), 25 epochs from 960 best.pt
- **Hybrid: 0.8361** — worse, disrupted the carefully tuned pipeline weights

### EXP-006: Extended Fine-tune (2026-03-22)
- Very low LR (3e-5), 30 more epochs, minimal augmentation
- **Hybrid: 0.8363** — worse, overfitting to training distribution

### EXP-007: YOLO11x Comparison (2026-03-22)
- 40 epochs from yolo11x.pt (single stage only)
- **Hybrid: 0.7956** — much lower, needs full pipeline to be fair
- YOLO26x converges faster than YOLO11x for this dataset

### EXP-008: last.pt vs best.pt (2026-03-22)
- last.pt: det=0.9317 cls=0.6189 → **Hybrid: 0.8379**
- best.pt still wins

### EXP-009: ONNX Export (2026-03-22)
- Exported best model to ONNX (opset 17, 214MB)
- Ready for submission packaging

### EXP-010: Long Single Run (2026-03-22) — IN PROGRESS
- 120 epochs, different seed (137), moderate augmentation
- Testing if single long run can match the 6-stage pipeline

### EXP-010: Long Single Run (2026-03-22)
- 120 epochs, different seed, moderate augmentation
- **Hybrid: 0.8007** — far worse than 6-stage pipeline, confirms curriculum learning superiority

### EXP-011: Pipeline v2 — Different Seeds + More Epochs (2026-03-22)
- Same 6-stage architecture but new seeds (99,133,200,300,400,500) and slightly more epochs
- Stage epochs: 35/80/30/25/15/20 (vs 30/70/25/20/12/18 in v1)
- **Hybrid: 0.8499** — NEW BEST! +0.011 over v1
- Detection improved: 0.943 vs 0.931
- Classification improved: 0.633 vs 0.624
- Random seed variance matters significantly on this small dataset

### EXP-012: Pipeline v3 — More Seeds (2026-03-22)
- Seeds: 7/23/47/71/97/113 (primes)
- **Hybrid: 0.8436** — better than v1 but worse than v2
- Confirms seed variance: v2 seeds 99/133/200/300/400/500 are the best so far

## All Pipeline Comparisons

| Pipeline | Seeds | Det AP | Cls mAP (all) | Hybrid |
|----------|-------|--------|--------------|--------|
| v1 | 62/77/91/123/123/123 | 0.931 | 0.624 | 0.839 |
| **v2** | **99/133/200/300/400/500** | **0.943** | **0.633** | **0.850** |
| v3 | 7/23/47/71/97/113 | 0.939 | 0.622 | 0.844 |

## Key Findings
1. The 6-stage curriculum pipeline is the best training strategy
2. Random seeds significantly impact results (0.849 vs 0.839)
3. External classifiers cannot beat YOLO's own classification
4. Single long runs cannot match curriculum learning
5. The classification bottleneck is structural: 78 absent classes guarantee zero AP
