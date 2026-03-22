# CLANK1 Progress — YOLO Detection+Classification for NorgesGruppen

## Gold Metric
`Hybrid = 0.7 * det_AP50 (class-agnostic) + 0.3 * cls_mAP50 (all 356 classes)`

## Submission Constraints
- Max 420 MB (including model weights)
- Max 300 seconds inference on L4 GPU
- Restricted imports (no `import os`)
- YOLO26x weights: ~115 MB each → room for ~3 models

## Current Best: 2-Model Ensemble (b4+b8)

**Models**:
1. `960_confcurr_s2_final` (batch=4 pipeline) — 115 MB
2. `960b8_confcurr_s2` (batch=8 pipeline) — 115 MB
**Total weight size**: 230 MB (under 420 MB limit)

### Best Ensemble Scores (no TTA, conf=0.0001)

| Metric | Value |
|--------|-------|
| det_AP50 | 0.9416 |
| cls_mAP50_present (278) | 0.8172 |
| cls_mAP50_all (356) | 0.6381 |
| hybrid_present | 0.9043 |
| **hybrid_all** | **0.8506** |

### Individual Model Scores

| Model | det_AP50 | cls_all | hybrid_all | hybrid_present |
|-------|----------|---------|------------|---------------|
| b4 alone | 0.9328 | 0.6259 | 0.8407 | 0.8934 |
| b8 alone | 0.9340 | 0.6259 | 0.8416 | 0.8943 |
| **b4+b8 ensemble** | **0.9416** | **0.6381** | **0.8506** | **0.9043** |

### Model Locations
- b4: `/home/jorge/clank3/tasks/norgesgruppen-data/runs/960_confcurr_s2_final_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt`
- b8: `/home/jorge/clank3/tasks/norgesgruppen-data/runs/960b8_confcurr_s2_e18_img960_b8_lr8e-05_mix0_cp0_seed123/weights/best.pt`

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
- Main value: **diversity for ensemble**

## Experiment Queue
- [ ] EXP-010: Train 3rd model (different seed) for 3-model ensemble
- [ ] EXP-011: Fix WBF + ensemble + TTA combination
- [ ] EXP-012: yolo26l backbone (lighter, might offer diversity)
- [ ] EXP-013: Label smoothing (cls=0.01 or higher)
- [ ] EXP-014: Higher resolution training (1280px)
- [ ] EXP-015: Longer training (200+ total epochs)
- [ ] EXP-016: SWA/EMA weight averaging across checkpoints

## Baseline Comparison
| Model | det_AP50 | cls_all | hybrid_all | hybrid_present |
|-------|----------|---------|------------|---------------|
| 640px baseline (prev) | 0.9321 | ~0.581 | ~0.838 | 0.8758 |
| 960px b4 model | 0.9328 | 0.6259 | 0.8407 | 0.8934 |
| 960px b4 + full TTA | 0.9428 | 0.6340 | 0.8502 | 0.9035 |
| **960px b4+b8 ensemble** | **0.9416** | **0.6381** | **0.8506** | **0.9043** |

## Lessons Learned
- Always glob *.jpeg along with *.jpg — 6/49 val images are .jpeg
- YOLO26 doesn't support `augment=True` — must implement manual TTA
- WBF ensemble of diverse models > TTA on single model
- batch=8 helps stage 2 (+0.01 mAP50) but value is mainly ensemble diversity
- Threshold tuning has diminishing returns below conf=0.001
- WBF with flip degrades ensemble — score normalization needs care
