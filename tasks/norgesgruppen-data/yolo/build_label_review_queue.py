from __future__ import annotations

import argparse
import csv
import json
from collections import Counter, defaultdict
from pathlib import Path

from PIL import Image


def parse_image_id_from_stem(stem: str) -> int:
    token = stem.split("_")[-1]
    return int(token)


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


def load_category_names(categories_json: Path | None) -> dict[int, str]:
    if categories_json is None or not categories_json.exists():
        return {}
    raw = json.loads(categories_json.read_text())
    if isinstance(raw, dict):
        raw = raw.get("categories", [])
    if not isinstance(raw, list):
        return {}
    out: dict[int, str] = {}
    for item in raw:
        if not isinstance(item, dict):
            continue
        class_id = int(item.get("id", -1))
        if class_id < 0:
            continue
        out[class_id] = str(item.get("name", ""))
    return out


def index_images(images_dir: Path) -> dict[int, dict]:
    indexed: dict[int, dict] = {}
    for image_path in sorted(images_dir.iterdir()):
        if image_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            continue
        image_id = parse_image_id_from_stem(image_path.stem)
        with Image.open(image_path) as im:
            width, height = im.size
        indexed[image_id] = {
            "image_id": image_id,
            "image_path": str(image_path.resolve()),
            "width": width,
            "height": height,
            "stem": image_path.stem,
        }
    return indexed


def load_ground_truth(val_dir: Path) -> dict[int, list[dict]]:
    labels_dir = val_dir / "labels"
    images_dir = val_dir / "images"
    images = index_images(images_dir)
    gt_by_image: dict[int, list[dict]] = defaultdict(list)

    for label_path in sorted(labels_dir.glob("*.txt")):
        image_id = parse_image_id_from_stem(label_path.stem)
        if image_id not in images:
            continue
        img_w = images[image_id]["width"]
        img_h = images[image_id]["height"]
        lines = label_path.read_text().splitlines()
        for row_idx, line in enumerate(lines):
            if not line.strip():
                continue
            parts = line.strip().split()
            if len(parts) != 5:
                continue
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
                    "label_path": str(label_path.resolve()),
                    "label_line_index": row_idx,
                    "label_line": line.strip(),
                }
            )
    return gt_by_image


def load_predictions(predictions_path: Path, score_threshold: float) -> dict[int, list[dict]]:
    raw = json.loads(predictions_path.read_text())
    pred_by_image: dict[int, list[dict]] = defaultdict(list)
    if not isinstance(raw, list):
        return pred_by_image
    for item in raw:
        if not isinstance(item, dict):
            continue
        score = float(item.get("score", 1.0))
        if score < score_threshold:
            continue
        image_id = int(item.get("image_id", -1))
        class_id = int(item.get("category_id", -1))
        bbox = item.get("bbox", [])
        if image_id < 0 or class_id < 0 or not isinstance(bbox, list) or len(bbox) != 4:
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
        pred_by_image[image_id].sort(key=lambda r: r["score"], reverse=True)
    return pred_by_image


def main() -> None:
    parser = argparse.ArgumentParser(description="Build a ranked manual review queue for label cleanup.")
    parser.add_argument("--predictions", type=Path, required=True, help="Predictions JSON from run.py.")
    parser.add_argument("--val-dir", type=Path, default=Path("data/yolo/val"))
    parser.add_argument("--categories-json", type=Path, default=Path("data/classifier/categories.json"))
    parser.add_argument("--iou", type=float, default=0.5, help="IoU threshold used for matched detections.")
    parser.add_argument(
        "--near-iou",
        type=float,
        default=0.35,
        help="Lower IoU bound for near-miss same-class box review.",
    )
    parser.add_argument("--score-threshold", type=float, default=0.0)
    parser.add_argument("--top-pairs", type=int, default=20, help="Top confusion pairs to keep.")
    parser.add_argument("--max-per-pair", type=int, default=120, help="Max queue rows per confusion pair.")
    parser.add_argument("--max-near-miss", type=int, default=400, help="Max near-miss box review rows.")
    parser.add_argument("--output-json", type=Path, default=Path("sweep_results/label_review_queue.json"))
    parser.add_argument("--output-csv", type=Path, default=Path("sweep_results/label_review_queue.csv"))
    parser.add_argument(
        "--output-pairs-json",
        type=Path,
        default=Path("sweep_results/label_review_pairs.json"),
        help="Summary of top confusion pairs by count.",
    )
    args = parser.parse_args()

    images = index_images(args.val_dir / "images")
    gt_by_image = load_ground_truth(args.val_dir)
    pred_by_image = load_predictions(args.predictions, score_threshold=args.score_threshold)
    class_names = load_category_names(args.categories_json if args.categories_json.exists() else None)

    confusion_counts: Counter[tuple[int, int]] = Counter()
    misclassified_events: list[dict] = []
    near_miss_events: list[dict] = []

    all_image_ids = sorted(set(gt_by_image.keys()) | set(pred_by_image.keys()))
    for image_id in all_image_ids:
        gt_rows = gt_by_image.get(image_id, [])
        pred_rows = pred_by_image.get(image_id, [])
        used_pred: set[int] = set()

        for gt_idx, gt in enumerate(gt_rows):
            best_iou = 0.0
            best_pred_idx = -1
            for pred_idx, pred in enumerate(pred_rows):
                if pred_idx in used_pred:
                    continue
                iou = iou_xyxy(gt["bbox_xyxy"], pred["bbox_xyxy"])
                if iou > best_iou:
                    best_iou = iou
                    best_pred_idx = pred_idx

            if best_pred_idx < 0:
                continue

            pred = pred_rows[best_pred_idx]
            gt_class = int(gt["category_id"])
            pred_class = int(pred["category_id"])
            score = float(pred["score"])

            if best_iou >= args.iou:
                used_pred.add(best_pred_idx)
                if pred_class != gt_class:
                    confusion_counts[(gt_class, pred_class)] += 1
                    # High-score high-IoU mismatches are often annotation inconsistencies.
                    suspicion = (score * 0.6) + (best_iou * 0.4)
                    misclassified_events.append(
                        {
                            "issue_type": "class_confusion",
                            "priority": round(float(suspicion), 6),
                            "image_id": image_id,
                            "image_path": images.get(image_id, {}).get("image_path", ""),
                            "label_path": gt["label_path"],
                            "label_line_index": gt["label_line_index"],
                            "label_line": gt["label_line"],
                            "gt_class_id": gt_class,
                            "gt_class_name": class_names.get(gt_class, ""),
                            "pred_class_id": pred_class,
                            "pred_class_name": class_names.get(pred_class, ""),
                            "pred_score": round(score, 6),
                            "iou": round(float(best_iou), 6),
                            "gt_bbox_xyxy": [round(float(v), 2) for v in gt["bbox_xyxy"]],
                            "pred_bbox_xyxy": [round(float(v), 2) for v in pred["bbox_xyxy"]],
                            "suggested_action": "Verify GT class vs sibling class; fix inconsistent SKU labeling first.",
                        }
                    )
            elif args.near_iou <= best_iou < args.iou and pred_class == gt_class:
                # Same class but low overlap: commonly indicates noisy/tightness issues in GT boxes.
                near_miss_events.append(
                    {
                        "issue_type": "box_near_miss",
                        "priority": round(float((1.0 - best_iou) * max(score, 0.2)), 6),
                        "image_id": image_id,
                        "image_path": images.get(image_id, {}).get("image_path", ""),
                        "label_path": gt["label_path"],
                        "label_line_index": gt["label_line_index"],
                        "label_line": gt["label_line"],
                        "gt_class_id": gt_class,
                        "gt_class_name": class_names.get(gt_class, ""),
                        "pred_class_id": pred_class,
                        "pred_class_name": class_names.get(pred_class, ""),
                        "pred_score": round(score, 6),
                        "iou": round(float(best_iou), 6),
                        "gt_bbox_xyxy": [round(float(v), 2) for v in gt["bbox_xyxy"]],
                        "pred_bbox_xyxy": [round(float(v), 2) for v in pred["bbox_xyxy"]],
                        "suggested_action": "Check bbox tightness/extent for occluded or adjacent items.",
                    }
                )

    top_pairs = confusion_counts.most_common(args.top_pairs)
    allowed_pairs = set(pair for pair, _ in top_pairs)

    by_pair: dict[tuple[int, int], list[dict]] = defaultdict(list)
    for row in misclassified_events:
        pair = (int(row["gt_class_id"]), int(row["pred_class_id"]))
        if pair in allowed_pairs:
            by_pair[pair].append(row)

    queue_rows: list[dict] = []
    for pair, rows in by_pair.items():
        rows.sort(key=lambda r: (r["priority"], r["pred_score"], r["iou"]), reverse=True)
        queue_rows.extend(rows[: args.max_per_pair])

    near_miss_events.sort(key=lambda r: (r["priority"], r["pred_score"]), reverse=True)
    queue_rows.extend(near_miss_events[: args.max_near_miss])
    queue_rows.sort(key=lambda r: (r["priority"], r["pred_score"]), reverse=True)

    pair_summary = []
    for (gt_class, pred_class), count in top_pairs:
        pair_summary.append(
            {
                "gt_class_id": int(gt_class),
                "gt_class_name": class_names.get(int(gt_class), ""),
                "pred_class_id": int(pred_class),
                "pred_class_name": class_names.get(int(pred_class), ""),
                "count": int(count),
            }
        )

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_csv.parent.mkdir(parents=True, exist_ok=True)
    args.output_pairs_json.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "config": {
            "predictions": str(args.predictions),
            "val_dir": str(args.val_dir),
            "iou": args.iou,
            "near_iou": args.near_iou,
            "score_threshold": args.score_threshold,
            "top_pairs": args.top_pairs,
            "max_per_pair": args.max_per_pair,
            "max_near_miss": args.max_near_miss,
        },
        "counts": {
            "total_misclassified_matches": len(misclassified_events),
            "total_near_miss": len(near_miss_events),
            "queue_size": len(queue_rows),
        },
        "top_pairs": pair_summary,
        "queue": queue_rows,
    }
    args.output_json.write_text(json.dumps(payload, indent=2))
    args.output_pairs_json.write_text(json.dumps(pair_summary, indent=2))

    if queue_rows:
        fieldnames = list(queue_rows[0].keys())
        with args.output_csv.open("w", newline="") as f:
            writer = csv.DictWriter(f, fieldnames=fieldnames)
            writer.writeheader()
            writer.writerows(queue_rows)
    else:
        with args.output_csv.open("w", newline="") as f:
            writer = csv.writer(f)
            writer.writerow(
                [
                    "issue_type",
                    "priority",
                    "image_id",
                    "image_path",
                    "label_path",
                    "label_line_index",
                    "label_line",
                    "gt_class_id",
                    "gt_class_name",
                    "pred_class_id",
                    "pred_class_name",
                    "pred_score",
                    "iou",
                    "gt_bbox_xyxy",
                    "pred_bbox_xyxy",
                    "suggested_action",
                ]
            )

    print(f"Wrote queue JSON: {args.output_json}")
    print(f"Wrote queue CSV:  {args.output_csv}")
    print(f"Wrote pair summary: {args.output_pairs_json}")
    print(f"Queue rows: {len(queue_rows)}")
    print(f"Top confusion pairs considered: {len(top_pairs)}")


if __name__ == "__main__":
    main()
