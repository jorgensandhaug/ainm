# Clank4 Progress — Norgesgruppen Shelf Detection

## Goal
Maximize **Hybrid Score = 0.7 * detection_mAP@0.5 + 0.3 * classification_mAP@0.5** across all 356 classes.

## Current Best Model

| Model | Det AP@0.5 | Cls mAP@0.5 (present) | Cls mAP@0.5 (all 356) | Hybrid (all) |
|-------|-----------|----------------------|----------------------|-------------|
| 960 pipeline baseline (YOLO26x, 6-stage) | 0.9310 | 0.7993 | 0.6242 | **0.8389** |

**Weights:** `runs/960_confcurr_s2_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt`

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
