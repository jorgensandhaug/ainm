from __future__ import annotations

import argparse
import json
import shutil
from collections import Counter
from pathlib import Path


def parse_label_classes(label_path: Path) -> list[int]:
    classes: list[int] = []
    for line in label_path.read_text().splitlines():
        line = line.strip()
        if not line:
            continue
        classes.append(int(float(line.split()[0])))
    return classes


def load_top_pairs(confusion_json: Path, top_pairs: int) -> list[tuple[int, int, int]]:
    raw = json.loads(confusion_json.read_text())
    rows = raw.get("top_confusions", []) if isinstance(raw, dict) else []
    pairs: list[tuple[int, int, int]] = []
    for row in rows[:top_pairs]:
        gt = int(row.get("gt_class", -1))
        pred = int(row.get("pred_class", -1))
        count = int(row.get("count", 0))
        if gt >= 0 and pred >= 0 and count > 0:
            pairs.append((gt, pred, count))
    return pairs


def copy_val_split(src_root: Path, out_root: Path) -> None:
    src_val_images = src_root / "val" / "images"
    src_val_labels = src_root / "val" / "labels"
    out_val_images = out_root / "val" / "images"
    out_val_labels = out_root / "val" / "labels"
    out_val_images.mkdir(parents=True, exist_ok=True)
    out_val_labels.mkdir(parents=True, exist_ok=True)
    for src in src_val_images.iterdir():
        if src.is_file():
            shutil.copy2(src, out_val_images / src.name)
    for src in src_val_labels.iterdir():
        if src.is_file():
            shutil.copy2(src, out_val_labels / src.name)


def write_data_yaml(src_yaml: Path, out_root: Path) -> None:
    src_data = src_yaml.read_text().splitlines()
    names_block = []
    in_names = False
    for line in src_data:
        if line.startswith("names:"):
            in_names = True
            names_block.append(line)
            continue
        if in_names and line.startswith("  "):
            names_block.append(line)
            continue
        if in_names and not line.startswith("  "):
            in_names = False
    out_yaml = [
        f"path: {out_root.as_posix()}",
        "train: train/images",
        "val: val/images",
        *names_block,
    ]
    (out_root / "data.yaml").write_text("\n".join(out_yaml) + "\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="Build confusion-pair curriculum YOLO dataset.")
    parser.add_argument("--src-yolo-root", type=Path, default=Path("data/yolo"))
    parser.add_argument("--confusion-json", type=Path, default=Path("sweep_results/error_analysis.json"))
    parser.add_argument("--output-root", type=Path, default=Path("data/yolo_confusion_curriculum"))
    parser.add_argument("--top-pairs", type=int, default=30)
    parser.add_argument("--max-repeats", type=int, default=4)
    parser.add_argument("--pair-boost", type=float, default=1.3)
    parser.add_argument("--class-boost", type=float, default=0.5)
    parser.add_argument("--min-repeat", type=int, default=1)
    args = parser.parse_args()

    src_train_images = args.src_yolo_root / "train" / "images"
    src_train_labels = args.src_yolo_root / "train" / "labels"
    src_yaml = args.src_yolo_root / "data.yaml"

    out_train_images = args.output_root / "train" / "images"
    out_train_labels = args.output_root / "train" / "labels"
    out_train_images.mkdir(parents=True, exist_ok=True)
    out_train_labels.mkdir(parents=True, exist_ok=True)

    top_pairs = load_top_pairs(args.confusion_json, args.top_pairs)
    pair_set = {(a, b) for a, b, _ in top_pairs}
    pair_counts = {(a, b): c for a, b, c in top_pairs}
    max_count = max((c for _, _, c in top_pairs), default=1)
    target_classes = {a for a, _, _ in top_pairs} | {b for _, b, _ in top_pairs}

    image_to_classes: dict[str, list[int]] = {}
    for label_path in sorted(src_train_labels.glob("*.txt")):
        image_to_classes[label_path.stem] = parse_label_classes(label_path)

    image_repeats: dict[str, int] = {}
    class_presence: Counter[int] = Counter()
    pair_presence: Counter[str] = Counter()
    for stem, classes in image_to_classes.items():
        cls_set = set(classes)
        for c in cls_set:
            class_presence[c] += 1

        score = float(args.min_repeat)
        if target_classes.intersection(cls_set):
            # Boost images containing confusing classes.
            overlap_ratio = len(target_classes.intersection(cls_set)) / max(1, len(cls_set))
            score += args.class_boost * (1.0 + overlap_ratio)

        for a, b in pair_set:
            if a in cls_set and b in cls_set:
                norm = pair_counts[(a, b)] / max_count
                score += args.pair_boost * norm
                pair_presence[f"{a}->{b}"] += 1

        repeats = int(round(score))
        repeats = max(args.min_repeat, min(args.max_repeats, repeats))
        image_repeats[stem] = repeats

    total_written = 0
    for stem, repeats in image_repeats.items():
        src_img = src_train_images / f"{stem}.jpg"
        if not src_img.exists():
            png_alt = src_train_images / f"{stem}.png"
            jpeg_alt = src_train_images / f"{stem}.jpeg"
            src_img = png_alt if png_alt.exists() else jpeg_alt
        src_lbl = src_train_labels / f"{stem}.txt"
        if not src_img.exists() or not src_lbl.exists():
            continue
        for rep_idx in range(repeats):
            suffix = f"_rep{rep_idx}" if rep_idx > 0 else ""
            dst_stem = f"{stem}{suffix}"
            shutil.copy2(src_img, out_train_images / f"{dst_stem}{src_img.suffix}")
            shutil.copy2(src_lbl, out_train_labels / f"{dst_stem}.txt")
            total_written += 1

    copy_val_split(args.src_yolo_root, args.output_root)
    write_data_yaml(src_yaml, args.output_root)

    summary = {
        "confusion_json": str(args.confusion_json),
        "top_pairs": [{"gt": a, "pred": b, "count": c} for a, b, c in top_pairs],
        "num_target_classes": len(target_classes),
        "num_source_train_images": len(image_repeats),
        "num_curriculum_train_images": total_written,
        "multiplier": round(total_written / max(1, len(image_repeats)), 3),
        "max_repeats": args.max_repeats,
        "pair_boost": args.pair_boost,
        "class_boost": args.class_boost,
        "top_pair_presence_in_train": pair_presence.most_common(20),
        "top_repeated_images": sorted(image_repeats.items(), key=lambda x: x[1], reverse=True)[:40],
    }
    (args.output_root / "curriculum_summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))


if __name__ == "__main__":
    main()
