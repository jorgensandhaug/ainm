# DEC-0003 Keep PE-Core As Primary Crop Embedder

## Status

Accepted

## Date

`2026-03-20`

## Context

- `EXP-0003` showed `PE-Core` is strong on blocked-val GT crop retrieval:
  - strict top-1 `0.627952`
  - strict top-5 `0.835159`
  - strict `mAP@20` `0.721652`
- `EXP-0004` tested public timm `DINOv3` under the same runner and eval surface:
  - strict top-1 `0.246409`
  - strict top-5 `0.492087`
  - strict `mAP@20` `0.360687`
- `DINOv3` is worse in every major slice and bucket.
- `DINOv3` does add some non-overlapping wins, but the ceiling is limited:
  - strict top-1 oracle union of `PE-Core` + `DINOv3` is only `0.661066`
  - that is only about `+0.033114` over `PE-Core` alone

## Decision

- Keep `PE-Core` as the primary crop embedder.
- Do not spend more time on public timm `DINOv3` as a standalone primary retriever.
- Treat `DINOv3` as optional secondary signal only:
  - acceptable for a cheap rerank/fusion ablation
  - not acceptable as the main crop-recognition path
- Shift priority away from more pure-vision embedder comparisons and toward:
  - OCR/text fusion on top of `PE-Core`
  - class-agnostic localization baselines

## Why

- The gap is too large to justify promoting `DINOv3`.
- The non-overlapping win set is too small to justify heavy fusion investment by itself.
- The remaining `PE-Core` errors are mostly sibling/size/text-sensitive cases, which points more toward OCR than toward another pure-vision backbone.
- The project now has enough evidence that localization is a co-equal bottleneck.

## Consequences

- `EXP-0005` should be framed as `PE-Core + OCR`, with `DINOv3` only optional if fusion is cheap.
- `EXP-0006` and later localization work can proceed without waiting for more crop-embedder shootouts.
- If a stronger, accessible DINOv3 checkpoint appears later, it can be evaluated, but it should be treated as a new challenge run, not as the default path.
