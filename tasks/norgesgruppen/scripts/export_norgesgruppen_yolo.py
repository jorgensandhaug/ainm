#!/usr/bin/env python3

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from pathlib import Path

from norgesgruppen_prep_common import (
    CATEGORY_MANIFEST_JSON,
    COCO_ANNOTATIONS,
    COCO_IMAGES,
    ROOT,
    TRAINING_MANIFEST_JSON,
    YOLO_CLASS_AGNOSTIC_DATASET_YAML,
    YOLO_CLASS_AGNOSTIC_ROOT,
    YOLO_CLASS_AGNOSTIC_SUMMARY_JSON,
    YOLO_DATASET_YAML,
    YOLO_ROOT,
    YOLO_SUMMARY_JSON,
    display_path,
    ensure_hardlink_or_copy,
    read_json,
    reset_dir,
    write_json,
)


def yolo_line(annotation: dict, image_by_id: dict[int, dict], class_agnostic: bool) -> str:
    image = image_by_id[annotation["image_id"]]
    x, y, width, height = annotation["bbox"]
    x_center = (x + width / 2.0) / image["width"]
    y_center = (y + height / 2.0) / image["height"]
    norm_width = width / image["width"]
    norm_height = height / image["height"]
    class_id = 0 if class_agnostic else annotation["category_id"]
    return (
        f"{class_id} "
        f"{x_center:.6f} "
        f"{y_center:.6f} "
        f"{norm_width:.6f} "
        f"{norm_height:.6f}"
    )


def build_dataset_yaml(category_manifest: list[dict], yolo_root: Path, class_agnostic: bool) -> str:
    if class_agnostic:
        names_block = "  0: 'product'"
        nc = 1
    else:
        names_block = "\n".join(
            f"  {row['category_id']}: {row['category_name']!r}"
            for row in sorted(category_manifest, key=lambda row: row["category_id"])
        )
        nc = len(category_manifest)
    lines = [
        f"path: {yolo_root}",
        "train: images/train",
        "val: images/val",
        f"nc: {nc}",
        "names:",
        names_block,
        "",
    ]
    return "\n".join(lines)


def export_yolo(class_agnostic: bool) -> dict:
    raw_annotations = read_json(COCO_ANNOTATIONS)
    training_manifest = read_json(TRAINING_MANIFEST_JSON)
    category_manifest = read_json(CATEGORY_MANIFEST_JSON)

    if class_agnostic:
        yolo_root = YOLO_CLASS_AGNOSTIC_ROOT
        dataset_yaml = YOLO_CLASS_AGNOSTIC_DATASET_YAML
        summary_json = YOLO_CLASS_AGNOSTIC_SUMMARY_JSON
        export_mode = "class_agnostic"
    else:
        yolo_root = YOLO_ROOT
        dataset_yaml = YOLO_DATASET_YAML
        summary_json = YOLO_SUMMARY_JSON
        export_mode = "multiclass"

    image_by_id = {
        row["id"]: row
        for row in raw_annotations["images"]
    }
    annotations_by_image_id = defaultdict(list)
    for annotation in raw_annotations["annotations"]:
        annotations_by_image_id[annotation["image_id"]].append(annotation)

    images_root = yolo_root / "images"
    labels_root = yolo_root / "labels"
    reset_dir(images_root / "train")
    reset_dir(images_root / "val")
    reset_dir(labels_root / "train")
    reset_dir(labels_root / "val")

    link_mode_counts = Counter()
    split_annotation_counts = {}

    for split_name in ("train", "val"):
        image_ids = training_manifest["splits"][split_name]["image_ids"]
        split_annotation_counts[split_name] = 0
        for image_id in image_ids:
            image = image_by_id[image_id]
            source_image = COCO_IMAGES / image["file_name"]
            target_image = images_root / split_name / image["file_name"]
            link_mode_counts[ensure_hardlink_or_copy(source_image, target_image)] += 1

            label_lines = [
                yolo_line(annotation, image_by_id, class_agnostic=class_agnostic)
                for annotation in sorted(annotations_by_image_id[image_id], key=lambda row: row["id"])
            ]
            split_annotation_counts[split_name] += len(label_lines)
            label_path = labels_root / split_name / f"{Path(image['file_name']).stem}.txt"
            label_path.write_text("\n".join(label_lines) + ("\n" if label_lines else ""))

    dataset_yaml.write_text(build_dataset_yaml(category_manifest, yolo_root=yolo_root, class_agnostic=class_agnostic))

    summary = {
        "status": "ok",
        "export_mode": export_mode,
        "yolo_root": display_path(yolo_root),
        "dataset_yaml": display_path(dataset_yaml),
        "counts": {
            "categories": 1 if class_agnostic else len(category_manifest),
            "train_images": training_manifest["splits"]["train"]["image_count"],
            "val_images": training_manifest["splits"]["val"]["image_count"],
            "train_annotations": split_annotation_counts["train"],
            "val_annotations": split_annotation_counts["val"],
        },
        "link_modes": dict(sorted(link_mode_counts.items())),
        "notes": [
            "Images are materialized as hardlinks when possible, otherwise copied.",
            "Labels use native payload category ids 0..355." if not class_agnostic else "All labels are remapped to class id 0 (`product`).",
            "This export follows the blocked section-aware split.",
        ],
    }
    write_json(summary_json, summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Export a YOLO-ready local training view for the NorgesGruppen dataset.")
    parser.add_argument(
        "--class-agnostic",
        action="store_true",
        help="Remap all annotations to class id 0 and write to derived/yolo-class-agnostic.",
    )
    args = parser.parse_args()
    summary = export_yolo(class_agnostic=args.class_agnostic)
    dataset_yaml = YOLO_CLASS_AGNOSTIC_DATASET_YAML if args.class_agnostic else YOLO_DATASET_YAML
    summary_json = YOLO_CLASS_AGNOSTIC_SUMMARY_JSON if args.class_agnostic else YOLO_SUMMARY_JSON
    print(f"Wrote {dataset_yaml}")
    print(f"Wrote {summary_json}")
    print(summary["status"])


if __name__ == "__main__":
    main()
