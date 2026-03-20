# EXP-0014 pipe-det-retrieval-plus-classifier

## Metadata

- id: `EXP-0014`
- slug: `pipe-det-retrieval-plus-classifier`
- status: `planned`
- phase: `M3`
- priority: `9`

## Question

Does detector plus retrieval plus classifier fallback materially beat retrieval-only end-to-end and become the first serious submission candidate?

## Prerequisites

- `EXP-0006`
- `EXP-0013`

## Success Gate

Beats the detector-plus-retrieval stack on hybrid proxy and specifically fixes structural full-slice failures without unacceptable complexity.

## Run Notes

- owner:
- code path:
  - planned:
    - `scripts/run_norgesgruppen_det_plus_retrieval.py`
    - `scripts/train_norgesgruppen_crop_classifier.py`
    - `scripts/run_norgesgruppen_det_retrieval_plus_classifier.py`
    - `scripts/eval_norgesgruppen_predictions.py`
- split:
  - blocked val
- slices:
  - full hybrid proxy
  - `egg`
  - `knekkebrod`
  - `missing_reference`
  - `unknown_sentinel`
  - `sibling_variant_trap`
  - exact-reference-high-view shadow slice
- seed:
  - inherit detector anchor
  - first classifier seed from `EXP-0013`
- frozen baselines to beat:
  - raw detector + retrieval hybrid `0.693615`
  - score-fused detector + retrieval hybrid `0.717616`
- hard architecture constraint:
  - retrieval must remain live because some val classes have zero train crops but do have packshots
  - classifier cannot be the only recognizer
- first fusion rules to test:
  - retrieval always
  - retrieval with score fusion
  - classifier-only shadow read
  - weighted retrieval + classifier fusion
  - classifier fallback when retrieval margin is low
  - classifier upweighting when retrieval top-1 is in structurally weak buckets
  - category-availability routing:
    - retrieval-dominant for no-train classes
    - classifier-dominant for no-ref classes
- optional soft priors:
  - theme prior may help
  - do not hard-gate by theme; shelves are mixed enough to make that risky
- promotion rule:
  - beat the score-fused retrieval baseline, not only the raw retrieval baseline
  - fix structural buckets without collapsing reference-safe slices

## Results

- primary metrics:
- bucketed metrics:
- key error read:
- next action:
