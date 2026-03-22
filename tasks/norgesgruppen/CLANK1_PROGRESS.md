# CLANK1 Progress — YOLO Detection+Classification for NorgesGruppen

## Gold Metric
`Hybrid = 0.7 * det_AP50 (class-agnostic) + 0.3 * cls_mAP50 (all 356 classes)`

## Submission Constraints
- Max 420 MB uncompressed, max 3 weight files, max 10 .py files
- Max 300 seconds inference on L4 GPU, max 50000 predictions
- Restricted imports (no os, sys, pickle, etc.)

## Current Best: haug + l + 1280v2 (hybrid_all=0.8674)

**Submission**: `/home/jorge/clank1/tasks/norgesgruppen/submission.zip` (243 MB)

**Models** (263 MB total, 3 FP16 ONNX files):
1. `model_haug.onnx` — yolo26x, heavy augmentation (mixup=0.3, copy_paste=0.2, seed=500), 108 MB
2. `model_l.onnx` — yolo26l (smaller arch, 26M params, cosine LR), 49 MB
3. `model_1280v2.onnx` — yolo26x trained+inferred at 1280px (cosine LR), 108 MB

| Metric | Value |
|--------|-------|
| det_AP50 | 0.9599 |
| cls_mAP50_present (278) | 0.8275 |
| cls_mAP50_all (356) | 0.6457 |
| hybrid_present | **0.9222** |
| **hybrid_all** | **0.8674** |
| Predictions | 47001 (limit 50000) |
| Weight size | 263 MB (limit 420 MB) |

### Diversity Axes in Ensemble
- **Architecture**: yolo26x (60M) + yolo26l (26M)
- **Resolution**: 960px + 1280px native
- **Augmentation**: standard + heavy (mixup=0.3, copy_paste=0.2)
- **LR schedule**: linear + cosine
- **TTA**: horizontal flip on all models

## All Ensemble Results (sorted by hybrid_all)

| Config | H_all | H_present | Size |
|--------|-------|-----------|------|
| **haug+l+1280v2** | **0.8674** | **0.9222** | 263MB |
| 4m: b8+1280n+haug+l | 0.8662 | 0.9208 | 388MB |
| b8+haug+l | 0.8658 | 0.9204 | 275MB |
| b8+haug+1280v2 | 0.8649 | 0.9194 | 338MB |
| b8+1280@native+l | 0.8639 | 0.9180 | 275MB |
| b8+1280@native+long | 0.8617 | 0.9159 | 337MB |
| b8+1280+long (ultralytics) | 0.8584 | 0.9129 | 345MB |
| b4 single (baseline) | 0.8407 | 0.8934 | 115MB |

## Model Locations (training weights)
- haug: `clank3/.../runs/gpu2_haug_cc2_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt`
- l: `clank3/.../runs/gpu1_l_cc2_e18_img960_b8_lr8e-05_mix0_cp0_seed123/weights/best.pt`
- 1280v2: `clank3/.../runs/gpu3_1280_cc2_e18_img1280_b2_lr8e-05_mix0_cp0_seed123/weights/best.pt`
- b8: `clank3/.../runs/960b8_confcurr_s2_e18_img960_b8_lr8e-05_mix0_cp0_seed123/weights/best.pt`
- b4: `clank3/.../runs/960_confcurr_s2_final_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt`

## Training Pipelines

### Heavy-Aug Pipeline (GPU2, seed=500)
```
Stage 1: gpu2_haug_s1 — 30ep yolo26x.pt → mAP50=0.6726
Stage 2: gpu2_haug_s2 — 100ep, mixup=0.3, cp=0.2, cosine → mAP50=0.7329@e85
Stage 3: gpu2_haug_full — 20ep fulltrain → mAP50=0.8211@e20
Stage 4: gpu2_haug_cc2 — 18ep → mAP50=0.8179@e13 ← strongest individual!
```

### yolo26l Pipeline (GPU1, cosine LR)
```
Stage 1: gpu1_l_s1 — 30ep yolo26l.pt, batch=8 → mAP50=0.6520
Stage 2: gpu1_l_s2 — 100ep cosine → mAP50=0.7198@e68
Stage 3: gpu1_l_full — 20ep fulltrain → mAP50=0.8028@e17
Stage 4: gpu1_l_cc2 — 18ep → mAP50=0.7946@e16
```

### 1280v2 Pipeline (GPU3, cosine LR)
```
Stage 1: gpu3_1280_s1 — 30ep 1280px, cosine → mAP50=0.6802
Stage 2: gpu3_1280_s2 — 100ep 1280px, cosine → mAP50=0.7399@e73
Stage 3: gpu3_1280_full — 20ep fulltrain → mAP50=0.8035@e20
Stage 4: gpu3_1280_cc2 — 18ep → mAP50=0.7996@e2
```

## Key Findings
- Heavy augmentation (mixup=0.3, cp=0.2) produces the strongest individual model (0.8179)
- yolo26l (26M params, 49MB FP16) adds diversity at low size cost
- 1280px native resolution captures finer details than 960px
- Ensemble diversity axes: architecture > resolution > augmentation > seed
- WBF IoU=0.60 optimal, conf=0.001 with 50k global cap
- ONNX pipeline with letterbox+per-class NMS outperforms ultralytics native
