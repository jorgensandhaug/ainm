# ML Verification Playbook

Purpose: make every stage of the ML pipeline falsifiable so we can converge quickly without being tricked by leakage, metric drift, lucky seeds, or broken assumptions.

This file is the operating manual for autonomous ML verification on this task.

## Core Rule

Never trust downstream gains until upstream invariants are still passing.

In practice:

1. verify data and split truth
2. verify evaluators with empty/oracle controls
3. verify trivial baselines
4. verify learning sanity on tiny subsets
5. verify oracle bounds to localize the bottleneck
6. only then trust bigger models or more complex pipelines

## Canonical Command

Run this before trusting the current modeling state:

```bash
python scripts/verify_norgesgruppen_ml_pipeline.py
```

It writes:

- [ml-pipeline-verification.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/ml-pipeline-verification.json)

This script is intentionally fast and artifact-driven. It does not replace serious experiments; it verifies that the accepted control surface still makes sense.

## Verification Ladder

### Stage 0: Data Lineage And Split Truth

What can go wrong:

- wrong image/class counts
- drift between docs and payload
- broken train/val split
- category-id mismatch
- stale derived manifests

Hard checks:

- [verify_norgesgruppen_prep.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/verify_norgesgruppen_prep.py)
- [verify_norgesgruppen_yolo_export.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/verify_norgesgruppen_yolo_export.py) once YOLO exports exist
- `248` images, `22731` annotations, `356` categories
- blocked split still `199` train / `49` val
- YOLO exports still agree with COCO split manifests and round-trip back to source boxes within tolerance

If this fails:

- stop all modeling
- rebuild prep
- fix the data contract first

### Stage 1: Evaluator Controls

What can go wrong:

- scorer bug
- metric inversion
- split filtering bug
- bad prediction normalization

Hard controls:

- full-image evaluator empty case -> score `0`
- full-image evaluator oracle case -> score `1`
- detection evaluator empty case -> `AP50 0`
- detection evaluator oracle case -> `AP50 1`
- crop evaluator oracle rankings -> strict top-1 `1`

If this fails:

- no experiment result is trustworthy
- fix evaluator before touching models

### Stage 2: Trivial Baselines

What can go wrong:

- model looks good only because baseline is missing
- retrieval harness is accidentally too easy
- gallery/query definitions are broken

Hard controls:

- random crop retrieval must be bad
- hash nearest-neighbor must beat random
- strong embedder must beat both on the same strict slice

For current accepted state:

- random strict top-1: `0.004383`
- hash strict top-1: `0.068176`
- `PE-Core` strict top-1: `0.627952`

If this fails:

- do not scale the fancy model
- first understand why the trivial baselines moved

### Stage 3: Learning Sanity

What can go wrong:

- data loading bug
- labels disconnected from examples
- optimizer/schedule/config broken
- apparent gains caused by evaluation artifact rather than learning

Detector controls:

- tiny overfit sanity on a few images
- zero-shot floor on blocked val
- trained smoke must beat zero-shot strongly

Current accepted detector controls:

- overfit `mAP50`: `0.78879`
- zero-shot blocked-val `AP50`: `0.156996`
- 1-epoch fine-tuned smoke `AP50`: `0.689607`
- 10-epoch canonical anchor `AP50`: `0.852028`
- 10-epoch canonical anchor `mAP50-95`: `0.494438`

Recognition controls:

- retrieval oracle rankings score `1`
- strong embedder beats trivial baselines
- duplicate query ids remain `0`

What we still need later:

- actual shuffled-label training runs for future supervised classifiers and multi-class detectors
- tiny-overfit for the future shelf-crop classifier
- multi-seed repeats before serious promotion

### Stage 4: Oracle Bounds

What can go wrong:

- wrong bottleneck diagnosis
- spending time on OCR when localization is still weak
- blaming retrieval for failures caused by detector recall

Required bounds:

- oracle boxes + current recognizer
- current detector boxes + oracle classes

Interpret them like this:

- oracle boxes strong, detector-box oracle-class weak -> detector is bottleneck
- oracle boxes weak too -> recognizer still weak
- detector-box oracle-class high but real pipeline weak -> recognition/calibration bottleneck

Current accepted reads:

- oracle boxes + `PE-Core` -> hybrid `0.860238`
- detector boxes + oracle classes, 1-epoch smoke -> hybrid `0.749827`
- detector boxes + oracle classes, 10-epoch anchor -> hybrid `0.879192`

So right now:

- localization is no longer obviously the single largest remaining bottleneck
- the next honest step is the first real detector + recognizer pipeline

### Stage 5: Postprocess And Calibration

What can go wrong:

- mistaking threshold tuning for real model improvement
- improving count noise while hurting ranked AP

Current accepted read:

- simple score/top-k cleanup reduces noise
- but best persisted sweep still underperforms raw detector on `AP50`

Interpretation:

- calibration is secondary
- better detector weights are still the main lever

### Stage 6: End-to-End Promotion

Before promoting any serious pipeline, require:

- upstream checks still passing
- bucketed metrics, not just one scalar
- failure review on `knekkebrod`, `egg`, `unknown_product`, and problem images
- weight size and latency recorded
- result linked to exact artifact paths and config

Never promote on:

- one lucky seed
- only micro-average improvement
- only head-class improvement
- one metric with broken controls upstream

## How To Verify New Models

### New Retrieval Model

Must pass in order:

1. rankings file has correct query count and no duplicates
2. strict slice beats random and hash floors
3. oracle rankings still score `1`
4. bucket failures are understandable
5. result is compared against `PE-Core`, not only against random

### New Detector

Must pass in order:

1. empty/oracle detection controls still pass
2. tiny overfit sanity
3. zero-shot / pretrained floor
4. trained smoke on blocked val
5. detector-box oracle-class bound
6. postprocess sweep only after the trained detector is real

### New End-to-End Pipeline

Must pass in order:

1. upstream detector and recognizer checks already pass
2. pipeline beats the relevant bound-free baseline
3. gains hold on hard buckets
4. score does not come from only one easy theme
5. local submission-style contract is still feasible

## Common Failure Patterns

### False Progress

Signs:

- one metric rises, but hard buckets collapse
- count `MAE` improves only because top-k truncation kills recall
- end-to-end score rises only because detector improved, while recognition got worse

Defense:

- always log bucketed metrics and oracle bounds

### Leakage

Signs:

- implausibly strong tiny model
- shuffled labels still “work”
- exact same queries/gallery rows duplicated

Defense:

- split verification
- duplicate-id checks
- eventually add shuffled-label controls for every supervised family

### Silent Contract Drift

Signs:

- category ids shift
- eval script behavior changes
- prepared manifests disagree with raw COCO

Defense:

- keep [verify_norgesgruppen_prep.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/verify_norgesgruppen_prep.py)
- keep [verify_norgesgruppen_ml_pipeline.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/verify_norgesgruppen_ml_pipeline.py)
- do not accept undocumented metric/split changes

## Known Gaps Still To Materialize

Important, but not hard-failing yet:

- actual shuffled-label training runs for future supervised classifier and future detector recipe changes
- tiny-overfit control for the future shelf-crop closed-set classifier
- multi-seed stability for serious promotions
- local submission contract dry-run for the eventual `run.py`
- detector recipe ablation matrix for schedule/imgsz/augment decisions

Support artifacts for the shuffled-label controls already exist:

- `data/2026-03-19/derived/control-datasets/shuffled-label-control/category-permutation.json`
- `data/2026-03-19/derived/control-datasets/shuffled-label-control/train-coco-shuffled.json`
- `data/2026-03-19/derived/control-datasets/shuffled-label-control/gt-crop-labels-shuffled.jsonl`

## What Good Autonomous Practice Looks Like Here

- assume every stage can fail silently
- build one control stronger than you think you need
- compare new methods against the strongest trivial baseline on the same split
- use oracle bounds to decide what to work on next
- only add complexity when the current bottleneck is proven

That is how we get to strong out-of-sample performance instead of leaderboard theater.
