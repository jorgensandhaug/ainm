"""Extract crops from YOLO annotated images for classifier training."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from PIL import Image


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--split", choices=["train", "val", "both"], default="train")
    parser.add_argument("--yolo-root", type=Path, default=Path("data/yolo"))
    parser.add_argument("--output", type=Path, default=Path("data/classifier_crops"))
    parser.add_argument("--min-size", type=int, default=32, help="Min crop dimension in pixels")
    parser.add_argument("--pad-ratio", type=float, default=0.05, help="Pad crops by this ratio")
    args = parser.parse_args()

    splits = ["train", "val"] if args.split == "both" else [args.split]
    total = 0

    for split in splits:
        images_dir = args.yolo_root / split / "images"
        labels_dir = args.yolo_root / split / "labels"

        for label_path in sorted(labels_dir.glob("*.txt")):
            stem = label_path.stem
            # Find image
            img_path = None
            for ext in [".jpg", ".jpeg", ".png"]:
                p = images_dir / f"{stem}{ext}"
                if p.exists():
                    img_path = p
                    break
            if img_path is None:
                continue

            img = Image.open(img_path)
            img_w, img_h = img.size

            for line_idx, line in enumerate(label_path.read_text().splitlines()):
                line = line.strip()
                if not line:
                    continue
                parts = line.split()
                class_id = int(float(parts[0]))
                xc, yc, w, h = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])

                # Convert to pixel coords
                px_w = w * img_w
                px_h = h * img_h
                px_x = (xc * img_w) - (px_w / 2.0)
                px_y = (yc * img_h) - (px_h / 2.0)

                # Skip tiny boxes
                if px_w < args.min_size or px_h < args.min_size:
                    continue

                # Pad
                pad_x = px_w * args.pad_ratio
                pad_y = px_h * args.pad_ratio
                x1 = max(0, int(px_x - pad_x))
                y1 = max(0, int(px_y - pad_y))
                x2 = min(img_w, int(px_x + px_w + pad_x))
                y2 = min(img_h, int(px_y + px_h + pad_y))

                crop = img.crop((x1, y1, x2, y2))

                out_dir = args.output / str(class_id)
                out_dir.mkdir(parents=True, exist_ok=True)
                crop_name = f"{stem}_{line_idx}.jpg"
                crop.save(out_dir / crop_name, quality=95)
                total += 1

    # Summary
    class_dirs = sorted(args.output.iterdir())
    print(f"Extracted {total} crops into {len(class_dirs)} classes")
    counts = {int(d.name): len(list(d.glob("*.jpg"))) for d in class_dirs if d.is_dir()}
    print(f"Min crops/class: {min(counts.values()) if counts else 0}")
    print(f"Max crops/class: {max(counts.values()) if counts else 0}")
    print(f"Avg crops/class: {sum(counts.values()) / len(counts) if counts else 0:.1f}")


if __name__ == "__main__":
    main()
