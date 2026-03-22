# CLANK2 Progress — Norgesgruppen Grocery Shelf Detection

## Task
Maximize hybrid score: `0.7 * detection_mAP@50 + 0.3 * classification_mAP@50`
- Constraints: < 420 MB total, < 300s on L4 GPU, offline
- Team best: ~0.89, top performers: ~0.93

## Current Best: 3-Model Ensemble + TTA

**Models (3x YOLO26x, 120MB each = 360MB total, fits 420MB limit):**
1. `runs/960_confcurr_s2_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt` (our 960px)
2. `runs/1280_confcurr_s2_e18_img1280_b2_lr8e-05_mix0_cp0_seed123/weights/best.pt` (our 1280px)
3. `/home/jorge/clank3/.../960_confcurr_s2_final_.../weights/best.pt` (clank3's 960px variant)

**Eval config:** scales=[640,960,1280], flip=True, WBF IoU=0.6, conf=0.0001

| Metric | Score |
|--------|-------|
| Detection AP@0.5 (class-agnostic) | 0.9418 |
| Classification mAP@0.5 (present 278 classes) | 0.8205 |
| Classification mAP@0.5 (all 356 classes) | 0.6407 |
| **Hybrid (present classes)** | **0.9054** |
| Hybrid (all 356 classes) | 0.8515 |

### Score progression
| Config | Hybrid(present) |
|--------|----------------|
| 960px single model | 0.8872 |
| 960px + TTA (3 scales, flip) | 0.8948 |
| 1280px single model | 0.8876 |
| 1280px + TTA | 0.9013 |
| 2-model ensemble + TTA | 0.9037 |
| **3-model ensemble + TTA** | **0.9054** |

## Single Model Baselines

**960px model:** `runs/960_confcurr_s2_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt` (120 MB)

| Metric | Score |
|--------|-------|
| Detection AP@0.5 (class-agnostic) | 0.9295 |
| Classification mAP@0.5 (present 278 classes) | 0.7885 |
| **Hybrid (present classes)** | **0.8872** |

**1280px model:** `runs/1280_confcurr_s2_e18_img1280_b2_lr8e-05_mix0_cp0_seed123/weights/best.pt` (120 MB)

| Metric | Score |
|--------|-------|
| Detection AP@0.5 (class-agnostic) | 0.9266 |
| Classification mAP@0.5 (present 278 classes) | 0.7966 |
| **Hybrid (present classes)** | **0.8876** |

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
- Status: DONE — improvement found
- Best config: scales=[640,960,1280], flip=True, WBF IoU=0.65
- Result: **Hybrid(present)=0.8948** (+0.0076), Det=0.9353, Cls(present)=0.8002
- TTA sweep results:
  - [640,960,1280] wbf=0.55 → 0.8940
  - [640,960,1280] wbf=0.60 → 0.8945
  - [640,960,1280] wbf=0.65 → **0.8948** (best)
  - [800,960,1120,1280] wbf=0.55 → 0.8900 (more scales worse)
  - [960,1280] wbf=0.55 → 0.8869 (fewer scales worse)
- Conclusion: TTA helps both det (+0.006) and cls (+0.012). Best with 3 diverse scales.

### EXP-004: Train 1280px model (higher resolution for classification)
- Date: 2026-03-22
- Status: TRAINING (Stage 2 epoch ~30/70)
- Config: Same 6-stage pipeline as 960px but at 1280px, batch=2

### EXP-005: MobileNetV3 crop classifier + fusion
- Date: 2026-03-22
- Status: DONE — no improvement
- Classifier: MobileNetV3-Large, 224px crops, 87.15% val acc (18MB)
- Fusion result: WORSE than YOLO alone at all blend values
  - blend=0.0 (always reclassify): cls_mAP drops 0.79→0.73
  - blend=0.5: cls_mAP = 0.7846 (still below YOLO's 0.7885)
  - blend≥0.7: essentially keeps YOLO classes = no change
- Conclusion: MobileNetV3 at 224px is weaker than YOLO26x at 960px for classification.
  YOLO uses contextual shelf information that the crop classifier misses.
  Need a much stronger classifier (>93% on GT crops) OR different fusion strategy.

### Class analysis (from baseline)
- 27 classes have 0.0 AP50 (complete failure, mostly 1-3 GT instances)
- 35 classes < 0.5 AP, 54 < 0.7, 149 ≥ 0.9
- Mean class AP: 0.788, median: 0.917 — long tail of bad classes
- Worst failures: rare classes, knekkebrød confusion, egg variants

## IMPORTANT
- Git remote branch: **clank2** (not clank4!)
- GPU assignment: device 1

## Ideas Queue (revised priority)
1. ~~Threshold sweep~~ — no gain
2. ~~MobileNetV3 classifier fusion~~ — no gain (YOLO context > crop classifier)
3. **1280px model** (training now) — pending
4. **Ensemble 960+1280 via WBF** — next after 1280 finishes
5. **TTA on ensemble** — combine TTA with model ensemble
6. Stronger classifier (EfficientNet-B4, ConvNeXt, or ViT) at 384px crops
7. Score-fusion: multiply YOLO cls conf by classifier agreement
8. Train YOLO with focal loss / class-balanced loss
9. Use product reference images for few-shot class recovery
