# REP-0007 Detector Postprocess And Miss Profile

## Scope

- `EXP-0006`
- 1-epoch fine-tuned `YOLOv8n` class-agnostic smoke
- score / top-k postprocess sweep
- miss concentration read

## Bottom Line

Postprocess is not the next main lever.

The best small sweep reduced noise, but it did not beat the raw detector on localization:

- raw 1-epoch smoke: `AP50 0.689607`, `mAP50-95 0.345672`
- best sweep config: `min_score 0.001`, `max_det 200`
- best sweep result: `AP50 0.668094`, `mAP50-95 0.335315`

So the next justified move is better detector weights, not more threshold fiddling.

## Sweep Read

Sweep grid:

- `min_score {0.001, 0.05, 0.1, 0.2}`
- `max_det_per_image {100, 150, 200}`

What improved:

- background FP rate fell from `0.556735` to `0.468469`
- duplicate rate fell from `0.175102` to `0.151939`
- count `MAE` fell from `72.510204` to `57.816327`

What got worse:

- miss rate rose from `0.104905` to `0.155313`
- `AP50` fell from `0.689607` to `0.668094`
- `mAP50-95` fell from `0.345672` to `0.335315`

Interpretation:

- the detector is overproducing boxes
- but a meaningful part of that overproduction is still helping recall and ranked AP
- current AP is training-limited more than it is postprocess-limited

Useful nuance:

- mild score filtering alone is almost AP-neutral
- example: `min_score 0.05`, `max_det 300`
  - `AP50 0.687818` vs raw `0.689607`
  - predictions drop from `14700` to `11600`
  - background FP rate drops from `0.556735` to `0.501207`

So if runtime or output volume matters later, a small confidence floor is a reasonable practical knob.

What clearly hurts more is aggressive top-k truncation.

## Miss Profile

This does not look like a generic edge-box failure.

GT hit rates from the raw 1-epoch smoke:

- large boxes: `0.925635`
- medium boxes: `0.640523`
- small boxes: `0.2`, but there are only `5` small GT boxes in val
- interior boxes: `0.893108`
- near-edge boxes: `0.925651`

So the hard regime is:

- dense medium-scale product facings
- especially `knekkebrod`

Not the main issue:

- true COCO-small objects
- edge truncation

## Where The Misses Are

Theme-level missed GT counts:

- `knekkebrod`: `335`
- `frokost`: `47`
- `varmedrikker`: `39`
- `other`: `32`
- `egg`: `9`

Top miss images are all `knekkebrod`:

- `304`
- `298`
- `305`
- `297`
- `308`
- `310`
- `303`
- `306`
- `317`
- `313`

This is useful because it narrows later detector choices:

- longer training first
- then heavier detector family if needed
- SAHI / tiling later, not first

## Strategic Decision

Freeze this read:

1. better detector weights are the next main priority
2. simple score / max-det tuning is secondary
3. `knekkebrod` dense shelves are the real detector stress test
4. do not escalate to OCR or classifier-fallback work before detector quality improves further

## Practical Detector Target

From `EXP-0012`:

- current detector-box oracle-class bound:
  - detection `AP50 0.689607`
  - classification `mAP50 0.890341`
  - hybrid `0.749827`

If post-detector classification stays in roughly that range, then detector `AP50` needs to move into about the mid-`0.7`s before the overall stack starts looking materially more competitive.

Useful rough target:

- hybrid `0.80` under a similar oracle-class regime needs detector `AP50` around `0.76`

That makes the next decision cleaner:

- if longer `YOLOv8n` training pushes well toward that band, keep iterating
- if it stalls far below it, escalate detector family sooner

## Relevant Artifacts

- `data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/eval-yolov8n-blocked-val-1ep-cpu-smoke/metrics.json`
- `data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/eval-yolov8n-blocked-val-1ep-cpu-smoke/error_summary.json`
- `data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/postprocess-sweep-yolov8n-blocked-val-1ep-cpu-smoke-small/sweep-summary.json`
- `data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/postprocess-sweep-yolov8n-blocked-val-1ep-cpu-smoke-small/sweep-results.csv`
