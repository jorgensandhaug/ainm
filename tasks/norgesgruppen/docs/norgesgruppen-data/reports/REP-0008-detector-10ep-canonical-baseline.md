# REP-0008 Detector 10-Epoch Canonical Baseline

## Scope

- `EXP-0006`
- `YOLOv8n` class-agnostic
- blocked val
- `10` epochs, `960`, batch `2`, cpu
- canonical saved-prediction eval
- updated detector-box oracle-class bound

## Bottom Line

The first real detector baseline is now strong enough to stop treating localization as merely preflight.

Canonical result:

- `AP50 0.852028`
- `AP75 0.530942`
- `mAP50-95 0.494438`
- miss rate `0.048592`
- duplicate-box rate `0.132653`
- background-FP rate `0.582313`
- count `MAE 31.306122`

Versus the earlier `1`-epoch smoke:

- `AP50 +0.162421`
- `AP75 +0.23387`
- `mAP50-95 +0.148766`
- miss rate `-0.056313`
- duplicate rate `-0.042449`
- count `MAE -41.204082`

This is no longer a weak detector lane.

## What Changed Strategically

The older read was:

- detector first, because current localization was the obvious bottleneck

That was true at the `1`-epoch smoke stage.

It is no longer the right main read now.

Updated bound:

- detector boxes + oracle classes -> hybrid `0.879192`

Compare:

- perfect boxes + current `PE-Core` -> hybrid `0.860238`

So with the stronger detector, localization is no longer obviously the largest remaining limiter. Recognition and pipeline integration are now at least equally urgent.

That changes the next action:

1. run the first real detector + `PE-Core` pipeline
2. then test classifier fallback / unknown calibration
3. keep OCR conditional
4. keep detector-family escalation as contingency, not immediate default

## Localization Read

Theme-level `AP50`:

- `egg` `0.920977`
- `frokost` `0.925458`
- `varmedrikker` `0.903574`
- `knekkebrod` `0.799986`
- `other` `0.623698`

The hard regime is still:

- dense `knekkebrod`
- the tiny `other` slice

But the detector is now strong on the main themes, not just promising in principle.

GT hit-rate read:

- `egg` `0.992647`
- `frokost` `0.981973`
- `varmedrikker` `0.980732`
- `knekkebrod` `0.9099`
- `other` `0.954545`

Area read:

- large `0.970812`
- medium `0.793028`
- small `0.2`, but only `5` GT boxes in val

So the remaining detector weakness is still dense medium-scale shelving, not a broad failure everywhere.

## Remaining Detector Weakness

The model is still saturated on output volume:

- predictions: `14700`
- true positives: `4190`
- duplicate FPs: `1950`
- background FPs: `8560`

That means:

- the detector is now good enough to support pipeline work
- but calibration and score filtering still matter for actual submission behavior
- count accuracy is much better than before, but not yet clean

This is why a postprocess sweep is still worth measuring on the stronger checkpoint, even though it was secondary on the smoke run.

## Updated Oracle-Class Bound

Detector-box oracle-class metrics:

- detection `AP50 0.852028`
- classification `mAP50 0.942574`
- hybrid proxy `0.879192`

Implication:

- if post-detection recognition becomes strong, this detector is already good enough to support a serious submission candidate

## Decision

Freeze this read:

1. `YOLOv8n` is now a legitimate class-agnostic localization anchor
2. the next highest-value experiment is `detector + PE-Core`
3. detector-only work should continue only where it is cheap: postprocess sweep and maybe one stronger recipe
4. do not delay end-to-end work waiting for perfect detector purity

## Relevant Artifacts

- `data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/yolov8n-blocked-val-10ep-cpu-baseline/results.csv`
- `data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/yolov8n-blocked-val-10ep-cpu-baseline-finalize-summary.json`
- `data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/eval-yolov8n-blocked-val-10ep-cpu-baseline/metrics.json`
- `data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/eval-yolov8n-blocked-val-10ep-cpu-baseline/error_summary.json`
- `data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/oracle-class-yolov8n-blocked-val-10ep-cpu-baseline/metrics.json`
- `data/2026-03-19/experiments/EXP-0011-oracle-box-pe-core-bound/metrics.json`
