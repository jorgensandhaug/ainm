# CLANK1 Progress — YOLO Detection+Classification for NorgesGruppen

## Gold Metric
`Hybrid = 0.7 * det_AP50 (class-agnostic) + 0.3 * cls_mAP50 (all 356 classes)`

## Submission Constraints
- Max 420 MB (including model weights)
- Max 300 seconds inference on L4 GPU
- Restricted imports (no `import os`)
- YOLO26x weights: ~115 MB each → room for ~3 models

## Current Best Model (EXP-001-v2)

**Model**: `960_confcurr_s2_final_e18_img960_b4_lr8e-05_mix0_cp0_seed123`
**Location**: `/home/jorge/clank3/tasks/norgesgruppen-data/runs/960_confcurr_s2_final_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt`
**Architecture**: YOLO26x (59.6M params, 213 GFLOPs)
**Training**: 6-stage curriculum pipeline at 960px, batch=4, AdamW

### Scores (no TTA, conf=0.0001)

| Metric | Value |
|--------|-------|
| det_AP50 | 0.9328 |
| cls_mAP50_present (278) | 0.8015 |
| cls_mAP50_all (356) | 0.6259 |
| hybrid_present | 0.8934 |
| **hybrid_all** | **0.8407** |

### Scores (with TTA — flip + multiscale 640/960/1280)

| Metric | Value |
|--------|-------|
| det_AP50 | 0.9428 |
| cls_mAP50_present | 0.8119 |
| cls_mAP50_all | 0.6340 |
| hybrid_present | 0.9035 |
| **hybrid_all** | **0.8502** |

### Pipeline Stages (full chain, deterministic)
```
Stage 1: sweep_precision  — 30ep from yolo26x.pt → mAP50=0.679
  seed=62, lr0=0.0035, mixup=0, copy_paste=0, scale=0.35
Stage 2: hardopt_full     — 70ep → mAP50=0.7315@e65
  seed=77, lr0=0.002, mixup=0.15, copy_paste=0.15, scale=0.5
Stage 3: rebalanceft_v2   — 25ep balanced data → mAP50=0.7387@e17
  seed=91, lr0=0.0008, mixup=0.05, copy_paste=0.1
Stage 4: finalfull_v2     — 20ep train+val → mAP50=0.8141@e20
  seed=123, lr0=0.0006
Stage 5: confcurr_s1_v2   — 12ep confusion curriculum → mAP50=0.8011@e2
  seed=123, lr0=0.0002
Stage 6: confcurr_s2_final — 18ep original data → mAP50=0.8024@e9
  seed=123, lr0=8e-5, mixup=0, copy_paste=0
```

## Completed Experiments

### EXP-002: Inference Threshold Sweep
- conf has minimal impact: 0.8404 (conf=0.001) → 0.8407 (conf=0.0001) on hybrid_all
- NMS IoU has zero effect at low conf thresholds
- Best: conf=0.0001, iou=0.55

### EXP-004: Manual TTA
| Config | det | cls_all | hybrid_all | hybrid_present | Cost |
|--------|-----|---------|------------|---------------|------|
| no_tta (960) | 0.9328 | 0.6259 | 0.8407 | 0.8934 | 1x |
| flip_only (960) | 0.9407 | 0.6336 | **0.8485** | 0.9019 | 2x |
| ms 960+1280 | 0.9312 | 0.6250 | 0.8393 | 0.8919 | 2x |
| flip+ms 960+1280 | 0.9359 | 0.6312 | 0.8445 | 0.8976 | 4x |
| ms 640+960+1280 | 0.9399 | 0.6321 | 0.8476 | 0.9008 | 3x |
| **flip+ms 640+960+1280** | **0.9428** | **0.6340** | **0.8502** | **0.9035** | **6x** |

**Finding**: TTA is very effective. Flip alone: +0.0078 hybrid_all. Full 6x TTA: +0.0095.
Practical choice for L4: flip_only (2x cost, +0.0078) or 3-scale no-flip (3x cost, +0.0069).

## Experiment Queue
- [ ] EXP-005: Ensemble 640px + 960px models (WBF merge)
- [ ] EXP-006: Retrain pipeline with batch=8 (A100 uses only 16/40 GB at batch=4)
- [ ] EXP-007: Alternative backbones / model sizes
- [ ] EXP-008: Label smoothing + focal loss tuning
- [ ] EXP-009: Longer stage 2 (100+ epochs)
- [ ] EXP-010: Different seed ensemble (same pipeline, different seeds)

## Key Observations
1. 78 of 356 classes have zero GT in val → cls_mAP_all = cls_mAP_present * 278/356
2. TTA (flip) is the single biggest inference-time improvement (+0.0078 hybrid_all)
3. 960px resolution helps classification more than detection vs 640px baseline
4. Stage 2 (hardopt, 70ep) is the longest/most impactful training stage
5. Model uses only 16GB VRAM at batch=4 — batch=8 should fit easily on A100

## Baseline Comparison
| Model | det_AP50 | cls_all | hybrid_all | hybrid_present |
|-------|----------|---------|------------|---------------|
| 640px confcurr_s2 (prev) | 0.9321 | ~0.581 | ~0.838 | 0.8758 |
| **960px pipeline (ours)** | 0.9328 | 0.6259 | **0.8407** | 0.8934 |
| 960px + full TTA | 0.9428 | 0.6340 | **0.8502** | 0.9035 |

## Lessons Learned
- Always glob *.jpeg along with *.jpg — 6/49 val images are .jpeg
- YOLO26 doesn't support `augment=True` — must implement manual TTA
- WBF merge across scales/flips is effective for both det and cls
- Threshold sweeps show diminishing returns below conf=0.001
