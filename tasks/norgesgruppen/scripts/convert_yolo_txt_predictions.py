#!/usr/bin/env python3

from __future__ import annotations

import argparse
from pathlib import Path
from typing import Any

from norgesgruppen_prep_common import VAL_COCO_JSON, display_path, read_json, write_json


def parse_prediction_line(raw: str) -> tuple[int, float, float, float, float, float]:
    parts = raw.strip().split()
    if len(parts) not in (5, 6):
        raise ValueError(f"expected 5 or 6 columns, got {len(parts)}")
    class_id = int(float(parts[0]))
    x_center = float(parts[1])
    y_center = float(parts[2])
    width = float(parts[3])
    height = float(parts[4])
    score = float(parts[5]) if len(parts) == 6 else 1.0
    return class_id, x_center, y_center, width, height, score


def yolo_to_coco_bbox(
    x_center: float,
    y_center: float,
    width: float,
    height: float,
    image_width: int,
    image_height: int,
) -> list[float]:
    abs_width = width * image_width
    abs_height = height * image_height
    x = (x_center * image_width) - (abs_width / 2.0)
    y = (y_center * image_height) - (abs_height / 2.0)
    return [
        round(x, 4),
        round(y, 4),
        round(abs_width, 4),
        round(abs_height, 4),
    ]


def convert_predictions(
    input_dir: Path,
    output_json: Path,
    coco_json: Path,
    force_category_id: int | None,
) -> dict[str, Any]:
    coco = read_json(coco_json)
    images_by_stem = {
        Path(row["file_name"]).stem: row
        for row in coco["images"]
    }

    predictions = []
    unmatched_files = []
    invalid_lines = []

    for txt_path in sorted(input_dir.glob("*.txt")):
        image = images_by_stem.get(txt_path.stem)
        if image is None:
            unmatched_files.append(txt_path.name)
            continue
        for line_index, raw_line in enumerate(txt_path.read_text().splitlines(), start=1):
            if not raw_line.strip():
                continue
            try:
                class_id, x_center, y_center, width, height, score = parse_prediction_line(raw_line)
            except Exception as exc:
                invalid_lines.append(
                    {
                        "file": txt_path.name,
                        "line_index": line_index,
                        "error": str(exc),
                    }
                )
                continue
            category_id = force_category_id if force_category_id is not None else class_id
            predictions.append(
                {
                    "image_id": image["id"],
                    "category_id": category_id,
                    "bbox": yolo_to_coco_bbox(
                        x_center=x_center,
                        y_center=y_center,
                        width=width,
                        height=height,
                        image_width=image["width"],
                        image_height=image["height"],
                    ),
                    "score": round(score, 6),
                }
            )

    predictions.sort(key=lambda row: (row["image_id"], -row["score"], row["category_id"]))
    write_json(output_json, predictions)
    return {
        "status": "ok",
        "input_dir": display_path(input_dir),
        "output_json": display_path(output_json),
        "coco_json": display_path(coco_json),
        "prediction_count": len(predictions),
        "txt_file_count": len(list(input_dir.glob("*.txt"))),
        "unmatched_file_count": len(unmatched_files),
        "unmatched_files": unmatched_files[:20],
        "invalid_line_count": len(invalid_lines),
        "invalid_lines": invalid_lines[:20],
        "forced_category_id": force_category_id,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Convert YOLO txt predictions into competition-style predictions.json")
    parser.add_argument("--input-dir", required=True, help="Directory containing YOLO txt prediction files.")
    parser.add_argument("--output-json", required=True, help="Where to write the converted predictions.json")
    parser.add_argument(
        "--coco-json",
        default=str(VAL_COCO_JSON),
        help="COCO json used to recover image ids and sizes. Defaults to blocked-val COCO json.",
    )
    parser.add_argument(
        "--force-category-id",
        type=int,
        default=None,
        help="Optional override category id for every prediction. Use 0 for class-agnostic models.",
    )
    args = parser.parse_args()

    summary = convert_predictions(
        input_dir=Path(args.input_dir),
        output_json=Path(args.output_json),
        coco_json=Path(args.coco_json),
        force_category_id=args.force_category_id,
    )
    print(summary)


if __name__ == "__main__":
    main()
