# Data Dictionary

This file describes source files, derived manifests, and the most important semantics/caveats.

## Source Files

- [annotations.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/extracted/coco/train/annotations.json)
  - Canonical shelf labels.
  - Verified annotation fields: `area`, `bbox`, `category_id`, `id`, `image_id`, `iscrowd`.
  - Does not contain `product_code`, `product_name`, or `corrected`.
- [metadata.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/extracted/product_images/metadata.json)
  - Product-reference metadata, including product names, image types, `annotation_count`, and `corrected_count`.
  - Related to COCO, but not equal to current COCO counts.
- [manual-review-decisions.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/manual-review-decisions.json)
  - Human-reviewed category join / policy decisions.
- [section-blocked-val-split.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/section-blocked-val-split.json)
  - Recommended day-to-day dev split derived from contiguous shelf sections.

## Derived Manifests

- [category-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/category-manifest.json)
  - One row per category.
  - Includes counts, inferred theme, exact-match status against metadata, exact matched products, and manual review decision.
- [category-strategy-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/category-strategy-manifest.json)
  - One row per category, focused on modeling readiness.
  - Includes rarity bucket, best usable reference, readiness bucket, flags, and a conservative heuristic detection weight.
- [image-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/image-manifest.json)
  - One row per shelf image.
  - Includes annotation counts, distinct category count, dominant theme, segment guess, and whether image is in blocked validation.
- [image-sampling-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/image-sampling-manifest.json)
  - One row per shelf image, focused on training-time sampling/difficulty.
  - Includes rare/problem/reference-weak annotation counts plus a conservative sampler bucket/weight.
- [packshot-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/packshot-manifest.json)
  - One row per metadata product plus one row per disk-only directory such as `CUSTOM_*`.
  - Includes metadata-vs-disk presence and image types.
- [problem-category-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/problem-category-manifest.json)
  - Filtered category view for anything unresolved, ambiguous, no-packshot, or manually constrained.
- [training-manifest.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/training-manifest.json)
  - Split-level summary plus train/val image ids and subset paths.
- [train.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/coco-splits/train.json) / [val.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/coco-splits/val.json)
  - COCO-format train and validation subsets using the blocked section-aware split.
- [gt-crop-summary.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/gt-crop-summary.json)
  - Summary of the annotation-level crop manifest.
- [gt-crop-manifest.jsonl](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/gt-crop-manifest.jsonl)
  - One row per annotation with split, bbox, category policy, and suggested crop output path.
- [prep-verification.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/prep-verification.json)
  - Summary written by the standalone prep verifier.
- [prep-overview.json](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/prep-overview.json)
  - Short summary of the prepared state.
- [dataset.yaml](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo/dataset.yaml)
  - YOLO-ready local training view built from the blocked split.
- [dataset.yaml](/home/jorge/repos/ainm/tasks/norgesgruppen/data/2026-03-19/derived/yolo-class-agnostic/dataset.yaml)
  - YOLO-ready class-agnostic local training view for localization baselines.

## Exact Match Status

- `exact_unique_with_images`: normalized category name maps to one metadata product and that product has images.
- `exact_unique_no_images`: normalized category name maps to one metadata product but that product has no packshots on disk.
- `exact_name_ambiguous`: normalized category name maps to multiple metadata products.
- `no_match`: no exact normalized-name match in metadata.

## Manual Review Decisions

- `map_likely`: acceptable provisional join for prep/baselines.
- `manual_review`: plausible but not yet safe enough to fold in automatically.
- `do_not_auto_map`: family/sibling variant trap.
- `missing_ref_likely`: metadata likely lacks the real product reference.
- `matched_no_packshot`: metadata row exists, but no reference images are present.
- `exact_name_ambiguous`: exact normalized-name collision; do not choose arbitrarily.
- `sentinel`: special class such as `unknown_product`.

## Important Caveats

- Category ids in the payload are `0..355`, not `0..356`.
- The payload contains `248` images, not `254`.
- `metadata.annotation_count` is not current-label truth.
- `CUSTOM_*` directories are real extra assets and require explicit policy.
