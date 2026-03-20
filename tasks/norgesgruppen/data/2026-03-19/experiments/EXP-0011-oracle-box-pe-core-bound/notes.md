# EXP-0011 oracle-box-pe-core-bound

## Metadata

- id: `EXP-0011`
- slug: `oracle-box-pe-core-bound`
- status: `completed`
- phase: `M1`
- priority: `5`

## Question

What end-to-end competition-proxy score does current `PE-Core` retrieval reach if localization is perfect?

## Prerequisites

- `EXP-0001`
- `EXP-0003`

## Success Gate

Produce a trustworthy image-level upper bound using real PE-Core rankings, real cached similarity scores, and exact GT boxes.

## Run Notes

- owner:
- code path:
  - `scripts/eval_norgesgruppen_oracle_box_bound.py`
- split:
  - blocked val
- recognizer source:
  - `EXP-0003` `PE-Core`
- score source:
  - cache-derived cosine similarity, rescaled to `[0, 1]`
- canonical command:
  - `PYTHONPATH=scripts ./scripts/run_norgesgruppen_crop_python.sh scripts/eval_norgesgruppen_oracle_box_bound.py --rankings data/2026-03-19/experiments/EXP-0003-crop-pe-core/artifacts/rankings.json --query-cache data/2026-03-19/experiments/EXP-0003-crop-pe-core/artifacts/cache/queries-pe_core_openclip-hf-hub-timm-pe-core-b-16-representative-padpx0-padfrac0.0-all.cache --gallery-cache data/2026-03-19/experiments/EXP-0003-crop-pe-core/artifacts/cache/gallery-pe_core_openclip-hf-hub-timm-pe-core-b-16-representative.cache --gallery-json data/2026-03-19/experiments/EXP-0003-crop-pe-core/artifacts/gallery-full.json --output-dir data/2026-03-19/experiments/EXP-0011-oracle-box-pe-core-bound/artifacts/oracle-box-pe-core`

## Results

- primary metrics:
  - detection `AP50` ignore-class `1.0`
  - classification `mAP50` `0.534127`
  - hybrid proxy `0.860238`
  - count `MAE` `0`
- bucketed metrics:
  - image-theme hybrid:
    - `egg` `0.80468`
    - `knekkebrod` `0.838295`
    - `frokost` `0.877194`
    - `varmedrikker` `0.875461`
  - readiness-bucket classification:
    - `exact_reference_high_view` `0.591159`
    - `exact_reference_low_view` `0.457195`
    - `missing_reference` `0.0`
    - `sibling_variant_trap` `0.0`
    - `unknown_sentinel` `0.0`
- key error read:
  - pure retrieval is already good enough to make localization worth serious work
  - pure retrieval is not enough as the final recognizer because no-ref, sibling-trap, and `unknown_product` buckets are still dead
  - confusion mass is still dominated by size/variant families: WASA, HUSMAN, egg variants, Leksands, AXA alias pairs
  - score margins are not huge:
    - raw top-1 cosine margin median `0.027919`
    - p10 `0.003153`
- next action:
  - finish `EXP-0006`
  - then run a shelf-crop closed-set classifier baseline before OCR
