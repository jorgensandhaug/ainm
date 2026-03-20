# DEC-0001 Freeze Validation Surface

## Metadata

- id: `DEC-0001`
- status: accepted
- date: `2026-03-20`
- owners: dataset-prep / modeling

## Decision

Freeze the development validation surface as follows:

- primary dev split: blocked section-aware `199` train / `49` val split
- stress suites: leave-one-section-out, per-theme, readiness buckets, image difficulty buckets
- recognition slices: strict, extended, full
- primary metrics:
  - localization: class-agnostic `AP50`, miss rate, duplicate-box rate, count `MAE`
  - recognition: GT-crop top-1, `Recall@1/5/10`, `mAP@20`, macro top-1
  - end-to-end: hybrid competition proxy `0.7 * det_AP50_ignore_class + 0.3 * cls_AP50_match_class`
- promotion rule: no model is promoted on a single scalar alone

## Context

This dataset has:

- contiguous section structure
- dense small objects
- severe long tail
- concentrated classification risk in `egg`, low-view refs, missing refs, sibling traps, and `unknown_product`

A random split or single aggregate metric would produce misleading conclusions.

## Evidence

Primary evidence:

- [deep-audit-summary.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/deep-audit-summary.md)
- [split-eval-plan.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/split-eval-plan.md)
- [modeling-experiment-plan.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/modeling-experiment-plan.md)
- [training-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/training-manifest.json)
- [category-strategy-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/category-strategy-manifest.json)
- [image-sampling-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/image-sampling-manifest.json)

## Consequences

This enables:

- comparable experiments across agents
- bucket-aware progress tracking
- faster diagnosis of whether recognition or localization is the bottleneck

This rules out:

- ad hoc random validation
- silent metric changes
- promoting models only on micro-average gains

## Implementation Requirements

Every serious experiment must record:

- split used
- slices used
- primary metrics
- bucketed metrics
- brief error review

Any result missing these is non-canonical.

## Supersedes / Superseded By

- supersedes: none
- superseded by: none
