# EXP-0012 det-box-oracle-class-bound

## Metadata

- id: `EXP-0012`
- slug: `det-box-oracle-class-bound`
- status: `completed`
- phase: `M2`
- priority: `7`

## Question

How far can the first real detector carry the hybrid score if classification after detection were perfect?

## Prerequisites

- `EXP-0001`
- `EXP-0006`

## Success Gate

Produce a trustworthy localization upper bound that isolates post-detector recognition headroom from detector recall limits.

## Run Notes

- owner:
- code path:
  - `scripts/eval_norgesgruppen_oracle_class_bound.py`
- split:
  - blocked val
- source detector:
  - `EXP-0006`
  - initial read: `yolov8n-blocked-val-1ep-cpu-smoke`
  - latest canonical rerun: `yolov8n-blocked-val-10ep-cpu-baseline`
- canonical command:
  - `PYTHONPATH=scripts python scripts/eval_norgesgruppen_oracle_class_bound.py --predictions data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/yolov8n-blocked-val-1ep-cpu-smoke-predict/predictions.json --output-dir data/2026-03-19/experiments/EXP-0012-det-box-oracle-class-bound/artifacts/yolov8n-blocked-val-1ep-cpu-smoke-oracle-class`
  - `PYTHONPATH=scripts python scripts/eval_norgesgruppen_oracle_class_bound.py --predictions data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/yolov8n-blocked-val-10ep-cpu-baseline-predict/predictions.json --output-dir data/2026-03-19/experiments/EXP-0006-det-yolov8-class-agnostic/artifacts/oracle-class-yolov8n-blocked-val-10ep-cpu-baseline`

## Results

- primary metrics:
  - initial smoke read:
    - detection `AP50` ignore-class `0.689607`
    - classification `mAP50` `0.890341`
    - hybrid proxy `0.749827`
  - latest canonical read on the `10`-epoch detector:
    - detection `AP50` ignore-class `0.852028`
    - classification `mAP50` `0.942574`
    - hybrid proxy `0.879192`
- bucketed metrics:
  - image-theme hybrid on the latest canonical detector:
    - `egg` `0.938241`
    - `frokost` `0.933357`
    - `varmedrikker` `0.927088`
    - `knekkebrod` `0.825449`
    - `other` `0.719209`
- key error read:
  - the old `1`-epoch read said detector quality was clearly the larger immediate bottleneck
  - the new `10`-epoch read changes that:
    - detector-box oracle-class hybrid `0.879192` is now above perfect-box `PE-Core` hybrid `0.860238`
    - so localization is no longer obviously the single largest remaining limiter
  - detector output is still noisy even after the stronger run:
    - `4190` matched TPs
    - `1950` duplicate/overlap predictions
    - `8560` background predictions
  - `knekkebrod` remains the hardest localization regime
- next action:
  - keep the stronger detector as the baseline localization anchor
  - move to the first real detector + recognizer pipeline
  - keep calibration as a secondary cheap lever
  - re-evaluate detector-family escalation only if the real pipeline still looks detector-limited
