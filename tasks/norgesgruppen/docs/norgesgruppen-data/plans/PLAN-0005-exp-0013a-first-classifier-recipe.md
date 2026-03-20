# PLAN-0005 EXP-0013A First Classifier Recipe

## Metadata

- id: `PLAN-0005`
- status: active
- date: `2026-03-20`
- scope: define the first concrete shelf-crop classifier recipe for `EXP-0013`

## Goal

Build the first classifier that is:

- cheap
- strongly verifiable
- compatible with the current retrieval stack
- useful for later fusion

This is not the place for a fancy model.

This is the place for the first classifier that can actually move the end-to-end score.

## Frozen Input Surface

Use the classifier manifests built by:

- `python scripts/build_norgesgruppen_crop_classifier_manifests.py`

Canonical outputs:

- `data/2026-03-19/derived/crop-classifier/category-role-manifest.json`
- `data/2026-03-19/derived/crop-classifier/train-all.jsonl`
- `data/2026-03-19/derived/crop-classifier/val-all.jsonl`
- `data/2026-03-19/derived/crop-classifier/val-train-seen.jsonl`
- `data/2026-03-19/derived/crop-classifier/val-zero-train-support.jsonl`
- `data/2026-03-19/derived/crop-classifier/tiny-overfit-train.jsonl`
- `data/2026-03-19/derived/crop-classifier/tiny-overfit-val.jsonl`
- `data/2026-03-19/derived/crop-classifier/summary.json`

Key frozen counts:

- train crops: `18327`
- val crops: `4404`
- train-seen classes: `351`
- val zero-train-support classes: `5`
- category roles:
  - `317` `fusion_candidate`
  - `34` `classifier_priority`
  - `4` `retrieval_only_unseen_in_train`
  - `1` `impossible_first_pass`

## What The First Classifier Should Predict

Classifier label space:

- all blocked-train seen category ids
- contiguous classifier labels for `351` trainable classes
- include `unknown_product`

Classifier should not be judged as failing on:

- `retrieval_only_unseen_in_train`
  - these are retrieval territory in first pass
- `impossible_first_pass`
  - currently `285` `Leka Egg 10stk`

This must be explicit in later eval and fusion logic.

## Model Choice

First pass should be:

- frozen `PE-Core` image encoder
- shelf-crop embeddings
- `LayerNorm -> Linear` head

Optional second pass if first pass is promising:

- replace linear with shallow MLP

Do not start with:

- full end-to-end fine-tune
- ViT fine-tune
- heavy augmentation stacks
- OCR

## Why Frozen `PE-Core` First

- strongest current embedder
- already proven on GT-crop retrieval
- lowest implementation risk
- easiest to debug
- easiest to compare directly with retrieval
- cheapest to rerun with controls

## Data Construction

Train on crop samples defined by `train-all.jsonl`, but do not trust only perfectly tight GT crops.

Use on-the-fly crop jitter from source shelf image:

- x/y shift: up to about `5%` of box width/height
- scale jitter: about `0.9 .. 1.1`
- context padding jitter: `0 .. 8%`
- mild edge clipping allowed

Purpose:

- approximate detector crop noise
- reduce GT-crop over-optimism

Do not use:

- horizontal flip
- vertical flip
- CutMix
- MixUp

Reason:

- product text and logos are orientation-sensitive
- mirrored packaging is unrealistic
- mixed-label augmentations are likely harmful for exact SKU identity

Allow only light appearance augmentation:

- small brightness / contrast / saturation jitter
- mild blur or JPEG/compression noise

## Training Recipe

### First Pass

- encoder: frozen `PE-Core`
- head: `LayerNorm -> Linear(351)`
- loss: standard cross-entropy
- sampler: inverse-sqrt class-frequency weighting, capped
- optimizer: `AdamW`
- weight decay: light to moderate
- epochs: fixed small budget, around `15-20`
- no giant hyperparameter sweep

Why standard cross-entropy first:

- simplest trustworthy baseline
- easier to interpret than focal / balanced-softmax variants
- calibration can be handled after the first fit

Why inverse-sqrt sampling:

- tail exists
- but full inverse-frequency oversampling would over-amplify 1-2 shot noise

## Controls

### Control 1. Tiny Overfit

Use:

- `tiny-overfit-train.jsonl`
- `tiny-overfit-val.jsonl`

Subset is:

- `8` categories
- `64` train crops
- `32` val crops

Must show near-memorization before any serious run is trusted.

### Control 2. Shuffled-Label Collapse

Use the existing shuffled-label control artifacts.

The first classifier recipe must fail cleanly under shuffled labels.

If shuffled labels still look good:

- stop
- assume leakage or implementation bug

### Control 3. Real GT-Crop Eval

Use full `train-all.jsonl` / `val-all.jsonl`.

Primary slices:

- full
- `classifier_priority`
- `fusion_candidate`
- `unknown_sentinel`
- `missing_reference`
- `sibling_variant_trap`
- `exact_reference_high_view` shadow slice

### Control 4. Detector-Crop Shadow Eval

After GT-crop read looks sane:

- run classifier on matched detector crops
- compare against retrieval matched-crop top-1/top-5 behavior

This is the real bridge to `EXP-0014`.

## What Counts As Success

The first classifier does **not** need to beat retrieval everywhere.

It does need to do these:

1. non-trivial performance on `classifier_priority` classes
2. non-trivial performance on `unknown_product`
3. useful signal on supported classes without collapsing head classes
4. reasonable detector-crop transfer after jitter training

The first pass is successful if it becomes a useful second recognizer for fusion.

## What To Watch Closely

### Tail Overfitting

There are many ultra-low-support classes.

Warning signs:

- training loss near zero, val unstable
- weirdly high confidence on 1-shot classes
- no shuffled-label collapse

### False Comfort On Unsupported Val Classes

Remember:

- `4` val-only classes are retrieval-covered
- `1` val-only class is effectively impossible first pass

Do not interpret those as classifier-only failures.

### Misleading Use Of Blocked Val

Do not run a giant recipe search here.

First pass should be:

- one tiny-overfit control
- one shuffled-label control
- one real run

Then decide.

## Expected Next Step After Success

If this recipe works:

1. run classifier on detector crops
2. build `EXP-0014` fusion
3. compare:
   - retrieval only
   - score-fused retrieval
   - classifier only
   - retrieval + classifier fusion

## Decision

Freeze this:

1. `EXP-0013A` is a frozen-embedding classifier, not a big fine-tune
2. training should use detector-style crop jitter
3. no flips or mixed-label augments
4. first purpose is fusion utility, not standalone dominance
