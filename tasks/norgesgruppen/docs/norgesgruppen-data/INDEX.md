# NorgesGruppen Prep Index

This is the quick entrypoint for humans and agents.

## At A Glance

- Source payload date: `2026-03-19`
- COCO shape: `248` images, `22731` annotations, `356` categories
- Product refs: `329` metadata products, `344` directories on disk
- Category exact-match summary: `{'exact_unique_with_images': 319, 'exact_unique_no_images': 2, 'exact_name_ambiguous': 2, 'no_match': 33}`
- Classification readiness: `{'ambiguous_reference': 2, 'exact_reference_high_view': 234, 'exact_reference_low_view': 39, 'exact_reference_medium_view': 46, 'missing_reference': 22, 'needs_manual_review': 4, 'provisional_alias_reference': 2, 'sibling_variant_trap': 6, 'unknown_sentinel': 1}`
- Manual review decisions: `{'do_not_auto_map': 6, 'exact_name_ambiguous': 2, 'manual_review': 4, 'map_likely': 2, 'matched_no_packshot': 2, 'missing_ref_likely': 17, 'sentinel': 1, 'unreviewed': 322}`
- Image sampler buckets: `{'dense_standard': 41, 'problem_heavy': 112, 'rare_class_rich': 4, 'standard': 91}`
- Blocked dev split: `199` train / `49` val images
- GT crop manifest rows: `22731`

## Suggested Flow

1. Read this index.
2. Use the deep audit when you need proof or anomaly context.
3. Use the fast prep builder to refresh manifests.
4. Run the standalone verifier before trusting the prepared state.
5. Run the ML pipeline verifier before trusting current modeling conclusions.
6. Read the critical-path decision tree before starting new modeling work.
7. Read the classifier/fusion strategy before starting recognizer work.
8. Read the first classifier recipe before implementing EXP-0013.
9. Read the latest experiment report before starting new modeling work.
10. Read the crop runtime before starting PE-Core or DINOv3.
11. Extract GT crops only when you actually need them.

## Rerun

Heavy forensic audit:
- `python scripts/deep_audit_norgesgruppen_data.py`

Fast prep/manifests build:
- `python scripts/build_norgesgruppen_prep.py`

YOLO export build:
- `python scripts/export_norgesgruppen_yolo.py`
- `python scripts/export_norgesgruppen_yolo.py --class-agnostic`
- `python scripts/verify_norgesgruppen_yolo_export.py`
- `python scripts/verify_norgesgruppen_yolo_export.py --class-agnostic`

Prepared-artifact verification:
- `python scripts/verify_norgesgruppen_prep.py`
- `python scripts/verify_norgesgruppen_ml_pipeline.py`
- `python scripts/build_norgesgruppen_label_controls.py`

Crop floor benchmark:
- `python scripts/benchmark_norgesgruppen_crops.py`

CPU-friendly crop-classifier cache path:
- `./scripts/run_norgesgruppen_crop_python.sh scripts/cache_norgesgruppen_crop_classifier_embeddings.py --output-dir <dir>`
- `./scripts/run_norgesgruppen_crop_python.sh scripts/train_norgesgruppen_crop_classifier_cached.py --train-cache <train.pt> --val-cache <val.pt> --output-dir <dir>`

Optional GT crop extraction:
- `python scripts/extract_norgesgruppen_gt_crops.py --split val --limit 100`

## Core Docs

- Overview of task/docs drift: [README.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/README.md)
- Deep forensic audit: [deep-audit-summary.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/deep-audit-summary.md)
- EDA roadmap: [eda-workstreams.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/eda-workstreams.md)
- Unresolved class decisions: [unresolved-class-review.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/unresolved-class-review.md)
- Split/eval plan: [split-eval-plan.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/split-eval-plan.md)
- Modeling/validation plan: [modeling-experiment-plan.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/modeling-experiment-plan.md)
- ML verification playbook: [ml-verification-playbook.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/ml-verification-playbook.md)
- Execution roadmap: [PLAN-0001-roadmap-to-first-competitive-submission.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/plans/PLAN-0001-roadmap-to-first-competitive-submission.md)
- Immediate execution wave: [PLAN-0002-immediate-execution-wave.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/plans/PLAN-0002-immediate-execution-wave.md)
- Critical-path decision tree: [PLAN-0003-critical-path-and-decision-tree-after-preflight.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/plans/PLAN-0003-critical-path-and-decision-tree-after-preflight.md)
- Classifier/fusion strategy: [PLAN-0004-classifier-and-fusion-strategy.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/plans/PLAN-0004-classifier-and-fusion-strategy.md)
- First classifier recipe: [PLAN-0005-exp-0013a-first-classifier-recipe.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/plans/PLAN-0005-exp-0013a-first-classifier-recipe.md)
- Frozen validation decision: [DEC-0001-freeze-validation-surface.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/decisions/DEC-0001-freeze-validation-surface.md)
- Frozen crop-eval decision: [DEC-0002-freeze-crop-retrieval-eval-contract.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/decisions/DEC-0002-freeze-crop-retrieval-eval-contract.md)
- Primary crop-embedder decision: [DEC-0003-keep-pe-core-as-primary-crop-embedder.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/decisions/DEC-0003-keep-pe-core-as-primary-crop-embedder.md)
- Frozen ML verification gates: [DEC-0004-freeze-ml-verification-gates.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/decisions/DEC-0004-freeze-ml-verification-gates.md)
- Latest classifier-controls report: [REP-0010-first-classifier-controls.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/reports/REP-0010-first-classifier-controls.md)
- CPU-friendly classifier cache path: [cache_norgesgruppen_crop_classifier_embeddings.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/cache_norgesgruppen_crop_classifier_embeddings.py) and [train_norgesgruppen_crop_classifier_cached.py](/home/jorge/repos/ainm/tasks/norgesgruppen/scripts/train_norgesgruppen_crop_classifier_cached.py)
- Latest pipeline report: [REP-0009-first-det-plus-retrieval-baseline.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/reports/REP-0009-first-det-plus-retrieval-baseline.md)
- Crop retrieval runtime: [crop-retrieval-runtime.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/crop-retrieval-runtime.md)
- Detection runtime: [detection-runtime.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/detection-runtime.md)
- Operating structure: [project-operating-system.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/project-operating-system.md)
- Data dictionary: [data-dictionary.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/data-dictionary.md)
- Prep playbook: [prep-playbook.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/prep-playbook.md)

## Core Manifests

- Category manifest: [category-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/category-manifest.json)
- Category strategy manifest: [category-strategy-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/category-strategy-manifest.json)
- Crop-classifier summary: [summary.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/crop-classifier/summary.json)
- Crop-classifier category roles: [category-role-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/crop-classifier/category-role-manifest.json)
- Crop-classifier train manifest: [train-all.jsonl](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/crop-classifier/train-all.jsonl)
- Crop-classifier val manifest: [val-all.jsonl](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/crop-classifier/val-all.jsonl)
- Crop-classifier val zero-train support manifest: [val-zero-train-support.jsonl](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/crop-classifier/val-zero-train-support.jsonl)
- Image manifest: [image-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/image-manifest.json)
- Image sampling manifest: [image-sampling-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/image-sampling-manifest.json)
- Packshot manifest: [packshot-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/packshot-manifest.json)
- Problem-category manifest: [problem-category-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/problem-category-manifest.json)
- Training manifest: [training-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/training-manifest.json)
- Train COCO subset: [train.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/coco-splits/train.json)
- Val COCO subset: [val.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/coco-splits/val.json)
- GT crop summary: [gt-crop-summary.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/gt-crop-summary.json)
- GT crop manifest: [gt-crop-manifest.jsonl](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/gt-crop-manifest.jsonl)
- Prep verification summary: [prep-verification.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/prep-verification.json)
- ML pipeline verification summary: [ml-pipeline-verification.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/ml-pipeline-verification.json)
- Shuffled-label control summary: [summary.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/control-datasets/shuffled-label-control/summary.json)
- Prep overview: [prep-overview.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/prep-overview.json)
- Artifact index: [artifact-index.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/artifact-index.json)
- YOLO dataset yaml: [dataset.yaml](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo/dataset.yaml)
- YOLO export summary: [export-summary.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo/export-summary.json)
- YOLO export verification: [verification.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo/verification.json)
- YOLO class-agnostic yaml: [dataset.yaml](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo-class-agnostic/dataset.yaml)
- YOLO class-agnostic summary: [export-summary.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo-class-agnostic/export-summary.json)
- YOLO class-agnostic verification: [verification.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo-class-agnostic/verification.json)

## Key Policies

- Do not trust docs for category count/range or `annotations.json` field list; trust payload.
- Do not auto-map coffee-family sibling variants just because names are close.
- Treat egg tail as structurally under-covered by packshots.
- Use blocked section-aware validation, not random split.
