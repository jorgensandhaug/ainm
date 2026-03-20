#!/usr/bin/env python3

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

from norgesgruppen_prep_common import (
    CATEGORY_STRATEGY_MANIFEST_JSON,
    CROP_CLASSIFIER_CATEGORY_ROLE_JSON,
    CROP_CLASSIFIER_ROOT,
    CROP_CLASSIFIER_SUMMARY_JSON,
    CROP_CLASSIFIER_TRAIN_JSONL,
    CROP_CLASSIFIER_VAL_JSONL,
    CROP_CLASSIFIER_VAL_TRAIN_SEEN_JSONL,
    CROP_CLASSIFIER_VAL_ZERO_TRAIN_SUPPORT_JSONL,
    DERIVED_ROOT,
    GT_CROP_MANIFEST_JSONL,
    ROOT,
    display_path,
    iter_jsonl,
    read_json,
    write_json,
    write_jsonl,
)


THEME_ORDER = ["egg", "frokost", "knekkebrod", "varmedrikker"]


def support_bucket(train_count: int) -> str:
    if train_count <= 0:
        return "zero_train_support"
    if train_count == 1:
        return "train_1"
    if train_count <= 5:
        return "train_2_5"
    if train_count <= 10:
        return "train_6_10"
    if train_count <= 20:
        return "train_11_20"
    return "train_21_plus"


def category_role(*, train_count: int, retrieval_available: bool) -> str:
    if train_count > 0 and retrieval_available:
        return "fusion_candidate"
    if train_count > 0 and not retrieval_available:
        return "classifier_priority"
    if train_count <= 0 and retrieval_available:
        return "retrieval_only_unseen_in_train"
    return "impossible_first_pass"


def selected_tiny_overfit_category_ids(category_rows: list[dict[str, Any]]) -> list[int]:
    selected: list[int] = []
    selected_set: set[int] = set()
    by_theme = defaultdict(list)
    for row in category_rows:
        if row["train_count"] < 20 or row["val_count"] < 5:
            continue
        if not row["classifier_trainable"]:
            continue
        by_theme[row["theme"]].append(row)

    for theme in THEME_ORDER:
        candidates = sorted(
            by_theme.get(theme, []),
            key=lambda row: (-row["train_count"], -row["val_count"], row["category_id"]),
        )
        for row in candidates[:2]:
            if row["category_id"] in selected_set:
                continue
            selected.append(row["category_id"])
            selected_set.add(row["category_id"])

    if len(selected) < 8:
        remaining = sorted(
            (
                row for row in category_rows
                if row["classifier_trainable"] and row["train_count"] >= 20 and row["val_count"] >= 5 and row["category_id"] not in selected_set
            ),
            key=lambda row: (-row["train_count"], -row["val_count"], row["category_id"]),
        )
        for row in remaining:
            selected.append(row["category_id"])
            selected_set.add(row["category_id"])
            if len(selected) >= 8:
                break
    return selected


def build_manifests(output_root: Path) -> dict[str, Any]:
    output_root.mkdir(parents=True, exist_ok=True)

    crop_rows = list(iter_jsonl(GT_CROP_MANIFEST_JSONL))
    category_rows = read_json(CATEGORY_STRATEGY_MANIFEST_JSON)

    train_counts = Counter(row["category_id"] for row in crop_rows if row["split"] == "train")
    val_counts = Counter(row["category_id"] for row in crop_rows if row["split"] == "val")

    category_role_rows = []
    classifier_label_map: dict[int, int] = {}
    next_label = 0
    for category in sorted(category_rows, key=lambda row: row["category_id"]):
        category_id = int(category["category_id"])
        train_count = int(train_counts[category_id])
        val_count = int(val_counts[category_id])
        retrieval_available = bool(category["best_reference_has_images"])
        trainable = train_count > 0
        if trainable:
            classifier_label_map[category_id] = next_label
            next_label += 1
        category_role_rows.append(
            {
                **category,
                "train_count": train_count,
                "val_count": val_count,
                "classifier_trainable": trainable,
                "classifier_label": classifier_label_map.get(category_id),
                "classifier_support_bucket": support_bucket(train_count),
                "retrieval_available": retrieval_available,
                "category_role": category_role(train_count=train_count, retrieval_available=retrieval_available),
            }
        )

    category_role_by_id = {row["category_id"]: row for row in category_role_rows}
    tiny_overfit_ids = selected_tiny_overfit_category_ids(category_role_rows)
    tiny_overfit_train_limit = 8
    tiny_overfit_val_limit = 4
    tiny_train_seen = Counter()
    tiny_val_seen = Counter()

    train_manifest = []
    val_manifest = []
    val_train_seen_manifest = []
    val_zero_train_support_manifest = []
    tiny_overfit_train_manifest = []
    tiny_overfit_val_manifest = []

    for row in crop_rows:
        category_meta = category_role_by_id[int(row["category_id"])]
        manifest_row = {
            **row,
            "expected_crop_path": display_path((DERIVED_ROOT / row["crop_rel_path"]).resolve()),
            "best_reference_product_code": category_meta["best_reference_product_code"],
            "best_reference_product_name": category_meta["best_reference_product_name"],
            "best_reference_has_images": category_meta["best_reference_has_images"],
            "best_reference_view_count": category_meta["best_reference_view_count"],
            "best_reference_view_bucket": category_meta["best_reference_view_bucket"],
            "classification_readiness_bucket": category_meta["classification_readiness_bucket"],
            "classifier_trainable": category_meta["classifier_trainable"],
            "classifier_label": category_meta["classifier_label"],
            "classifier_support_bucket": category_meta["classifier_support_bucket"],
            "category_role": category_meta["category_role"],
            "retrieval_available": category_meta["retrieval_available"],
        }
        if row["split"] == "train":
            train_manifest.append(manifest_row)
            if row["category_id"] in tiny_overfit_ids and tiny_train_seen[row["category_id"]] < tiny_overfit_train_limit:
                tiny_overfit_train_manifest.append(manifest_row)
                tiny_train_seen[row["category_id"]] += 1
        else:
            val_manifest.append(manifest_row)
            if category_meta["classifier_trainable"]:
                val_train_seen_manifest.append(manifest_row)
            else:
                val_zero_train_support_manifest.append(manifest_row)
            if row["category_id"] in tiny_overfit_ids and tiny_val_seen[row["category_id"]] < tiny_overfit_val_limit:
                tiny_overfit_val_manifest.append(manifest_row)
                tiny_val_seen[row["category_id"]] += 1

    write_json(CROP_CLASSIFIER_CATEGORY_ROLE_JSON, category_role_rows)
    write_jsonl(CROP_CLASSIFIER_TRAIN_JSONL, train_manifest)
    write_jsonl(CROP_CLASSIFIER_VAL_JSONL, val_manifest)
    write_jsonl(CROP_CLASSIFIER_VAL_TRAIN_SEEN_JSONL, val_train_seen_manifest)
    write_jsonl(CROP_CLASSIFIER_VAL_ZERO_TRAIN_SUPPORT_JSONL, val_zero_train_support_manifest)
    write_jsonl(output_root / "tiny-overfit-train.jsonl", tiny_overfit_train_manifest)
    write_jsonl(output_root / "tiny-overfit-val.jsonl", tiny_overfit_val_manifest)

    role_counts = Counter(row["category_role"] for row in category_role_rows)
    support_counts = Counter(row["classifier_support_bucket"] for row in category_role_rows)
    zero_train_support_rows = [row for row in category_role_rows if row["train_count"] <= 0 and row["val_count"] > 0]

    summary = {
        "output_root": display_path(output_root),
        "paths": {
            "category_role_manifest_json": display_path(CROP_CLASSIFIER_CATEGORY_ROLE_JSON),
            "train_manifest_jsonl": display_path(CROP_CLASSIFIER_TRAIN_JSONL),
            "val_manifest_jsonl": display_path(CROP_CLASSIFIER_VAL_JSONL),
            "val_train_seen_manifest_jsonl": display_path(CROP_CLASSIFIER_VAL_TRAIN_SEEN_JSONL),
            "val_zero_train_support_manifest_jsonl": display_path(CROP_CLASSIFIER_VAL_ZERO_TRAIN_SUPPORT_JSONL),
            "tiny_overfit_train_jsonl": display_path(output_root / "tiny-overfit-train.jsonl"),
            "tiny_overfit_val_jsonl": display_path(output_root / "tiny-overfit-val.jsonl"),
        },
        "counts": {
            "train_crop_count": len(train_manifest),
            "val_crop_count": len(val_manifest),
            "train_seen_class_count": sum(1 for row in category_role_rows if row["classifier_trainable"]),
            "val_class_count": sum(1 for row in category_role_rows if row["val_count"] > 0),
            "val_zero_train_support_class_count": len(zero_train_support_rows),
            "val_zero_train_support_crop_count": len(val_zero_train_support_manifest),
        },
        "category_role_counts": dict(sorted(role_counts.items())),
        "classifier_support_bucket_counts": dict(sorted(support_counts.items())),
        "val_zero_train_support_classes": [
            {
                "category_id": row["category_id"],
                "category_name": row["category_name"],
                "val_count": row["val_count"],
                "retrieval_available": row["retrieval_available"],
                "category_role": row["category_role"],
                "classification_readiness_bucket": row["classification_readiness_bucket"],
            }
            for row in zero_train_support_rows
        ],
        "tiny_overfit": {
            "selected_category_ids": tiny_overfit_ids,
            "selected_categories": [
                {
                    "category_id": row["category_id"],
                    "category_name": row["category_name"],
                    "theme": row["theme"],
                    "train_count": row["train_count"],
                    "val_count": row["val_count"],
                    "classifier_label": row["classifier_label"],
                }
                for row in category_role_rows
                if row["category_id"] in tiny_overfit_ids
            ],
            "train_manifest_count": len(tiny_overfit_train_manifest),
            "val_manifest_count": len(tiny_overfit_val_manifest),
            "train_limit_per_class": tiny_overfit_train_limit,
            "val_limit_per_class": tiny_overfit_val_limit,
        },
        "notes": [
            "Classifier trainability is based on blocked-train crop support only.",
            "Retrieval availability is based on best_reference_has_images from category-strategy-manifest.json.",
            "Do not treat retrieval_only_unseen_in_train classes as classifier failures in first-pass closed-set training.",
        ],
    }
    write_json(CROP_CLASSIFIER_SUMMARY_JSON, summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Build classifier-ready manifests for the first NorgesGruppen shelf-crop classifier.")
    parser.add_argument("--output-root", type=Path, default=CROP_CLASSIFIER_ROOT)
    args = parser.parse_args()

    summary = build_manifests(output_root=args.output_root)
    print(summary)


if __name__ == "__main__":
    main()
