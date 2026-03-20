# EXP-0013 crop-shelf-closed-set-classifier

## Metadata

- id: `EXP-0013`
- slug: `crop-shelf-closed-set-classifier`
- status: `planned`
- phase: `M2`
- priority: `8`

## Question

Can a shelf-crop closed-set classifier recover the no-reference, sentinel, and shelf-domain cases that retrieval cannot solve well?

## Prerequisites

- `EXP-0001`
- `EXP-0011`

## Success Gate

Improves full-slice and hard-bucket recognition, especially missing-reference, unknown_sentinel, and low-view regimes, without collapsing strong reference-safe classes.

## Run Notes

- owner:
- code path:
  - planned:
    - `scripts/extract_norgesgruppen_gt_crops.py`
    - `scripts/train_norgesgruppen_crop_classifier.py`
    - `scripts/eval_norgesgruppen_crop_classifier.py`
- split:
  - train GT crops from blocked train images
  - val GT crops from blocked val images
- slices:
  - full
  - missing-reference
  - unknown-sentinel
  - sibling-variant-trap
  - exact-reference-high-view shadow slice
  - low-view exact-reference slice
- seed:
  - first pass single-seed
  - promote only after multi-seed repeat if promising
- controls to run first:
  - tiny overfit on a small balanced subset
  - shuffled-label collapse with the same recipe
- hard data constraints:
  - `5` val classes have zero train crops
  - `4` of those still have packshots and must remain retrieval-driven:
    - `91`, `256`, `279`, `350`
  - `1` is structurally weak for both first-pass classifier and retrieval:
    - `285` `Leka Egg 10stk`
- baseline objective:
  - learn shelf-domain closed-set categories that retrieval cannot cover well
  - especially:
    - `missing_reference`
    - `unknown_product`
    - weak/low-view packshot classes
    - detector-crop domain gap
- first model family:
  - frozen `PE-Core` embeddings
  - linear probe or shallow MLP head
  - class-balanced objective
  - calibrated probabilities
- crop generation:
  - do not train only on perfectly tight GT crops
  - add synthetic detector-style jitter:
    - expansion / shrink
    - x/y shift
    - mild truncation
    - context padding jitter
- main comparison surface:
  - compare against `EXP-0003` / `EXP-0008` retrieval numbers on GT crops and hard buckets
  - do not require classifier to beat retrieval everywhere
  - do require it to win where retrieval is structurally weak
- first acceptance read:
  - clear lift on missing-reference / unknown / sibling buckets
  - no severe collapse on exact-reference-high-view shadow slice
  - no false comfort from classes with zero train support

## Results

- primary metrics:
- bucketed metrics:
- key error read:
- next action:
