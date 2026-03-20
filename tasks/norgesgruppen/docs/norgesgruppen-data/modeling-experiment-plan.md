# Modeling Experiment Plan

Purpose: define the exact experiment order, validation logic, and promotion rules before serious modeling starts.

This plan assumes the dataset facts already locked in the prep layer:

- blocked section-aware dev split, not random split
- dense small-object localization problem
- classification bottlenecks concentrated in `egg`, `unknown_product`, missing refs, ambiguous refs, and low-view packshots
- competition score is detection-heavy, but exact SKU identity still matters

## North Star

Optimize for the real task, not for isolated paper metrics:

- final target: best end-to-end competition score proxy
- decomposition first: localization -> crop identity -> OCR/text fusion -> end-to-end calibration
- always maintain two tracks:
  - research-ceiling track: strongest offline models regardless of deployment convenience
  - submission track: models that can actually run in the sandbox within `300s`, `420 MB`, offline

## Fixed Validation Surface

Never change these casually during model iteration.

### Primary Model-Selection Split

- use the blocked `49`-image validation split from [section-blocked-val-split.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/section-blocked-val-split.json)
- canonical summary: [training-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/training-manifest.json)

### Stress Suites

- leave-one-section-out holdouts from [split-eval-plan.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/split-eval-plan.md)
- theme buckets: `varmedrikker`, `egg`, `frokost`, `knekkebrod`, `other`
- readiness buckets from [category-strategy-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/category-strategy-manifest.json):
  - `exact_reference_high_view`
  - `exact_reference_medium_view`
  - `exact_reference_low_view`
  - `missing_reference`
  - `ambiguous_reference`
  - `sibling_variant_trap`
  - `needs_manual_review`
  - `unknown_sentinel`
- image difficulty buckets from [image-sampling-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/image-sampling-manifest.json):
  - `problem_heavy`
  - `rare_class_rich`
  - `dense_standard`
  - `standard`

### Recognition Slices

Use three slices, not one:

- strict reference-safe: `319` exact-unique categories with images
- extended reference-usable: strict + `2` `map_likely` categories
- full closed-set slice: all categories, including no-ref / ambiguous / sentinel

The strict slice answers whether the recognizer actually works. The full slice answers whether the pipeline handles reality.

## Metrics That Actually Matter

Use competition-proxy metrics as primary, broader diagnostics as secondary.

### Localization

Primary:

- category-agnostic `AP50` on full images
- miss rate
- duplicate-box rate
- count `MAE` per image

Secondary:

- COCO `mAP@[0.50:0.95]`
- `AP50`
- `AP75`
- `AP_small`
- per-theme localization metrics

### Crop Recognition

Primary:

- top-1 on GT crops
- `Recall@1/5/10`
- `mAP@20`
- macro top-1 across SKUs

Secondary:

- per-theme top-1 / `Recall@5`
- per-readiness-bucket top-1 / `Recall@5`
- sibling-family confusion matrix
- low-view vs high-view delta

### End-to-End

Primary:

- hybrid competition proxy: `0.7 * det_AP50_ignore_class + 0.3 * cls_AP50_match_class`

Also always log:

- detection-only proxy
- classification-only proxy
- per-theme hybrid / detection / classification
- performance on `unknown_product`
- performance on missing-ref / ambiguous / low-view subsets
- per-image count accuracy
- end-to-end latency and total model size

## What Must Exist Before Trusting Any Result

Every serious experiment needs:

- exact code/weights config
- split identity
- seed
- train time / inference time
- weight size
- full metric bundle
- bucketed breakdowns
- a short error review with concrete examples

Never trust a single scalar.

## Sanity Checks Before Real Experiments

These are hard gates, not optional nice-to-haves.

### Data / Harness Sanity

- scorer reproduces the blocked split exactly
- category ids remain `0..355`
- train/val leakage check stays clean
- packshot/reference slice definitions are frozen

### Learning Sanity

- detector can overfit `10` training images
- crop recognizer can overfit a tiny reference-safe subset
- shuffled-label recognizer collapses as expected
- random retrieval baseline is bad

If a method cannot pass these, do not scale it.

### Error Sanity

- nearest-neighbor retrieval examples look visually plausible
- detector failure cases are concentrated in expected regimes: tiny items, edge-touch, `egg`, missing-ref, `unknown_product`
- improvements are not coming only from head classes while the tail dies

## Experiment Order

Order matters. Do not skip ahead to full pipeline work before the isolated pieces make sense.

## Phase 0: Evaluation And Baselines Infrastructure

Goal: make every later result trustworthy.

| id | question | minimal output | success gate |
|---|---|---|---|
| `EVAL-01` | Can we score the primary blocked split correctly? | local competition-proxy evaluator + bucketed report | counts and split membership exactly match prepared manifests |
| `EVAL-02` | Can we evaluate crop recognition on GT crops cleanly? | GT-crop benchmark harness with strict / extended / full slices | metrics reproducible across reruns |
| `EVAL-03` | Can we inspect failures quickly? | fixed error-report format with top FP/FN/confusions | one report usable without manual spelunking |
| `EVAL-04` | Are control baselines sane? | random retrieval, trivial nearest-neighbor, tiny overfit tests | all behave as expected |

Do not start heavyweight model comparison until this phase is stable.

## Phase 1: GT-Crop Recognition Only

Goal: prove SKU identity is possible before detection noise enters.

Recommended order:

| id | model family | formulation | primary read | promote if |
|---|---|---|---|---|
| `CROP-00` | simple image baseline | nearest-neighbor on packshots | floor | establishes a non-trivial baseline |
| `CROP-01` | `PE-Core` | retrieval | likely strongest first bet for products | clearly beats `CROP-00` on strict slice and macro top-1 |
| `CROP-02` | `DINOv3` | retrieval | strong pure-vision complement | beats or complements `PE-Core` on strict slice |
| `CROP-03` | `PE-Core + DINOv3` | embedding fusion / rerank | hedge across product-vs-instance strengths | improves strict and extended slices without tail collapse |
| `CROP-04` | best vision model + OCR | score fusion | should help sibling SKUs and text-heavy packs | lifts low-view / sibling-heavy buckets |
| `CROP-05` | best fused model + multi-view gallery | catalog aggregation / rerank | should help sparse angles and packshot mismatch | improves strict slice and low-view buckets |

Kill rule:

- if GT-crop recognition remains weak on strict reference-safe classes, do not spend weeks on detector variants yet

Promote rule:

- improvement must hold on strict slice first
- then check extended slice
- then inspect whether full-slice behavior is acceptable or just masked by unresolved classes

## Phase 2: Localization Only

Goal: maximize dense, class-agnostic shelf localization.

Recommended order:

| id | model family | scope | why it exists | promote if |
|---|---|---|---|---|
| `DET-00` | `YOLOv8` class-agnostic | submission-friendly | cheap baseline and deployment anchor | overfit sanity passes; competitive AP50 ignore-class |
| `DET-01` | `RF-DETR` class-agnostic | practical strong baseline | fast modern custom-data baseline | beats `DET-00` on AP50 and count MAE |
| `DET-02` | `Co-DETR` / `Co-DINO` class-agnostic | research ceiling | strongest supervised public detector family to test | beats `DET-01` on primary split and at least does not crater stress suites |
| `DET-03` | best detector + `SAHI` | inference ablation | dense small objects justify slicing | improves `AP_small` / miss rate without unacceptable latency |
| `DET-04` | best detector + threshold/NMS/count sweep | calibration | shelf scenes often fail on duplicates and count | lowers duplicate rate and count MAE |

Primary decision metric here is category-agnostic `AP50`, because that mirrors the `70%` detection-heavy competition structure better than generic COCO `AP`.

## Phase 3: End-to-End Stack

Goal: combine best localizer + best recognizer into a submission-oriented pipeline.

Recommended order:

| id | pipeline | what changes | primary question |
|---|---|---|---|
| `PIPE-01` | detector + crop retrieval | plain fusion | does decomposition beat monolithic closed-set detection already? |
| `PIPE-02` | `PIPE-01` + OCR/text fusion | add text score | does sibling-SKU confusion fall? |
| `PIPE-03` | `PIPE-02` + unknown / abstain policy | thresholding and fallback | can we reduce catastrophic wrong-SKU assignments? |
| `PIPE-04` | `PIPE-03` + multi-view catalog rerank | stronger retrieval | do low-view / partial-pack cases improve? |
| `PIPE-05` | `PIPE-04` + theme-aware calibration | optional | do theme-specific priors help without overfitting? |

Promote only if:

- hybrid proxy improves
- detection-only proxy does not regress badly
- classification-only proxy actually improves rather than hiding behind detector gains
- `egg`, `unknown_product`, and problem buckets do not collapse

## Phase 4: Monolithic Detector Ablations

Goal: prove whether the simpler closed-set approach is actually competitive.

| id | model family | why run it |
|---|---|---|
| `MONO-01` | `YOLOv8` multi-class | cheap strong closed-set baseline |
| `MONO-02` | `RF-DETR` multi-class | practical stronger closed-set baseline |
| `MONO-03` | `Co-DETR` / `Co-DINO` multi-class | high-end monolithic reference |

This phase is an ablation, not the first bet.

If one of these surprisingly matches the stack, that matters. But do not assume it will.

## Phase 5: Bootstrapping And Rare-Class Recovery

Run this only after phases `1-4` reveal the actual bottleneck.

| id | method | intended use |
|---|---|---|
| `BOOT-01` | `Grounding DINO` / `MM-Grounding-DINO` | pseudo-label proposals, weak supervision, rare-class mining |
| `BOOT-02` | `T-Rex2` | packshot-prompted detection / rare-SKU recovery / verification |
| `BOOT-03` | `Grounded-SAM 2` | annotation refinement, box cleanup, hard-negative mining |
| `BOOT-04` | OCR-focused mining | resolve sibling variants and missing-ref failure cases |

Use these to fix bottlenecks, not as blind complexity inflation.

## Promotion Rules

To move a model/pipeline forward:

- it must beat the current best on the primary blocked split
- it must not win only by head-class micro averaging
- it must not hide a serious regression in `egg`, low-view classes, or `problem_heavy` images
- it must have an explanation for why it improved
- if it is a serious finalist, rerun with `3` seeds if feasible

## Kill Rules

Kill or pause an experiment if:

- it fails overfit sanity
- it only improves micro averages while macro/per-bucket results worsen
- it adds complexity without clear bucket-level gains
- it is obviously impossible to ship inside sandbox constraints and does not establish a meaningful research ceiling

## Deployment Reality Check

Before a promising result is considered truly valuable, answer:

- can we export or reimplement it for offline sandbox inference?
- can it stay under `300s` end-to-end?
- can total weights stay under `420 MB`?
- can we keep it robust without network access or runtime installs?

This is why a submission-friendly baseline must exist the whole time, even while testing stronger research models.

## Recommended First Real Experiments

If starting tomorrow, run in this exact order:

1. `EVAL-01` + `EVAL-02`
2. `CROP-00`
3. `CROP-01`
4. `CROP-02`
5. `CROP-03`
6. `DET-00`
7. `DET-01`
8. `PIPE-01`

That sequence answers the most important question fastest:

- is recognition or localization the real bottleneck?

If crop recognition is already strong on GT crops, prioritize localization.
If crop recognition is weak even on GT crops, prioritize retrieval/OCR/catalog work first.
