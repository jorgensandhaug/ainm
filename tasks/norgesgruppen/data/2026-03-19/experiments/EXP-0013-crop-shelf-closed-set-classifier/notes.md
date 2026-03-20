# EXP-0013 crop-shelf-closed-set-classifier

## Metadata

- id: `EXP-0013`
- slug: `crop-shelf-closed-set-classifier`
- status: `in_progress`
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
    - `scripts/build_norgesgruppen_crop_classifier_manifests.py`
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
- frozen recipe doc:
  - `docs/norgesgruppen-data/plans/PLAN-0005-exp-0013a-first-classifier-recipe.md`
- canonical manifests:
  - `data/2026-03-19/derived/crop-classifier/train-all.jsonl`
  - `data/2026-03-19/derived/crop-classifier/val-all.jsonl`
  - `data/2026-03-19/derived/crop-classifier/val-zero-train-support.jsonl`
  - `data/2026-03-19/derived/crop-classifier/tiny-overfit-train.jsonl`
  - `data/2026-03-19/derived/crop-classifier/tiny-overfit-val.jsonl`
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

- control status:
  - implemented:
    - `scripts/norgesgruppen_crop_classifier_common.py`
    - `scripts/cache_norgesgruppen_crop_classifier_embeddings.py`
    - `scripts/train_norgesgruppen_crop_classifier.py`
    - `scripts/train_norgesgruppen_crop_classifier_cached.py`
    - `scripts/eval_norgesgruppen_crop_classifier.py`
  - report:
    - `docs/norgesgruppen-data/reports/REP-0010-first-classifier-controls.md`
- tiny overfit control:
  - output:
    - `artifacts/pe-core-linear-tiny-overfit`
  - best epoch: `8`
  - best val seen top-1 / top-5: `0.8125 / 0.84375`
  - full-slice mAP@20: `0.833705`
  - read:
    - train path learns real signal
    - export + eval path work
    - current realistic jitter recipe does not fully memorize held-out tiny val
- shuffled-label collapse control:
  - output:
    - `artifacts/pe-core-linear-tiny-overfit-shuffled-labels`
  - best val seen top-1 / top-5: `0.25 / 0.5`
  - final val seen top-1 / top-5: `0.15625 / 0.65625`
  - read:
    - negative control collapses as expected
    - no obvious leakage survived
- exact-crop/no-jitter follow-up:
  - output:
    - `artifacts/pe-core-linear-tiny-overfit-exact-crop`
  - best val seen top-1 / top-5: `0.8125 / 0.84375`
  - read:
    - removing jitter/context did not improve the held-out tiny control
    - current tiny held-out ceiling looks more like class confusion than crop-noise sensitivity
- same-sample memorization control:
  - output:
    - `artifacts/pe-core-linear-tiny-memorize-same-samples`
  - best epoch: `3`
  - best val seen top-1 / top-5: `1.0 / 1.0`
  - read:
    - trainer can fit exact seen crops perfectly
    - the held-out tiny ceiling is real generalization/confusion, not a broken training path
- cached exact-crop path:
  - smoke cache extraction:
    - `artifacts/pe-core-linear-cache-tiny`
  - smoke cached held-out tiny train:
    - `artifacts/pe-core-linear-cached-tiny-train`
  - cached same-sample memorization:
    - `artifacts/pe-core-linear-cached-tiny-memorize-same-samples`
  - cached resume smoke:
    - `artifacts/pe-core-linear-cache-tiny-resume-smoke`
  - cached same-sample best epoch: `9`
  - cached same-sample best val seen top-1 / top-5: `1.0 / 1.0`
  - read:
    - CPU-friendly cached-embedding route is now trusted too
    - cache extraction is now split-atomic and resumable
    - validated resume path reuses finished `train-embeddings.pt` and only extracts missing `val-embeddings.pt`
    - full `train-all -> val-all` exact-crop baseline can now use cached embeddings without reopening trainer-trust questions
- retrieval baseline on classifier surface:
  - output:
    - `artifacts/retrieval-baseline-on-classifier-slices/metrics.json`
  - full top-1 / top-5 / mAP@20: `0.585831 / 0.797911 / 0.681357`
  - classifier-priority top-1 / top-5 / mAP@20: `0.165323 / 0.193548 / 0.176411`
  - fusion-candidate top-1 / top-5 / mAP@20: `0.611807 / 0.835181 / 0.712518`
  - hard buckets:
    - `missing_reference`: `0 / 0 / 0`
    - `unknown_sentinel`: `0 / 0 / 0`
    - `sibling_variant_trap`: `0 / 0 / 0`
  - read:
    - first full classifier does not need to beat retrieval everywhere
    - it does need to materially beat retrieval on `classifier_priority` and the structural zero buckets
- cache extraction speed benchmark:
  - output:
    - `artifacts/cache-bench/benchmark-summary.json`
  - subset:
    - `512` blocked-train rows
  - timings:
    - `b64/w0`: `80.39s`
    - `b128/w0`: `59.68s`
    - `b64/w2`: `61.25s`
    - `b256/w0`: `58.69s`
  - read:
    - `b256/w0` was only marginally faster than `b128/w0`
    - first full cache run should use `batch-size 128`, `num-workers 0`
    - workers did not beat the simpler larger-batch configs on this CPU host
- implementation bugs already caught and fixed:
  - sparse global classifier labels in subset manifests required local label reindexing
  - frozen encoder `inference_mode()` tensors broke autograd and were replaced with `no_grad()`
- key error read:
  - current tiny overfit misses are concentrated in `knekkebrod`
  - the control is strong enough to trust the path, but not strict enough to call memorization fully solved
- next action:
  - finish full exact-crop cache on `train-all.jsonl` -> `val-all.jsonl`
  - use:
    - `./scripts/run_norgesgruppen_crop_python.sh scripts/cache_norgesgruppen_crop_classifier_embeddings.py --output-dir data/2026-03-19/experiments/EXP-0013-crop-shelf-closed-set-classifier/artifacts/pe-core-linear-cache-full --experiment-id EXP-0013 --label pe_core_linear_cache_full --cache-split both --reuse-existing --batch-size 128 --num-workers 0`
  - run first full cached GT-crop baseline on top of those embeddings
  - use:
    - `./scripts/run_norgesgruppen_crop_python.sh scripts/train_norgesgruppen_crop_classifier_cached.py --train-cache data/2026-03-19/experiments/EXP-0013-crop-shelf-closed-set-classifier/artifacts/pe-core-linear-cache-full/artifacts/train-embeddings.pt --val-cache data/2026-03-19/experiments/EXP-0013-crop-shelf-closed-set-classifier/artifacts/pe-core-linear-cache-full/artifacts/val-embeddings.pt --output-dir data/2026-03-19/experiments/EXP-0013-crop-shelf-closed-set-classifier/artifacts/pe-core-linear-cached-full-train --experiment-id EXP-0013 --label pe_core_linear_cached_full_train --epochs 40 --batch-size 1024`
  - compare directly against `artifacts/retrieval-baseline-on-classifier-slices/metrics.json`
  - then run detector-crop shadow eval
  - then build `EXP-0014` fusion
