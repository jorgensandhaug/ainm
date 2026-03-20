#!/usr/bin/env python3

from __future__ import annotations

import argparse
import re
from collections import defaultdict
from pathlib import Path
from typing import Any

from norgesgruppen_prep_common import (
    CATEGORY_MANIFEST_JSON,
    COCO_ANNOTATIONS,
    COCO_IMAGES,
    ROOT,
    TRAINING_MANIFEST_JSON,
    YOLO_CLASS_AGNOSTIC_DATASET_YAML,
    YOLO_CLASS_AGNOSTIC_ROOT,
    YOLO_CLASS_AGNOSTIC_VERIFICATION_JSON,
    YOLO_CLASS_AGNOSTIC_SUMMARY_JSON,
    YOLO_DATASET_YAML,
    YOLO_ROOT,
    YOLO_SUMMARY_JSON,
    YOLO_VERIFICATION_JSON,
    display_path,
    read_json,
    write_json,
)


ROUNDTRIP_TOLERANCE_PX = 0.01
CLASS_TOKEN_RE = re.compile(r"^-?\d+$")


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def load_export_context() -> dict[str, Any]:
    raw_annotations = read_json(COCO_ANNOTATIONS)
    training_manifest = read_json(TRAINING_MANIFEST_JSON)
    category_manifest = read_json(CATEGORY_MANIFEST_JSON)
    image_by_id = {row["id"]: row for row in raw_annotations["images"]}
    annotations_by_image_id: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for row in raw_annotations["annotations"]:
        annotations_by_image_id[row["image_id"]].append(row)
    return {
        "raw_annotations": raw_annotations,
        "training_manifest": training_manifest,
        "category_manifest": category_manifest,
        "image_by_id": image_by_id,
        "annotations_by_image_id": annotations_by_image_id,
    }


def parse_dataset_yaml(path: Path) -> dict[str, Any]:
    lines = path.read_text().splitlines()
    require(lines, f"Empty dataset yaml: {path}")
    require(lines[0].startswith("path:"), f"Dataset yaml missing path line: {path}")
    require(len(lines) >= 5, f"Dataset yaml too short: {path}")
    require(lines[1].strip() == "train: images/train", f"Unexpected train line in dataset yaml: {path}")
    require(lines[2].strip() == "val: images/val", f"Unexpected val line in dataset yaml: {path}")
    require(lines[3].startswith("nc:"), f"Dataset yaml missing nc line: {path}")
    require(lines[4].strip() == "names:", f"Dataset yaml missing names header: {path}")
    names = {}
    for line in lines[5:]:
        if not line.strip():
            continue
        key, sep, value = line.partition(":")
        require(sep == ":", f"Malformed names line in dataset yaml: {line!r}")
        key = key.strip()
        require(key.isdigit(), f"Non-integer names key in dataset yaml: {line!r}")
        names[int(key)] = value.strip()
    return {
        "path": Path(lines[0].split(":", 1)[1].strip()).resolve(),
        "nc": int(lines[3].split(":", 1)[1].strip()),
        "names": names,
    }


def parse_label_line(line: str) -> tuple[int, float, float, float, float]:
    tokens = line.split()
    require(len(tokens) == 5, f"Expected 5 tokens in YOLO label line, got {len(tokens)}: {line!r}")
    require(CLASS_TOKEN_RE.fullmatch(tokens[0]) is not None, f"Non-integer class id token in YOLO label line: {line!r}")
    class_id = int(tokens[0])
    x_center, y_center, width, height = (float(token) for token in tokens[1:])
    return class_id, x_center, y_center, width, height


def verify_split(
    *,
    split_name: str,
    image_ids: list[int],
    image_by_id: dict[int, dict[str, Any]],
    annotations_by_image_id: dict[int, list[dict[str, Any]]],
    image_root: Path,
    label_root: Path,
    class_agnostic: bool,
    max_valid_class_id: int,
) -> dict[str, Any]:
    expected_file_names = {
        image_by_id[image_id]["file_name"]
        for image_id in image_ids
    }
    image_paths = sorted(path for path in image_root.iterdir() if path.is_file())
    label_paths = sorted(path for path in label_root.glob("*.txt"))
    image_file_names = {path.name for path in image_paths}
    expected_label_names = {f"{Path(name).stem}.txt" for name in expected_file_names}
    label_file_names = {path.name for path in label_paths}

    require(image_file_names == expected_file_names, f"{split_name} image file set mismatch in YOLO export.")
    require(label_file_names == expected_label_names, f"{split_name} label file set mismatch in YOLO export.")

    annotation_count = 0
    invalid_line_count = 0
    invalid_class_id_count = 0
    non_normalized_value_count = 0
    max_abs_bbox_error_px = 0.0
    max_abs_bbox_error_component = {
        "x": 0.0,
        "y": 0.0,
        "w": 0.0,
        "h": 0.0,
    }

    for image_id in image_ids:
        image = image_by_id[image_id]
        source_image = COCO_IMAGES / image["file_name"]
        exported_image = image_root / image["file_name"]
        require(exported_image.exists(), f"Missing exported image: {exported_image}")
        require(exported_image.stat().st_size == source_image.stat().st_size, f"Exported image size mismatch: {exported_image}")

        label_path = label_root / f"{Path(image['file_name']).stem}.txt"
        require(label_path.exists(), f"Missing label file: {label_path}")
        label_lines = [line.strip() for line in label_path.read_text().splitlines() if line.strip()]
        source_annotations = sorted(annotations_by_image_id[image_id], key=lambda row: row["id"])
        require(
            len(label_lines) == len(source_annotations),
            f"Label/annotation count mismatch for {label_path}: labels={len(label_lines)} annotations={len(source_annotations)}",
        )

        image_width = float(image["width"])
        image_height = float(image["height"])

        for label_line, source_annotation in zip(label_lines, source_annotations, strict=True):
            annotation_count += 1
            try:
                class_id, x_center, y_center, width, height = parse_label_line(label_line)
            except AssertionError:
                invalid_line_count += 1
                raise
            if class_agnostic:
                if class_id != 0:
                    invalid_class_id_count += 1
                require(class_id == 0, f"Class-agnostic export contains non-zero class id: {label_line!r}")
            else:
                if not (0 <= class_id <= max_valid_class_id):
                    invalid_class_id_count += 1
                require(class_id == source_annotation["category_id"], f"Class id mismatch for annotation {source_annotation['id']}: {label_line!r}")

            values = (x_center, y_center, width, height)
            if any(value < 0.0 or value > 1.0 for value in values) or width <= 0.0 or height <= 0.0:
                non_normalized_value_count += 1
            require(0.0 <= x_center <= 1.0, f"x_center outside [0,1] for annotation {source_annotation['id']}")
            require(0.0 <= y_center <= 1.0, f"y_center outside [0,1] for annotation {source_annotation['id']}")
            require(0.0 < width <= 1.0, f"width outside (0,1] for annotation {source_annotation['id']}")
            require(0.0 < height <= 1.0, f"height outside (0,1] for annotation {source_annotation['id']}")

            exported_width = width * image_width
            exported_height = height * image_height
            exported_x = x_center * image_width - exported_width / 2.0
            exported_y = y_center * image_height - exported_height / 2.0

            source_x, source_y, source_width, source_height = source_annotation["bbox"]
            component_errors = {
                "x": abs(exported_x - source_x),
                "y": abs(exported_y - source_y),
                "w": abs(exported_width - source_width),
                "h": abs(exported_height - source_height),
            }
            for key, error in component_errors.items():
                if error > max_abs_bbox_error_component[key]:
                    max_abs_bbox_error_component[key] = error
            max_abs_bbox_error_px = max(max_abs_bbox_error_px, *component_errors.values())
            require(
                max(component_errors.values()) <= ROUNDTRIP_TOLERANCE_PX,
                (
                    f"YOLO roundtrip bbox drift exceeds tolerance for annotation {source_annotation['id']}: "
                    f"errors={component_errors} tolerance_px={ROUNDTRIP_TOLERANCE_PX}"
                ),
            )

    return {
        "image_count": len(image_ids),
        "label_file_count": len(label_paths),
        "annotation_count": annotation_count,
        "invalid_line_count": invalid_line_count,
        "invalid_class_id_count": invalid_class_id_count,
        "non_normalized_value_count": non_normalized_value_count,
        "max_abs_bbox_error_px": max_abs_bbox_error_px,
        "max_abs_bbox_error_component_px": max_abs_bbox_error_component,
    }


def verify_yolo_export(*, class_agnostic: bool, write_summary_json: bool = False) -> dict[str, Any]:
    context = load_export_context()
    category_manifest = context["category_manifest"]
    training_manifest = context["training_manifest"]
    image_by_id = context["image_by_id"]
    annotations_by_image_id = context["annotations_by_image_id"]

    if class_agnostic:
        export_mode = "class_agnostic"
        yolo_root = YOLO_CLASS_AGNOSTIC_ROOT
        dataset_yaml = YOLO_CLASS_AGNOSTIC_DATASET_YAML
        export_summary = YOLO_CLASS_AGNOSTIC_SUMMARY_JSON
        verification_json = YOLO_CLASS_AGNOSTIC_VERIFICATION_JSON
        expected_nc = 1
    else:
        export_mode = "multiclass"
        yolo_root = YOLO_ROOT
        dataset_yaml = YOLO_DATASET_YAML
        export_summary = YOLO_SUMMARY_JSON
        verification_json = YOLO_VERIFICATION_JSON
        expected_nc = len(category_manifest)

    require(yolo_root.exists(), f"YOLO export root missing: {yolo_root}")
    require(dataset_yaml.exists(), f"YOLO dataset yaml missing: {dataset_yaml}")
    require(export_summary.exists(), f"YOLO export summary missing: {export_summary}")

    parsed_yaml = parse_dataset_yaml(dataset_yaml)
    require(parsed_yaml["path"] == yolo_root.resolve(), f"Dataset yaml path mismatch: {dataset_yaml}")
    require(parsed_yaml["nc"] == expected_nc, f"Dataset yaml nc mismatch: {dataset_yaml}")
    require(len(parsed_yaml["names"]) == expected_nc, f"Dataset yaml names count mismatch: {dataset_yaml}")

    max_valid_class_id = len(category_manifest) - 1
    split_summaries = {}
    overall_max_abs_bbox_error_px = 0.0
    overall_component_max = {
        "x": 0.0,
        "y": 0.0,
        "w": 0.0,
        "h": 0.0,
    }

    for split_name in ("train", "val"):
        split_summary = verify_split(
            split_name=split_name,
            image_ids=training_manifest["splits"][split_name]["image_ids"],
            image_by_id=image_by_id,
            annotations_by_image_id=annotations_by_image_id,
            image_root=yolo_root / "images" / split_name,
            label_root=yolo_root / "labels" / split_name,
            class_agnostic=class_agnostic,
            max_valid_class_id=max_valid_class_id,
        )
        split_summaries[split_name] = split_summary
        overall_max_abs_bbox_error_px = max(overall_max_abs_bbox_error_px, split_summary["max_abs_bbox_error_px"])
        for key, value in split_summary["max_abs_bbox_error_component_px"].items():
            overall_component_max[key] = max(overall_component_max[key], value)

    summary = {
        "status": "ok",
        "export_mode": export_mode,
        "yolo_root": display_path(yolo_root),
        "dataset_yaml": display_path(dataset_yaml),
        "export_summary_json": display_path(export_summary),
        "verification_json": display_path(verification_json),
        "roundtrip_tolerance_px": ROUNDTRIP_TOLERANCE_PX,
        "dataset_yaml_checks": {
            "path_matches_export_root": True,
            "nc": parsed_yaml["nc"],
            "name_count": len(parsed_yaml["names"]),
        },
        "split_summaries": split_summaries,
        "overall": {
            "image_count": sum(row["image_count"] for row in split_summaries.values()),
            "label_file_count": sum(row["label_file_count"] for row in split_summaries.values()),
            "annotation_count": sum(row["annotation_count"] for row in split_summaries.values()),
            "max_abs_bbox_error_px": overall_max_abs_bbox_error_px,
            "max_abs_bbox_error_component_px": overall_component_max,
        },
    }
    if write_summary_json:
        write_json(verification_json, summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify that YOLO exports are geometrically and structurally faithful to the audited COCO source.")
    parser.add_argument(
        "--class-agnostic",
        action="store_true",
        help="Verify the class-agnostic export under derived/yolo-class-agnostic instead of the multiclass export.",
    )
    args = parser.parse_args()
    summary = verify_yolo_export(class_agnostic=args.class_agnostic, write_summary_json=True)
    print(f"Wrote {ROOT / summary['verification_json']}")
    print("YOLO export verification passed.")


if __name__ == "__main__":
    main()
