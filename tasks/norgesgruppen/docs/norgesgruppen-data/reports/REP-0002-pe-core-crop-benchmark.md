# REP-0002 PE-Core Crop Benchmark

## Scope

- `EXP-0003` GT-crop retrieval with `PE-Core`
- comparison against `EXP-0002` hash nearest-neighbor floor

## Bottom Line

`PE-Core` is a real step-change, not a marginal baseline improvement.

- strict top-1 `0.627952` vs hash floor `0.068176`
- strict top-5 `0.835159` vs hash floor `0.152666`
- strict top-10 `0.873387` vs hash floor `0.205016`
- strict `mAP@20` `0.721652` vs hash floor `0.108862`
- full top-1 overall `0.586058`
- full top-1 evaluable-only `0.613793`
- full evaluable fraction unchanged at `0.954814`

This means the crop-recognition lane is strongly viable on classes with usable references.

## What Matters

- strict slice is no longer weak:
  - top-1 `0.627952`
  - top-5 `0.835159`
  - `mAP@20` `0.721652`
- extended slice stays similar:
  - top-1 `0.61194`
  - top-5 `0.834858`
  - `mAP@20` `0.713077`
- full slice is capped by known reference gaps, not ranking failure:
  - evaluable fraction `0.954814`
  - unevaluable queries `199`

## Bucket Read

- strict theme top-1:
  - `egg` `0.643443`
  - `frokost` `0.739504`
  - `knekkebrod` `0.522353`
  - `other` `0.65873`
  - `varmedrikker` `0.683519`
- strict readiness top-1:
  - `exact_reference_high_view` `0.632023`
  - `exact_reference_medium_view` `0.684375`
  - `exact_reference_low_view` `0.536932`
- full readiness buckets:
  - `ambiguous_reference` `0.803922` top-1 on evaluable queries
  - `provisional_alias_reference` `0.319149` top-1
  - `missing_reference` `65` queries, `0` evaluable
  - `needs_manual_review` `9` queries, `0` evaluable
  - `sibling_variant_trap` `35` queries, `0` evaluable
  - `unknown_sentinel` `90` queries, `0` evaluable

## Main Error Pattern

Errors are mostly sibling or size variants, not generic collapse:

- `HAVRE KNEKKEBRØD 300G WASA` -> `HAVRE KNEKKEBRØD ØKONOMI 600G WASA` (`51`)
- `HUSMAN KNEKKEBRØD 260G WASA` -> `HUSMAN KNEKKEBRØD 520G WASA` (`45`)
- `GÅRDSEGG M/L 12STK ELDORADO` -> `EGG FRITTGÅENDE 18STK S/M FIRST PRICE` (`30`)
- `LEKSANDS KNEKKE RUTBIT 200G` -> `Leksands Rutbit` (`27`, extended/full)
- `MUSLI FRUKT 700G AXA` -> `MÜSLI FRUKT MÜSLI 700G AXA` (`20-25`, extended/full)

This is exactly the regime where OCR/text fusion or stronger reranking should help.

## Operational Read

- cold run is dominated by query embedding and takes minutes on CPU
- warm-cache rerun is about `13.99s` on CPU for the full `4404`-query blocked-val benchmark
- cache support is therefore mandatory for serious iteration

## Interpretation

- recognition is not the main blocker anymore for reference-safe classes
- localization now becomes a co-equal bottleneck for end-to-end performance
- OCR/fusion still matters because the remaining errors are mostly near-identical family variants
- unresolved full-slice mass is structural dataset/reference coverage, not something retrieval can solve alone

## Immediate Next Step

Run `EXP-0004` and compare `DINOv3` against this:

- if `DINOv3` beats `PE-Core`, promote it
- if `DINOv3` loses overall but fixes different sibling confusions, use it for fusion/reranking
- if `DINOv3` is clearly worse and non-complementary, move directly to `EXP-0005`
