# REP-0003 Crop Embedder Comparison

## Scope

- `EXP-0003` `PE-Core`
- `EXP-0004` public timm `DINOv3`
- same blocked-val GT crop surface
- same gallery mode
- same retrieval runner

## Bottom Line

`PE-Core` wins clearly.

- strict top-1:
  - `PE-Core` `0.627952`
  - `DINOv3` `0.246409`
  - delta `-0.381543`
- strict top-5:
  - `PE-Core` `0.835159`
  - `DINOv3` `0.492087`
  - delta `-0.343072`
- strict `mAP@20`:
  - `PE-Core` `0.721652`
  - `DINOv3` `0.360687`
  - delta `-0.360965`

`DINOv3` is not competitive as the primary crop embedder in this setup.

## Slice Summary

- extended top-1:
  - `PE-Core` `0.61194`
  - `DINOv3` `0.239769`
- full top-1 overall:
  - `PE-Core` `0.586058`
  - `DINOv3` `0.228202`
- full top-1 evaluable-only:
  - `PE-Core` `0.613793`
  - `DINOv3` `0.238049`

## Bucket Read

`DINOv3` loses everywhere important.

- strict theme delta, `DINOv3 - PE-Core`:
  - `egg` `-0.569673`
  - `frokost` `-0.36355`
  - `knekkebrod` `-0.349412`
  - `other` `-0.420635`
  - `varmedrikker` `-0.404449`
- strict readiness delta:
  - `exact_reference_high_view` `-0.392139`
  - `exact_reference_medium_view` `-0.390625`
  - `exact_reference_low_view` `-0.269887`

## Complementarity Read

`DINOv3` is not useless, but its unique win set is small.

- strict per-query top-1 overlap:
  - both correct `876`
  - `PE-Core` only `1703`
  - `DINOv3` only `136`
  - both wrong `1392`
- strict oracle union top-1 is `0.661066`
  - only about `+0.033114` over `PE-Core` alone

That means any fusion with `DINOv3` needs to be extremely cheap to justify itself.

## Error Shape

`DINOv3` still shows the same general family-variant pain, but also adds broad cereal/knakekebrod confusion:

- `CHEERIOS MULTI 375G NESTLE` -> `GRANOLA CRAZELNUT 500G START!` (`31`)
- `LEKSANDS KNEKKE FIBERBIT 240G` -> `LEKSANDS TREKANT HAVRE 200G` (`30`)
- `CHEERIOS HAVRE 375G NESTLE` -> `GRANOLA CRAZELNUT 500G START!` (`25`)
- `KNEKKEBRØD 100 FRØ&HAVSALT 245G WASA` -> `EARL GREY TEA ØKOLOGISK 15POS JACOBS` (`25`)

Compared with `PE-Core`, this looks less product-specific and less robust.

## Decision Read

- promote `PE-Core`
- demote public timm `DINOv3`
- do not spend more time on pure-vision embedder shootouts right now
- move next effort toward:
  - `PE-Core + OCR`
  - class-agnostic localization

## Immediate Next Step

Treat `EXP-0005` as an OCR-first follow-up, not a large visual-fusion project.
