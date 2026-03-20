# NorgesGruppen EDA Workstreams

Purpose: turn the deep audit into a concrete map of what to keep testing so we understand both the dataset and the competition failure modes.

Primary reference: `deep-audit-summary.md`

## Core Workstreams

| Workstream | Why it matters | Key tests / questions | Current read |
|---|---|---|---|
| Payload truth vs docs | Bad assumptions here poison everything downstream: class count, schema, output contract, packshot expectations. | Verify hashes, zip central dirs, file counts, schema fields, id ranges, missing files, README claims. | Locked down. Payload is internally clean; main drift is docs/metadata semantics, not corruption. |
| Shelf-image order / section structure | Split design and validation can leak or mis-estimate performance if image order reflects contiguous shelf captures/sections. | Analyze image-id gaps, category Jaccard across neighbors, dominant-theme runs, best contiguous segmentation. | Strong evidence for 4 contiguous sections: `varmedrikker -> egg -> frokost -> knekkebrod`. |
| Annotation geometry / truncation | Small objects, border-truncated products, and dense shelves change augmentation, crop policy, NMS, and error analysis. | Box size/aspect distributions, per-image labeled area, edge-touch rate, center heatmap, top edge-heavy images. | Dense small-object regime. `6.0%` of boxes touch within `1%` of an image edge; `704` boxes lie exactly on an edge. |
| Annotation conflict / overlap quality | High-overlap pairs can indicate duplicate-ish annotations, class confusion, or genuine near-identical products. | Pairwise IoU stats within image, same-vs-cross-category overlap, top high-IoU conflicts. | Very few extreme conflicts: only `18` pairs at IoU `>= 0.5`, `5` cross-category. One strong alias/conflict signal is `Leksands Rutbit` vs `LEKSANDS KNEKKE RUTBIT 200G`. |
| Class imbalance / tail severity | Drives split strategy, loss weighting, sampling, calibration, and expected leaderboard variance. | Class-count histograms, Gini, entropy/effective classes, tail mass, per-image class diversity. | Severe long tail. `84` classes have `<=5` anns; effective class count is only about `180.4` despite `356` classes. |
| Packshot coverage / view richness | Reference-based classification only works if packshots exist, are unambiguous, and have enough views. | Exact name-match coverage, ambiguous names, no-image matches, views per matched class, theme-specific low-view burden. | Coverage is strong overall by annotation mass, but `egg` is weak: only `84.1%` exact-unique coverage and `48.7%` of covered egg mass uses just `1-2` views. |
| Name join / provenance resolution | The remaining classification gap is dominated by whether unresolved shelf classes can be mapped to packshots or are genuinely missing. | Exact normalization, fuzzy match triage, shared-token analysis, ambiguous metadata names, overlap evidence. | Most unresolved mass is concentrated in a few classes. Some are likely aliases/family variants; many egg/local-farm rows look genuinely missing. |
| `unknown_product` behavior | This class can cap classification performance and may need special handling in training/inference. | Frequency, theme spread, geometry vs all boxes, image concentration. | Large and broad: `422` anns across `90` images, not isolated to one section, geometry similar to the main object regime. |
| Packshot asset anomalies / `CUSTOM_*` policy | Extra assets can help or hurt depending on whether they map cleanly to real classes. | Disk-vs-metadata diffs, exact duplicates, nearest-neighbor similarity, aspect-ratio differences, cross-product duplicates. | `17` `CUSTOM_*` dirs are real extras, structurally different from normal packshots, and have no safe automatic mapping yet. |
| Metadata count semantics | Misreading `annotation_count` or `corrected_count` can distort priors and class weighting. | Correlate metadata counts vs COCO counts; test transforms like `annotation_count - corrected_count`. | Related but not identical provenance. `annotation_count - corrected_count` tracks COCO better than raw `corrected_count`, but neither is training truth. |
| Leakage / duplicate risk | Near-duplicates can inflate validation and give false confidence. | Exact and perceptual duplicate search for shelf images and packshots. | No duplicate shelf-image groups and no near-duplicate shelf pairs in the simple aHash pass. Packshot duplicates exist, but only within product. |

## What We Should Test Next

| Priority | Test | Why |
|---|---|---|
| 1 | Build a reviewed alias table for top unresolved classes | Remaining unresolved mass is concentrated enough that manual review has high leverage. |
| 2 | Freeze section-aware train/val splits | Image order and section contiguity are strong; random splitting is likely optimistic. |
| 3 | Run per-theme baselines | `egg`, `varmedrikker`, `frokost`, and `knekkebrod` have very different coverage and difficulty profiles. |
| 4 | Audit crop/context strategies on edge-touch boxes | Border truncation is common enough to affect classifier crops and detector training. |
| 5 | Decide `unknown_product` policy explicitly | Needed for both training labels and inference fallback/calibration. |
| 6 | Decide `CUSTOM_*` policy explicitly | Ignore, manual-map, or auxiliary-only. Leaving it implicit will create inconsistency later. |

## Modeling Implications

- Detection is a dense small-object problem with moderate overlap, not an extreme duplicate-annotation problem.
- Classification difficulty is dominated less by global coverage and more by a few concentrated failure buckets: `unknown_product`, missing egg refs, ambiguous names, and low-view packshots.
- Evaluation should be section-aware and long-tail-aware. One aggregate validation score will hide important failure modes.
- Manual review is now cheaper than more blind statistics for the top unresolved classes; the audit has narrowed the uncertainty enough.
