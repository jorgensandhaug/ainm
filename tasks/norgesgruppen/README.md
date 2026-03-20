# NorgesGruppen Dataset Prep

This repo state is the prepared handoff surface for understanding the dataset before modeling.

## Start Here

Read in this order:

1. [docs/norgesgruppen-data/prep-playbook.md](docs/norgesgruppen-data/prep-playbook.md)
2. [docs/norgesgruppen-data/INDEX.md](docs/norgesgruppen-data/INDEX.md)
3. [docs/norgesgruppen-data/deep-audit-summary.md](docs/norgesgruppen-data/deep-audit-summary.md)
4. [docs/norgesgruppen-data/reports/REP-0003-crop-embedder-comparison.md](docs/norgesgruppen-data/reports/REP-0003-crop-embedder-comparison.md)
5. [docs/norgesgruppen-data/crop-retrieval-runtime.md](docs/norgesgruppen-data/crop-retrieval-runtime.md)
6. [docs/norgesgruppen-data/detection-runtime.md](docs/norgesgruppen-data/detection-runtime.md)
7. [docs/norgesgruppen-data/modeling-experiment-plan.md](docs/norgesgruppen-data/modeling-experiment-plan.md)
8. [docs/norgesgruppen-data/project-operating-system.md](docs/norgesgruppen-data/project-operating-system.md)
9. [docs/norgesgruppen-data/plans/PLAN-0001-roadmap-to-first-competitive-submission.md](docs/norgesgruppen-data/plans/PLAN-0001-roadmap-to-first-competitive-submission.md)

If you want only the machine-readable core:

- [data/2026-03-19/derived/prep-overview.json](data/2026-03-19/derived/prep-overview.json)
- [data/2026-03-19/derived/category-strategy-manifest.json](data/2026-03-19/derived/category-strategy-manifest.json)
- [data/2026-03-19/derived/image-sampling-manifest.json](data/2026-03-19/derived/image-sampling-manifest.json)
- [data/2026-03-19/derived/training-manifest.json](data/2026-03-19/derived/training-manifest.json)
- [data/2026-03-19/manual-review-decisions.json](data/2026-03-19/manual-review-decisions.json)

## Locked Facts

- Payload truth is `248` images, `22731` annotations, `356` categories, ids `0..355`
- Product metadata has `329` rows; disk has `344` product dirs; `17` are `CUSTOM_*`
- Exact unique category-to-packshot matches with images: `319` classes
- Problem categories needing special handling: `37`
- Recommended dev split: `199` train / `49` val, blocked and section-aware
- YOLO export already materialized under [data/2026-03-19/derived/yolo](data/2026-03-19/derived/yolo)
- Class-agnostic YOLO export for localization is materialized under [data/2026-03-19/derived/yolo-class-agnostic](data/2026-03-19/derived/yolo-class-agnostic)

## Biggest Practical Conclusions

- Do not trust older docs for dataset counts or `annotations.json` field list; trust payload
- Do not random-split this dataset; use the blocked section-aware split
- Do not auto-map coffee-family sibling variants just because names are close
- Treat `unknown_product` as a real sentinel class
- Egg is the weakest classification regime because packshot coverage is worse there
- Local evaluation is now real: `EXP-0001` scorer sanity passes, `EXP-0002` crop floor is non-random, `EXP-0003` proves `PE-Core` is strong, `EXP-0004` demotes public `DINOv3`, `EXP-0006` detector preflight is working

## Best Files For Specific Questions

- Proof / anomalies: [docs/norgesgruppen-data/deep-audit-summary.md](docs/norgesgruppen-data/deep-audit-summary.md)
- What to do operationally: [docs/norgesgruppen-data/prep-playbook.md](docs/norgesgruppen-data/prep-playbook.md)
- Modeling / validation order: [docs/norgesgruppen-data/modeling-experiment-plan.md](docs/norgesgruppen-data/modeling-experiment-plan.md)
- Latest experiment readout: [docs/norgesgruppen-data/reports/REP-0003-crop-embedder-comparison.md](docs/norgesgruppen-data/reports/REP-0003-crop-embedder-comparison.md)
- Crop retrieval runtime / commands: [docs/norgesgruppen-data/crop-retrieval-runtime.md](docs/norgesgruppen-data/crop-retrieval-runtime.md)
- Detection runtime / commands: [docs/norgesgruppen-data/detection-runtime.md](docs/norgesgruppen-data/detection-runtime.md)
- Primary crop-embedder decision: [docs/norgesgruppen-data/decisions/DEC-0003-keep-pe-core-as-primary-crop-embedder.md](docs/norgesgruppen-data/decisions/DEC-0003-keep-pe-core-as-primary-crop-embedder.md)
- Where new docs/results should live: [docs/norgesgruppen-data/project-operating-system.md](docs/norgesgruppen-data/project-operating-system.md)
- Execution roadmap: [docs/norgesgruppen-data/plans/PLAN-0001-roadmap-to-first-competitive-submission.md](docs/norgesgruppen-data/plans/PLAN-0001-roadmap-to-first-competitive-submission.md)
- Frozen validation decision: [docs/norgesgruppen-data/decisions/DEC-0001-freeze-validation-surface.md](docs/norgesgruppen-data/decisions/DEC-0001-freeze-validation-surface.md)
- Frozen crop-eval decision: [docs/norgesgruppen-data/decisions/DEC-0002-freeze-crop-retrieval-eval-contract.md](docs/norgesgruppen-data/decisions/DEC-0002-freeze-crop-retrieval-eval-contract.md)
- All artifact locations: [data/2026-03-19/derived/artifact-index.json](data/2026-03-19/derived/artifact-index.json)
- Experiment queue: [data/2026-03-19/experiments/experiment-registry.json](data/2026-03-19/experiments/experiment-registry.json)
- Category-level modeling readiness: [data/2026-03-19/derived/category-strategy-manifest.json](data/2026-03-19/derived/category-strategy-manifest.json)
- Image-level sampling/difficulty: [data/2026-03-19/derived/image-sampling-manifest.json](data/2026-03-19/derived/image-sampling-manifest.json)
- Unresolved joins / traps: [docs/norgesgruppen-data/unresolved-class-review.md](docs/norgesgruppen-data/unresolved-class-review.md)
- Split/eval policy: [docs/norgesgruppen-data/split-eval-plan.md](docs/norgesgruppen-data/split-eval-plan.md)

## Rebuild / Verify

```bash
python scripts/build_norgesgruppen_prep.py
python scripts/verify_norgesgruppen_prep.py
python scripts/export_norgesgruppen_yolo.py
python scripts/export_norgesgruppen_yolo.py --class-agnostic
python scripts/benchmark_norgesgruppen_crops.py
```

Optional:

```bash
python scripts/extract_norgesgruppen_gt_crops.py --split val --limit 100
```

## Training-Ready Outputs

- COCO train split: [data/2026-03-19/derived/coco-splits/train.json](data/2026-03-19/derived/coco-splits/train.json)
- COCO val split: [data/2026-03-19/derived/coco-splits/val.json](data/2026-03-19/derived/coco-splits/val.json)
- YOLO dataset yaml: [data/2026-03-19/derived/yolo/dataset.yaml](data/2026-03-19/derived/yolo/dataset.yaml)
- YOLO export summary: [data/2026-03-19/derived/yolo/export-summary.json](data/2026-03-19/derived/yolo/export-summary.json)
- YOLO class-agnostic dataset yaml: [data/2026-03-19/derived/yolo-class-agnostic/dataset.yaml](data/2026-03-19/derived/yolo-class-agnostic/dataset.yaml)
- YOLO class-agnostic export summary: [data/2026-03-19/derived/yolo-class-agnostic/export-summary.json](data/2026-03-19/derived/yolo-class-agnostic/export-summary.json)

## If Handing Off To Another Agent

Give them these first:

- [README.md](README.md)
- [docs/norgesgruppen-data/prep-playbook.md](docs/norgesgruppen-data/prep-playbook.md)
- [docs/norgesgruppen-data/deep-audit-summary.md](docs/norgesgruppen-data/deep-audit-summary.md)
- [docs/norgesgruppen-data/reports/REP-0003-crop-embedder-comparison.md](docs/norgesgruppen-data/reports/REP-0003-crop-embedder-comparison.md)
- [docs/norgesgruppen-data/decisions/DEC-0003-keep-pe-core-as-primary-crop-embedder.md](docs/norgesgruppen-data/decisions/DEC-0003-keep-pe-core-as-primary-crop-embedder.md)
- [docs/norgesgruppen-data/detection-runtime.md](docs/norgesgruppen-data/detection-runtime.md)
- [docs/norgesgruppen-data/modeling-experiment-plan.md](docs/norgesgruppen-data/modeling-experiment-plan.md)
- [docs/norgesgruppen-data/plans/PLAN-0001-roadmap-to-first-competitive-submission.md](docs/norgesgruppen-data/plans/PLAN-0001-roadmap-to-first-competitive-submission.md)
- [docs/norgesgruppen-data/decisions/DEC-0001-freeze-validation-surface.md](docs/norgesgruppen-data/decisions/DEC-0001-freeze-validation-surface.md)
- [docs/norgesgruppen-data/decisions/DEC-0002-freeze-crop-retrieval-eval-contract.md](docs/norgesgruppen-data/decisions/DEC-0002-freeze-crop-retrieval-eval-contract.md)
- [data/2026-03-19/derived/category-strategy-manifest.json](data/2026-03-19/derived/category-strategy-manifest.json)
- [data/2026-03-19/derived/image-sampling-manifest.json](data/2026-03-19/derived/image-sampling-manifest.json)
