# REP-0009 First Detector + Retrieval Baseline

## Scope

- `EXP-0008`
- detector: `EXP-0006` `YOLOv8n` class-agnostic 10-epoch anchor
- recognizer: `EXP-0003` `PE-Core`
- gallery mode: `representative`
- detector filter: `min_score 0.4`
- query padding: `0`
- blocked val

## Bottom Line

The first real detector + retrieval stack is now measured and viable.

At the chosen filtered detector operating point:

- detector-only hybrid: `0.557981`
- detector + `PE-Core` hybrid: `0.693615`
- same-box oracle-class hybrid: `0.817538`

So the decomposition works, but current post-detector recognition and calibration still leave `0.123923` hybrid on the table.

There is also an immediate cheap win:

- simple score fusion `detector_score * retrieval_top1_score` lifts hybrid to `0.717616`

That means the next path should be:

1. freeze score calibration as part of the baseline
2. add closed-set classifier fallback
3. keep OCR conditional

## What This Proves

- Detector quality is already good enough to support a serious end-to-end stack.
- `PE-Core` still transfers meaningfully from GT crops to detector crops.
- The next bottleneck is not detector existence.
- The next bottleneck is recognition quality on detector crops plus confidence calibration.

## First Real Stack Read

Filtered detector operating point:

- predictions: `4906`
- detection `AP50 0.797113`
- miss rate `0.132607`
- duplicate-box rate `0.01916`
- background-FP rate `0.202201`
- count `MAE 12.326531`

Classification at that exact operating point:

- detector-only classification `mAP50 0.000005`
- detector + retrieval classification `mAP50 0.452121`
- same-box oracle-class classification `mAP50 0.865195`

Interpretation:

- retrieval adds real class signal
- but the recognition gap on detector crops is still large

## Bucket Read

Pipeline classification `mAP50` by theme:

- `egg 0.208371`
- `frokost 0.507062`
- `knekkebrod 0.379309`
- `other 0.329942`
- `varmedrikker 0.526872`

Structural failure buckets remain exactly where expected:

- `missing_reference 0.0`
- `needs_manual_review 0.0`
- `sibling_variant_trap 0.0`
- `unknown_sentinel 0.0`

So this is not a vague degradation. It is concentrated in the known hard regimes.

## Matched Detector-Crop Anatomy

On matched true-positive detector crops:

- top-1 `0.627225`
- top-5 `0.825916`

On supported/reference-like matched true-positive detector crops:

- top-1 `0.658966`
- top-5 `0.867712`

Theme read:

- `frokost` matched-crop top-1/top-5: `0.745283 / 0.909853`
- `varmedrikker`: `0.693666 / 0.876428`
- `egg`: `0.535565 / 0.845188`
- `knekkebrod`: `0.560462 / 0.783967`
- `other`: `0.333333 / 0.453125`

Margin read:

- margin `<0.01`: top-1 `0.349425`, top-5 `0.703448`
- margin `0.05..0.1`: top-1 `0.84279`, top-5 `0.927896`
- margin `>=0.1`: top-1 `0.923695`, top-5 `0.929719`

This strongly supports a rerank / fallback strategy:

- candidate sets are often good enough
- low-margin predictions are where cheap calibration should act first

## Cheap Calibration Read

Saved-prediction score sweep:

- raw pipeline score = detector score -> hybrid `0.693615`
- best cheap variant = `detector_score * retrieval_top1_score` -> hybrid `0.717616`

This matters because:

- no extra model is needed
- the gain is immediate
- it proves calibration is part of the bottleneck, not just label assignment

## Decision

Freeze this read:

1. `EXP-0008` succeeded as the first real end-to-end stack.
2. The next cheap baseline should include score fusion.
3. The next major experiment should be detector + retrieval + closed-set classifier fallback.
4. OCR should still wait until classifier fallback is measured.

## Relevant Artifacts

- `data/2026-03-19/experiments/EXP-0008-pipe-det-plus-retrieval/artifacts/pe-core-b16-ms0.4-representative/summary.json`
- `data/2026-03-19/experiments/EXP-0008-pipe-det-plus-retrieval/artifacts/pe-core-b16-ms0.4-representative/retrieval-analysis.json`
- `data/2026-03-19/experiments/EXP-0008-pipe-det-plus-retrieval/artifacts/pe-core-b16-ms0.4-representative/score-fusion-sweep.json`
- `data/2026-03-19/experiments/EXP-0008-pipe-det-plus-retrieval/artifacts/pe-core-b16-ms0.4-representative/score-fusion-best-variant.json`
- `data/2026-03-19/experiments/EXP-0008-pipe-det-plus-retrieval/artifacts/pe-core-b16-ms0.4-representative/eval-pipeline/metrics.json`
- `data/2026-03-19/experiments/EXP-0008-pipe-det-plus-retrieval/artifacts/pe-core-b16-ms0.4-representative/eval-pipeline-score-fusion-times-top1/metrics.json`
- `data/2026-03-19/experiments/EXP-0008-pipe-det-plus-retrieval/artifacts/pe-core-b16-ms0.4-representative/oracle-class-bound/metrics.json`
