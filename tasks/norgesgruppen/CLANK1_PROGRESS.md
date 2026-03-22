# CLANK1 Progress — YOLO Detection+Classification for NorgesGruppen

## Gold Metric
`Hybrid = 0.7 * det_AP50 (class-agnostic) + 0.3 * cls_mAP50 (all 356 classes)`

## Submission Constraints
- Max 420 MB (including model weights)
- Max 300 seconds inference on L4 GPU
- Restricted imports (no `import os`)
- YOLO26x weights: ~115 MB each → room for ~3 models

## Current Best: 3-Model Ensemble (b8+1280+long) + Flip TTA

**Models** (total 345 MB, under 420 MB limit):
1. `960b8_confcurr_s2` (960px, batch=8) — 115 MB
2. `1280_confcurr_s2` (1280px, batch=2) — 115 MB
3. `960long_confcurr_s2` (960px, 120-epoch stage 2) — 115 MB

### Best Scores (ONNX submission, conf=0.001, WBF IoU=0.60, +hflip)

| Metric | Value |
|--------|-------|
| det_AP50 | 0.9550 |
| cls_mAP50_present (278) | 0.8249 |
| cls_mAP50_all (356) | 0.6441 |
| hybrid_present | 0.9159 |
| **hybrid_all** | **0.8617** |
| Predictions | 35090 (limit 50000) |
| Inference cost | 6x (3 models × 2 orientations) |
| Total weight size | 337 MB (FP16 ONNX) |

### Key Improvements in ONNX Pipeline
- Letterbox preprocessing (vs stretch) → matches training preprocessing
- Per-class NMS via torchvision.batched_nms (vs class-agnostic)
- 1280 model at native 1280px resolution (vs 960px) → +0.0026 hybrid_all
- numpy array flip for TTA (vs re-letterboxing) → faster
- WBF via ensemble_boxes library
- 50k prediction cap with global score-based selection

### All Ensemble Variants

| Config | det | cls_all | hybrid_all | hybrid_pres | Cost | Size |
|--------|-----|---------|------------|------------|------|------|
| b4 single | 0.9328 | 0.6259 | 0.8407 | 0.8934 | 1x | 115MB |
| b4+b8 (2-model) | 0.9416 | 0.6381 | 0.8506 | 0.9043 | 2x | 230MB |
| b4+b8+div (3m) | 0.9441 | 0.6375 | 0.8521 | 0.9057 | 3x | 345MB |
| b4+b8+1280 (3m) | 0.9471 | 0.6429 | 0.8558 | 0.9099 | 3x | 345MB |
| b4+b8+div+flip | 0.9477 | 0.6423 | 0.8561 | 0.9101 | 6x | 345MB |
| b4+b8+1280+flip | 0.9483 | 0.6465 | 0.8578 | 0.9122 | 6x | 345MB |
| b8+1280+long+flip (ultralytics) | 0.9489 | 0.6473 | 0.8584 | 0.9129 | 6x | 345MB |
| **ONNX b8+1280@native+long** | **0.9550** | **0.6441** | **0.8617** | **0.9159** | **6x** | **337MB** |

### Model Locations
- b8: `/home/jorge/clank3/tasks/norgesgruppen-data/runs/960b8_confcurr_s2_e18_img960_b8_lr8e-05_mix0_cp0_seed123/weights/best.pt`
- 1280: `/home/jorge/clank3/tasks/norgesgruppen-data/runs/1280_confcurr_s2_e18_img1280_b2_lr8e-05_mix0_cp0_seed123/weights/best.pt`
- long: `/home/jorge/clank3/tasks/norgesgruppen-data/runs/960long_confcurr_s2_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt`
- b4 (alt): `/home/jorge/clank3/tasks/norgesgruppen-data/runs/960_confcurr_s2_final_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt`

## Training Pipelines

### Pipeline A: batch=4 (EXP-001-v2)
```
Stage 1: sweep_precision  — 30ep from yolo26x.pt → mAP50=0.679
Stage 2: hardopt_full     — 70ep → mAP50=0.7315@e65
Stage 3: rebalanceft_v2   — 25ep balanced → mAP50=0.7387@e17
Stage 4: finalfull_v2     — 20ep train+val → mAP50=0.8141@e20
Stage 5: confcurr_s1_v2   — 12ep confusion → mAP50=0.8011@e2
Stage 6: confcurr_s2_final — 18ep original → mAP50=0.8024@e9
```

### Pipeline B: batch=8 (EXP-006)
```
Stage 1: 960b8_sweep_precision — 30ep → mAP50=0.6855
Stage 2: 960b8_hardopt        — 70ep → mAP50=0.7412@e68
Stage 3: 960b8_rebalanceft    — 25ep → mAP50=0.7292@e14
Stage 4: 960b8_finalfull      — 20ep → mAP50=0.8129@e17
Stage 5: 960b8_confcurr_s1    — 12ep → mAP50=0.7958@e12
Stage 6: 960b8_confcurr_s2    — 18ep → mAP50=0.8047@e17
```

### Pipeline C: 1280px (EXP-014)
```
Stage 1: 1280_sweep         — 30ep → mAP50=0.6921@e30
Stage 2: 1280_hardopt       — 70ep → mAP50=0.7324@e67
Stage 3: 1280_rebalance     — 25ep → mAP50=0.7364@e21
Stage 4: 1280_finalfull     — 20ep → mAP50=0.8213@e20  ← highest of any single stage!
Stage 5: 1280_confcurr_s1   — 12ep → mAP50=0.8020@e1
Stage 6: 1280_confcurr_s2   — 18ep → mAP50=0.8079@e16
```

## Completed Experiments

### EXP-002: Inference Threshold Sweep
- conf has minimal impact: 0.8404→0.8407 across conf=0.001..0.0001
- NMS IoU has zero effect at low conf
- Best: conf=0.0001, iou=0.55

### EXP-004: Manual TTA (single model)
| Config | det | cls_all | hybrid_all | Cost |
|--------|-----|---------|------------|------|
| no_tta (960) | 0.9328 | 0.6259 | 0.8407 | 1x |
| flip_only (960) | 0.9407 | 0.6336 | 0.8485 | 2x |
| ms 640+960+1280 | 0.9399 | 0.6321 | 0.8476 | 3x |
| flip+ms 640+960+1280 | 0.9428 | 0.6340 | 0.8502 | 6x |

### EXP-005: Ensemble (b4+b8 models)
| Config | det | cls_all | hybrid_all | Cost |
|--------|-----|---------|------------|------|
| b4+b8 ensemble | 0.9416 | 0.6381 | **0.8506** | 2x |
| b4+b8+flip | 0.9347 | 0.6361 | 0.8451 | 4x |
| b4+b8+ms | 0.9349 | 0.6321 | 0.8441 | 3x |

**Key finding**: 2-model ensemble (0.8506) > single-model 6x TTA (0.8502). Ensemble is more compute-efficient.

### EXP-006: Batch=8 Training
- batch=8 slightly improves stage 2 (+0.0097 mAP50) but stage 3 slightly worse
- Final model: hybrid_all=0.8416 vs 0.8407 (marginal)
- Main value: **diversity for ensemble** (+0.0099 when combined with b4)

### EXP-009: WBF IoU Threshold Sweep (3-model+flip)
| WBF IoU | det | cls_all | hybrid_all | preds |
|---------|-----|---------|------------|-------|
| 0.30 | 0.9416 | 0.6371 | 0.8503 | 49253 |
| 0.40 | 0.9436 | 0.6381 | 0.8520 | 52211 |
| 0.50 | 0.9455 | 0.6418 | 0.8544 | 56476 |
| 0.55 | 0.9465 | 0.6417 | 0.8550 | 59299 |
| **0.60** | **0.9477** | **0.6423** | **0.8561** | **62303** |
| 0.70 | 0.9477 | 0.6416 | 0.8559 | 70209 |

**Finding**: WBF IoU=0.60 is optimal for hybrid_all (+0.0011 over 0.55).

### EXP-010: Diversity Model (seed=200, batch=6)
- Different seed + slightly modified hyperparams (lr0=0.004, mixup=0.2 in stage 2)
- Individual: mAP50=0.779 (weaker), but adds diversity
- 3-model ensemble: +0.0015 over 2-model (0.8521 vs 0.8506)
- 3-model + flip: **0.8550** — best result overall

### EXP-013: cls=1.5 loss weight
- Fine-tuned from best model with cls=1.5 (3x default)
- WORSE: hybrid_all=0.8340 (vs 0.8407) — hurts detection AP
- Conclusion: default cls=0.5 is fine

### EXP-015: Extended stage 2 (120 epochs)
- Stage 2 best: mAP50=0.7474@e79 (vs 0.7315@e65 in 70-epoch run, +0.016)
- But full pipeline ends lower individually: hybrid_all=0.8374 (vs 0.8407)
- **Critical insight**: better stage 2 → worse later stages unless LRs adjusted
- **However**: adds unique ensemble diversity → b8+1280+long = 0.8584 (new best)

## Experiment Queue
- [ ] EXP-016: SWA/EMA weight averaging across checkpoints
- [ ] EXP-017: Soft-NMS or weighted NMS post-processing
- [ ] EXP-018: Knowledge distillation from ensemble → single model
- [ ] EXP-019: Train with end2end=True (newer YOLO feature)
- [ ] EXP-020: Weighted ensemble (give different weights to models in WBF)

## Baseline Comparison
| Model | det_AP50 | cls_all | hybrid_all | hybrid_present |
|-------|----------|---------|------------|---------------|
| 640px baseline (prev) | 0.9321 | ~0.581 | ~0.838 | 0.8758 |
| 960px b4 single | 0.9328 | 0.6259 | 0.8407 | 0.8934 |
| 960px b4+b8 ensemble | 0.9416 | 0.6381 | 0.8506 | 0.9043 |
| 960px 3-model+flip+WBF0.6 | 0.9477 | 0.6423 | 0.8561 | 0.9101 |
| b4+b8+1280+flip | 0.9483 | 0.6465 | 0.8578 | 0.9122 |
| **b8+1280+long+flip** | **0.9489** | **0.6473** | **0.8584** | **0.9129** |

## Lessons Learned
- Always glob *.jpeg along with *.jpg — 6/49 val images are .jpeg
- YOLO26 doesn't support `augment=True` — must implement manual TTA
- WBF ensemble of diverse models > TTA on single model
- batch=8 helps stage 2 (+0.01 mAP50) but value is mainly ensemble diversity
- Threshold tuning has diminishing returns below conf=0.001
- Resolution diversity (960+1280) > seed diversity (seed 123 vs 200) for ensemble
- 1280px model has highest single-stage mAP50 (0.8213 at finalfull)
- 4-model ensemble exceeds 420MB limit — must pick best 3
