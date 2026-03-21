from __future__ import annotations

import argparse
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))
from compare_predictions import iou_xyxy, load_category_names, load_ground_truth, load_predictions


def analyze_errors(
    gt_by_image: dict[int, list[dict]],
    pred_by_image: dict[int, list[dict]],
    iou_threshold: float,
) -> dict:
    missing_by_class: Counter[int] = Counter()
    misclassified_gt_by_class: Counter[int] = Counter()
    confusion: Counter[tuple[int, int]] = Counter()
    gt_count_by_class: Counter[int] = Counter()
    pred_count_by_class: Counter[int] = Counter()

    all_image_ids = set(gt_by_image.keys()) | set(pred_by_image.keys())
    for image_id in all_image_ids:
        gt_rows = gt_by_image.get(image_id, [])
        pred_rows = pred_by_image.get(image_id, [])
        for p in pred_rows:
            pred_count_by_class[int(p["category_id"])] += 1
        for g in gt_rows:
            gt_count_by_class[int(g["category_id"])] += 1

        used_pred = set()
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

            gt_class = int(gt["category_id"])
            if best_pred_idx < 0 or best_iou < iou_threshold:
                missing_by_class[gt_class] += 1
                continue

            used_pred.add(best_pred_idx)
            pred_class = int(pred_rows[best_pred_idx]["category_id"])
            if pred_class != gt_class:
                misclassified_gt_by_class[gt_class] += 1
                confusion[(gt_class, pred_class)] += 1

    per_class = []
    all_classes = sorted(set(gt_count_by_class.keys()) | set(pred_count_by_class.keys()))
    for class_id in all_classes:
        gt_count = gt_count_by_class[class_id]
        pred_count = pred_count_by_class[class_id]
        missing = missing_by_class[class_id]
        misclassified = misclassified_gt_by_class[class_id]
        miss_rate = (missing / gt_count) if gt_count else 0.0
        miscls_rate = (misclassified / gt_count) if gt_count else 0.0
        per_class.append(
            {
                "class_id": class_id,
                "gt_count": gt_count,
                "pred_count": pred_count,
                "missing_count": missing,
                "misclassified_count": misclassified,
                "missing_rate": round(miss_rate, 4),
                "misclassified_rate": round(miscls_rate, 4),
            }
        )

    per_class.sort(key=lambda x: (x["missing_rate"] + x["misclassified_rate"], x["gt_count"]), reverse=True)
    top_confusions = [
        {"gt_class": gt, "pred_class": pred, "count": c}
        for (gt, pred), c in confusion.most_common(50)
    ]
    return {"per_class": per_class, "top_confusions": top_confusions}


def main() -> None:
    parser = argparse.ArgumentParser(description="Analyze localization-vs-classification error modes.")
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--val-dir", type=Path, default=Path("data/yolo/val"))
    parser.add_argument("--categories-json", type=Path, default=Path("data/classifier/categories.json"))
    parser.add_argument("--iou", type=float, default=0.5)
    parser.add_argument("--output-json", type=Path, default=Path("sweep_results/error_analysis.json"))
    parser.add_argument("--top", type=int, default=20)
    args = parser.parse_args()

    gt_by_image = load_ground_truth(args.val_dir)
    pred_by_image = load_predictions(args.predictions, score_threshold=0.0)
    names = load_category_names(args.categories_json if args.categories_json.exists() else None)
    report = analyze_errors(gt_by_image, pred_by_image, iou_threshold=args.iou)

    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(report, indent=2))

    print(f"Wrote analysis: {args.output_json}")
    print(f"Top {args.top} problem classes:")
    for row in report["per_class"][: args.top]:
        class_id = row["class_id"]
        class_name = names.get(class_id, "")
        print(
            f"  class_id={class_id:>3} gt={row['gt_count']:>4} pred={row['pred_count']:>4} "
            f"miss_rate={row['missing_rate']:.3f} miscls_rate={row['misclassified_rate']:.3f}"
            + (f" name={class_name!r}" if class_name else "")
        )

    print("")
    print("Top confusion pairs (gt -> pred):")
    for row in report["top_confusions"][: args.top]:
        gt, pred = row["gt_class"], row["pred_class"]
        gt_name = names.get(gt, "")
        pred_name = names.get(pred, "")
        gt_txt = f"{gt}:{gt_name}" if gt_name else str(gt)
        pred_txt = f"{pred}:{pred_name}" if pred_name else str(pred)
        print(f"  {gt_txt} -> {pred_txt}: {row['count']}")


if __name__ == "__main__":
    main()
