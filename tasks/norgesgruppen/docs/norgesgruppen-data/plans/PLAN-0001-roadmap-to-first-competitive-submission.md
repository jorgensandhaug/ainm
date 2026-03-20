# PLAN-0001 Roadmap To First Competitive Submission

## Metadata

- id: `PLAN-0001`
- status: active
- date: `2026-03-20`
- scope: get from prepared data understanding to a first serious submission path without losing rigor

## End Goal

Reach a competitive submission through the shortest path that is still technically defensible.

That means:

- trustworthy validation first
- fast baseline second
- high-ceiling research third
- submission hardening throughout

## Main Strategic Bet

Primary working hypothesis:

- dense class-agnostic localization
- crop-level SKU retrieval
- OCR/text fusion
- calibrated end-to-end fusion

Not the first bet:

- monolithic `356`-class detector as the main system

Reason:

- tiny image count
- dense shelves
- long tail
- sibling-SKU confusion
- incomplete / ambiguous reference coverage

## Parallel Tracks

### Track A: Evaluation And Infrastructure

Goal:

- make every later result trustworthy and easy to continue

Deliverables:

- local competition-proxy scorer
- GT-crop benchmark harness
- experiment registry discipline
- standard error reports

### Track B: Recognition

Goal:

- determine whether SKU identity is tractable on GT crops

Deliverables:

- simple retrieval floor
- `PE-Core`
- `DINOv3`
- fusion / rerank
- OCR fusion

### Track C: Localization

Goal:

- maximize dense shelf localization independent of SKU identity

Deliverables:

- class-agnostic `YOLOv8`
- class-agnostic `RF-DETR`
- stronger `Co-DETR`/`Co-DINO` only after baselines are stable
- `SAHI` ablations

### Track D: Submissionization

Goal:

- keep a deployable sandbox-compatible line alive at all times

Deliverables:

- runnable local `run.py` path
- weight-size / latency checks
- ONNX or pinned-framework export path

## Milestones

## M0: Frozen Measurement

Objective:

- no serious experiment starts before measurement is stable

Required outputs:

- [DEC-0001-freeze-validation-surface.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/decisions/DEC-0001-freeze-validation-surface.md)
- local evaluation harness
- bucketed reporting

Exit criteria:

- blocked split reproduced exactly
- strict / extended / full recognition slices implemented
- one run can emit scalar + bucket metrics + error summary

## M1: Recognition Bottleneck Test

Objective:

- answer whether identity or localization is the real bottleneck

Required outputs:

- `EXP-0002` through `EXP-0005` from registry

Exit criteria:

- best GT-crop recognizer identified
- strict-slice performance understood
- low-view / sibling / missing-ref failure modes documented

Decision point:

- if strict-slice recognition is weak, prioritize Track B
- if strict-slice recognition is strong, prioritize Track C

## M2: First Strong Localizer

Objective:

- establish a serious class-agnostic shelf detector

Required outputs:

- `YOLOv8` class-agnostic baseline
- `RF-DETR` class-agnostic baseline

Exit criteria:

- best practical detector chosen
- duplicate/miss/count tradeoffs understood
- `AP50` ignore-class and count `MAE` stable enough to compare pipelines

## M3: First End-To-End Stack

Objective:

- prove the decomposition strategy beats naive closed-set baselines

Required outputs:

- detector + retrieval
- detector + retrieval + OCR
- basic abstain / `unknown_product` policy

Exit criteria:

- hybrid proxy beats simple monolithic baseline
- no catastrophic collapse in `egg`, low-view, or `problem_heavy` buckets

## M4: Research Ceiling Push

Objective:

- only after M1-M3, test heavier models if they target known bottlenecks

Candidate work:

- `Co-DETR` / `Co-DINO`
- `SAHI`
- `Grounding DINO`
- `T-Rex2`
- stronger OCR fusion
- pseudo-label / refinement loops

Exit criteria:

- any added complexity must fix a measured bottleneck

## M5: Submission Hardening

Objective:

- convert best stack into something actually uploadable

Required outputs:

- final inference graph / weights
- sandbox-compatible package choices
- runtime benchmark
- size benchmark
- local dry-run equivalent

Exit criteria:

- fits `300s`
- fits `420 MB`
- no forbidden runtime dependencies

## Immediate Next Actions

Highest-value next sequence:

1. `EXP-0002-crop-random-and-nearest-neighbor-floor`
2. `EXP-0003-crop-pe-core`
3. `EXP-0004-crop-dinov3`
4. `EXP-0006-det-yolov8-class-agnostic`
5. `EXP-0008-pipe-det-plus-retrieval`

This sequence tells us fastest whether we are blocked by recognition or localization.

## Kill Rules

Stop or pause work if:

- validation surface is changing midstream
- a method fails overfit sanity
- gains appear only in micro averages
- complexity increases without bucket-level gains
- a method cannot plausibly reach submission constraints and is not teaching us anything new

## What Future Agents Should Not Re-Decide

- the blocked primary dev split
- the need for bucketed metrics
- the need to separate GT-crop recognition from localization
- the need to keep a submission-friendly track alive

Those are already part of the operating system now.
