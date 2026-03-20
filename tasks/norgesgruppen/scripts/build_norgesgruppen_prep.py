#!/usr/bin/env python3

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from norgesgruppen_prep_common import (
    ARTIFACT_INDEX_JSON,
    BLOCKED_SPLIT,
    CATEGORY_MANIFEST_JSON,
    CATEGORY_STRATEGY_MANIFEST_JSON,
    COCO_ANNOTATIONS,
    COCO_IMAGES,
    CRITICAL_PATH_PLAN_MD,
    DATA_DATE,
    DATA_DICTIONARY_MD,
    DEEP_AUDIT_JSON,
    DOCS_ROOT,
    GT_CROP_MANIFEST_JSONL,
    GT_CROP_SUMMARY_JSON,
    IMMEDIATE_EXECUTION_PLAN_MD,
    IMAGE_MANIFEST_JSON,
    IMAGE_SAMPLING_MANIFEST_JSON,
    INDEX_MD,
    MANUAL_REVIEW_DECISIONS,
    MODELING_EXPERIMENT_PLAN_MD,
    EXPERIMENT_REGISTRY_JSON,
    PACKSHOT_MANIFEST_JSON,
    PREP_OVERVIEW_JSON,
    PREP_PLAYBOOK_MD,
    PREP_VERIFICATION_JSON,
    PROJECT_OPERATING_SYSTEM_MD,
    ROADMAP_PLAN_MD,
    PRODUCT_METADATA,
    PRODUCT_ROOT,
    PROBLEM_CATEGORY_MANIFEST_JSON,
    ROOT,
    TRAIN_COCO_JSON,
    TRAINING_MANIFEST_JSON,
    VALIDATION_DECISION_MD,
    VAL_COCO_JSON,
    YOLO_DATASET_YAML,
    YOLO_SUMMARY_JSON,
    YOLO_VERIFICATION_JSON,
    YOLO_CLASS_AGNOSTIC_DATASET_YAML,
    YOLO_CLASS_AGNOSTIC_SUMMARY_JSON,
    YOLO_CLASS_AGNOSTIC_VERIFICATION_JSON,
    infer_theme,
    normalize_name,
    read_json,
    slugify,
    write_json,
    write_jsonl,
)


def load_sources() -> dict[str, Any]:
    annotations = read_json(COCO_ANNOTATIONS)
    metadata = read_json(PRODUCT_METADATA)
    manual_review = read_json(MANUAL_REVIEW_DECISIONS)
    blocked_split = read_json(BLOCKED_SPLIT)
    deep_audit = read_json(DEEP_AUDIT_JSON)
    image_files = sorted(path for path in COCO_IMAGES.iterdir() if path.is_file())
    product_dirs = sorted(path for path in PRODUCT_ROOT.iterdir() if path.is_dir())
    return {
        "annotations": annotations,
        "metadata": metadata,
        "manual_review": manual_review,
        "blocked_split": blocked_split,
        "deep_audit": deep_audit,
        "image_files": image_files,
        "product_dirs": product_dirs,
    }


def build_context(sources: dict[str, Any]) -> dict[str, Any]:
    annotations = sources["annotations"]
    metadata = sources["metadata"]
    manual_review = sources["manual_review"]
    blocked_split = sources["blocked_split"]
    deep_audit = sources["deep_audit"]
    image_files = sources["image_files"]
    product_dirs = sources["product_dirs"]

    images = annotations["images"]
    categories = annotations["categories"]
    boxes = annotations["annotations"]
    metadata_products = metadata["products"]

    images_by_id = {image["id"]: image for image in images}
    categories_by_id = {category["id"]: category for category in categories}
    category_counts = Counter(box["category_id"] for box in boxes)
    image_counts = Counter(box["image_id"] for box in boxes)
    category_image_ids = defaultdict(set)
    image_category_counts = defaultdict(Counter)
    boxes_by_image_id = defaultdict(list)
    for box in boxes:
        category_image_ids[box["category_id"]].add(box["image_id"])
        image_category_counts[box["image_id"]][box["category_id"]] += 1
        boxes_by_image_id[box["image_id"]].append(box)

    metadata_by_norm = defaultdict(list)
    metadata_by_code = {}
    for product in metadata_products:
        row = {
            **product,
            "normalized_name": normalize_name(product["product_name"]),
        }
        metadata_by_norm[row["normalized_name"]].append(row)
        metadata_by_code[row["product_code"]] = row

    manual_review_by_category_id = {
        row["category_id"]: row
        for row in manual_review["category_decisions"]
    }

    product_dirs_by_name = {path.name: path for path in product_dirs}
    split_segments = blocked_split["segments"]
    split_segment_by_theme = {segment["theme"]: segment for segment in split_segments}
    blocked_val_image_ids = set(blocked_split["val_image_ids"])

    return {
        "images": images,
        "categories": categories,
        "boxes": boxes,
        "metadata_products": metadata_products,
        "images_by_id": images_by_id,
        "categories_by_id": categories_by_id,
        "category_counts": category_counts,
        "image_counts": image_counts,
        "category_image_ids": category_image_ids,
        "image_category_counts": image_category_counts,
        "boxes_by_image_id": boxes_by_image_id,
        "metadata_by_norm": metadata_by_norm,
        "metadata_by_code": metadata_by_code,
        "manual_review_by_category_id": manual_review_by_category_id,
        "product_dirs_by_name": product_dirs_by_name,
        "split_segments": split_segments,
        "split_segment_by_theme": split_segment_by_theme,
        "blocked_val_image_ids": blocked_val_image_ids,
        "image_files": image_files,
        "deep_audit": deep_audit,
    }


def exact_match_status(products: list[dict[str, Any]]) -> str:
    if not products:
        return "no_match"
    if len(products) > 1:
        return "exact_name_ambiguous"
    if products[0]["has_images"]:
        return "exact_unique_with_images"
    return "exact_unique_no_images"


def segment_guess(image_id: int, split_segments: list[dict[str, Any]]) -> dict[str, Any] | None:
    for segment in split_segments:
        if segment["segment_start_image_id"] <= image_id <= segment["segment_end_image_id"]:
            return {
                "theme": segment["theme"],
                "segment_start_image_id": segment["segment_start_image_id"],
                "segment_end_image_id": segment["segment_end_image_id"],
            }
    return None


def build_category_manifest(context: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for category in sorted(context["categories"], key=lambda row: row["id"]):
        category_id = category["id"]
        normalized_name = normalize_name(category["name"])
        products = context["metadata_by_norm"].get(normalized_name, [])
        match_status = exact_match_status(products)
        manual_review = context["manual_review_by_category_id"].get(category_id)
        row = {
            "category_id": category_id,
            "category_name": category["name"],
            "normalized_name": normalized_name,
            "supercategory": category["supercategory"],
            "theme": infer_theme(category["name"]),
            "annotation_count": context["category_counts"][category_id],
            "image_count": len(context["category_image_ids"][category_id]),
            "exact_match_status": match_status,
            "exact_match_product_count": len(products),
            "exact_match_products": [
                {
                    "product_code": product["product_code"],
                    "product_name": product["product_name"],
                    "has_images": product["has_images"],
                    "image_types": product["image_types"],
                    "metadata_annotation_count": product["annotation_count"],
                    "corrected_count": product["corrected_count"],
                }
                for product in products
            ],
            "manual_review_decision": manual_review["decision"] if manual_review else "unreviewed",
            "manual_review_target_product_code": manual_review.get("target_product_code") if manual_review else None,
            "manual_review_target_product_name": manual_review.get("target_product_name") if manual_review else None,
            "manual_review_rationale": manual_review.get("rationale") if manual_review else None,
            "is_problem_class": match_status != "exact_unique_with_images" or (manual_review is not None and manual_review["decision"] != "map_likely"),
        }
        rows.append(row)
    return rows


def build_image_manifest(context: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for image in sorted(context["images"], key=lambda row: row["id"]):
        image_id = image["id"]
        category_counts = context["image_category_counts"][image_id]
        total_annotations = context["image_counts"][image_id]
        theme_counts = Counter()
        for category_id, count in category_counts.items():
            theme_counts[infer_theme(context["categories_by_id"][category_id]["name"])] += count
        dominant_theme = theme_counts.most_common(1)[0][0]
        segment = segment_guess(image_id, context["split_segments"])
        rows.append(
            {
                "image_id": image_id,
                "file_name": image["file_name"],
                "file_extension": Path(image["file_name"]).suffix.lower(),
                "width": image["width"],
                "height": image["height"],
                "annotation_count": total_annotations,
                "distinct_category_count": len(category_counts),
                "dominant_theme": dominant_theme,
                "dominant_theme_annotation_count": theme_counts[dominant_theme],
                "dominant_theme_purity": round(theme_counts[dominant_theme] / total_annotations, 6),
                "theme_annotation_counts": dict(sorted(theme_counts.items())),
                "contains_unknown_product": 355 in category_counts,
                "segment_guess": segment,
                "is_blocked_val_image": image_id in context["blocked_val_image_ids"],
            }
        )
    return rows


def build_packshot_manifest(context: dict[str, Any]) -> list[dict[str, Any]]:
    rows = []
    for product in sorted(context["metadata_products"], key=lambda row: row["product_code"]):
        product_dir = context["product_dirs_by_name"].get(product["product_code"])
        disk_image_types = []
        representative_path = None
        if product_dir is not None:
            disk_image_types = sorted(path.stem for path in product_dir.iterdir() if path.is_file())
            if (product_dir / "main.jpg").is_file():
                representative_path = str((product_dir / "main.jpg").relative_to(PRODUCT_ROOT))
            else:
                file_candidates = sorted(path for path in product_dir.iterdir() if path.is_file())
                if file_candidates:
                    representative_path = str(file_candidates[0].relative_to(PRODUCT_ROOT))
        rows.append(
            {
                "product_code": product["product_code"],
                "product_name": product["product_name"],
                "normalized_name": normalize_name(product["product_name"]),
                "record_source": "metadata",
                "is_custom": False,
                "has_images_in_metadata": product["has_images"],
                "has_directory_on_disk": product_dir is not None,
                "metadata_image_types": product["image_types"],
                "disk_image_types": disk_image_types,
                "metadata_annotation_count": product["annotation_count"],
                "corrected_count": product["corrected_count"],
                "representative_path": representative_path,
            }
        )

    for product_code, product_dir in sorted(context["product_dirs_by_name"].items()):
        if product_code in context["metadata_by_code"]:
            continue
        disk_image_types = sorted(path.stem for path in product_dir.iterdir() if path.is_file())
        representative_path = None
        if (product_dir / "main.jpg").is_file():
            representative_path = str((product_dir / "main.jpg").relative_to(PRODUCT_ROOT))
        else:
            file_candidates = sorted(path for path in product_dir.iterdir() if path.is_file())
            if file_candidates:
                representative_path = str(file_candidates[0].relative_to(PRODUCT_ROOT))
        rows.append(
            {
                "product_code": product_code,
                "product_name": None,
                "normalized_name": None,
                "record_source": "disk_only",
                "is_custom": product_code.startswith("CUSTOM_"),
                "has_images_in_metadata": None,
                "has_directory_on_disk": True,
                "metadata_image_types": [],
                "disk_image_types": disk_image_types,
                "metadata_annotation_count": None,
                "corrected_count": None,
                "representative_path": representative_path,
            }
        )
    return rows


def build_problem_category_manifest(category_manifest: list[dict[str, Any]]) -> list[dict[str, Any]]:
    problem_rows = [row for row in category_manifest if row["is_problem_class"]]
    return sorted(
        problem_rows,
        key=lambda row: (-row["annotation_count"], row["category_id"]),
    )


def rarity_bucket(annotation_count: int) -> str:
    if annotation_count <= 5:
        return "ultra_rare"
    if annotation_count <= 10:
        return "very_rare"
    if annotation_count <= 25:
        return "rare"
    if annotation_count <= 100:
        return "mid_tail"
    return "head"


def view_count_bucket(view_count: int | None) -> str:
    if view_count is None:
        return "unknown"
    if view_count <= 0:
        return "none"
    if view_count <= 2:
        return "low_1_2"
    if view_count <= 4:
        return "medium_3_4"
    return "high_5_plus"


def reference_details_for_category(
    category_row: dict[str, Any],
    context: dict[str, Any],
) -> dict[str, Any]:
    if category_row["exact_match_status"] in {"exact_unique_with_images", "exact_unique_no_images"}:
        product = category_row["exact_match_products"][0]
        return {
            "reference_source": "exact_match",
            "product_code": product["product_code"],
            "product_name": product["product_name"],
            "has_images": product["has_images"],
            "view_count": len(product["image_types"]),
            "image_types": product["image_types"],
        }

    decision = category_row["manual_review_decision"]
    if decision in {"map_likely", "matched_no_packshot"} and category_row["manual_review_target_product_code"]:
        product = context["metadata_by_code"][category_row["manual_review_target_product_code"]]
        return {
            "reference_source": "manual_review_target",
            "product_code": product["product_code"],
            "product_name": product["product_name"],
            "has_images": product["has_images"],
            "view_count": len(product["image_types"]),
            "image_types": product["image_types"],
        }

    return {
        "reference_source": None,
        "product_code": None,
        "product_name": None,
        "has_images": False,
        "view_count": 0,
        "image_types": [],
    }


def classification_readiness_bucket(
    category_row: dict[str, Any],
    reference_view_count: int,
) -> str:
    decision = category_row["manual_review_decision"]
    if decision == "sentinel":
        return "unknown_sentinel"
    if decision == "exact_name_ambiguous" or category_row["exact_match_status"] == "exact_name_ambiguous":
        return "ambiguous_reference"
    if decision == "do_not_auto_map":
        return "sibling_variant_trap"
    if decision == "manual_review":
        return "needs_manual_review"
    if decision in {"missing_ref_likely", "matched_no_packshot"} or category_row["exact_match_status"] == "exact_unique_no_images":
        return "missing_reference"
    if decision == "map_likely":
        return "provisional_alias_reference"
    if category_row["exact_match_status"] != "exact_unique_with_images":
        return "missing_reference"
    if reference_view_count <= 2:
        return "exact_reference_low_view"
    if reference_view_count <= 4:
        return "exact_reference_medium_view"
    return "exact_reference_high_view"


def build_category_strategy_manifest(
    context: dict[str, Any],
    category_manifest: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    total_annotations = len(context["boxes"])
    max_annotation_count = max(row["annotation_count"] for row in category_manifest)
    rank_by_category_id = {
        row["category_id"]: rank
        for rank, row in enumerate(
            sorted(category_manifest, key=lambda row: (-row["annotation_count"], row["category_id"])),
            start=1,
        )
    }

    rows = []
    for category_row in sorted(category_manifest, key=lambda row: row["category_id"]):
        reference = reference_details_for_category(category_row, context)
        readiness = classification_readiness_bucket(category_row, reference["view_count"])
        flags = []
        if category_row["annotation_count"] <= 25:
            flags.append("tail_class")
        if category_row["annotation_count"] <= 10:
            flags.append("very_low_frequency")
        if category_row["is_problem_class"]:
            flags.append("problem_class")
        if readiness == "unknown_sentinel":
            flags.append("sentinel_unknown")
        if readiness == "missing_reference":
            flags.append("no_reference_images")
        if readiness == "ambiguous_reference":
            flags.append("ambiguous_reference")
        if readiness == "sibling_variant_trap":
            flags.append("sibling_variant_risk")
        if readiness == "needs_manual_review":
            flags.append("manual_review_pending")
        if reference["view_count"] in {1, 2}:
            flags.append("low_view_reference")

        rows.append(
            {
                "category_id": category_row["category_id"],
                "category_name": category_row["category_name"],
                "theme": category_row["theme"],
                "annotation_count": category_row["annotation_count"],
                "annotation_share": round(category_row["annotation_count"] / total_annotations, 6),
                "image_count": category_row["image_count"],
                "annotation_rank": rank_by_category_id[category_row["category_id"]],
                "rarity_bucket": rarity_bucket(category_row["annotation_count"]),
                "exact_match_status": category_row["exact_match_status"],
                "manual_review_decision": category_row["manual_review_decision"],
                "classification_readiness_bucket": readiness,
                "best_reference_source": reference["reference_source"],
                "best_reference_product_code": reference["product_code"],
                "best_reference_product_name": reference["product_name"],
                "best_reference_has_images": reference["has_images"],
                "best_reference_view_count": reference["view_count"],
                "best_reference_view_bucket": view_count_bucket(reference["view_count"]),
                "best_reference_image_types": reference["image_types"],
                "heuristic_detection_weight": round(min(8.0, (max_annotation_count / category_row["annotation_count"]) ** 0.5), 6),
                "flags": flags,
            }
        )
    return rows


def build_image_sampling_manifest(
    context: dict[str, Any],
    category_strategy_manifest: list[dict[str, Any]],
    image_manifest: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    category_strategy_by_id = {
        row["category_id"]: row
        for row in category_strategy_manifest
    }
    rows = []
    for image_row in sorted(image_manifest, key=lambda row: row["image_id"]):
        image_id = image_row["image_id"]
        boxes = context["boxes_by_image_id"][image_id]
        problem_annotation_count = 0
        rare_annotation_count_le_5 = 0
        rare_annotation_count_le_10 = 0
        rare_annotation_count_le_25 = 0
        unknown_product_annotation_count = 0
        low_view_reference_annotation_count = 0
        missing_reference_annotation_count = 0
        ambiguous_reference_annotation_count = 0
        sibling_variant_trap_annotation_count = 0
        edge_touch_1pct_annotation_count = 0

        for box in boxes:
            category_strategy = category_strategy_by_id[box["category_id"]]
            x, y, width, height = box["bbox"]
            edge_margin_fraction = min(
                x / image_row["width"],
                y / image_row["height"],
                (image_row["width"] - (x + width)) / image_row["width"],
                (image_row["height"] - (y + height)) / image_row["height"],
            )
            if edge_margin_fraction <= 0.01:
                edge_touch_1pct_annotation_count += 1
            if category_strategy["flags"]:
                problem_annotation_count += 1
            if category_strategy["annotation_count"] <= 5:
                rare_annotation_count_le_5 += 1
            if category_strategy["annotation_count"] <= 10:
                rare_annotation_count_le_10 += 1
            if category_strategy["annotation_count"] <= 25:
                rare_annotation_count_le_25 += 1
            if box["category_id"] == 355:
                unknown_product_annotation_count += 1
            if category_strategy["classification_readiness_bucket"] == "exact_reference_low_view":
                low_view_reference_annotation_count += 1
            if category_strategy["classification_readiness_bucket"] == "missing_reference":
                missing_reference_annotation_count += 1
            if category_strategy["classification_readiness_bucket"] == "ambiguous_reference":
                ambiguous_reference_annotation_count += 1
            if category_strategy["classification_readiness_bucket"] == "sibling_variant_trap":
                sibling_variant_trap_annotation_count += 1

        annotation_count = image_row["annotation_count"]
        heuristic_sampler_weight = 1.0
        heuristic_sampler_weight += min(0.6, 0.12 * rare_annotation_count_le_10)
        heuristic_sampler_weight += min(0.4, 0.04 * problem_annotation_count)
        heuristic_sampler_weight += min(0.2, 0.02 * low_view_reference_annotation_count)
        heuristic_sampler_weight = round(min(2.0, heuristic_sampler_weight), 6)

        if problem_annotation_count >= max(10, annotation_count * 0.2):
            sampler_bucket = "problem_heavy"
        elif rare_annotation_count_le_10 >= 5:
            sampler_bucket = "rare_class_rich"
        elif annotation_count >= 120:
            sampler_bucket = "dense_standard"
        else:
            sampler_bucket = "standard"

        rows.append(
            {
                "image_id": image_id,
                "file_name": image_row["file_name"],
                "split": "val" if image_row["is_blocked_val_image"] else "train",
                "dominant_theme": image_row["dominant_theme"],
                "dominant_theme_purity": image_row["dominant_theme_purity"],
                "annotation_count": annotation_count,
                "distinct_category_count": image_row["distinct_category_count"],
                "problem_annotation_count": problem_annotation_count,
                "rare_annotation_count_le_5": rare_annotation_count_le_5,
                "rare_annotation_count_le_10": rare_annotation_count_le_10,
                "rare_annotation_count_le_25": rare_annotation_count_le_25,
                "unknown_product_annotation_count": unknown_product_annotation_count,
                "low_view_reference_annotation_count": low_view_reference_annotation_count,
                "missing_reference_annotation_count": missing_reference_annotation_count,
                "ambiguous_reference_annotation_count": ambiguous_reference_annotation_count,
                "sibling_variant_trap_annotation_count": sibling_variant_trap_annotation_count,
                "edge_touch_1pct_annotation_count": edge_touch_1pct_annotation_count,
                "heuristic_sampler_bucket": sampler_bucket,
                "heuristic_sampler_weight": heuristic_sampler_weight,
            }
        )
    return rows


def build_split_coco(
    annotations: dict[str, Any],
    image_ids: set[int],
) -> dict[str, Any]:
    return {
        "images": [
            image
            for image in annotations["images"]
            if image["id"] in image_ids
        ],
        "categories": annotations["categories"],
        "annotations": [
            box
            for box in annotations["annotations"]
            if box["image_id"] in image_ids
        ],
    }


def build_training_manifest(
    context: dict[str, Any],
    category_manifest: list[dict[str, Any]],
    image_manifest: list[dict[str, Any]],
) -> dict[str, Any]:
    all_image_ids = sorted(row["image_id"] for row in image_manifest)
    val_image_ids = sorted(context["blocked_val_image_ids"])
    train_image_ids = [image_id for image_id in all_image_ids if image_id not in context["blocked_val_image_ids"]]
    split_rows = {"train": train_image_ids, "val": val_image_ids}

    split_annotation_counts = {}
    split_theme_counts = {}
    for split_name, image_ids in split_rows.items():
        annotation_count = sum(context["image_counts"][image_id] for image_id in image_ids)
        split_annotation_counts[split_name] = annotation_count
        theme_counts = Counter()
        for image_id in image_ids:
            for category_id, count in context["image_category_counts"][image_id].items():
                theme_counts[infer_theme(context["categories_by_id"][category_id]["name"])] += count
        split_theme_counts[split_name] = dict(sorted(theme_counts.items()))

    return {
        "name": "section_blocked_mid_segment_val",
        "data_date": DATA_DATE,
        "image_root": str(COCO_IMAGES.relative_to(ROOT)),
        "source_annotations_path": str(COCO_ANNOTATIONS.relative_to(ROOT)),
        "category_manifest_path": str(CATEGORY_MANIFEST_JSON.relative_to(ROOT)),
        "manual_review_decisions_path": str(MANUAL_REVIEW_DECISIONS.relative_to(ROOT)),
        "coco_split_paths": {
            "train": str(TRAIN_COCO_JSON.relative_to(ROOT)),
            "val": str(VAL_COCO_JSON.relative_to(ROOT)),
        },
        "counts": {
            "images_total": len(image_manifest),
            "annotations_total": len(context["boxes"]),
            "categories_total": len(category_manifest),
        },
        "splits": {
            split_name: {
                "image_count": len(image_ids),
                "annotation_count": split_annotation_counts[split_name],
                "theme_annotation_counts": split_theme_counts[split_name],
                "image_ids": image_ids,
            }
            for split_name, image_ids in split_rows.items()
        },
        "notes": [
            "Validation is blocked and section-aware, not random.",
            "Categories remain the full payload category set in both COCO split files.",
        ],
    }


def build_gt_crop_manifest(
    context: dict[str, Any],
    category_manifest: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    category_manifest_by_id = {
        row["category_id"]: row
        for row in category_manifest
    }
    rows = []
    split_counts = Counter()
    theme_counts = Counter()
    decision_counts = Counter()
    exact_match_status_counts = Counter()

    for box in sorted(context["boxes"], key=lambda row: row["id"]):
        image = context["images_by_id"][box["image_id"]]
        category = category_manifest_by_id[box["category_id"]]
        x, y, width, height = box["bbox"]
        split = "val" if box["image_id"] in context["blocked_val_image_ids"] else "train"
        area_fraction = round(box["area"] / (image["width"] * image["height"]), 6)
        edge_margin_fraction = round(
            min(
                x / image["width"],
                y / image["height"],
                (image["width"] - (x + width)) / image["width"],
                (image["height"] - (y + height)) / image["height"],
            ),
            6,
        )
        crop_rel_path = (
            Path("gt-crops")
            / split
            / f"{category['category_id']:03d}-{slugify(category['category_name'])}"
            / f"img_{box['image_id']:05d}_ann_{box['id']:06d}.jpg"
        )
        row = {
            "annotation_id": box["id"],
            "split": split,
            "image_id": box["image_id"],
            "image_file": str((COCO_IMAGES / image["file_name"]).relative_to(ROOT)),
            "image_width": image["width"],
            "image_height": image["height"],
            "category_id": category["category_id"],
            "category_name": category["category_name"],
            "theme": category["theme"],
            "exact_match_status": category["exact_match_status"],
            "manual_review_decision": category["manual_review_decision"],
            "manual_review_target_product_code": category["manual_review_target_product_code"],
            "manual_review_target_product_name": category["manual_review_target_product_name"],
            "bbox_xywh": [x, y, width, height],
            "bbox_xyxy": [x, y, x + width, y + height],
            "area": box["area"],
            "area_fraction": area_fraction,
            "edge_margin_fraction": edge_margin_fraction,
            "edge_touch_1pct": edge_margin_fraction <= 0.01,
            "iscrowd": box["iscrowd"],
            "crop_rel_path": str(crop_rel_path),
        }
        rows.append(row)
        split_counts[split] += 1
        theme_counts[category["theme"]] += 1
        decision_counts[category["manual_review_decision"]] += 1
        exact_match_status_counts[category["exact_match_status"]] += 1

    summary = {
        "row_count": len(rows),
        "split_counts": dict(sorted(split_counts.items())),
        "theme_counts": dict(sorted(theme_counts.items())),
        "manual_review_decision_counts": dict(sorted(decision_counts.items())),
        "exact_match_status_counts": dict(sorted(exact_match_status_counts.items())),
        "manifest_path": str(GT_CROP_MANIFEST_JSONL.relative_to(ROOT)),
    }
    return rows, summary


def build_prep_overview(
    context: dict[str, Any],
    category_manifest: list[dict[str, Any]],
    category_strategy_manifest: list[dict[str, Any]],
    image_manifest: list[dict[str, Any]],
    image_sampling_manifest: list[dict[str, Any]],
    packshot_manifest: list[dict[str, Any]],
    problem_category_manifest: list[dict[str, Any]],
) -> dict[str, Any]:
    exact_unique_with_images = sum(1 for row in category_manifest if row["exact_match_status"] == "exact_unique_with_images")
    exact_unique_no_images = sum(1 for row in category_manifest if row["exact_match_status"] == "exact_unique_no_images")
    exact_ambiguous = sum(1 for row in category_manifest if row["exact_match_status"] == "exact_name_ambiguous")
    no_match = sum(1 for row in category_manifest if row["exact_match_status"] == "no_match")
    manual_decision_counts = Counter(row["manual_review_decision"] for row in category_manifest)
    return {
        "data_date": DATA_DATE,
        "source_counts": {
            "images": len(context["images"]),
            "annotations": len(context["boxes"]),
            "categories": len(context["categories"]),
            "metadata_products": len(context["metadata_products"]),
            "packshot_directories": len(context["product_dirs_by_name"]),
        },
        "category_match_summary": {
            "exact_unique_with_images": exact_unique_with_images,
            "exact_unique_no_images": exact_unique_no_images,
            "exact_name_ambiguous": exact_ambiguous,
            "no_match": no_match,
        },
        "manual_review_decision_counts": dict(sorted(manual_decision_counts.items())),
        "classification_readiness_counts": dict(
            sorted(Counter(row["classification_readiness_bucket"] for row in category_strategy_manifest).items())
        ),
        "blocked_split": {
            "train_image_count": len([row for row in image_manifest if not row["is_blocked_val_image"]]),
            "val_image_count": len([row for row in image_manifest if row["is_blocked_val_image"]]),
            "segment_count": len(context["split_segments"]),
        },
        "image_sampler_bucket_counts": dict(
            sorted(Counter(row["heuristic_sampler_bucket"] for row in image_sampling_manifest).items())
        ),
        "gt_crop_manifest_row_count": len(context["boxes"]),
        "problem_category_count": len(problem_category_manifest),
        "custom_packshot_dir_count": sum(1 for row in packshot_manifest if row["is_custom"]),
        "deep_audit_reference": str(DEEP_AUDIT_JSON.relative_to(ROOT)),
    }


def render_index_md(prep_overview: dict[str, Any]) -> str:
    lines = [
        "# NorgesGruppen Prep Index",
        "",
        "This is the quick entrypoint for humans and agents.",
        "",
        "## At A Glance",
        "",
        f"- Source payload date: `{prep_overview['data_date']}`",
        f"- COCO shape: `{prep_overview['source_counts']['images']}` images, `{prep_overview['source_counts']['annotations']}` annotations, `{prep_overview['source_counts']['categories']}` categories",
        f"- Product refs: `{prep_overview['source_counts']['metadata_products']}` metadata products, `{prep_overview['source_counts']['packshot_directories']}` directories on disk",
        f"- Category exact-match summary: `{prep_overview['category_match_summary']}`",
        f"- Classification readiness: `{prep_overview['classification_readiness_counts']}`",
        f"- Manual review decisions: `{prep_overview['manual_review_decision_counts']}`",
        f"- Image sampler buckets: `{prep_overview['image_sampler_bucket_counts']}`",
        f"- Blocked dev split: `{prep_overview['blocked_split']['train_image_count']}` train / `{prep_overview['blocked_split']['val_image_count']}` val images",
        f"- GT crop manifest rows: `{prep_overview['source_counts']['annotations']}`",
        "",
        "## Suggested Flow",
        "",
        "1. Read this index.",
        "2. Use the deep audit when you need proof or anomaly context.",
        "3. Use the fast prep builder to refresh manifests.",
        "4. Run the standalone verifier before trusting the prepared state.",
        "5. Run the ML pipeline verifier before trusting current modeling conclusions.",
        "6. Read the critical-path decision tree before starting new modeling work.",
        "7. Read the classifier/fusion strategy before starting recognizer work.",
        "8. Read the latest experiment report before starting new modeling work.",
        "9. Read the crop runtime before starting PE-Core or DINOv3.",
        "10. Extract GT crops only when you actually need them.",
        "",
        "## Rerun",
        "",
        "Heavy forensic audit:",
        f"- `python {Path('scripts/deep_audit_norgesgruppen_data.py')}`",
        "",
        "Fast prep/manifests build:",
        f"- `python {Path('scripts/build_norgesgruppen_prep.py')}`",
        "",
        "YOLO export build:",
        f"- `python {Path('scripts/export_norgesgruppen_yolo.py')}`",
        f"- `python {Path('scripts/export_norgesgruppen_yolo.py')} --class-agnostic`",
        f"- `python {Path('scripts/verify_norgesgruppen_yolo_export.py')}`",
        f"- `python {Path('scripts/verify_norgesgruppen_yolo_export.py')} --class-agnostic`",
        "",
        "Prepared-artifact verification:",
        f"- `python {Path('scripts/verify_norgesgruppen_prep.py')}`",
        f"- `python {Path('scripts/verify_norgesgruppen_ml_pipeline.py')}`",
        f"- `python {Path('scripts/build_norgesgruppen_label_controls.py')}`",
        "",
        "Crop floor benchmark:",
        f"- `python {Path('scripts/benchmark_norgesgruppen_crops.py')}`",
        "",
        "Optional GT crop extraction:",
        f"- `python {Path('scripts/extract_norgesgruppen_gt_crops.py')} --split val --limit 100`",
        "",
        "## Core Docs",
        "",
        f"- Overview of task/docs drift: [{Path('README.md').name}]({DOCS_ROOT / 'README.md'})",
        f"- Deep forensic audit: [{Path('deep-audit-summary.md').name}]({DOCS_ROOT / 'deep-audit-summary.md'})",
        f"- EDA roadmap: [{Path('eda-workstreams.md').name}]({DOCS_ROOT / 'eda-workstreams.md'})",
        f"- Unresolved class decisions: [{Path('unresolved-class-review.md').name}]({DOCS_ROOT / 'unresolved-class-review.md'})",
        f"- Split/eval plan: [{Path('split-eval-plan.md').name}]({DOCS_ROOT / 'split-eval-plan.md'})",
        f"- Modeling/validation plan: [{Path('modeling-experiment-plan.md').name}]({MODELING_EXPERIMENT_PLAN_MD})",
        f"- ML verification playbook: [{Path('ml-verification-playbook.md').name}]({DOCS_ROOT / 'ml-verification-playbook.md'})",
        f"- Execution roadmap: [{Path(ROADMAP_PLAN_MD.name).name}]({ROADMAP_PLAN_MD})",
        f"- Immediate execution wave: [{Path(IMMEDIATE_EXECUTION_PLAN_MD.name).name}]({IMMEDIATE_EXECUTION_PLAN_MD})",
        f"- Critical-path decision tree: [{Path(CRITICAL_PATH_PLAN_MD.name).name}]({CRITICAL_PATH_PLAN_MD})",
        f"- Classifier/fusion strategy: [{Path('PLAN-0004-classifier-and-fusion-strategy.md').name}]({DOCS_ROOT / 'plans' / 'PLAN-0004-classifier-and-fusion-strategy.md'})",
        f"- Frozen validation decision: [{Path(VALIDATION_DECISION_MD.name).name}]({VALIDATION_DECISION_MD})",
        f"- Frozen crop-eval decision: [{Path('DEC-0002-freeze-crop-retrieval-eval-contract.md').name}]({DOCS_ROOT / 'decisions' / 'DEC-0002-freeze-crop-retrieval-eval-contract.md'})",
        f"- Primary crop-embedder decision: [{Path('DEC-0003-keep-pe-core-as-primary-crop-embedder.md').name}]({DOCS_ROOT / 'decisions' / 'DEC-0003-keep-pe-core-as-primary-crop-embedder.md'})",
        f"- Frozen ML verification gates: [{Path('DEC-0004-freeze-ml-verification-gates.md').name}]({DOCS_ROOT / 'decisions' / 'DEC-0004-freeze-ml-verification-gates.md'})",
        f"- Latest experiment report: [{Path('REP-0009-first-det-plus-retrieval-baseline.md').name}]({DOCS_ROOT / 'reports' / 'REP-0009-first-det-plus-retrieval-baseline.md'})",
        f"- Crop retrieval runtime: [{Path('crop-retrieval-runtime.md').name}]({DOCS_ROOT / 'crop-retrieval-runtime.md'})",
        f"- Detection runtime: [{Path('detection-runtime.md').name}]({DOCS_ROOT / 'detection-runtime.md'})",
        f"- Operating structure: [{Path('project-operating-system.md').name}]({PROJECT_OPERATING_SYSTEM_MD})",
        f"- Data dictionary: [{Path('data-dictionary.md').name}]({DATA_DICTIONARY_MD})",
        f"- Prep playbook: [{Path('prep-playbook.md').name}]({PREP_PLAYBOOK_MD})",
        "",
        "## Core Manifests",
        "",
        f"- Category manifest: [{Path('category-manifest.json').name}]({CATEGORY_MANIFEST_JSON})",
        f"- Category strategy manifest: [{Path('category-strategy-manifest.json').name}]({CATEGORY_STRATEGY_MANIFEST_JSON})",
        f"- Image manifest: [{Path('image-manifest.json').name}]({IMAGE_MANIFEST_JSON})",
        f"- Image sampling manifest: [{Path('image-sampling-manifest.json').name}]({IMAGE_SAMPLING_MANIFEST_JSON})",
        f"- Packshot manifest: [{Path('packshot-manifest.json').name}]({PACKSHOT_MANIFEST_JSON})",
        f"- Problem-category manifest: [{Path('problem-category-manifest.json').name}]({PROBLEM_CATEGORY_MANIFEST_JSON})",
        f"- Training manifest: [{Path('training-manifest.json').name}]({TRAINING_MANIFEST_JSON})",
        f"- Train COCO subset: [{Path('train.json').name}]({TRAIN_COCO_JSON})",
        f"- Val COCO subset: [{Path('val.json').name}]({VAL_COCO_JSON})",
        f"- GT crop summary: [{Path('gt-crop-summary.json').name}]({GT_CROP_SUMMARY_JSON})",
        f"- GT crop manifest: [{Path('gt-crop-manifest.jsonl').name}]({GT_CROP_MANIFEST_JSONL})",
        f"- Prep verification summary: [{Path('prep-verification.json').name}]({PREP_VERIFICATION_JSON})",
        f"- ML pipeline verification summary: [{Path('ml-pipeline-verification.json').name}]({ROOT / 'data' / DATA_DATE / 'derived' / 'ml-pipeline-verification.json'})",
        f"- Shuffled-label control summary: [{Path('summary.json').name}]({ROOT / 'data' / DATA_DATE / 'derived' / 'control-datasets' / 'shuffled-label-control' / 'summary.json'})",
        f"- Prep overview: [{Path('prep-overview.json').name}]({PREP_OVERVIEW_JSON})",
        f"- Artifact index: [{Path('artifact-index.json').name}]({ARTIFACT_INDEX_JSON})",
        f"- YOLO dataset yaml: [{Path('dataset.yaml').name}]({YOLO_DATASET_YAML})",
        f"- YOLO export summary: [{Path('export-summary.json').name}]({YOLO_SUMMARY_JSON})",
        f"- YOLO export verification: [{Path('verification.json').name}]({YOLO_VERIFICATION_JSON})",
        f"- YOLO class-agnostic yaml: [{Path('dataset.yaml').name}]({YOLO_CLASS_AGNOSTIC_DATASET_YAML})",
        f"- YOLO class-agnostic summary: [{Path('export-summary.json').name}]({YOLO_CLASS_AGNOSTIC_SUMMARY_JSON})",
        f"- YOLO class-agnostic verification: [{Path('verification.json').name}]({YOLO_CLASS_AGNOSTIC_VERIFICATION_JSON})",
        "",
        "## Key Policies",
        "",
        "- Do not trust docs for category count/range or `annotations.json` field list; trust payload.",
        "- Do not auto-map coffee-family sibling variants just because names are close.",
        "- Treat egg tail as structurally under-covered by packshots.",
        "- Use blocked section-aware validation, not random split.",
    ]
    return "\n".join(lines) + "\n"


def render_data_dictionary_md() -> str:
    lines = [
        "# Data Dictionary",
        "",
        "This file describes source files, derived manifests, and the most important semantics/caveats.",
        "",
        "## Source Files",
        "",
        f"- [{Path('annotations.json').name}]({COCO_ANNOTATIONS})",
        "  - Canonical shelf labels.",
        "  - Verified annotation fields: `area`, `bbox`, `category_id`, `id`, `image_id`, `iscrowd`.",
        "  - Does not contain `product_code`, `product_name`, or `corrected`.",
        f"- [{Path('metadata.json').name}]({PRODUCT_METADATA})",
        "  - Product-reference metadata, including product names, image types, `annotation_count`, and `corrected_count`.",
        "  - Related to COCO, but not equal to current COCO counts.",
        f"- [{Path('manual-review-decisions.json').name}]({MANUAL_REVIEW_DECISIONS})",
        "  - Human-reviewed category join / policy decisions.",
        f"- [{Path('section-blocked-val-split.json').name}]({BLOCKED_SPLIT})",
        "  - Recommended day-to-day dev split derived from contiguous shelf sections.",
        "",
        "## Derived Manifests",
        "",
        f"- [{Path('category-manifest.json').name}]({CATEGORY_MANIFEST_JSON})",
        "  - One row per category.",
        "  - Includes counts, inferred theme, exact-match status against metadata, exact matched products, and manual review decision.",
        f"- [{Path('category-strategy-manifest.json').name}]({CATEGORY_STRATEGY_MANIFEST_JSON})",
        "  - One row per category, focused on modeling readiness.",
        "  - Includes rarity bucket, best usable reference, readiness bucket, flags, and a conservative heuristic detection weight.",
        f"- [{Path('image-manifest.json').name}]({IMAGE_MANIFEST_JSON})",
        "  - One row per shelf image.",
        "  - Includes annotation counts, distinct category count, dominant theme, segment guess, and whether image is in blocked validation.",
        f"- [{Path('image-sampling-manifest.json').name}]({IMAGE_SAMPLING_MANIFEST_JSON})",
        "  - One row per shelf image, focused on training-time sampling/difficulty.",
        "  - Includes rare/problem/reference-weak annotation counts plus a conservative sampler bucket/weight.",
        f"- [{Path('packshot-manifest.json').name}]({PACKSHOT_MANIFEST_JSON})",
        "  - One row per metadata product plus one row per disk-only directory such as `CUSTOM_*`.",
        "  - Includes metadata-vs-disk presence and image types.",
        f"- [{Path('problem-category-manifest.json').name}]({PROBLEM_CATEGORY_MANIFEST_JSON})",
        "  - Filtered category view for anything unresolved, ambiguous, no-packshot, or manually constrained.",
        f"- [{Path('training-manifest.json').name}]({TRAINING_MANIFEST_JSON})",
        "  - Split-level summary plus train/val image ids and subset paths.",
        f"- [{Path('train.json').name}]({TRAIN_COCO_JSON}) / [{Path('val.json').name}]({VAL_COCO_JSON})",
        "  - COCO-format train and validation subsets using the blocked section-aware split.",
        f"- [{Path('gt-crop-summary.json').name}]({GT_CROP_SUMMARY_JSON})",
        "  - Summary of the annotation-level crop manifest.",
        f"- [{Path('gt-crop-manifest.jsonl').name}]({GT_CROP_MANIFEST_JSONL})",
        "  - One row per annotation with split, bbox, category policy, and suggested crop output path.",
        f"- [{Path('prep-verification.json').name}]({PREP_VERIFICATION_JSON})",
        "  - Summary written by the standalone prep verifier.",
        f"- [{Path('prep-overview.json').name}]({PREP_OVERVIEW_JSON})",
        "  - Short summary of the prepared state.",
        f"- [{Path('dataset.yaml').name}]({YOLO_DATASET_YAML})",
        "  - YOLO-ready local training view built from the blocked split.",
        f"- [{Path('verification.json').name}]({YOLO_VERIFICATION_JSON})",
        "  - Geometric/structural proof that the multiclass YOLO export round-trips back to COCO within tolerance.",
        f"- [{Path('dataset.yaml').name}]({YOLO_CLASS_AGNOSTIC_DATASET_YAML})",
        "  - YOLO-ready class-agnostic local training view for localization baselines.",
        f"- [{Path('verification.json').name}]({YOLO_CLASS_AGNOSTIC_VERIFICATION_JSON})",
        "  - Geometric/structural proof that the class-agnostic YOLO export is exact.",
        "",
        "## Exact Match Status",
        "",
        "- `exact_unique_with_images`: normalized category name maps to one metadata product and that product has images.",
        "- `exact_unique_no_images`: normalized category name maps to one metadata product but that product has no packshots on disk.",
        "- `exact_name_ambiguous`: normalized category name maps to multiple metadata products.",
        "- `no_match`: no exact normalized-name match in metadata.",
        "",
        "## Manual Review Decisions",
        "",
        "- `map_likely`: acceptable provisional join for prep/baselines.",
        "- `manual_review`: plausible but not yet safe enough to fold in automatically.",
        "- `do_not_auto_map`: family/sibling variant trap.",
        "- `missing_ref_likely`: metadata likely lacks the real product reference.",
        "- `matched_no_packshot`: metadata row exists, but no reference images are present.",
        "- `exact_name_ambiguous`: exact normalized-name collision; do not choose arbitrarily.",
        "- `sentinel`: special class such as `unknown_product`.",
        "",
        "## Important Caveats",
        "",
        "- Category ids in the payload are `0..355`, not `0..356`.",
        "- The payload contains `248` images, not `254`.",
        "- `metadata.annotation_count` is not current-label truth.",
        "- `CUSTOM_*` directories are real extra assets and require explicit policy.",
    ]
    return "\n".join(lines) + "\n"


def render_prep_playbook_md(
    prep_overview: dict[str, Any],
    training_manifest: dict[str, Any],
) -> str:
    lines = [
        "# Prep Playbook",
        "",
        "This is the practical operating guide for rerunning prep and understanding which artifact to trust for which question.",
        "",
        "## Canonical Sequence",
        "",
        "1. `python scripts/build_norgesgruppen_prep.py`",
        "2. `python scripts/verify_norgesgruppen_prep.py`",
        "3. `python scripts/verify_norgesgruppen_ml_pipeline.py`",
        "4. `python scripts/export_norgesgruppen_yolo.py`",
        "5. `python scripts/verify_norgesgruppen_yolo_export.py` when you need proof that the multiclass YOLO export still matches COCO exactly",
        "6. `python scripts/export_norgesgruppen_yolo.py --class-agnostic` when starting localization baselines",
        "7. `python scripts/verify_norgesgruppen_yolo_export.py --class-agnostic` when you need proof that the class-agnostic YOLO export is still exact",
        "8. `python scripts/benchmark_norgesgruppen_crops.py` when you need the current crop floor",
        "9. `python scripts/extract_norgesgruppen_gt_crops.py --split val --limit 100` only when you need actual crops on disk",
        "",
        "## What Is Canonical",
        "",
        f"- Payload truth: [{Path('annotations.json').name}]({COCO_ANNOTATIONS}) and [{Path('metadata.json').name}]({PRODUCT_METADATA})",
        f"- Proof/anomaly source: [{Path('deep-audit-summary.md').name}]({DOCS_ROOT / 'deep-audit-summary.md'})",
        f"- Fast prep truth: [{Path('prep-overview.json').name}]({PREP_OVERVIEW_JSON}) plus the manifests under [{Path('derived').name}]({PREP_OVERVIEW_JSON.parent})",
        f"- Split truth: [{Path('training-manifest.json').name}]({TRAINING_MANIFEST_JSON})",
        f"- YOLO export truth: [{Path('verification.json').name}]({YOLO_VERIFICATION_JSON}) and [{Path('verification.json').name}]({YOLO_CLASS_AGNOSTIC_VERIFICATION_JSON}) once exports exist",
        f"- Category readiness truth: [{Path('category-strategy-manifest.json').name}]({CATEGORY_STRATEGY_MANIFEST_JSON})",
        f"- Image sampling truth: [{Path('image-sampling-manifest.json').name}]({IMAGE_SAMPLING_MANIFEST_JSON})",
        f"- Experiment/validation order: [{Path('modeling-experiment-plan.md').name}]({MODELING_EXPERIMENT_PLAN_MD})",
        f"- ML verification doctrine: [{Path('ml-verification-playbook.md').name}]({DOCS_ROOT / 'ml-verification-playbook.md'})",
        f"- Critical-path next-step logic: [{Path(CRITICAL_PATH_PLAN_MD.name).name}]({CRITICAL_PATH_PLAN_MD})",
        f"- Classifier/fusion next-step logic: [{Path('PLAN-0004-classifier-and-fusion-strategy.md').name}]({DOCS_ROOT / 'plans' / 'PLAN-0004-classifier-and-fusion-strategy.md'})",
        f"- Latest experiment report: [{Path('REP-0009-first-det-plus-retrieval-baseline.md').name}]({DOCS_ROOT / 'reports' / 'REP-0009-first-det-plus-retrieval-baseline.md'})",
        f"- Primary crop-embedder decision: [{Path('DEC-0003-keep-pe-core-as-primary-crop-embedder.md').name}]({DOCS_ROOT / 'decisions' / 'DEC-0003-keep-pe-core-as-primary-crop-embedder.md'})",
        f"- Frozen ML verification gates: [{Path('DEC-0004-freeze-ml-verification-gates.md').name}]({DOCS_ROOT / 'decisions' / 'DEC-0004-freeze-ml-verification-gates.md'})",
        f"- Crop runtime / commands: [{Path('crop-retrieval-runtime.md').name}]({DOCS_ROOT / 'crop-retrieval-runtime.md'})",
        f"- Detection runtime / commands: [{Path('detection-runtime.md').name}]({DOCS_ROOT / 'detection-runtime.md'})",
        f"- Documentation / experiment structure: [{Path('project-operating-system.md').name}]({PROJECT_OPERATING_SYSTEM_MD})",
        "",
        "## Current Locked Facts",
        "",
        f"- COCO payload: `{prep_overview['source_counts']['images']}` images, `{prep_overview['source_counts']['annotations']}` annotations, `{prep_overview['source_counts']['categories']}` categories",
        f"- Product refs: `{prep_overview['source_counts']['metadata_products']}` metadata rows, `{prep_overview['source_counts']['packshot_directories']}` on-disk directories, `{prep_overview['custom_packshot_dir_count']}` `CUSTOM_*` directories",
        f"- Blocked split: `{training_manifest['splits']['train']['image_count']}` train / `{training_manifest['splits']['val']['image_count']}` val",
        f"- Problem categories: `{prep_overview['problem_category_count']}`",
        f"- Classification readiness buckets: `{prep_overview['classification_readiness_counts']}`",
        "",
        "## Training Implications",
        "",
        "- Use the blocked section-aware split, not random split.",
        "- Treat `category-strategy-manifest.json` as the first filter for which classes are safe for packshot-driven classification.",
        "- Treat `image-sampling-manifest.json` as a starting point for curriculum or weighted image sampling, not as a hard rule.",
        "- Treat `unknown_product` as a real sentinel class; never collapse it into a concrete SKU.",
        "- Treat coffee-family near-matches as dangerous sibling traps unless manually cleared.",
        "",
        "## Minimal Files To Hand Another Agent",
        "",
        f"- [{Path('INDEX.md').name}]({INDEX_MD})",
        f"- [{Path('deep-audit-summary.md').name}]({DOCS_ROOT / 'deep-audit-summary.md'})",
        f"- [{Path('ml-verification-playbook.md').name}]({DOCS_ROOT / 'ml-verification-playbook.md'})",
        f"- [{Path('REP-0009-first-det-plus-retrieval-baseline.md').name}]({DOCS_ROOT / 'reports' / 'REP-0009-first-det-plus-retrieval-baseline.md'})",
        f"- [{Path('category-strategy-manifest.json').name}]({CATEGORY_STRATEGY_MANIFEST_JSON})",
        f"- [{Path('image-sampling-manifest.json').name}]({IMAGE_SAMPLING_MANIFEST_JSON})",
        f"- [{Path('training-manifest.json').name}]({TRAINING_MANIFEST_JSON})",
        f"- [{Path('experiment-registry.json').name}]({EXPERIMENT_REGISTRY_JSON})",
        f"- [{Path('manual-review-decisions.json').name}]({MANUAL_REVIEW_DECISIONS})",
        "",
        "## Heuristic Notes",
        "",
        "- `heuristic_detection_weight` is inverse-sqrt frequency, capped, and meant as a safe baseline only.",
        "- `heuristic_sampler_weight` is conservative on purpose; it nudges toward rare/problem-rich images without exploding density bias.",
        "",
    ]
    return "\n".join(lines) + "\n"


def build_artifact_index() -> dict[str, Any]:
    return {
        "docs": {
            "index_md": str(INDEX_MD.relative_to(ROOT)),
            "data_dictionary_md": str(DATA_DICTIONARY_MD.relative_to(ROOT)),
            "prep_playbook_md": str(PREP_PLAYBOOK_MD.relative_to(ROOT)),
            "modeling_experiment_plan_md": str(MODELING_EXPERIMENT_PLAN_MD.relative_to(ROOT)),
            "ml_verification_playbook_md": str((DOCS_ROOT / "ml-verification-playbook.md").relative_to(ROOT)),
            "project_operating_system_md": str(PROJECT_OPERATING_SYSTEM_MD.relative_to(ROOT)),
            "roadmap_plan_md": str(ROADMAP_PLAN_MD.relative_to(ROOT)),
            "immediate_execution_plan_md": str(IMMEDIATE_EXECUTION_PLAN_MD.relative_to(ROOT)),
            "critical_path_plan_md": str(CRITICAL_PATH_PLAN_MD.relative_to(ROOT)),
            "validation_decision_md": str(VALIDATION_DECISION_MD.relative_to(ROOT)),
            "crop_eval_decision_md": str((DOCS_ROOT / "decisions" / "DEC-0002-freeze-crop-retrieval-eval-contract.md").relative_to(ROOT)),
            "primary_crop_embedder_decision_md": str((DOCS_ROOT / "decisions" / "DEC-0003-keep-pe-core-as-primary-crop-embedder.md").relative_to(ROOT)),
            "ml_verification_decision_md": str((DOCS_ROOT / "decisions" / "DEC-0004-freeze-ml-verification-gates.md").relative_to(ROOT)),
            "latest_experiment_report_md": str((DOCS_ROOT / "reports" / "REP-0009-first-det-plus-retrieval-baseline.md").relative_to(ROOT)),
            "crop_retrieval_runtime_md": str((DOCS_ROOT / "crop-retrieval-runtime.md").relative_to(ROOT)),
            "detection_runtime_md": str((DOCS_ROOT / "detection-runtime.md").relative_to(ROOT)),
            "readme_md": str((DOCS_ROOT / "README.md").relative_to(ROOT)),
            "deep_audit_summary_md": str((DOCS_ROOT / "deep-audit-summary.md").relative_to(ROOT)),
            "eda_workstreams_md": str((DOCS_ROOT / "eda-workstreams.md").relative_to(ROOT)),
            "unresolved_class_review_md": str((DOCS_ROOT / "unresolved-class-review.md").relative_to(ROOT)),
            "split_eval_plan_md": str((DOCS_ROOT / "split-eval-plan.md").relative_to(ROOT)),
        },
        "data": {
            "manual_review_decisions_json": str(MANUAL_REVIEW_DECISIONS.relative_to(ROOT)),
            "blocked_split_json": str(BLOCKED_SPLIT.relative_to(ROOT)),
            "prep_overview_json": str(PREP_OVERVIEW_JSON.relative_to(ROOT)),
            "training_manifest_json": str(TRAINING_MANIFEST_JSON.relative_to(ROOT)),
            "gt_crop_summary_json": str(GT_CROP_SUMMARY_JSON.relative_to(ROOT)),
            "gt_crop_manifest_jsonl": str(GT_CROP_MANIFEST_JSONL.relative_to(ROOT)),
            "prep_verification_json": str(PREP_VERIFICATION_JSON.relative_to(ROOT)),
            "ml_pipeline_verification_json": str((ROOT / "data" / DATA_DATE / "derived" / "ml-pipeline-verification.json").relative_to(ROOT)),
            "shuffled_label_control_summary_json": str((ROOT / "data" / DATA_DATE / "derived" / "control-datasets" / "shuffled-label-control" / "summary.json").relative_to(ROOT)),
            "train_coco_json": str(TRAIN_COCO_JSON.relative_to(ROOT)),
            "val_coco_json": str(VAL_COCO_JSON.relative_to(ROOT)),
            "category_manifest_json": str(CATEGORY_MANIFEST_JSON.relative_to(ROOT)),
            "category_strategy_manifest_json": str(CATEGORY_STRATEGY_MANIFEST_JSON.relative_to(ROOT)),
            "image_manifest_json": str(IMAGE_MANIFEST_JSON.relative_to(ROOT)),
            "image_sampling_manifest_json": str(IMAGE_SAMPLING_MANIFEST_JSON.relative_to(ROOT)),
            "packshot_manifest_json": str(PACKSHOT_MANIFEST_JSON.relative_to(ROOT)),
            "problem_category_manifest_json": str(PROBLEM_CATEGORY_MANIFEST_JSON.relative_to(ROOT)),
            "experiment_registry_json": str((ROOT / "data" / "2026-03-19" / "experiments" / "experiment-registry.json").relative_to(ROOT)),
            "yolo_dataset_yaml": str(YOLO_DATASET_YAML.relative_to(ROOT)),
            "yolo_export_summary_json": str(YOLO_SUMMARY_JSON.relative_to(ROOT)),
            "yolo_export_verification_json": str(YOLO_VERIFICATION_JSON.relative_to(ROOT)),
            "yolo_class_agnostic_dataset_yaml": str(YOLO_CLASS_AGNOSTIC_DATASET_YAML.relative_to(ROOT)),
            "yolo_class_agnostic_export_summary_json": str(YOLO_CLASS_AGNOSTIC_SUMMARY_JSON.relative_to(ROOT)),
            "yolo_class_agnostic_export_verification_json": str(YOLO_CLASS_AGNOSTIC_VERIFICATION_JSON.relative_to(ROOT)),
        },
        "scripts": {
            "deep_audit": str((ROOT / "scripts" / "deep_audit_norgesgruppen_data.py").relative_to(ROOT)),
            "prep_builder": str((ROOT / "scripts" / "build_norgesgruppen_prep.py").relative_to(ROOT)),
            "prep_verifier": str((ROOT / "scripts" / "verify_norgesgruppen_prep.py").relative_to(ROOT)),
            "ml_pipeline_verifier": str((ROOT / "scripts" / "verify_norgesgruppen_ml_pipeline.py").relative_to(ROOT)),
            "label_control_builder": str((ROOT / "scripts" / "build_norgesgruppen_label_controls.py").relative_to(ROOT)),
            "prediction_evaluator": str((ROOT / "scripts" / "eval_norgesgruppen_predictions.py").relative_to(ROOT)),
            "oracle_box_bound_evaluator": str((ROOT / "scripts" / "eval_norgesgruppen_oracle_box_bound.py").relative_to(ROOT)),
            "crop_benchmark_common": str((ROOT / "scripts" / "norgesgruppen_crop_benchmark_common.py").relative_to(ROOT)),
            "retrieval_backends": str((ROOT / "scripts" / "norgesgruppen_retrieval_backends.py").relative_to(ROOT)),
            "crop_floor_benchmark": str((ROOT / "scripts" / "benchmark_norgesgruppen_crops.py").relative_to(ROOT)),
            "crop_rankings_evaluator": str((ROOT / "scripts" / "eval_norgesgruppen_crop_rankings.py").relative_to(ROOT)),
            "crop_retrieval_runner": str((ROOT / "scripts" / "run_norgesgruppen_crop_retrieval.py").relative_to(ROOT)),
            "det_plus_retrieval_runner": str((ROOT / "scripts" / "run_norgesgruppen_det_plus_retrieval.py").relative_to(ROOT)),
            "det_plus_retrieval_analyzer": str((ROOT / "scripts" / "analyze_norgesgruppen_det_plus_retrieval.py").relative_to(ROOT)),
            "pipeline_score_fusion_sweep": str((ROOT / "scripts" / "sweep_norgesgruppen_pipeline_score_fusion.py").relative_to(ROOT)),
            "crop_env_setup": str((ROOT / "scripts" / "setup_norgesgruppen_crop_env.sh").relative_to(ROOT)),
            "crop_python_wrapper": str((ROOT / "scripts" / "run_norgesgruppen_crop_python.sh").relative_to(ROOT)),
            "detection_evaluator": str((ROOT / "scripts" / "eval_norgesgruppen_class_agnostic_detection.py").relative_to(ROOT)),
            "yolo_txt_converter": str((ROOT / "scripts" / "convert_yolo_txt_predictions.py").relative_to(ROOT)),
            "yolov8_runner": str((ROOT / "scripts" / "run_norgesgruppen_yolov8.py").relative_to(ROOT)),
            "yolo_run_finalizer": str((ROOT / "scripts" / "finalize_norgesgruppen_yolo_run.py").relative_to(ROOT)),
            "yolo_export_verifier": str((ROOT / "scripts" / "verify_norgesgruppen_yolo_export.py").relative_to(ROOT)),
            "det_env_setup": str((ROOT / "scripts" / "setup_norgesgruppen_det_env.sh").relative_to(ROOT)),
            "det_python_wrapper": str((ROOT / "scripts" / "run_norgesgruppen_det_python.sh").relative_to(ROOT)),
            "gt_crop_extractor": str((ROOT / "scripts" / "extract_norgesgruppen_gt_crops.py").relative_to(ROOT)),
            "yolo_exporter": str((ROOT / "scripts" / "export_norgesgruppen_yolo.py").relative_to(ROOT)),
            "experiment_scaffolder": str((ROOT / "scripts" / "scaffold_norgesgruppen_experiment.py").relative_to(ROOT)),
        },
    }


def run_self_checks(
    context: dict[str, Any],
    category_manifest: list[dict[str, Any]],
    category_strategy_manifest: list[dict[str, Any]],
    image_manifest: list[dict[str, Any]],
    image_sampling_manifest: list[dict[str, Any]],
    packshot_manifest: list[dict[str, Any]],
    problem_category_manifest: list[dict[str, Any]],
    prep_overview: dict[str, Any],
    training_manifest: dict[str, Any],
    train_coco: dict[str, Any],
    val_coco: dict[str, Any],
    gt_crop_rows: list[dict[str, Any]],
    gt_crop_summary: dict[str, Any],
) -> None:
    deep_audit = context["deep_audit"]

    assert len({row["category_id"] for row in category_manifest}) == len(category_manifest), "Duplicate category ids in category manifest."
    assert len({row["category_id"] for row in category_strategy_manifest}) == len(category_strategy_manifest), "Duplicate category ids in category strategy manifest."
    assert len({row["image_id"] for row in image_manifest}) == len(image_manifest), "Duplicate image ids in image manifest."
    assert len({row["image_id"] for row in image_sampling_manifest}) == len(image_sampling_manifest), "Duplicate image ids in image sampling manifest."
    assert len([row for row in image_manifest if row["is_blocked_val_image"]]) == len(context["blocked_val_image_ids"]), "Blocked val image count mismatch."

    assert prep_overview["source_counts"]["images"] == deep_audit["coco"]["counts"]["images"], "Image count drift vs deep audit."
    assert prep_overview["source_counts"]["annotations"] == deep_audit["coco"]["counts"]["annotations"], "Annotation count drift vs deep audit."
    assert prep_overview["source_counts"]["categories"] == deep_audit["coco"]["counts"]["categories"], "Category count drift vs deep audit."
    assert prep_overview["source_counts"]["metadata_products"] == deep_audit["packshots"]["metadata_counts"]["total_products"], "Metadata product count drift vs deep audit."
    assert prep_overview["source_counts"]["packshot_directories"] == deep_audit["packshots"]["disk_counts"]["product_dirs"], "Packshot directory count drift vs deep audit."

    exact_unique_with_images = sum(1 for row in category_manifest if row["exact_match_status"] == "exact_unique_with_images")
    exact_unique_no_images = sum(1 for row in category_manifest if row["exact_match_status"] == "exact_unique_no_images")
    exact_name_ambiguous = sum(1 for row in category_manifest if row["exact_match_status"] == "exact_name_ambiguous")
    no_match = sum(1 for row in category_manifest if row["exact_match_status"] == "no_match")
    assert exact_unique_with_images == 319, "Unexpected exact_unique_with_images count."
    assert exact_unique_no_images == 2, "Unexpected exact_unique_no_images count."
    assert exact_name_ambiguous == len(deep_audit["alignment"]["ambiguous_name_matches"]), "Unexpected exact_name_ambiguous count."
    assert no_match == deep_audit["alignment"]["unmatched_categories_count"], "Unexpected no_match count."
    assert len(problem_category_manifest) == exact_unique_no_images + exact_name_ambiguous + no_match, "Problem category manifest count mismatch."
    assert len(category_strategy_manifest) == len(category_manifest), "Category strategy manifest count mismatch."
    assert len(image_sampling_manifest) == len(image_manifest), "Image sampling manifest count mismatch."

    custom_packshot_dir_count = sum(1 for row in packshot_manifest if row["is_custom"])
    assert custom_packshot_dir_count == 17, "Unexpected custom packshot dir count."

    assert training_manifest["counts"]["images_total"] == len(image_manifest), "Training manifest image total mismatch."
    assert training_manifest["counts"]["annotations_total"] == len(context["boxes"]), "Training manifest annotation total mismatch."
    assert training_manifest["splits"]["train"]["image_count"] + training_manifest["splits"]["val"]["image_count"] == len(image_manifest), "Train/val image counts do not sum to total."
    assert training_manifest["splits"]["train"]["annotation_count"] + training_manifest["splits"]["val"]["annotation_count"] == len(context["boxes"]), "Train/val annotation counts do not sum to total."

    assert len(train_coco["images"]) == training_manifest["splits"]["train"]["image_count"], "Train COCO image count mismatch."
    assert len(val_coco["images"]) == training_manifest["splits"]["val"]["image_count"], "Val COCO image count mismatch."
    assert len(train_coco["annotations"]) == training_manifest["splits"]["train"]["annotation_count"], "Train COCO annotation count mismatch."
    assert len(val_coco["annotations"]) == training_manifest["splits"]["val"]["annotation_count"], "Val COCO annotation count mismatch."
    assert len(train_coco["categories"]) == len(context["categories"]), "Train COCO category count mismatch."
    assert len(val_coco["categories"]) == len(context["categories"]), "Val COCO category count mismatch."

    assert len(gt_crop_rows) == len(context["boxes"]), "GT crop row count mismatch."
    assert gt_crop_summary["row_count"] == len(context["boxes"]), "GT crop summary count mismatch."
    assert gt_crop_summary["split_counts"]["train"] + gt_crop_summary["split_counts"]["val"] == len(context["boxes"]), "GT crop split counts do not sum to total."


def run() -> None:
    sources = load_sources()
    context = build_context(sources)

    category_manifest = build_category_manifest(context)
    category_strategy_manifest = build_category_strategy_manifest(context, category_manifest)
    image_manifest = build_image_manifest(context)
    image_sampling_manifest = build_image_sampling_manifest(context, category_strategy_manifest, image_manifest)
    packshot_manifest = build_packshot_manifest(context)
    problem_category_manifest = build_problem_category_manifest(category_manifest)
    train_coco = build_split_coco(sources["annotations"], set(image_id for image_id in context["images_by_id"] if image_id not in context["blocked_val_image_ids"]))
    val_coco = build_split_coco(sources["annotations"], set(context["blocked_val_image_ids"]))
    training_manifest = build_training_manifest(
        context=context,
        category_manifest=category_manifest,
        image_manifest=image_manifest,
    )
    gt_crop_rows, gt_crop_summary = build_gt_crop_manifest(
        context=context,
        category_manifest=category_manifest,
    )
    prep_overview = build_prep_overview(
        context=context,
        category_manifest=category_manifest,
        category_strategy_manifest=category_strategy_manifest,
        image_manifest=image_manifest,
        image_sampling_manifest=image_sampling_manifest,
        packshot_manifest=packshot_manifest,
        problem_category_manifest=problem_category_manifest,
    )
    artifact_index = build_artifact_index()

    run_self_checks(
        context=context,
        category_manifest=category_manifest,
        category_strategy_manifest=category_strategy_manifest,
        image_manifest=image_manifest,
        image_sampling_manifest=image_sampling_manifest,
        packshot_manifest=packshot_manifest,
        problem_category_manifest=problem_category_manifest,
        prep_overview=prep_overview,
        training_manifest=training_manifest,
        train_coco=train_coco,
        val_coco=val_coco,
        gt_crop_rows=gt_crop_rows,
        gt_crop_summary=gt_crop_summary,
    )

    write_json(PREP_OVERVIEW_JSON, prep_overview)
    write_json(CATEGORY_MANIFEST_JSON, category_manifest)
    write_json(CATEGORY_STRATEGY_MANIFEST_JSON, category_strategy_manifest)
    write_json(IMAGE_MANIFEST_JSON, image_manifest)
    write_json(IMAGE_SAMPLING_MANIFEST_JSON, image_sampling_manifest)
    write_json(PACKSHOT_MANIFEST_JSON, packshot_manifest)
    write_json(PROBLEM_CATEGORY_MANIFEST_JSON, problem_category_manifest)
    write_json(TRAINING_MANIFEST_JSON, training_manifest)
    write_json(TRAIN_COCO_JSON, train_coco)
    write_json(VAL_COCO_JSON, val_coco)
    write_json(GT_CROP_SUMMARY_JSON, gt_crop_summary)
    write_jsonl(GT_CROP_MANIFEST_JSONL, gt_crop_rows)
    write_json(ARTIFACT_INDEX_JSON, artifact_index)

    INDEX_MD.write_text(render_index_md(prep_overview))
    DATA_DICTIONARY_MD.write_text(render_data_dictionary_md())
    PREP_PLAYBOOK_MD.write_text(render_prep_playbook_md(prep_overview, training_manifest))

    print(f"Wrote {PREP_OVERVIEW_JSON}")
    print(f"Wrote {CATEGORY_MANIFEST_JSON}")
    print(f"Wrote {CATEGORY_STRATEGY_MANIFEST_JSON}")
    print(f"Wrote {IMAGE_MANIFEST_JSON}")
    print(f"Wrote {IMAGE_SAMPLING_MANIFEST_JSON}")
    print(f"Wrote {PACKSHOT_MANIFEST_JSON}")
    print(f"Wrote {PROBLEM_CATEGORY_MANIFEST_JSON}")
    print(f"Wrote {TRAINING_MANIFEST_JSON}")
    print(f"Wrote {TRAIN_COCO_JSON}")
    print(f"Wrote {VAL_COCO_JSON}")
    print(f"Wrote {GT_CROP_SUMMARY_JSON}")
    print(f"Wrote {GT_CROP_MANIFEST_JSONL}")
    print(f"Wrote {ARTIFACT_INDEX_JSON}")
    print(f"Wrote {INDEX_MD}")
    print(f"Wrote {DATA_DICTIONARY_MD}")
    print(f"Wrote {PREP_PLAYBOOK_MD}")
    print("Prep self-checks passed.")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build fast derived prep artifacts for the NorgesGruppen dataset.")
    parser.parse_args()
    run()


if __name__ == "__main__":
    main()
