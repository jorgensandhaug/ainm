#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

from norgesgruppen_prep_common import (
    BLOCKED_SPLIT,
    CATEGORY_MANIFEST_JSON,
    CATEGORY_STRATEGY_MANIFEST_JSON,
    COCO_ANNOTATIONS,
    DATA_DATE,
    DEEP_AUDIT_JSON,
    EXPERIMENT_REGISTRY_JSON,
    GT_CROP_MANIFEST_JSONL,
    GT_CROP_SUMMARY_JSON,
    IMAGE_MANIFEST_JSON,
    IMAGE_SAMPLING_MANIFEST_JSON,
    IMMEDIATE_EXECUTION_PLAN_MD,
    MANUAL_REVIEW_DECISIONS,
    MODELING_EXPERIMENT_PLAN_MD,
    PACKSHOT_MANIFEST_JSON,
    PREP_OVERVIEW_JSON,
    PREP_VERIFICATION_JSON,
    PROJECT_OPERATING_SYSTEM_MD,
    PRODUCT_METADATA,
    PROBLEM_CATEGORY_MANIFEST_JSON,
    ROADMAP_PLAN_MD,
    ROOT,
    TRAIN_COCO_JSON,
    TRAINING_MANIFEST_JSON,
    VALIDATION_DECISION_MD,
    VAL_COCO_JSON,
    YOLO_CLASS_AGNOSTIC_ROOT,
    YOLO_CLASS_AGNOSTIC_SUMMARY_JSON,
    YOLO_ROOT,
    YOLO_SUMMARY_JSON,
    iter_jsonl,
    read_json,
)


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def verify() -> dict[str, Any]:
    required_paths = [
        COCO_ANNOTATIONS,
        PRODUCT_METADATA,
        DEEP_AUDIT_JSON,
        MANUAL_REVIEW_DECISIONS,
        BLOCKED_SPLIT,
        PREP_OVERVIEW_JSON,
        CATEGORY_MANIFEST_JSON,
        CATEGORY_STRATEGY_MANIFEST_JSON,
        IMAGE_MANIFEST_JSON,
        IMAGE_SAMPLING_MANIFEST_JSON,
        PACKSHOT_MANIFEST_JSON,
        PROBLEM_CATEGORY_MANIFEST_JSON,
        TRAINING_MANIFEST_JSON,
        GT_CROP_SUMMARY_JSON,
        GT_CROP_MANIFEST_JSONL,
        TRAIN_COCO_JSON,
        VAL_COCO_JSON,
        MODELING_EXPERIMENT_PLAN_MD,
        PROJECT_OPERATING_SYSTEM_MD,
        ROADMAP_PLAN_MD,
        IMMEDIATE_EXECUTION_PLAN_MD,
        VALIDATION_DECISION_MD,
        EXPERIMENT_REGISTRY_JSON,
    ]
    missing_paths = [str(path.relative_to(ROOT)) for path in required_paths if not path.exists()]
    require(not missing_paths, f"Missing required files: {missing_paths}")

    raw_annotations = read_json(COCO_ANNOTATIONS)
    raw_metadata = read_json(PRODUCT_METADATA)
    deep_audit = read_json(DEEP_AUDIT_JSON)
    manual_review = read_json(MANUAL_REVIEW_DECISIONS)
    blocked_split = read_json(BLOCKED_SPLIT)
    prep_overview = read_json(PREP_OVERVIEW_JSON)
    category_manifest = read_json(CATEGORY_MANIFEST_JSON)
    category_strategy_manifest = read_json(CATEGORY_STRATEGY_MANIFEST_JSON)
    image_manifest = read_json(IMAGE_MANIFEST_JSON)
    image_sampling_manifest = read_json(IMAGE_SAMPLING_MANIFEST_JSON)
    packshot_manifest = read_json(PACKSHOT_MANIFEST_JSON)
    problem_category_manifest = read_json(PROBLEM_CATEGORY_MANIFEST_JSON)
    training_manifest = read_json(TRAINING_MANIFEST_JSON)
    gt_crop_summary = read_json(GT_CROP_SUMMARY_JSON)
    train_coco = read_json(TRAIN_COCO_JSON)
    val_coco = read_json(VAL_COCO_JSON)
    experiment_registry = read_json(EXPERIMENT_REGISTRY_JSON)

    require(prep_overview["source_counts"]["images"] == 248, "Unexpected image count in prep overview.")
    require(prep_overview["source_counts"]["annotations"] == 22731, "Unexpected annotation count in prep overview.")
    require(prep_overview["source_counts"]["categories"] == 356, "Unexpected category count in prep overview.")
    require(prep_overview["source_counts"]["metadata_products"] == 329, "Unexpected metadata product count in prep overview.")
    require(prep_overview["source_counts"]["packshot_directories"] == 344, "Unexpected packshot directory count in prep overview.")
    require(prep_overview["problem_category_count"] == 37, "Unexpected problem category count.")
    require(prep_overview["custom_packshot_dir_count"] == 17, "Unexpected custom packshot dir count.")

    require(len(category_manifest) == 356, "Category manifest row count mismatch.")
    require(len({row["category_id"] for row in category_manifest}) == 356, "Duplicate category ids in category manifest.")
    require(len(category_strategy_manifest) == 356, "Category strategy manifest row count mismatch.")
    require(len({row["category_id"] for row in category_strategy_manifest}) == 356, "Duplicate category ids in category strategy manifest.")
    require(len(image_manifest) == 248, "Image manifest row count mismatch.")
    require(len({row["image_id"] for row in image_manifest}) == 248, "Duplicate image ids in image manifest.")
    require(len(image_sampling_manifest) == 248, "Image sampling manifest row count mismatch.")
    require(len({row["image_id"] for row in image_sampling_manifest}) == 248, "Duplicate image ids in image sampling manifest.")
    require(len(problem_category_manifest) == 37, "Problem category manifest row count mismatch.")
    require(len(packshot_manifest) == 346, "Packshot manifest row count mismatch.")

    blocked_val_image_ids = set(blocked_split["val_image_ids"])
    image_manifest_val_ids = {row["image_id"] for row in image_manifest if row["is_blocked_val_image"]}
    require(blocked_val_image_ids == image_manifest_val_ids, "Blocked val image ids mismatch between split and image manifest.")
    require(len(blocked_val_image_ids) == 49, "Unexpected blocked val image count.")

    train_image_ids = set(training_manifest["splits"]["train"]["image_ids"])
    val_image_ids = set(training_manifest["splits"]["val"]["image_ids"])
    raw_image_ids = {image["id"] for image in raw_annotations["images"]}
    require(not (train_image_ids & val_image_ids), "Train/val image overlap detected.")
    require(train_image_ids | val_image_ids == raw_image_ids, "Train/val image ids do not cover raw image ids.")
    require(val_image_ids == blocked_val_image_ids, "Training manifest val ids mismatch blocked split.")
    require(training_manifest["splits"]["train"]["image_count"] == 199, "Unexpected train image count.")
    require(training_manifest["splits"]["val"]["image_count"] == 49, "Unexpected val image count.")

    require(len(train_coco["images"]) == 199, "Train COCO image count mismatch.")
    require(len(val_coco["images"]) == 49, "Val COCO image count mismatch.")
    require(len(train_coco["annotations"]) + len(val_coco["annotations"]) == 22731, "Train/val COCO annotation counts do not sum to total.")
    require({image["id"] for image in train_coco["images"]} == train_image_ids, "Train COCO image ids mismatch training manifest.")
    require({image["id"] for image in val_coco["images"]} == val_image_ids, "Val COCO image ids mismatch training manifest.")
    require(len(train_coco["categories"]) == 356, "Train COCO category count mismatch.")
    require(len(val_coco["categories"]) == 356, "Val COCO category count mismatch.")

    gt_crop_row_count = 0
    gt_crop_split_counts = Counter()
    gt_crop_category_ids = set()
    for row in iter_jsonl(GT_CROP_MANIFEST_JSONL):
        gt_crop_row_count += 1
        gt_crop_split_counts[row["split"]] += 1
        gt_crop_category_ids.add(row["category_id"])
    require(gt_crop_row_count == 22731, "GT crop manifest row count mismatch.")
    require(gt_crop_summary["row_count"] == 22731, "GT crop summary row count mismatch.")
    require(gt_crop_summary["split_counts"] == dict(sorted(gt_crop_split_counts.items())), "GT crop split counts mismatch.")
    require(len(gt_crop_category_ids) == 356, "GT crop manifest does not cover all categories.")

    strategy_ids = {row["category_id"] for row in category_strategy_manifest}
    require(strategy_ids == {row["category_id"] for row in category_manifest}, "Category strategy ids mismatch category manifest.")
    require(
        Counter(row["classification_readiness_bucket"] for row in category_strategy_manifest)
        == Counter(prep_overview["classification_readiness_counts"]),
        "Classification readiness counts mismatch prep overview.",
    )
    require(
        Counter(row["heuristic_sampler_bucket"] for row in image_sampling_manifest)
        == Counter(prep_overview["image_sampler_bucket_counts"]),
        "Image sampler bucket counts mismatch prep overview.",
    )

    manual_review_rows = manual_review["category_decisions"]
    require(len({row["category_id"] for row in manual_review_rows}) == len(manual_review_rows), "Duplicate category ids in manual review decisions.")
    packshot_by_code = {row["product_code"]: row for row in packshot_manifest}
    metadata_by_code = {row["product_code"]: row for row in raw_metadata["products"]}
    for row in manual_review_rows:
        decision = row["decision"]
        target_product_code = row.get("target_product_code")
        if decision == "map_likely":
            require(target_product_code in packshot_by_code, f"Missing packshot target for map_likely category {row['category_id']}.")
        if decision == "matched_no_packshot":
            require(target_product_code in metadata_by_code, f"Missing metadata row for matched_no_packshot category {row['category_id']}.")
            require(metadata_by_code[target_product_code]["has_images"] is False, f"matched_no_packshot target unexpectedly has images for category {row['category_id']}.")

    require(deep_audit["coco"]["counts"]["images"] == 248, "Deep audit image count drift.")
    require(deep_audit["coco"]["counts"]["annotations"] == 22731, "Deep audit annotation count drift.")
    require(deep_audit["coco"]["counts"]["categories"] == 356, "Deep audit category count drift.")
    require(len(experiment_registry["experiments"]) >= 1, "Experiment registry is unexpectedly empty.")
    require(experiment_registry["experiments"][0]["id"] == "EXP-0001", "Experiment registry first entry drift.")

    optional_checks = {}
    if YOLO_SUMMARY_JSON.exists():
        yolo_summary = read_json(YOLO_SUMMARY_JSON)
        require(yolo_summary["counts"]["train_images"] == 199, "YOLO export train image count mismatch.")
        require(yolo_summary["counts"]["val_images"] == 49, "YOLO export val image count mismatch.")
        require(yolo_summary["counts"]["train_annotations"] == 18327, "YOLO export train annotation count mismatch.")
        require(yolo_summary["counts"]["val_annotations"] == 4404, "YOLO export val annotation count mismatch.")
        train_label_count = len(list((YOLO_ROOT / "labels" / "train").glob("*.txt")))
        val_label_count = len(list((YOLO_ROOT / "labels" / "val").glob("*.txt")))
        require(train_label_count == 199, "YOLO train label file count mismatch.")
        require(val_label_count == 49, "YOLO val label file count mismatch.")
        optional_checks["yolo_export"] = "ok"

    if YOLO_CLASS_AGNOSTIC_SUMMARY_JSON.exists():
        yolo_summary = read_json(YOLO_CLASS_AGNOSTIC_SUMMARY_JSON)
        require(yolo_summary["counts"]["categories"] == 1, "Class-agnostic YOLO export category count mismatch.")
        require(yolo_summary["counts"]["train_images"] == 199, "Class-agnostic YOLO export train image count mismatch.")
        require(yolo_summary["counts"]["val_images"] == 49, "Class-agnostic YOLO export val image count mismatch.")
        require(yolo_summary["counts"]["train_annotations"] == 18327, "Class-agnostic YOLO export train annotation count mismatch.")
        require(yolo_summary["counts"]["val_annotations"] == 4404, "Class-agnostic YOLO export val annotation count mismatch.")
        train_label_count = len(list((YOLO_CLASS_AGNOSTIC_ROOT / "labels" / "train").glob("*.txt")))
        val_label_count = len(list((YOLO_CLASS_AGNOSTIC_ROOT / "labels" / "val").glob("*.txt")))
        require(train_label_count == 199, "Class-agnostic YOLO train label file count mismatch.")
        require(val_label_count == 49, "Class-agnostic YOLO val label file count mismatch.")
        optional_checks["yolo_class_agnostic_export"] = "ok"

    return {
        "status": "ok",
        "data_date": DATA_DATE,
        "verified_counts": {
            "images": 248,
            "annotations": 22731,
            "categories": 356,
            "metadata_products": 329,
            "packshot_directories": 344,
            "problem_categories": 37,
            "custom_packshot_dirs": 17,
            "train_images": 199,
            "val_images": 49,
            "gt_crop_rows": 22731,
        },
        "optional_checks": optional_checks,
        "checked_files": [str(path.relative_to(ROOT)) for path in required_paths],
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify prepared NorgesGruppen artifacts against audited truth.")
    parser.parse_args()
    summary = verify()
    PREP_VERIFICATION_JSON.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    print(f"Wrote {PREP_VERIFICATION_JSON}")
    print("Prep verification passed.")


if __name__ == "__main__":
    main()
