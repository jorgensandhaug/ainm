#!/usr/bin/env python3

from __future__ import annotations

import math
import random
from collections import Counter
from pathlib import Path
from typing import Any

from norgesgruppen_prep_common import iter_jsonl


CLASSIFIER_BUCKET_KEYS = (
    "theme",
    "classification_readiness_bucket",
    "category_role",
    "classifier_support_bucket",
)


def load_classifier_manifest(path: Path) -> list[dict[str, Any]]:
    return list(iter_jsonl(path))


def build_label_maps(rows: list[dict[str, Any]]) -> dict[str, Any]:
    trainable_rows = [row for row in rows if row.get("classifier_trainable")]
    by_label = {}
    for row in trainable_rows:
        label = int(row["classifier_label"])
        current = by_label.get(label)
        if current is None:
            by_label[label] = {
                "classifier_label": label,
                "category_id": int(row["category_id"]),
                "category_name": row["category_name"],
                "theme": row["theme"],
                "classification_readiness_bucket": row["classification_readiness_bucket"],
                "category_role": row["category_role"],
            }
            continue
        if int(current["category_id"]) != int(row["category_id"]):
            raise ValueError(
                f"Inconsistent classifier_label mapping for label {label}: "
                f"{current['category_id']} != {row['category_id']}"
            )
    original_labels = sorted(by_label)
    label_rows = []
    for local_label, original_label in enumerate(original_labels):
        label_rows.append(
            {
                **by_label[original_label],
                "original_classifier_label": int(original_label),
                "local_classifier_label": int(local_label),
            }
        )
    label_to_category_id = [int(row["category_id"]) for row in label_rows]
    category_id_to_label = {
        int(row["category_id"]): int(row["local_classifier_label"])
        for row in label_rows
    }
    return {
        "label_rows": label_rows,
        "label_to_category_id": label_to_category_id,
        "category_id_to_label": category_id_to_label,
        "original_classifier_label_to_local_label": {
            int(row["original_classifier_label"]): int(row["local_classifier_label"])
            for row in label_rows
        },
        "eligible_category_ids": sorted(category_id_to_label),
        "num_classes": len(label_rows),
    }


def attach_local_classifier_labels(rows: list[dict[str, Any]], label_maps: dict[str, Any]) -> list[dict[str, Any]]:
    category_id_to_local_label = label_maps["category_id_to_label"]
    output_rows = []
    for row in rows:
        output_rows.append(
            {
                **row,
                "local_classifier_label": category_id_to_local_label.get(int(row["category_id"]), -1),
            }
        )
    return output_rows


def attach_loss_labels(train_rows: list[dict[str, Any]], seed: int, shuffle_labels: bool) -> tuple[list[dict[str, Any]], dict[str, Any] | None]:
    rows_with_targets = [{**row, "loss_label": int(row["local_classifier_label"])} for row in train_rows]
    if not shuffle_labels:
        return rows_with_targets, None
    labels = [int(row["local_classifier_label"]) for row in rows_with_targets]
    rng = random.Random(seed + 991)
    shuffled_labels = labels[:]
    rng.shuffle(shuffled_labels)
    for row, shuffled_label in zip(rows_with_targets, shuffled_labels, strict=True):
        row["loss_label"] = shuffled_label
    return rows_with_targets, {
        "enabled": True,
        "seed": seed + 991,
    }


def build_label_rows_with_counts(train_rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    label_maps = build_label_maps(train_rows)
    counts_by_category_id = Counter(int(row["category_id"]) for row in train_rows if row.get("classifier_trainable"))
    rows = []
    for label_row in label_maps["label_rows"]:
        rows.append(
            {
                **label_row,
                "train_count": counts_by_category_id[int(label_row["category_id"])],
            }
        )
    return rows


def build_classifier_slice_defs(val_rows: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    slice_specs = [
        ("full", lambda row: True),
        ("train_seen_only", lambda row: bool(row.get("classifier_trainable"))),
        ("fusion_candidate", lambda row: row["category_role"] == "fusion_candidate"),
        ("classifier_priority", lambda row: row["category_role"] == "classifier_priority"),
        ("retrieval_only_unseen_in_train", lambda row: row["category_role"] == "retrieval_only_unseen_in_train"),
        ("impossible_first_pass", lambda row: row["category_role"] == "impossible_first_pass"),
        ("unknown_sentinel", lambda row: row["classification_readiness_bucket"] == "unknown_sentinel"),
        ("missing_reference", lambda row: row["classification_readiness_bucket"] == "missing_reference"),
        ("sibling_variant_trap", lambda row: row["classification_readiness_bucket"] == "sibling_variant_trap"),
        ("exact_reference_high_view", lambda row: row["classification_readiness_bucket"] == "exact_reference_high_view"),
        ("exact_reference_medium_view", lambda row: row["classification_readiness_bucket"] == "exact_reference_medium_view"),
        ("exact_reference_low_view", lambda row: row["classification_readiness_bucket"] == "exact_reference_low_view"),
    ]
    return {
        slice_name: [row for row in val_rows if predicate(row)]
        for slice_name, predicate in slice_specs
    }


def dedupe_preserve_order(values: list[int]) -> list[int]:
    seen = set()
    ordered = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def bbox_xyxy_to_crop_box(
    bbox_xyxy: list[float] | tuple[float, float, float, float],
    image_width: int,
    image_height: int,
) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = bbox_xyxy
    crop_x1 = clamp_int(math.floor(x1), 0, image_width - 1)
    crop_y1 = clamp_int(math.floor(y1), 0, image_height - 1)
    crop_x2 = clamp_int(math.ceil(x2), crop_x1 + 1, image_width)
    crop_y2 = clamp_int(math.ceil(y2), crop_y1 + 1, image_height)
    return crop_x1, crop_y1, crop_x2, crop_y2


def clamp_int(value: int, lower: int, upper: int) -> int:
    return max(lower, min(upper, value))


def jittered_bbox_xyxy(
    bbox_xyxy: list[float] | tuple[float, float, float, float],
    image_width: int,
    image_height: int,
    rng: random.Random,
    shift_frac: float,
    scale_min: float,
    scale_max: float,
    context_frac_max: float,
) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = bbox_xyxy
    width = max(1.0, x2 - x1)
    height = max(1.0, y2 - y1)
    center_x = (x1 + x2) / 2.0
    center_y = (y1 + y2) / 2.0

    center_x += rng.uniform(-shift_frac, shift_frac) * width
    center_y += rng.uniform(-shift_frac, shift_frac) * height

    scale = rng.uniform(scale_min, scale_max)
    context_frac = rng.uniform(0.0, context_frac_max)
    new_width = width * scale * (1.0 + 2.0 * context_frac)
    new_height = height * scale * (1.0 + 2.0 * context_frac)

    crop_x1 = clamp_int(math.floor(center_x - (new_width / 2.0)), 0, image_width - 1)
    crop_y1 = clamp_int(math.floor(center_y - (new_height / 2.0)), 0, image_height - 1)
    crop_x2 = clamp_int(math.ceil(center_x + (new_width / 2.0)), crop_x1 + 1, image_width)
    crop_y2 = clamp_int(math.ceil(center_y + (new_height / 2.0)), crop_y1 + 1, image_height)
    return crop_x1, crop_y1, crop_x2, crop_y2


def deterministic_row_rng(seed: int, epoch: int, row: dict[str, Any]) -> random.Random:
    mixed_seed = (
        int(seed)
        + int(epoch) * 1_000_003
        + int(row["annotation_id"]) * 97
        + int(row["category_id"]) * 17
    )
    return random.Random(mixed_seed)
