# Clank3 Progress — Norgesgruppen Object Detection

## Current Best Score
- **Hybrid (all 356 classes): 0.8445** (with flip TTA + WBF max fusion)
- Without TTA: 0.8389
- Target: ~0.93

## Model Details
- Architecture: YOLO26x (59.6M params, 213 GFLOPs)
- Training: 6-stage 960px pipeline (sweep_precision → hardopt → rebalanceft → finalfull → confcurr_s1 → confcurr_s2)
- Checkpoint: `runs/960_confcurr_s2_v2_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt` (115MB)
- Dataset: 248 images (199 train, 49 val), 356 product classes

## Scoring Formula
`hybrid = 0.7 * detection_AP@0.5 (class-agnostic) + 0.3 * classification_mAP@0.5 (all 356 classes)`

## Experiments Log

### Experiment 1: Baseline 960 Pipeline (6-stage)
- **Score**: hybrid_all=0.8389
- Detection AP@0.5: 0.9310
- Classification mAP@0.5 (present 278 classes): 0.7993
- Classification mAP@0.5 (all 356 classes): 0.6242
- Note: 78/356 classes absent from val → AP=0, caps cls_all at 278/356 * present_AP

### Experiment 2: Confidence Threshold Sweep
- Tested conf=[0.0001 to 0.30], NMS IoU=[0.45 to 0.65]
- Result: No improvement from threshold tuning. Best at conf=0.0001, iou=0.55
- AP is rank-based so low conf just adds weak predictions at end of ranked list

### Experiment 3: Resolution Scaling at Inference
- 960px (train size): hybrid_all=0.8389 ← best
- 1280px: hybrid_all=0.8159 (worse, +230px mismatch)
- 1536px: hybrid_all=0.7962 (worse)
- Built-in TTA (augment=True): Not supported by YOLO26x architecture

### Experiment 4: Manual Flip TTA + Box Fusion
- **Best: flip + WBF(max) → hybrid_all=0.8445 (+0.56%)**
- flip + NMS: 0.8442
- flip + WBF(avg): 0.8383
- Horizontal flip adds complementary detections, WBF(max) preserves high-confidence scores

## Key Bottlenecks
1. Classification mAP is the main limitation (0.62 all-class vs 0.80 present-class)
2. 78 absent classes in val set cap theoretical max cls_all at 0.781
3. Many classes have very few GT instances (25 classes with AP=0 among present)
4. Model sees 356 fine-grained product classes with limited training data (199 images)

## Next Experiments Planned
1. Train longer with heavier augmentation (more mosaic, erasing, copy-paste)
2. Train at higher resolution (1280) from scratch
3. Multi-model ensemble with WBF
4. Retrain with focal loss tuning for rare classes
5. Investigate class weight balancing during training
