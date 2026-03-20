# REP-0010 First Classifier Controls

## Metadata

- id: `REP-0010`
- date: `2026-03-20`
- related experiment: `EXP-0013`
- status: `active`

## What Was Added

First real closed-set classifier path is now implemented:

- `scripts/cache_norgesgruppen_crop_classifier_embeddings.py`
- `scripts/norgesgruppen_crop_classifier_common.py`
- `scripts/train_norgesgruppen_crop_classifier.py`
- `scripts/train_norgesgruppen_crop_classifier_cached.py`
- `scripts/eval_norgesgruppen_crop_classifier.py`

This path uses:

- frozen `PE-Core`
- `LayerNorm -> Linear` head
- GT-crop classifier manifests
- deterministic detector-style crop jitter
- CPU-friendly exact-crop embedding caches
- explicit ranking export
- explicit classifier-slice eval

## Verification Work

Classifier verification now covers both direct and cached training routes on the `8`-class tiny subset.

### Positive Control

Artifacts:

- `data/2026-03-19/experiments/EXP-0013-crop-shelf-closed-set-classifier/artifacts/pe-core-linear-tiny-overfit/metrics.json`
- `data/2026-03-19/experiments/EXP-0013-crop-shelf-closed-set-classifier/artifacts/pe-core-linear-tiny-overfit/artifacts/summary.json`

Best read:

- best epoch: `8`
- train loss at best epoch: `0.001445`
- val seen top-1: `0.8125`
- val seen top-5: `0.84375`
- full-slice mAP@20: `0.833705`

Interpretation:

- pipeline learns real signal
- ranking export and eval are working
- current realistic jitter/held-out tiny split does not fully memorize
- this is good enough to trust the path, but not enough to call the memorization gate maximally strict

### Negative Control

Artifacts:

- `data/2026-03-19/experiments/EXP-0013-crop-shelf-closed-set-classifier/artifacts/pe-core-linear-tiny-overfit-shuffled-labels/metrics.json`
- `data/2026-03-19/experiments/EXP-0013-crop-shelf-closed-set-classifier/artifacts/pe-core-linear-tiny-overfit-shuffled-labels/artifacts/summary.json`

Best read:

- best epoch: `1`
- best val seen top-1: `0.25`
- final val seen top-1: `0.15625`
- best val seen top-5: `0.5`

Interpretation:

- shuffled-label collapse is real
- no obvious leakage / target-path bug survived this control
- positive vs negative control gap is large enough to trust downstream full runs

### Exact-Crop Follow-Up

Artifacts:

- `data/2026-03-19/experiments/EXP-0013-crop-shelf-closed-set-classifier/artifacts/pe-core-linear-tiny-overfit-exact-crop/artifacts/summary.json`

Best read:

- best epoch: `10`
- best val seen top-1: `0.8125`
- best val seen top-5: `0.84375`

Interpretation:

- removing crop jitter/context did not improve the held-out tiny control
- current ceiling on this `8`-class tiny val slice looks more like class confusion than crop-noise sensitivity

### Same-Sample Memorization Control

Artifacts:

- `data/2026-03-19/experiments/EXP-0013-crop-shelf-closed-set-classifier/artifacts/pe-core-linear-tiny-memorize-same-samples/artifacts/summary.json`

Best read:

- best epoch: `3`
- best val seen top-1: `1.0`
- best val seen top-5: `1.0`

Interpretation:

- the training path can fit exact seen crops perfectly
- the earlier `0.8125` held-out tiny controls are not evidence of a broken trainer
- they are evidence of real generalization/confusion limits even inside the tiny subset

### Cached Exact-Crop Route

Artifacts:

- `data/2026-03-19/experiments/EXP-0013-crop-shelf-closed-set-classifier/artifacts/pe-core-linear-cache-tiny/artifacts/summary.json`
- `data/2026-03-19/experiments/EXP-0013-crop-shelf-closed-set-classifier/artifacts/pe-core-linear-cached-tiny-train/artifacts/summary.json`
- `data/2026-03-19/experiments/EXP-0013-crop-shelf-closed-set-classifier/artifacts/pe-core-linear-cached-tiny-memorize-same-samples/artifacts/summary.json`

Best read:

- cached held-out tiny best epoch: `3`
- cached held-out tiny val seen top-1 / top-5: `0.78125 / 1.0`
- cached same-sample best epoch: `9`
- cached same-sample val seen top-1 / top-5: `1.0 / 1.0`

Interpretation:

- cached exact-crop route is viable on this CPU-only host
- cached route can also memorize exact seen samples perfectly
- cached extractor is now split-atomic and resumable
- resume smoke proved that a finished train cache can be reused while extracting only the missing val split
- future full exact-crop classifier baselines can use cached embeddings without reopening trainer-trust questions

### Cache Extraction Speed Benchmark

Artifacts:

- `data/2026-03-19/experiments/EXP-0013-crop-shelf-closed-set-classifier/artifacts/cache-bench/benchmark-summary.json`

Quick CPU-only benchmark on a `512`-row blocked-train subset:

- `batch-size 64`, `num-workers 0`: `80.39s`
- `batch-size 128`, `num-workers 0`: `59.68s`
- `batch-size 64`, `num-workers 2`: `61.25s`
- `batch-size 256`, `num-workers 0`: `58.69s`

Interpretation:

- `batch-size 256`, `num-workers 0` was only marginally faster than `128/0`
- first full cache run should use `batch-size 128`, `num-workers 0`
- larger batch beat extra workers in this quick benchmark
- resume support means future interrupts no longer throw all cache work away

## Bugs Caught By The Controls

These controls already found and forced fixes for two real implementation issues:

1. sparse global classifier labels in subset manifests
2. frozen-encoder `inference_mode()` tensors leaking into autograd

Both are fixed in the current scripts.

## What This Means

`EXP-0013` is no longer just planned.

What is now true:

- classifier manifests are real
- direct and cached classifier train/eval code are real
- positive and negative controls both exist
- same-sample memorization is proven for both routes
- retrieval is now re-evaluated on the classifier surface, so the first full classifier run has a direct baseline on `classifier_priority` / `fusion_candidate` / hard buckets
- next step can be a full GT-crop training run via cached embeddings on CPU

What is still not true:

- no full `train-all -> val-all` classifier result yet
- no detector-crop shadow eval yet
- no fusion with retrieval yet

## Next Move

Run first full GT-crop baseline:

1. finish full exact-crop cache on `train-all.jsonl` -> `val-all.jsonl`
2. train cached frozen `PE-Core` linear probe on top of those embeddings
3. score hard buckets first:
   - `classifier_priority`
   - `missing_reference`
   - `unknown_sentinel`
   - `sibling_variant_trap`
4. compare against retrieval slices before building `EXP-0014`

Current apples-to-apples retrieval baseline on that same classifier surface:

- full top-1 / top-5 / mAP@20: `0.585831 / 0.797911 / 0.681357`
- `classifier_priority`: `0.165323 / 0.193548 / 0.176411`
- `fusion_candidate`: `0.611807 / 0.835181 / 0.712518`
- `missing_reference`: `0 / 0 / 0`
- `unknown_sentinel`: `0 / 0 / 0`
- `sibling_variant_trap`: `0 / 0 / 0`
