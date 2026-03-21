from __future__ import annotations

import argparse
import json
import math
import shutil
from collections import Counter, defaultdict
from pathlib import Path


def parse_label_classes(label_path: Path) -> list[int]:
    classes: list[int] = []
    for line in label_path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        classes.append(int(float(line.split()[0])))
    return classes


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a class-balanced YOLO train split by image replication.")
    parser.add_argument("--src-yolo-root", type=Path, default=Path("data/yolo"))
    parser.add_argument("--output-root", type=Path, default=Path("data/yolo_balanced"))
    parser.add_argument("--max-repeats", type=int, default=4)
    parser.add_argument("--min-class-count", type=int, default=40)
    parser.add_argument("--power", type=float, default=0.5, help="0.5 = sqrt balancing")
    args = parser.parse_args()

    src_train_images = args.src_yolo_root / "train" / "images"
    src_train_labels = args.src_yolo_root / "train" / "labels"
    src_val_images = args.src_yolo_root / "val" / "images"
    src_val_labels = args.src_yolo_root / "val" / "labels"
    src_yaml = args.src_yolo_root / "data.yaml"

    out_train_images = args.output_root / "train" / "images"
    out_train_labels = args.output_root / "train" / "labels"
    out_val_images = args.output_root / "val" / "images"
    out_val_labels = args.output_root / "val" / "labels"
    for d in (out_train_images, out_train_labels, out_val_images, out_val_labels):
        d.mkdir(parents=True, exist_ok=True)

    image_to_classes: dict[str, list[int]] = {}
    class_counts: Counter[int] = Counter()
    for label_path in sorted(src_train_labels.glob("*.txt")):
        classes = parse_label_classes(label_path)
        stem = label_path.stem
        image_to_classes[stem] = classes
        class_counts.update(classes)

    target = max(args.min_class_count, max(class_counts.values()) if class_counts else args.min_class_count)
    per_class_weight: dict[int, float] = {}
    for cls, count in class_counts.items():
        ratio = target / max(count, 1)
        per_class_weight[cls] = ratio ** args.power

    image_repeats: dict[str, int] = {}
    for stem, classes in image_to_classes.items():
        if not classes:
            image_repeats[stem] = 1
            continue
        boost = max(per_class_weight.get(cls, 1.0) for cls in classes)
        repeats = int(round(boost))
        repeats = max(1, min(args.max_repeats, repeats))
        image_repeats[stem] = repeats

    for stem, repeats in image_repeats.items():
        src_img = src_train_images / f"{stem}.jpg"
        if not src_img.exists():
            png_alt = src_train_images / f"{stem}.png"
            jpeg_alt = src_train_images / f"{stem}.jpeg"
            src_img = png_alt if png_alt.exists() else jpeg_alt
        if not src_img.exists():
            continue
        src_lbl = src_train_labels / f"{stem}.txt"
        for rep_idx in range(repeats):
            suffix = f"_rep{rep_idx}" if rep_idx > 0 else ""
            dst_stem = f"{stem}{suffix}"
            shutil.copy2(src_img, out_train_images / f"{dst_stem}{src_img.suffix}")
            shutil.copy2(src_lbl, out_train_labels / f"{dst_stem}.txt")

    for src_img in src_val_images.iterdir():
        if src_img.is_file():
            shutil.copy2(src_img, out_val_images / src_img.name)
    for src_lbl in src_val_labels.iterdir():
        if src_lbl.is_file():
            shutil.copy2(src_lbl, out_val_labels / src_lbl.name)

    src_data = src_yaml.read_text().splitlines()
    names_block = []
    for line in src_data:
        if line.startswith("names:") or line.startswith("  "):
            names_block.append(line)
    out_yaml = [
        f"path: {args.output_root.as_posix()}",
        "train: train/images",
        "val: val/images",
        *names_block,
    ]
    (args.output_root / "data.yaml").write_text("\n".join(out_yaml) + "\n")

    total_original = len(image_repeats)
    total_augmented = sum(image_repeats.values())
    summary = {
        "total_train_images_original": total_original,
        "total_train_images_balanced": total_augmented,
        "multiplier": round(total_augmented / max(total_original, 1), 3),
        "max_repeats": args.max_repeats,
        "min_class_count": args.min_class_count,
        "power": args.power,
        "top_repeated_examples": sorted(image_repeats.items(), key=lambda x: x[1], reverse=True)[:30],
    }
    (args.output_root / "balance_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
