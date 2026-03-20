# Prep Playbook

This is the practical operating guide for rerunning prep and understanding which artifact to trust for which question.

## Canonical Sequence

1. `python scripts/build_norgesgruppen_prep.py`
2. `python scripts/verify_norgesgruppen_prep.py`
3. `python scripts/verify_norgesgruppen_ml_pipeline.py`
4. `python scripts/export_norgesgruppen_yolo.py`
5. `python scripts/verify_norgesgruppen_yolo_export.py` when you need proof that the multiclass YOLO export still matches COCO exactly
6. `python scripts/export_norgesgruppen_yolo.py --class-agnostic` when starting localization baselines
7. `python scripts/verify_norgesgruppen_yolo_export.py --class-agnostic` when you need proof that the class-agnostic YOLO export is still exact
8. `python scripts/benchmark_norgesgruppen_crops.py` when you need the current crop floor
9. `python scripts/extract_norgesgruppen_gt_crops.py --split val --limit 100` only when you need actual crops on disk

## What Is Canonical

- Payload truth: [annotations.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/extracted/coco/train/annotations.json) and [metadata.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/extracted/product_images/metadata.json)
- Proof/anomaly source: [deep-audit-summary.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/deep-audit-summary.md)
- Fast prep truth: [prep-overview.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/prep-overview.json) plus the manifests under [derived](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived)
- Split truth: [training-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/training-manifest.json)
- YOLO export truth: [verification.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo/verification.json) and [verification.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo-class-agnostic/verification.json) once exports exist
- Category readiness truth: [category-strategy-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/category-strategy-manifest.json)
- Image sampling truth: [image-sampling-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/image-sampling-manifest.json)
- Experiment/validation order: [modeling-experiment-plan.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/modeling-experiment-plan.md)
- ML verification doctrine: [ml-verification-playbook.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/ml-verification-playbook.md)
- Critical-path next-step logic: [PLAN-0003-critical-path-and-decision-tree-after-preflight.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/plans/PLAN-0003-critical-path-and-decision-tree-after-preflight.md)
- Classifier/fusion next-step logic: [PLAN-0004-classifier-and-fusion-strategy.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/plans/PLAN-0004-classifier-and-fusion-strategy.md)
- Latest experiment report: [REP-0009-first-det-plus-retrieval-baseline.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/reports/REP-0009-first-det-plus-retrieval-baseline.md)
- Primary crop-embedder decision: [DEC-0003-keep-pe-core-as-primary-crop-embedder.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/decisions/DEC-0003-keep-pe-core-as-primary-crop-embedder.md)
- Frozen ML verification gates: [DEC-0004-freeze-ml-verification-gates.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/decisions/DEC-0004-freeze-ml-verification-gates.md)
- Crop runtime / commands: [crop-retrieval-runtime.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/crop-retrieval-runtime.md)
- Detection runtime / commands: [detection-runtime.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/detection-runtime.md)
- Documentation / experiment structure: [project-operating-system.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/project-operating-system.md)

## Current Locked Facts

- COCO payload: `248` images, `22731` annotations, `356` categories
- Product refs: `329` metadata rows, `344` on-disk directories, `17` `CUSTOM_*` directories
- Blocked split: `199` train / `49` val
- Problem categories: `37`
- Classification readiness buckets: `{'ambiguous_reference': 2, 'exact_reference_high_view': 234, 'exact_reference_low_view': 39, 'exact_reference_medium_view': 46, 'missing_reference': 22, 'needs_manual_review': 4, 'provisional_alias_reference': 2, 'sibling_variant_trap': 6, 'unknown_sentinel': 1}`

## Training Implications

- Use the blocked section-aware split, not random split.
- Treat `category-strategy-manifest.json` as the first filter for which classes are safe for packshot-driven classification.
- Treat `image-sampling-manifest.json` as a starting point for curriculum or weighted image sampling, not as a hard rule.
- Treat `unknown_product` as a real sentinel class; never collapse it into a concrete SKU.
- Treat coffee-family near-matches as dangerous sibling traps unless manually cleared.

## Minimal Files To Hand Another Agent

- [INDEX.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/INDEX.md)
- [deep-audit-summary.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/deep-audit-summary.md)
- [ml-verification-playbook.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/ml-verification-playbook.md)
- [REP-0009-first-det-plus-retrieval-baseline.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/reports/REP-0009-first-det-plus-retrieval-baseline.md)
- [category-strategy-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/category-strategy-manifest.json)
- [image-sampling-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/image-sampling-manifest.json)
- [training-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/training-manifest.json)
- [experiment-registry.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/experiments/experiment-registry.json)
- [manual-review-decisions.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/manual-review-decisions.json)

## Heuristic Notes

- `heuristic_detection_weight` is inverse-sqrt frequency, capped, and meant as a safe baseline only.
- `heuristic_sampler_weight` is conservative on purpose; it nudges toward rare/problem-rich images without exploding density bias.

