# EXP-0005 crop-fusion-and-ocr

## Metadata

- id: `EXP-0005`
- slug: `crop-fusion-and-ocr`
- status: `planned`
- phase: `M1`
- priority: `5`

## Question

Does fusion of the best visual retriever plus OCR materially reduce sibling-SKU confusion?

## Prerequisites

- `EXP-0003`
- `EXP-0004`

## Success Gate

Improves strict-slice recognition and sibling-heavy / low-view buckets without hurting overall calibration.

## Run Notes

- owner:
- code path:
- split:
- slices:
- seed:
- starting point:
  - use `PE-Core` as the anchor visual retriever
  - do not assume `DINOv3` visual fusion is worth much by itself
  - strict oracle union of `PE-Core` + `DINOv3` top-1 is only `0.661066`
- intended shape:
  - OCR/text features should target sibling, size, flavor, and typography-sensitive confusions
  - if `DINOv3` is included at all, keep it as a cheap secondary rerank signal

## Results

- primary metrics:
- bucketed metrics:
- key error read:
- next action:
