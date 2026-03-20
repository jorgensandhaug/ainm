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
5. Read the latest experiment report before starting new modeling work.
6. Read the crop runtime before starting PE-Core or DINOv3.
7. Extract GT crops only when you actually need them.

## Rerun

Heavy forensic audit:
- `python scripts/deep_audit_norgesgruppen_data.py`

Fast prep/manifests build:
- `python scripts/build_norgesgruppen_prep.py`

YOLO export build:
- `python scripts/export_norgesgruppen_yolo.py`
- `python scripts/export_norgesgruppen_yolo.py --class-agnostic`

Prepared-artifact verification:
- `python scripts/verify_norgesgruppen_prep.py`

Crop floor benchmark:
- `python scripts/benchmark_norgesgruppen_crops.py`

Optional GT crop extraction:
- `python scripts/extract_norgesgruppen_gt_crops.py --split val --limit 100`

## Core Docs

- Overview of task/docs drift: [README.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/README.md)
- Deep forensic audit: [deep-audit-summary.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/deep-audit-summary.md)
- EDA roadmap: [eda-workstreams.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/eda-workstreams.md)
- Unresolved class decisions: [unresolved-class-review.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/unresolved-class-review.md)
- Split/eval plan: [split-eval-plan.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/split-eval-plan.md)
- Modeling/validation plan: [modeling-experiment-plan.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/modeling-experiment-plan.md)
- Execution roadmap: [PLAN-0001-roadmap-to-first-competitive-submission.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/plans/PLAN-0001-roadmap-to-first-competitive-submission.md)
- Immediate execution wave: [PLAN-0002-immediate-execution-wave.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/plans/PLAN-0002-immediate-execution-wave.md)
- Frozen validation decision: [DEC-0001-freeze-validation-surface.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/decisions/DEC-0001-freeze-validation-surface.md)
- Frozen crop-eval decision: [DEC-0002-freeze-crop-retrieval-eval-contract.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/decisions/DEC-0002-freeze-crop-retrieval-eval-contract.md)
- Primary crop-embedder decision: [DEC-0003-keep-pe-core-as-primary-crop-embedder.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/decisions/DEC-0003-keep-pe-core-as-primary-crop-embedder.md)
- Latest experiment report: [REP-0003-crop-embedder-comparison.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/reports/REP-0003-crop-embedder-comparison.md)
- Crop retrieval runtime: [crop-retrieval-runtime.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/crop-retrieval-runtime.md)
- Detection runtime: [detection-runtime.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/detection-runtime.md)
- Operating structure: [project-operating-system.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/project-operating-system.md)
- Data dictionary: [data-dictionary.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/data-dictionary.md)
- Prep playbook: [prep-playbook.md](/home/jorge/repos/ainm/tasks/norgesgruppen/docs/norgesgruppen-data/prep-playbook.md)

## Core Manifests

- Category manifest: [category-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/category-manifest.json)
- Category strategy manifest: [category-strategy-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/category-strategy-manifest.json)
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
- Prep overview: [prep-overview.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/prep-overview.json)
- Artifact index: [artifact-index.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/artifact-index.json)
- YOLO dataset yaml: [dataset.yaml](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo/dataset.yaml)
- YOLO class-agnostic yaml: [dataset.yaml](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo-class-agnostic/dataset.yaml)

## Key Policies

- Do not trust docs for category count/range or `annotations.json` field list; trust payload.
- Do not auto-map coffee-family sibling variants just because names are close.
- Treat egg tail as structurally under-covered by packshots.
- Use blocked section-aware validation, not random split.
