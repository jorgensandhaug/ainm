import json
import random
import shutil
from pathlib import Path


def main() -> None:
    random.seed(42)

    src_root = Path("data/train")
    src_images = src_root / "images"
    src_annotations = src_root / "annotations.json"

    out_root = Path("data/yolo")
    train_images_out = out_root / "train" / "images"
    train_labels_out = out_root / "train" / "labels"
    val_images_out = out_root / "val" / "images"
    val_labels_out = out_root / "val" / "labels"
    for d in (train_images_out, train_labels_out, val_images_out, val_labels_out):
        d.mkdir(parents=True, exist_ok=True)

    coco = json.loads(src_annotations.read_text())
    images = {img["id"]: img for img in coco["images"]}
    categories = sorted(coco["categories"], key=lambda c: c["id"])
    cat_id_to_idx = {cat["id"]: idx for idx, cat in enumerate(categories)}

    anns_by_image_id: dict[int, list[dict]] = {}
    for ann in coco["annotations"]:
        anns_by_image_id.setdefault(ann["image_id"], []).append(ann)

    image_ids = list(images.keys())
    random.shuffle(image_ids)
    val_count = max(1, int(0.2 * len(image_ids)))
    val_ids = set(image_ids[:val_count])

    for image_id, image in images.items():
        split = "val" if image_id in val_ids else "train"
        image_out_dir = val_images_out if split == "val" else train_images_out
        label_out_dir = val_labels_out if split == "val" else train_labels_out

        src_image_path = src_images / image["file_name"]
        dst_image_path = image_out_dir / image["file_name"]
        shutil.copy2(src_image_path, dst_image_path)

        width = float(image["width"])
        height = float(image["height"])
        lines = []
        for ann in anns_by_image_id.get(image_id, []):
            x, y, w, h = ann["bbox"]
            x_center = (x + w / 2.0) / width
            y_center = (y + h / 2.0) / height
            w_norm = w / width
            h_norm = h / height
            cls_idx = cat_id_to_idx[ann["category_id"]]
            lines.append(f"{cls_idx} {x_center:.6f} {y_center:.6f} {w_norm:.6f} {h_norm:.6f}")

        label_path = label_out_dir / f"{Path(image['file_name']).stem}.txt"
        label_path.write_text("\n".join(lines))

    names = {idx: cat["name"] for idx, cat in enumerate(categories)}
    data_yaml_lines = [
        f"path: {out_root.as_posix()}",
        "train: train/images",
        "val: val/images",
        "names:",
    ]
    for idx, name in names.items():
        safe_name = str(name).replace('"', '\\"')
        data_yaml_lines.append(f'  {idx}: "{safe_name}"')

    (out_root / "data.yaml").write_text("\n".join(data_yaml_lines) + "\n")
    print(f"Wrote YOLO dataset to {out_root}")
    print(f"Classes: {len(categories)}")


if __name__ == "__main__":
    main()
