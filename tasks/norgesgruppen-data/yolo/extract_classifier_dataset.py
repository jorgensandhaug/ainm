from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Extract classification crops from COCO bounding boxes with metadata."
    )
    parser.add_argument(
        "--annotations",
        default="data/train/annotations.json",
        help="Path to COCO annotations JSON.",
    )
    parser.add_argument(
        "--images-dir",
        default="data/train/images",
        help="Directory containing source images.",
    )
    parser.add_argument(
        "--output-dir",
        default="data/classifier",
        help="Output directory for crops and metadata.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=0,
        help="Optional max number of annotations to process (<=0 means all).",
    )
    parser.add_argument(
        "--image-format",
        choices=["jpg", "png"],
        default="jpg",
        help="Image format used for saved crops.",
    )
    parser.add_argument(
        "--jpeg-quality",
        type=int,
        default=95,
        help="JPEG quality used when --image-format=jpg.",
    )
    return parser.parse_args()


def resolve_from_root(root: Path, maybe_relative: str) -> Path:
    path = Path(maybe_relative)
    if not path.is_absolute():
        path = (root / path).resolve()
    return path


def clamp_bbox_xyxy(
    x: float, y: float, w: float, h: float, image_w: int, image_h: int
) -> tuple[int, int, int, int] | None:
    x1 = max(0, min(int(round(x)), image_w))
    y1 = max(0, min(int(round(y)), image_h))
    x2 = max(0, min(int(round(x + w)), image_w))
    y2 = max(0, min(int(round(y + h)), image_h))
    if x2 <= x1 or y2 <= y1:
        return None
    return x1, y1, x2, y2


def main() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parents[1]

    annotations_path = resolve_from_root(root, args.annotations)
    images_dir = resolve_from_root(root, args.images_dir)
    output_dir = resolve_from_root(root, args.output_dir)
    crops_dir = output_dir / "crops"
    output_dir.mkdir(parents=True, exist_ok=True)
    crops_dir.mkdir(parents=True, exist_ok=True)

    coco = json.loads(annotations_path.read_text())
    images_by_id = {image["id"]: image for image in coco["images"]}
    categories_by_id = {category["id"]: category for category in coco["categories"]}

    metadata_path = output_dir / "metadata.jsonl"
    skipped_path = output_dir / "skipped_annotations.jsonl"
    categories_path = output_dir / "categories.json"

    categories_payload = {
        "categories": [
            {"id": category["id"], "name": category["name"]}
            for category in sorted(coco["categories"], key=lambda c: c["id"])
        ]
    }
    categories_path.write_text(json.dumps(categories_payload, ensure_ascii=False, indent=2) + "\n")

    processed = 0
    skipped = 0
    annotations = coco["annotations"]
    if args.limit > 0:
        annotations = annotations[: args.limit]

    with metadata_path.open("w", encoding="utf-8") as metadata_file, skipped_path.open(
        "w", encoding="utf-8"
    ) as skipped_file:
        for ann in annotations:
            image_info = images_by_id.get(ann["image_id"])
            if image_info is None:
                skipped += 1
                skipped_file.write(
                    json.dumps(
                        {
                            "annotation_id": ann["id"],
                            "image_id": ann["image_id"],
                            "reason": "missing_image_reference",
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                continue

            src_image_path = images_dir / image_info["file_name"]
            if not src_image_path.exists():
                skipped += 1
                skipped_file.write(
                    json.dumps(
                        {
                            "annotation_id": ann["id"],
                            "image_id": ann["image_id"],
                            "reason": "missing_image_file",
                            "image_path": str(src_image_path),
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                continue

            x, y, w, h = ann["bbox"]
            crop_box = clamp_bbox_xyxy(
                x=x,
                y=y,
                w=w,
                h=h,
                image_w=int(image_info["width"]),
                image_h=int(image_info["height"]),
            )
            if crop_box is None:
                skipped += 1
                skipped_file.write(
                    json.dumps(
                        {
                            "annotation_id": ann["id"],
                            "image_id": ann["image_id"],
                            "reason": "invalid_bbox_after_clamp",
                            "bbox_xywh": ann["bbox"],
                        },
                        ensure_ascii=False,
                    )
                    + "\n"
                )
                continue

            category_id = int(ann["category_id"])
            category_name = categories_by_id.get(category_id, {}).get("name", f"class_{category_id}")
            class_dir = crops_dir / f"{category_id:03d}"
            class_dir.mkdir(parents=True, exist_ok=True)

            crop_filename = (
                f"{Path(image_info['file_name']).stem}"
                f"_ann{int(ann['id']):06d}"
                f"_cls{category_id:03d}.{args.image_format}"
            )
            crop_path = class_dir / crop_filename

            with Image.open(src_image_path).convert("RGB") as src_image:
                crop = src_image.crop(crop_box)
                if args.image_format == "jpg":
                    crop.save(crop_path, quality=args.jpeg_quality)
                else:
                    crop.save(crop_path)

            x1, y1, x2, y2 = crop_box
            metadata_record = {
                "annotation_id": int(ann["id"]),
                "image_id": int(ann["image_id"]),
                "image_file_name": image_info["file_name"],
                "source_image_size": {
                    "width": int(image_info["width"]),
                    "height": int(image_info["height"]),
                },
                "category_id": category_id,
                "category_name": category_name,
                "bbox_xywh": [float(x), float(y), float(w), float(h)],
                "bbox_xyxy_clipped": [x1, y1, x2, y2],
                "crop_size": {"width": int(x2 - x1), "height": int(y2 - y1)},
                "crop_path": str(crop_path.relative_to(output_dir)),
            }
            metadata_file.write(json.dumps(metadata_record, ensure_ascii=False) + "\n")
            processed += 1

    print(f"Processed annotations: {processed}")
    print(f"Skipped annotations: {skipped}")
    print(f"Crops directory: {crops_dir}")
    print(f"Metadata file: {metadata_path}")
    print(f"Skipped file: {skipped_path}")
    print(f"Categories file: {categories_path}")


if __name__ == "__main__":
    main()
