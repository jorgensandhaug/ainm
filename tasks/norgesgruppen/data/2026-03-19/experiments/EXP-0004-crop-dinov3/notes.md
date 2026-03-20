# EXP-0004 crop-dinov3

## Metadata

- id: `EXP-0004`
- slug: `crop-dinov3`
- status: `completed`
- phase: `M1`
- priority: `4`

## Question

How strong is DINOv3 as a pure-vision retrieval embedder on GT crops?

## Prerequisites

- `EXP-0001`
- `EXP-0002`

## Success Gate

Either beats PE-Core on a meaningful slice or provides complementary confusion behavior worth fusion.

## Run Notes

- owner:
- code path:
- split: blocked validation GT crops
- slices: `strict`, `extended`, `full`
- gallery mode: `representative`
- seed: `20260320`
- required artifact:
  - `artifacts/rankings.json` with the same contract as `EXP-0003`
- canonical run command:
  - `PYTHONPATH=scripts ./scripts/run_norgesgruppen_crop_python.sh scripts/run_norgesgruppen_crop_retrieval.py --backend dinov3_timm --model-id convnext_large.dinov3_lvd1689m --output-dir data/2026-03-19/experiments/EXP-0004-crop-dinov3 --experiment-id EXP-0004 --label dinov3_convnext_large`
- comparison target:
  - must be compared against both `EXP-0002` floor and `EXP-0003`
  - transformer checkpoints may require HF-gated access; timm DINOv3 is the safer public route
- local smoke:
  - `artifacts/dinov3-timm-smoke/artifacts/run-manifest.json` already proves public timm DINOv3 boots on this machine
  - `dinov3_transformers` with `facebook/dinov3-vits16-pretrain-lvd1689m` hit HF gated-access `401` here

## Results

- primary metrics:
  - strict top-1 `0.246409`
  - strict top-5 `0.492087`
  - strict top-10 `0.618213`
  - strict `mAP@20` `0.360687`
  - full top-1 overall `0.228202`
  - full top-5 overall `0.463896`
  - full `mAP@20` `0.338021`
- bucketed metrics:
  - lost to `PE-Core` in every major slice and bucket
  - strict theme top-1 deltas vs `PE-Core`:
    - `egg` `-0.569673`
    - `frokost` `-0.36355`
    - `knekkebrod` `-0.349412`
    - `varmedrikker` `-0.404449`
  - strict readiness deltas vs `PE-Core`:
    - `exact_reference_high_view` `-0.392139`
    - `exact_reference_medium_view` `-0.390625`
    - `exact_reference_low_view` `-0.269887`
- key error read:
  - still shows sibling-variant confusion, but also broad cereal / knekkebrod mismatches
  - strict oracle union with `PE-Core` is only `0.661066`, about `+0.033114` over `PE-Core` alone
  - useful as a weak secondary signal at most, not as the primary embedder
- next action:
  - keep `PE-Core` as primary crop embedder
  - treat `DINOv3` as optional cheap rerank input only
  - move next effort toward `EXP-0005` OCR-first fusion or `EXP-0006` localization
