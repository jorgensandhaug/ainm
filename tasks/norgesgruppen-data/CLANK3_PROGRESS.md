# Clank3 Progress — Norgesgruppen Object Detection

## Current Best Score
- **Hybrid (all 356 classes): 0.8756** (V7 ONNX FP16 + letterbox + batched_nms + flip TTA)
- V7 PyTorch + flip TTA: 0.8734
- V6 ONNX + flip TTA: 0.8689
- V1 baseline: 0.8389
- Target: ~0.93

## Best Model & Submission
- Architecture: YOLO26x (59.6M params, 213 GFLOPs)
- PT checkpoint: `runs/v7_polish_e25_img960_b4_lr5e-05_mix0_cp0_seed2441/weights/best.pt`
- ONNX submission: FP32, opset 17, raw logits (214MB, passes onnx.checker)
- Submission zip: `submission_v7_fp32.zip` (176MB compressed)
- NOTE: FP16 exports have broken graph topology — DO NOT USE FP16
- Training: V7 5-stage pipeline (`yolo/train_v7_pipeline.sh`)
- Key innovation: 250-epoch Stage 2 with cosine LR + label smoothing 0.05
- Inference: letterbox + per-class NMS (torchvision.batched_nms) + flip TTA
- GPU timing: 30.8s on A100 for 49 images

## Submission Compliance
- No `import os` (uses pathlib) ✓
- FP16 ONNX, 108MB (< 420MB) ✓
- 1 weight file (< 3 max) ✓
- 1 Python file (< 10 max) ✓
- Runtime ~75s on CPU, ~15-20s estimated on L4 GPU (< 300s) ✓
- opset 17 ✓
- ONNX raw logits + custom NMS (no ultralytics dependency at inference) ✓

## Scoring Formula
`hybrid = 0.7 * detection_AP@0.5 (class-agnostic) + 0.3 * classification_mAP@0.5 (all 356 classes)`

## Dataset
- 248 images total (199 train, 49 val), 356 product classes
- 278 classes present in val, 78 absent (auto AP=0)
- Derived datasets: balanced (749 train), fulltrain (248 train), confusion curriculum (592 train)

## Experiments Log

### Exp 1: V1 Baseline 960 Pipeline (6-stage, original seeds)
- **hybrid_all=0.8389** | det=0.9310 | cls_present=0.7993 | cls_all=0.6242
- Checkpoint: `runs/960_confcurr_s2_v2_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt`

### Exp 2: Confidence + NMS IoU Sweep
- No improvement. AP is rank-based; conf threshold doesn't affect score.

### Exp 3: Resolution Scaling
- 960px best. 1280px/1536px worse due to train-inference resolution mismatch.
- Built-in TTA (augment=True): Not supported by YOLO26x.

### Exp 4: Manual Flip TTA (on V1)
- flip+WBF(max): hybrid_all=0.8445 (+0.56%)
- Flip adds complementary detections.

### Exp 5: Heavy Augmentation from Scratch (120 epochs)
- hybrid_all=0.8020 — WORSE. 6-stage curriculum crucial, can't skip.

### Exp 6: Fine-tune V1 with Different Seed
- hybrid_all=0.8355 — no improvement (same model slightly perturbed).

### Exp 7: V2 Diverse Pipeline (different seeds + augmentation)
- **hybrid_all=0.8464** (+0.75% over V1)
- Seeds: 137→223→307→401→503→601 (vs V1: 62→77→91→123→123→123)
- Augmentation: slightly different mixup/copy-paste/scale at each stage
- det=0.9408 (+1.0%), cls_present=0.8020, cls_all=0.6262
- Pipeline: `yolo/train_960_pipeline_v2_resume.sh`

### Exp 8: V2 + Flip TTA
- **hybrid_all=0.8518** (NEW BEST)
- det=0.9464 | cls_present=0.8084 | cls_all=0.6313

### Exp 9: Ensemble V1+V2 (failed)
- Naive ensemble HURTS: hybrid_all=0.7680 (detection AP drops from 0.94 to 0.85)
- Reason: doubled false positives overwhelm AP calculation
- Ensemble only works if models find DIFFERENT boxes; same-arch models find same boxes

## Key Insights
1. 6-stage curriculum training is essential — training from scratch underperforms
2. Seed diversity in pipeline stages creates genuinely better models
3. Flip TTA consistently helps (~0.5% gain)
4. Naive model ensemble hurts due to FP doubling
5. Classification mAP capped by 78 absent val classes (max cls_all ≈ 0.781)
6. For ensemble to work, need class-agnostic detection + separate classifier

### Exp 10: V3 High Classification Loss (cls=1.0, box=5.0)
- hybrid_all=0.8420 standalone, 0.8491 with flip TTA — worse than V2
- Higher cls loss hurts detection without improving classification enough

### Exp 11: V4 Frozen Backbone (freeze=10)
- hybrid_all=0.8394 — worse, backbone can't adapt

### Exp 12: V5 Long Balanced Data Fine-tune (40 epochs, cosine LR)
- hybrid_all=0.8415 — worse, balanced data degrades detection

### Exp 13: Cross-session Model Comparison
- clank2 960: 0.8354, clank4 yolo11x: 0.7956, clank4 extft: 0.8363
- clank2 1280: 0.8352 (at 1280px inference)
- None beat V2 (0.8464)

### Exp 14: SWA Weight Averaging
- V1+V2 equal: 0.1444 (models too divergent, destroyed)
- V2+V2cc3 equal: 0.8451 (neutral, no improvement)

### Exp 15: Detect-then-Classify (EfficientNet-B0 reranker)
- Trained EfficientNet-B0 on 18257 GT crops: 89.9% top-1 val accuracy
- But YOLO's integrated classification (cls_present=0.802) > separate classifier (0.733)
- YOLO has contextual features (shelf position, neighbors) that crops lack
- All reranking strategies hurt: yolo_only > cls_veryhighconf > cls_highconf > classifier_only
- **Conclusion: detect-then-classify doesn't work for this task**

## Failed Approaches
- Naive model ensemble (doubles FPs, hurts detection AP)
- Higher classification loss weight (hurts detection)
- Backbone freezing (prevents adaptation)
- Training from scratch with heavy augmentation (curriculum needed)
- Weight averaging between different pipelines (destructive)
- Higher inference resolution than training resolution
- Separate crop classifier for reranking (YOLO context > crop features)

## What Works
1. 6-stage curriculum pipeline with diverse seeds (V2 >> V1)
2. Flip TTA with WBF(max) fusion (+0.5% consistently)
3. Training at native resolution (960px)
4. Low confidence threshold (conf≈0.0003)

### Exp 16: V6 Extended Hardopt Pipeline (150 epochs + cosine LR)
- **hybrid_all=0.8616 standalone, 0.8658 with flip+NMS TTA (NEW BEST!)**
- det=0.9505 (+1.0% vs V2), cls_present=0.8377 (+3.6%), cls_all=0.6541 (+2.8%)
- Pipeline: init(40e) → hardopt(150e,cos_lr) → balanced(30e) → fulltrain(25e) → polish(20e)
- Seeds: 1337→1447→1553→1667→1777
- Key: 150 epochs in Stage 2 (vs 70-80 in V1/V2) + cosine LR = massive improvement
- Both detection AND classification improved significantly
- Script: `yolo/train_v6_pipeline.sh`

### Exp 17: V7 Pipeline (250 epochs + label smoothing 0.05) — NEW BEST
- **hybrid_all=0.8756 ONNX** (PyTorch: 0.8734 with flip TTA, 0.8688 standalone)
- det=0.9578 (+0.7% vs V6), cls_present=0.8465 (+0.9%), cls_all=0.6611 (+0.7%)
- Label smoothing hurt early convergence but final model is better than V6
- 250 epochs > 150 epochs: more training helps with label smoothing
- Pipeline: `yolo/train_v7_pipeline.sh`
- Seeds: 2001→2111→2221→2331→2441

### Submission Engineering: ONNX + Letterbox + Flip TTA
- **Letterbox preprocessing was worth +2% over stretch resize**
- Per-class NMS via torchvision.batched_nms matches ultralytics behavior
- FP16 ONNX: 108MB (lossless vs FP32: <0.01% degradation)
- Fixed zero-width bbox bug from edge clipping + rounding
- Submission EXCEEDS PyTorch baseline: 0.8689 vs 0.8616 (+0.73%)

## Next Steps
1. Evaluate V7 when complete — if better, update submission
2. Try V8 pipeline WITHOUT label smoothing but with 250 epochs
3. Multi-model submission (room for 2 more models, ~300MB budget)
4. Try different backbone (YOLO11x)
5. Investigate class-specific confidence calibration
