from __future__ import annotations

import argparse
from pathlib import Path
from typing import Iterable

from PIL import Image, ImageDraw
from ultralytics import YOLO


VALID_IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png"}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Create side-by-side visualizations of ground truth and model predictions."
    )
    parser.add_argument(
        "--model",
        default="runs/detect2/weights/best.pt",
        help="Path to YOLO model weights.",
    )
    parser.add_argument(
        "--images-dir",
        default="data/yolo/val/images",
        help="Directory containing images.",
    )
    parser.add_argument(
        "--labels-dir",
        default="data/yolo/val/labels",
        help="Directory containing YOLO label .txt files.",
    )
    parser.add_argument(
        "--output-dir",
        default="runs/visualizations",
        help="Directory where side-by-side outputs are written.",
    )
    parser.add_argument(
        "--conf-thres",
        type=float,
        default=0.25,
        help="Minimum confidence required to draw predicted boxes.",
    )
    parser.add_argument(
        "--max-images",
        type=int,
        default=20,
        help="Maximum number of images to visualize (use <=0 for all).",
    )
    return parser.parse_args()


def read_yolo_label_file(label_file: Path, image_w: int, image_h: int) -> list[tuple[float, float, float, float]]:
    boxes: list[tuple[float, float, float, float]] = []
    if not label_file.exists():
        return boxes

    for line in label_file.read_text().splitlines():
        parts = line.strip().split()
        if len(parts) < 5:
            continue
        _, x_center, y_center, width, height = map(float, parts[:5])
        x1 = (x_center - width / 2.0) * image_w
        y1 = (y_center - height / 2.0) * image_h
        x2 = (x_center + width / 2.0) * image_w
        y2 = (y_center + height / 2.0) * image_h
        boxes.append((x1, y1, x2, y2))
    return boxes


def draw_boxes(
    image: Image.Image,
    boxes: Iterable[tuple[float, float, float, float]],
    color: tuple[int, int, int],
    labels: Iterable[str] | None = None,
) -> Image.Image:
    rendered = image.copy()
    draw = ImageDraw.Draw(rendered)

    if labels is None:
        labels = []
    labels_list = list(labels)

    for idx, (x1, y1, x2, y2) in enumerate(boxes):
        draw.rectangle([(x1, y1), (x2, y2)], outline=color, width=3)
        if idx < len(labels_list):
            draw.text((x1 + 2, max(0, y1 - 16)), labels_list[idx], fill=color)
    return rendered


def add_panel_title(image: Image.Image, title: str) -> Image.Image:
    title_height = 28
    canvas = Image.new("RGB", (image.width, image.height + title_height), color=(20, 20, 20))
    canvas.paste(image, (0, title_height))
    draw = ImageDraw.Draw(canvas)
    draw.text((8, 8), title, fill=(255, 255, 255))
    return canvas


def main() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parents[1]

    model_path = (root / args.model).resolve()
    images_dir = (root / args.images_dir).resolve()
    labels_dir = (root / args.labels_dir).resolve()
    output_dir = (root / args.output_dir).resolve()
    output_dir.mkdir(parents=True, exist_ok=True)

    image_paths = sorted([p for p in images_dir.iterdir() if p.suffix.lower() in VALID_IMAGE_SUFFIXES])
    if args.max_images > 0:
        image_paths = image_paths[: args.max_images]

    model = YOLO(str(model_path))

    for image_path in image_paths:
        image = Image.open(image_path).convert("RGB")
        gt_boxes = read_yolo_label_file(labels_dir / f"{image_path.stem}.txt", image.width, image.height)
        gt_rendered = draw_boxes(image, gt_boxes, color=(0, 255, 0))

        result = model.predict(source=str(image_path), conf=args.conf_thres, verbose=False)[0]
        pred_boxes = result.boxes.xyxy.cpu().tolist() if result.boxes is not None else []
        pred_confs = result.boxes.conf.cpu().tolist() if result.boxes is not None else []
        pred_labels = [f"{conf:.2f}" for conf in pred_confs]
        pred_rendered = draw_boxes(image, pred_boxes, color=(255, 0, 0), labels=pred_labels)

        left = add_panel_title(gt_rendered, "Ground Truth (green)")
        right = add_panel_title(pred_rendered, "Predictions (red)")

        combined = Image.new("RGB", (left.width + right.width, max(left.height, right.height)), color=(0, 0, 0))
        combined.paste(left, (0, 0))
        combined.paste(right, (left.width, 0))
        combined.save(output_dir / f"{image_path.stem}_comparison.jpg", quality=95)

    print(f"Wrote {len(image_paths)} comparison image(s) to: {output_dir}")


if __name__ == "__main__":
    main()
