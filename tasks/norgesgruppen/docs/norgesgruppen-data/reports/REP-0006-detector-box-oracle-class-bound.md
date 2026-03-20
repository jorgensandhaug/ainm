# REP-0006 Detector-Box Oracle-Class Bound

## Scope

- `EXP-0012`
- use the first real detector checkpoint from `EXP-0006`
- relabel its saved predictions with oracle GT categories
- score on the frozen image-level competition proxy

## Bottom Line

Current detector boxes, with oracle-perfect categories, reach:

- detection `AP50` ignore-class `0.689607`
- classification `mAP50` `0.890341`
- hybrid proxy `0.749827`

That is the important number.

It means the current detector is now the larger immediate bottleneck than recognition.

## Why This Changes Priorities

We already had:

- perfect boxes + current `PE-Core` -> hybrid `0.860238`

Now we have:

- current detector + perfect categories -> hybrid `0.749827`

So the current detector is leaving about:

- `0.110411` hybrid

on the table relative to the already-achieved perfect-box retrieval bound.

That is too much to ignore.

Right now, more detector quality is worth more than OCR work and probably worth more than classifier-fallback work in the immediate next cycle.

## What This Bound Is Actually Saying

This is not a full pipeline result.

It is a localization ceiling for the current detector:

- if every detector box were labeled with the best possible category
- with the same boxes and same scores

So any real recognizer attached to this detector can only do worse than `0.749827`.

## Theme Read

By image theme:

- `egg` hybrid `0.874608`
- `frokost` `0.850075`
- `varmedrikker` `0.856754`
- `knekkebrod` `0.658821`
- `other` `0.646954`

This makes the detector problem more specific:

- `knekkebrod` is the main localization pain point
- the simpler shelf regimes are already much healthier

## Detector Noise Read

Current detector prediction mass:

- matched true positives `3942`
- duplicate / overlap predictions `2574`
- background predictions `8184`

So the current detector is not failing only by recall.

It is also carrying:

- too many duplicate boxes
- too many background boxes

That is exactly where longer training plus threshold / NMS / calibration work should pay off.

## Recognition Buckets Under Oracle Labels

These become mostly healthy:

- `missing_reference` `0.957685`
- `sibling_variant_trap` `0.97784`
- `unknown_sentinel` `0.832189`

Interpretation:

- those buckets are not localization-impossible
- they are recognizer-side problems once the object is found

But they are not the immediate biggest system bottleneck anymore.

The current bigger bottleneck is still detector quality.

## Practical Decision

Next cycle should prioritize:

1. longer real `YOLOv8n` training
2. detector score cleanup:
   - confidence threshold
   - NMS / max-det behavior
   - calibration
3. rerun this oracle-class bound on the improved detector
4. only then decide how urgent closed-set classifier work is

Do not spend the next cycle first on:

- OCR
- another retrieval embedder
- classifier-first work without improving the detector
