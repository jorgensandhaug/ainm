"""Extract crops from YOLO training data + product images for classifier training."""
from __future__ import annotations

import json
import random
import shutil
from pathlib import Path
from PIL import Image


def parse_yolo_labels(label_path: Path) -> list[tuple[int, float, float, float, float]]:
    """Parse YOLO label file: class_id, xc, yc, w, h (normalized)."""
    labels = []
    for line in label_path.read_text().splitlines():
        parts = line.strip().split()
        if len(parts) != 5:
            continue
        cls = int(float(parts[0]))
        xc, yc, w, h = float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4])
        labels.append((cls, xc, yc, w, h))
    return labels


def extract_crop(img: Image.Image, xc: float, yc: float, w: float, h: float,
                 jitter: float = 0.0, pad: float = 0.05) -> Image.Image:
    """Extract a crop with optional jitter and padding."""
    iw, ih = img.size
    # Add padding
    w_pad = w * (1 + pad)
    h_pad = h * (1 + pad)
    # Apply jitter
    if jitter > 0:
        xc += random.uniform(-jitter, jitter) * w
        yc += random.uniform(-jitter, jitter) * h
        w_pad *= random.uniform(1 - jitter * 0.5, 1 + jitter * 0.5)
        h_pad *= random.uniform(1 - jitter * 0.5, 1 + jitter * 0.5)

    x1 = max(0, int((xc - w_pad / 2) * iw))
    y1 = max(0, int((yc - h_pad / 2) * ih))
    x2 = min(iw, int((xc + w_pad / 2) * iw))
    y2 = min(ih, int((yc + h_pad / 2) * ih))

    if x2 <= x1 or y2 <= y1:
        return None
    return img.crop((x1, y1, x2, y2))


def main() -> None:
    random.seed(42)

    yolo_root = Path("data/yolo")
    product_root = Path("data/product_images")
    mapping_path = Path("data/product_class_mapping.json")
    out_root = Path("data/classifier")
    crop_size = 224

    # Load class mapping
    mapping = json.loads(mapping_path.read_text()) if mapping_path.exists() else {}

    # Load class names from data.yaml
    data_yaml = (yolo_root / "data.yaml").read_text()
    class_names = {}
    for line in data_yaml.splitlines():
        line = line.strip()
        if line and ":" in line and line.split(":")[0].strip().isdigit():
            idx = int(line.split(":")[0].strip())
            name = line.split(":", 1)[1].strip().strip('"')
            class_names[idx] = name

    num_classes = len(class_names)
    print(f"Classes: {num_classes}")

    # Create output directories
    for split in ["train", "val"]:
        for cls_id in range(num_classes):
            (out_root / split / str(cls_id)).mkdir(parents=True, exist_ok=True)

    # Extract GT crops from YOLO train split
    train_images_dir = yolo_root / "train" / "images"
    train_labels_dir = yolo_root / "train" / "labels"

    crop_count = 0
    for label_path in sorted(train_labels_dir.glob("*.txt")):
        stem = label_path.stem
        img_path = train_images_dir / f"{stem}.jpg"
        if not img_path.exists():
            for ext in [".jpeg", ".png"]:
                alt = train_images_dir / f"{stem}{ext}"
                if alt.exists():
                    img_path = alt
                    break
        if not img_path.exists():
            continue

        img = Image.open(img_path).convert("RGB")
        labels = parse_yolo_labels(label_path)

        for i, (cls_id, xc, yc, w, h) in enumerate(labels):
            # Clean crop
            crop = extract_crop(img, xc, yc, w, h, jitter=0.0, pad=0.05)
            if crop is None:
                continue
            crop_resized = crop.resize((crop_size, crop_size), Image.LANCZOS)
            crop_resized.save(out_root / "train" / str(cls_id) / f"{stem}_box{i}.jpg", quality=92)
            crop_count += 1

            # Jittered copies for augmentation
            for j in range(2):
                jcrop = extract_crop(img, xc, yc, w, h, jitter=0.15, pad=0.08)
                if jcrop is None:
                    continue
                jcrop_resized = jcrop.resize((crop_size, crop_size), Image.LANCZOS)
                jcrop_resized.save(out_root / "train" / str(cls_id) / f"{stem}_box{i}_j{j}.jpg", quality=92)
                crop_count += 1

    print(f"Extracted {crop_count} GT crops from train split")

    # Extract GT crops from val split (for val classifier eval only)
    val_images_dir = yolo_root / "val" / "images"
    val_labels_dir = yolo_root / "val" / "labels"
    val_count = 0

    for label_path in sorted(val_labels_dir.glob("*.txt")):
        stem = label_path.stem
        img_path = val_images_dir / f"{stem}.jpg"
        if not img_path.exists():
            for ext in [".jpeg", ".png"]:
                alt = val_images_dir / f"{stem}{ext}"
                if alt.exists():
                    img_path = alt
                    break
        if not img_path.exists():
            continue

        img = Image.open(img_path).convert("RGB")
        labels = parse_yolo_labels(label_path)

        for i, (cls_id, xc, yc, w, h) in enumerate(labels):
            crop = extract_crop(img, xc, yc, w, h, jitter=0.0, pad=0.05)
            if crop is None:
                continue
            crop_resized = crop.resize((crop_size, crop_size), Image.LANCZOS)
            crop_resized.save(out_root / "val" / str(cls_id) / f"{stem}_box{i}.jpg", quality=92)
            val_count += 1

    print(f"Extracted {val_count} val crops")

    # Add product reference images
    product_count = 0
    for cls_id_str, info in mapping.items():
        cls_id = int(cls_id_str)
        pcode = info["product_code"]
        pdir = product_root / pcode
        if not pdir.exists():
            continue
        for img_path in pdir.iterdir():
            if img_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
                continue
            try:
                img = Image.open(img_path).convert("RGB")
                img_resized = img.resize((crop_size, crop_size), Image.LANCZOS)
                img_resized.save(
                    out_root / "train" / str(cls_id) / f"product_{pcode}_{img_path.stem}.jpg",
                    quality=92,
                )
                product_count += 1
            except Exception:
                continue

    print(f"Added {product_count} product reference images")

    # Summary
    train_total = sum(1 for _ in (out_root / "train").rglob("*.jpg"))
    val_total = sum(1 for _ in (out_root / "val").rglob("*.jpg"))
    classes_with_train = sum(1 for d in (out_root / "train").iterdir() if d.is_dir() and any(d.iterdir()))
    classes_with_val = sum(1 for d in (out_root / "val").iterdir() if d.is_dir() and any(d.iterdir()))

    summary = {
        "train_crops": train_total,
        "val_crops": val_total,
        "gt_crops": crop_count,
        "product_images": product_count,
        "classes_with_train_data": classes_with_train,
        "classes_with_val_data": classes_with_val,
        "total_classes": num_classes,
    }
    (out_root / "summary.json").write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))

    # Save categories for later use
    categories = [{"id": k, "name": v} for k, v in sorted(class_names.items())]
    (out_root / "categories.json").write_text(json.dumps(categories, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
