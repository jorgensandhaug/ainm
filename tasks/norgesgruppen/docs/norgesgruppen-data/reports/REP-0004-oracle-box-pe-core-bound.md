# REP-0004 Oracle-Box PE-Core Bound

## Scope

- `EXP-0011`
- end-to-end image-level bound using:
  - perfect GT boxes
  - `EXP-0003` `PE-Core` top-1 category predictions
  - real cache-derived similarity scores

## Bottom Line

Current `PE-Core` retrieval plus perfect localization yields:

- detection `AP50` ignore-class `1.0`
- classification `mAP50` `0.534127`
- hybrid proxy `0.860238`

This is a strong upper bound for the current retrieval-only recognizer.

It proves two things at once:

- localization is now worth serious effort
- retrieval alone is not the final recognizer

## Why This Matters

The competition proxy is:

- `0.7 * detection + 0.3 * classification`

Under perfect localization, the current recognizer captures:

- full detection tranche: `0.7`
- classification tranche contribution: `0.160238`

That means current retrieval is already converting about `53.4%` of the available classification tranche on the real image-level metric.

So detector work is justified.

But it also means retrieval-only still leaves too much classification value on the table.

## What The Bound Says About Bottlenecks

### Localization Is A Real Bottleneck

Because even the current recognizer is already capable of an `0.860238` hybrid if boxes are perfect.

So we should stop acting as if recognition quality alone is the dominant near-term blocker.

### Retrieval-Only Recognition Is Structurally Incomplete

The zero buckets are the real story:

- `missing_reference` classification `mAP50` `0.0`
- `needs_manual_review` `0.0`
- `sibling_variant_trap` `0.0`
- `unknown_sentinel` `0.0`

This is not normal model noise.

This is a structural limit of packshot-driven retrieval on this dataset.

## Bucket Read

### By Image Theme

- `egg` hybrid `0.80468`
- `knekkebrod` hybrid `0.838295`
- `frokost` hybrid `0.877194`
- `varmedrikker` hybrid `0.875461`

The upper bound is weakest exactly where we expected:

- egg
- knekkebrod variant families

### By Readiness Bucket

- `exact_reference_high_view` classification `mAP50` `0.591159`
- `exact_reference_medium_view` `0.569069`
- `exact_reference_low_view` `0.457195`
- `missing_reference` `0.0`
- `provisional_alias_reference` `0.129385`
- `sibling_variant_trap` `0.0`
- `unknown_sentinel` `0.0`

This is the clearest evidence so far that the next recognition experiment should be a shelf-crop classifier, not another retrieval embedder.

## Error Pattern

The top confusions are still highly structured:

- `HAVRE KNEKKEBRØD 300G WASA` -> `HAVRE KNEKKEBRØD ØKONOMI 600G WASA`
- `HUSMAN KNEKKEBRØD 260G WASA` -> `HUSMAN KNEKKEBRØD 520G WASA`
- `GÅRDSEGG M/L 12STK ELDORADO` -> egg-family sibling variants
- `LEKSANDS KNEKKE RUTBIT 200G` -> `Leksands Rutbit`
- `SJOKORINGER 375G ELDORADO` -> empty-name class id `300`
- `MUSLI FRUKT 700G AXA` -> `MÜSLI FRUKT MÜSLI 700G AXA`

This supports:

- classifier fallback
- unknown calibration

It does not yet force OCR.

## Confidence Read

The bound used real cache-derived cosine scores, not fake flat confidences.

Important read:

- top-1 score median `0.842936` after `[−1, 1] -> [0, 1]` rescaling
- raw top-1 cosine median `0.685872`
- raw top-1 margin median only `0.027919`
- p10 margin only `0.003153`

So rankings are often plausible but not decisively separated.

That is another argument for:

- classifier fusion
- abstain / unknown calibration

before committing to OCR complexity.

## Interpretation

The best next path is now clearer:

1. finish `EXP-0006` and get the first real localization baseline
2. run the detector-box + oracle-class bound after that
3. add a shelf-crop closed-set classifier
4. build detector + retrieval + classifier fallback
5. only then decide whether OCR still earns its cost

## Practical Decision

Do not spend the next cycle on:

- another pure retrieval embedder
- OCR-first work
- heavy detector families before a cheap detector baseline exists

Do spend the next cycle on:

- `EXP-0006`
- closed-set crop classification
- pipeline fusion logic
