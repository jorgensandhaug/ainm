#!/usr/bin/env python3

from __future__ import annotations

import argparse
import random
from pathlib import Path
from typing import Any

from norgesgruppen_prep_common import (
    GT_CROP_MANIFEST_JSONL,
    TRAIN_COCO_JSON,
    VAL_COCO_JSON,
    iter_jsonl,
    read_json,
    write_json,
    write_jsonl,
)


def build_derangement(category_ids: list[int], seed: int) -> dict[int, int]:
    rng = random.Random(seed)
    original = list(category_ids)
    shuffled = list(category_ids)
    for _ in range(10000):
        rng.shuffle(shuffled)
        if all(a != b for a, b in zip(original, shuffled)):
            return dict(zip(original, shuffled))
    raise RuntimeError("Failed to build category-id derangement.")


def build_controls(seed: int, output_dir: Path) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)

    train_coco = read_json(TRAIN_COCO_JSON)
    val_coco = read_json(VAL_COCO_JSON)
    categories = sorted(train_coco["categories"], key=lambda row: row["id"])
    category_ids = [row["id"] for row in categories]
    category_by_id = {row["id"]: row for row in categories}

    permutation = build_derangement(category_ids=category_ids, seed=seed)
    mapping_rows = [
        {
            "original_category_id": category_id,
            "shuffled_category_id": permutation[category_id],
            "original_name": category_by_id[category_id]["name"],
            "shuffled_name": category_by_id[permutation[category_id]]["name"],
        }
        for category_id in category_ids
    ]

    shuffled_train_coco = {
        "images": train_coco["images"],
        "categories": train_coco["categories"],
        "annotations": [
            {
                **annotation,
                "category_id": permutation[int(annotation["category_id"])],
            }
            for annotation in train_coco["annotations"]
        ],
    }

    crop_rows = list(iter_jsonl(GT_CROP_MANIFEST_JSONL))
    shuffled_crop_rows = []
    train_crop_count = 0
    val_crop_count = 0
    for row in crop_rows:
        effective_category_id = int(row["category_id"])
        label_mode = "original"
        if row["split"] == "train":
            effective_category_id = permutation[effective_category_id]
            label_mode = "train_shuffled_derangement"
            train_crop_count += 1
        elif row["split"] == "val":
            val_crop_count += 1
        shuffled_crop_rows.append(
            {
                **row,
                "effective_category_id": effective_category_id,
                "label_mode": label_mode,
            }
        )

    summary = {
        "seed": seed,
        "category_count": len(category_ids),
        "train_annotation_count": len(train_coco["annotations"]),
        "val_annotation_count": len(val_coco["annotations"]),
        "train_crop_count": train_crop_count,
        "val_crop_count": val_crop_count,
        "derangement_verified": all(
            row["original_category_id"] != row["shuffled_category_id"]
            for row in mapping_rows
        ),
        "paths": {
            "category_permutation_json": str((output_dir / "category-permutation.json").resolve()),
            "train_coco_shuffled_json": str((output_dir / "train-coco-shuffled.json").resolve()),
            "val_coco_original_json": str(VAL_COCO_JSON.resolve()),
            "gt_crop_labels_shuffled_jsonl": str((output_dir / "gt-crop-labels-shuffled.jsonl").resolve()),
        },
    }

    write_json(output_dir / "category-permutation.json", mapping_rows)
    write_json(output_dir / "train-coco-shuffled.json", shuffled_train_coco)
    write_jsonl(output_dir / "gt-crop-labels-shuffled.jsonl", shuffled_crop_rows)
    write_json(output_dir / "summary.json", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Build deterministic shuffled-label control artifacts for future supervised NorgesGruppen experiments.")
    parser.add_argument("--seed", type=int, default=20260320)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("data/2026-03-19/derived/control-datasets/shuffled-label-control"),
    )
    args = parser.parse_args()

    summary = build_controls(seed=args.seed, output_dir=args.output_dir)
    print(summary)


if __name__ == "__main__":
    main()
