# Split And Eval Plan

Purpose: define development evaluation that respects the verified shelf-order structure.

## Why Random Split Is Bad Here

- Image order is not arbitrary. Best contiguous segmentation is strongly `varmedrikker -> egg -> frokost -> knekkebrod`.
- Boundary transitions `66->71`, `111->114`, `243->244` all have consecutive-category Jaccard `0.0`.
- Random splitting would mix near-identical section context across train/val and hide section-specific failure modes.

## Recommended Primary Dev Split

Use a blocked mid-segment validation slice from each inferred section. This keeps every section in validation while still preserving local continuity.

Total:

- train images: `199`
- val images: `49`

Validation image ids by segment:

- `varmedrikker`: `23, 25, 26, 27, 29, 31, 32, 33, 34`
- `egg`: `85, 86, 88, 89, 93, 94`
- `frokost`: `160, 161, 163, 167, 168, 169, 170, 173, 175, 177, 178, 183, 184, 186, 192, 193`
- `knekkebrod`: `297, 298, 299, 300, 302, 303, 304, 305, 306, 308, 310, 311, 313, 315, 316, 317, 319, 320`

Validation annotation mix from those blocked slices:

| segment | val imgs | val anns | dominant-theme purity |
|---|---:|---:|---:|
| `varmedrikker` | `9` | `950` | `0.8411` |
| `egg` | `6` | `315` | `0.8635` |
| `frokost` | `16` | `952` | `0.8456` |
| `knekkebrod` | `18` | `2187` | `0.8203` |

This is not perfectly pure, which is good. It still reflects real shelf transitions and mixed-border images.

## Secondary Stress Tests

### 1. Leave-One-Section-Out

Use each contiguous section as a full holdout once:

- hold out `1..66` for `varmedrikker`
- hold out `71..111` for `egg`
- hold out `114..243` for `frokost`
- hold out `244..382` for `knekkebrod`

Use this as robustness testing, not as the only model-selection metric.

### 2. Detection vs Classification Decoupling

Run three evaluation slices:

- full validation score
- detection-only score
- classification-on-matched-packshot classes only

Reason: classification weakness is concentrated in missing refs, ambiguous names, `unknown_product`, and low-view packshots.

### 3. Packshot-Richness Buckets

Track classification separately on:

- exact-unique matched classes with `>=5` views
- exact-unique matched classes with `<=2` views
- no-packshot / unresolved classes

This matters because low-view burden is very uneven by theme, especially `egg`.

## Theme Risk Summary

| theme | exact unique coverage | hard unmatched frac | low-view frac of covered exact mass | read |
|---|---:|---:|---:|---|
| `varmedrikker` | `0.9491` | `0.0101` | `0.0757` | good coverage; some coffee-family naming drift |
| `egg` | `0.8412` | `0.1588` | `0.4872` | weakest theme by far |
| `frokost` | `0.9956` | `0.0020` | `0.1448` | strongest coverage overall |
| `knekkebrod` | `0.9526` | `0.0173` | `0.0193` | strong coverage; one major ambiguity (`RISKAKER`) |
| `other` | `0.5606` | `0.4378` | `0.0163` | heterogeneous bucket, not a coherent section |

## Minimum Metrics To Log

- overall hybrid score proxy
- detection-only mAP proxy
- classification-only mAP proxy
- per-theme detection/classification
- performance on `unknown_product`
- performance on unresolved / no-packshot classes
- performance on low-view exact-match classes

## Practical Recommendation

- Use the blocked `49`-image split for day-to-day iteration.
- Use leave-one-section-out as a stress suite before trusting a submission.
- Do not interpret one aggregate validation score as “dataset solved”; `egg` and unresolved classes can still be failing badly while the blended average looks acceptable.
