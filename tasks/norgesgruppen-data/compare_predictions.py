import argparse
import json
from collections import defaultdict
from pathlib import Path

from PIL import Image


def xywh_to_xyxy(x: float, y: float, w: float, h: float) -> tuple[float, float, float, float]:
    return x, y, x + w, y + h


def iou_xyxy(a: tuple[float, float, float, float], b: tuple[float, float, float, float]) -> float:
    ax1, ay1, ax2, ay2 = a
    bx1, by1, bx2, by2 = b
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter = inter_w * inter_h
    if inter <= 0.0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter
    if union <= 0.0:
        return 0.0
    return inter / union


def parse_image_id_from_stem(stem: str) -> int:
    # Supports names like img_00005 and generic numeric stems.
    token = stem.split("_")[-1]
    return int(token)


def index_val_images(images_dir: Path) -> dict[int, tuple[int, int]]:
    image_sizes: dict[int, tuple[int, int]] = {}
    for image_path in sorted(images_dir.iterdir()):
        if image_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            continue
        image_id = parse_image_id_from_stem(image_path.stem)
        with Image.open(image_path) as im:
            w, h = im.size
        image_sizes[image_id] = (w, h)
    return image_sizes


def load_ground_truth(val_dir: Path) -> dict[int, list[dict]]:
    labels_dir = val_dir / "labels"
    images_dir = val_dir / "images"
    if not labels_dir.exists():
        raise FileNotFoundError(f"Missing labels directory: {labels_dir}")
    if not images_dir.exists():
        raise FileNotFoundError(f"Missing images directory: {images_dir}")

    image_sizes = index_val_images(images_dir)
    gt_by_image: dict[int, list[dict]] = defaultdict(list)

    for label_path in sorted(labels_dir.glob("*.txt")):
        image_id = parse_image_id_from_stem(label_path.stem)
        if image_id not in image_sizes:
            raise FileNotFoundError(
                f"No image found for label file {label_path.name} (expected matching image in {images_dir})"
            )
        img_w, img_h = image_sizes[image_id]
        for line in label_path.read_text().splitlines():
            if not line.strip():
                continue
            parts = line.strip().split()
            if len(parts) != 5:
                raise ValueError(f"Invalid YOLO row in {label_path}: {line!r}")
            class_id = int(float(parts[0]))
            xc, yc, w, h = (float(parts[1]), float(parts[2]), float(parts[3]), float(parts[4]))
            px_w = w * img_w
            px_h = h * img_h
            px_x = (xc * img_w) - (px_w / 2.0)
            px_y = (yc * img_h) - (px_h / 2.0)
            gt_by_image[image_id].append(
                {
                    "category_id": class_id,
                    "bbox_xyxy": xywh_to_xyxy(px_x, px_y, px_w, px_h),
                }
            )

    return gt_by_image


def load_predictions(predictions_path: Path, score_threshold: float) -> dict[int, list[dict]]:
    raw = json.loads(predictions_path.read_text())
    if not isinstance(raw, list):
        raise ValueError(f"Expected a JSON list in {predictions_path}, got {type(raw).__name__}")

    pred_by_image: dict[int, list[dict]] = defaultdict(list)
    for item in raw:
        if not isinstance(item, dict):
            continue
        score = float(item.get("score", 1.0))
        if score < score_threshold:
            continue
        image_id = int(item["image_id"])
        class_id = int(item.get("category_id", -1))
        bbox = item["bbox"]
        if not isinstance(bbox, list) or len(bbox) != 4:
            continue
        x, y, w, h = map(float, bbox)
        pred_by_image[image_id].append(
            {
                "category_id": class_id,
                "score": score,
                "bbox_xyxy": xywh_to_xyxy(x, y, w, h),
            }
        )

    for image_id in pred_by_image:
        pred_by_image[image_id].sort(key=lambda row: row["score"], reverse=True)

    return pred_by_image


def compute_ap(recalls: list[float], precisions: list[float]) -> float:
    if not recalls:
        return 0.0
    mrec = [0.0] + recalls + [1.0]
    mpre = [0.0] + precisions + [0.0]
    for i in range(len(mpre) - 2, -1, -1):
        mpre[i] = max(mpre[i], mpre[i + 1])
    ap = 0.0
    for i in range(len(mrec) - 1):
        if mrec[i + 1] != mrec[i]:
            ap += (mrec[i + 1] - mrec[i]) * mpre[i + 1]
    return ap


def flatten_by_image(records_by_image: dict[int, list[dict]]) -> list[dict]:
    flat = []
    for image_id, rows in records_by_image.items():
        for row in rows:
            out = dict(row)
            out["image_id"] = image_id
            flat.append(out)
    return flat


def compute_single_ap(
    gt_records: list[dict],
    pred_records: list[dict],
    iou_threshold: float,
) -> tuple[float, dict[str, float]]:
    gt_by_image: dict[int, list[tuple[int, dict]]] = defaultdict(list)
    for idx, gt in enumerate(gt_records):
        gt_by_image[int(gt["image_id"])].append((idx, gt))

    total_gt = len(gt_records)
    if total_gt == 0:
        return 0.0, {"tp": 0.0, "fp": 0.0, "fn": 0.0}

    sorted_preds = sorted(pred_records, key=lambda x: float(x["score"]), reverse=True)
    matched_gt: set[int] = set()
    tps: list[int] = []
    fps: list[int] = []

    for pred in sorted_preds:
        image_id = int(pred["image_id"])
        candidates = gt_by_image.get(image_id, [])
        best_iou = 0.0
        best_gt_idx = None
        for gt_idx, gt in candidates:
            if gt_idx in matched_gt:
                continue
            iou = iou_xyxy(pred["bbox_xyxy"], gt["bbox_xyxy"])
            if iou > best_iou:
                best_iou = iou
                best_gt_idx = gt_idx
        if best_gt_idx is not None and best_iou >= iou_threshold:
            matched_gt.add(best_gt_idx)
            tps.append(1)
            fps.append(0)
        else:
            tps.append(0)
            fps.append(1)

    cum_tp = 0
    cum_fp = 0
    recalls = []
    precisions = []
    for tp_i, fp_i in zip(tps, fps):
        cum_tp += tp_i
        cum_fp += fp_i
        recalls.append(cum_tp / total_gt if total_gt else 0.0)
        precisions.append(cum_tp / (cum_tp + cum_fp) if (cum_tp + cum_fp) else 0.0)

    ap = compute_ap(recalls, precisions)
    tp = float(cum_tp)
    fp = float(cum_fp)
    fn = float(total_gt - cum_tp)
    return ap, {"tp": tp, "fp": fp, "fn": fn}


def evaluate_hybrid(
    gt_by_image: dict[int, list[dict]],
    pred_by_image: dict[int, list[dict]],
    iou_threshold: float,
    num_classes: int,
) -> dict:
    gt_flat = flatten_by_image(gt_by_image)
    pred_flat = flatten_by_image(pred_by_image)

    # Detection AP ignores category_id.
    detection_ap, det_counts = compute_single_ap(gt_flat, pred_flat, iou_threshold=iou_threshold)

    gt_classes = {int(g["category_id"]) for g in gt_flat}
    pred_classes = {int(p["category_id"]) for p in pred_flat}
    present_classes = sorted(gt_classes | pred_classes)

    class_aps_present = []
    class_aps_full = []
    per_class = []
    for class_id in range(num_classes):
        class_gt = [g for g in gt_flat if int(g["category_id"]) == class_id]
        class_pred = [p for p in pred_flat if int(p["category_id"]) == class_id]
        if len(class_gt) == 0:
            class_aps_full.append(0.0)
            per_class.append(
                {
                    "class_id": class_id,
                    "ap50": 0.0,
                    "gt_count": 0,
                    "pred_count": len(class_pred),
                }
            )
            continue
        ap, _ = compute_single_ap(class_gt, class_pred, iou_threshold=iou_threshold)
        class_aps_full.append(ap)
        class_aps_present.append(ap)
        per_class.append(
            {
                "class_id": class_id,
                "ap50": ap,
                "gt_count": len(class_gt),
                "pred_count": len(class_pred),
            }
        )

    classification_map_present = (
        sum(class_aps_present) / len(class_aps_present) if class_aps_present else 0.0
    )
    classification_map_full = sum(class_aps_full) / num_classes if num_classes > 0 else 0.0

    hybrid_present = 0.7 * detection_ap + 0.3 * classification_map_present
    hybrid_full = 0.7 * detection_ap + 0.3 * classification_map_full

    all_image_ids = sorted(set(gt_by_image.keys()) | set(pred_by_image.keys()))
    per_image = []
    for image_id in all_image_ids:
        per_image.append(
            {
                "image_id": image_id,
                "gt": len(gt_by_image.get(image_id, [])),
                "pred": len(pred_by_image.get(image_id, [])),
            }
        )

    return {
        "images": len(all_image_ids),
        "gt_boxes": len(gt_flat),
        "pred_boxes": len(pred_flat),
        "detection_ap50": detection_ap,
        "classification_map50_present_classes": classification_map_present,
        "classification_map50_all_classes": classification_map_full,
        "hybrid_score_present_classes": hybrid_present,
        "hybrid_score_all_classes": hybrid_full,
        "present_gt_classes": len({int(g["category_id"]) for g in gt_flat}),
        "counts_detection": det_counts,
        "per_image": per_image,
        "per_class": per_class,
    }


def load_category_names(categories_json: Path | None) -> dict[int, str]:
    if categories_json is None:
        return {}
    raw = json.loads(categories_json.read_text())
    if isinstance(raw, dict):
        raw = raw.get("categories", [])
    if not isinstance(raw, list):
        raise ValueError(f"Expected a JSON list or dict with 'categories' in {categories_json}, got {type(raw).__name__}")
    names: dict[int, str] = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        class_id = int(item.get("id", -1))
        if class_id < 0:
            continue
        names[class_id] = str(item.get("name", ""))
    return names


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Compare prediction.json against data/yolo/val using hybrid mAP scoring."
    )
    parser.add_argument(
        "--predictions",
        "-p",
        type=Path,
        default=Path("predictions.json"),
        help="Predictions JSON file (default: prediction.json).",
    )
    parser.add_argument(
        "--val-dir",
        "-v",
        type=Path,
        default=Path("data/yolo/val"),
        help="YOLO validation directory containing images/ and labels/ (default: data/yolo/val).",
    )
    parser.add_argument("--iou", type=float, default=0.5, help="IoU threshold for AP matching.")
    parser.add_argument("--score-threshold", type=float, default=0.0, help="Discard predictions below this score.")
    parser.add_argument("--num-classes", type=int, default=356, help="Number of product classes for classification mAP.")
    parser.add_argument(
        "--show-worst",
        type=int,
        default=10,
        help="Show top-N images by largest prediction-vs-gt box count gap.",
    )
    parser.add_argument(
        "--show-worst-classes",
        type=int,
        default=0,
        help="Show N worst classes by AP@0.5 among classes with GT.",
    )
    parser.add_argument(
        "--categories-json",
        type=Path,
        default=Path("data/classifier/categories.json"),
        help="Category names JSON with [{'id': int, 'name': str}, ...].",
    )
    args = parser.parse_args()

    gt_by_image = load_ground_truth(args.val_dir)
    pred_by_image = load_predictions(args.predictions, args.score_threshold)
    category_names = load_category_names(args.categories_json if args.categories_json.exists() else None)
    metrics = evaluate_hybrid(
        gt_by_image=gt_by_image,
        pred_by_image=pred_by_image,
        iou_threshold=args.iou,
        num_classes=args.num_classes,
    )

    print(f"Predictions: {args.predictions}")
    print(f"Validation dir: {args.val_dir}")
    print(f"IoU threshold: {args.iou:.2f}")
    print(f"Score threshold: {args.score_threshold:.3f}")
    print(f"Num classes: {args.num_classes}")
    print("")
    print(f"Images compared: {metrics['images']}")
    print(f"GT boxes: {metrics['gt_boxes']}")
    print(f"Pred boxes: {metrics['pred_boxes']}")
    print(f"Detection AP@0.5 (class-agnostic): {metrics['detection_ap50']:.4f}")
    print(
        "Classification mAP@0.5 (present GT classes): "
        f"{metrics['classification_map50_present_classes']:.4f} "
        f"(present classes={metrics['present_gt_classes']})"
    )
    print(
        f"Classification mAP@0.5 (all {args.num_classes} classes): "
        f"{metrics['classification_map50_all_classes']:.4f}"
    )
    print("")
    print(
        "Hybrid score (0.7*det + 0.3*cls, present GT classes): "
        f"{metrics['hybrid_score_present_classes']:.4f}"
    )
    print(
        f"Hybrid score (0.7*det + 0.3*cls, all {args.num_classes} classes): "
        f"{metrics['hybrid_score_all_classes']:.4f}"
    )
    det_counts = metrics["counts_detection"]
    print("")
    print(
        "Detection matching counts (for reference): "
        f"TP={int(det_counts['tp'])} FP={int(det_counts['fp'])} FN={int(det_counts['fn'])}"
    )

    if args.show_worst > 0:
        print("")
        print(f"Worst {args.show_worst} images by |pred - gt| box-count gap:")
        ranked = sorted(
            metrics["per_image"],
            key=lambda row: abs(row["pred"] - row["gt"]),
            reverse=True,
        )
        for row in ranked[: args.show_worst]:
            print(
                f"  image_id={row['image_id']:>5} "
                f"gt={row['gt']:>3} pred={row['pred']:>3} gap={abs(row['pred'] - row['gt']):>3}"
            )

    if args.show_worst_classes > 0:
        print("")
        print(f"Worst {args.show_worst_classes} classes by AP@0.5 (GT-present classes only):")
        classes_with_gt = [row for row in metrics["per_class"] if row["gt_count"] > 0]
        ranked = sorted(
            classes_with_gt,
            key=lambda row: (row["ap50"], -row["gt_count"]),
        )
        for row in ranked[: args.show_worst_classes]:
            class_id = int(row["class_id"])
            class_name = category_names.get(class_id, "")
            suffix = f" name={class_name!r}" if class_name else ""
            print(
                f"  class_id={class_id:>3} ap50={row['ap50']:.4f} "
                f"gt={row['gt_count']:>4} pred={row['pred_count']:>4}{suffix}"
            )


if __name__ == "__main__":
    main()
