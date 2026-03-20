from __future__ import annotations

import argparse
import json
from pathlib import Path

from PIL import Image, ImageDraw

UNKNOWN_CLASS_ID = 355
DEFAULT_BOX_COLOR = (255, 0, 0)
UNKNOWN_BOX_COLOR = (0, 102, 255)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Visualize one training image with COCO bounding boxes and class names."
    )
    parser.add_argument(
        "--image-id",
        type=int,
        default=None,
        help="Optional COCO image id from data/train/annotations.json. If omitted, renders all images.",
    )
    parser.add_argument(
        "--annotations",
        default="data/train/annotations.json",
        help="Path to COCO annotations JSON.",
    )
    parser.add_argument(
        "--images-dir",
        default="data/train/images",
        help="Directory containing training images.",
    )
    parser.add_argument(
        "--output",
        default=None,
        help="Optional output path. Defaults to runs/visualizations/train_image_<image_id>.jpg",
    )
    parser.add_argument(
        "--show",
        action="store_true",
        help="Open the rendered image in the default image viewer.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parents[1]

    annotations_path = Path(args.annotations)
    if not annotations_path.is_absolute():
        annotations_path = (root / annotations_path).resolve()

    images_dir = Path(args.images_dir)
    if not images_dir.is_absolute():
        images_dir = (root / images_dir).resolve()

    annotations_data = json.loads(annotations_path.read_text())
    image_by_id = {image["id"]: image for image in annotations_data["images"]}
    category_name_by_id = {cat["id"]: cat["name"] for cat in annotations_data["categories"]}

    if args.output:
        output_dir = Path(args.output)
        if not output_dir.is_absolute():
            output_dir = (root / output_dir).resolve()
    else:
        output_dir = (root / "runs" / "visualizations").resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    image_ids: list[int]
    if args.image_id is not None:
        if args.image_id not in image_by_id:
            raise ValueError(f"Image id {args.image_id} not found in {annotations_path}")
        image_ids = [args.image_id]
    else:
        image_ids = sorted(image_by_id.keys())

    anns_by_image_id: dict[int, list[dict]] = {}
    for ann in annotations_data["annotations"]:
        anns_by_image_id.setdefault(ann["image_id"], []).append(ann)

    for image_id in image_ids:
        image_info = image_by_id[image_id]
        image_path = images_dir / image_info["file_name"]
        if not image_path.exists():
            raise FileNotFoundError(f"Image file not found: {image_path}")

        image = Image.open(image_path).convert("RGB")
        draw = ImageDraw.Draw(image)

        anns = anns_by_image_id.get(image_id, [])
        for ann in anns:
            x, y, w, h = ann["bbox"]
            x1, y1 = x, y
            x2, y2 = x + w, y + h

            box_color = UNKNOWN_BOX_COLOR if ann["category_id"] == UNKNOWN_CLASS_ID else DEFAULT_BOX_COLOR
            class_name = category_name_by_id.get(ann["category_id"], f"class_{ann['category_id']}")
            draw.rectangle([(x1, y1), (x2, y2)], outline=box_color, width=3)

            label_text = class_name
            text_bbox = draw.textbbox((0, 0), label_text)
            text_w = text_bbox[2] - text_bbox[0]
            text_h = text_bbox[3] - text_bbox[1]
            label_x = x1
            label_y = max(0, y1 - text_h - 6)
            draw.rectangle(
                [(label_x, label_y), (label_x + text_w + 6, label_y + text_h + 4)],
                fill=box_color,
            )
            draw.text((label_x + 3, label_y + 2), label_text, fill=(255, 255, 255))

        output_path = output_dir / f"{Path(image_info['file_name']).stem}_annotated.jpg"
        image.save(output_path, quality=95)
        print(f"Rendered image id {image_id} with {len(anns)} boxes -> {output_path}")

        if args.show:
            image.show()

    print(f"Finished rendering {len(image_ids)} image(s) to: {output_dir}")


if __name__ == "__main__":
    main()
