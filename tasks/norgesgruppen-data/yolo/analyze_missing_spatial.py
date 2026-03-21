#!/usr/bin/env python3
"""
Analyze *missing detection* (no prediction with IoU >= threshold): where in the image
those GT boxes fall, plus size / class patterns.

Matching follows the same greedy scheme as yolo/analyze_class_errors.py:
for each GT in file order, assign the unused prediction with highest IoU; if best IoU < threshold, count as missing.
"""
from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))
from compare_predictions import (
    index_val_images,
    iou_xyxy,
    load_category_names,
    load_ground_truth,
    load_predictions,
)


def grid_cell(nx: int, ny: int, x_norm: float, y_norm: float) -> tuple[int, int]:
    """x_norm, y_norm in [0,1]. Return 0-based cell indices."""
    cx = min(nx - 1, max(0, int(x_norm * nx)))
    cy = min(ny - 1, max(0, int(y_norm * ny)))
    return cx, cy


def edge_proximity(x1: float, y1: float, x2: float, y2: float, w: float, h: float) -> float:
    """Min distance from box (axis-aligned) to any image border, normalized by min(w,h)."""
    m = min(w, h)
    if m <= 0:
        return 0.0
    d = min(x1, y1, w - x2, h - y2)
    return max(0.0, d / m)


def analyze(
    gt_by_image: dict[int, list[dict]],
    pred_by_image: dict[int, list[dict]],
    image_sizes: dict[int, tuple[int, int]],
    iou_threshold: float,
) -> dict:
    results: list[dict] = []
    all_image_ids = sorted(set(gt_by_image.keys()) | set(pred_by_image.keys()))

    for image_id in all_image_ids:
        gt_rows = gt_by_image.get(image_id, [])
        pred_rows = pred_by_image.get(image_id, [])
        if not gt_rows:
            continue

        img_w = float(image_sizes.get(image_id, (1, 1))[0])
        img_h = float(image_sizes.get(image_id, (1, 1))[1])
        img_w = max(1.0, img_w)
        img_h = max(1.0, img_h)

        used_pred = set()
        for gt in gt_rows:
            best_iou = 0.0
            best_pred_idx = -1
            for pred_idx, pred in enumerate(pred_rows):
                if pred_idx in used_pred:
                    continue
                iou = iou_xyxy(gt["bbox_xyxy"], pred["bbox_xyxy"])
                if iou > best_iou:
                    best_iou = iou
                    best_pred_idx = pred_idx

            gx1, gy1, gx2, gy2 = gt["bbox_xyxy"]
            gw = max(0.0, gx2 - gx1)
            gh = max(0.0, gy2 - gy1)
            gcx = (gx1 + gx2) / 2.0
            gcy = (gy1 + gy2) / 2.0
            x_norm = gcx / img_w
            y_norm = gcy / img_h
            area_frac = (gw * gh) / max(1e-9, img_w * img_h)
            aspect = gw / max(1e-9, gh)

            if best_pred_idx >= 0 and best_iou >= iou_threshold:
                used_pred.add(best_pred_idx)
                continue

            # Missing box
            cell_3x3 = grid_cell(3, 3, x_norm, y_norm)
            row_band = "top" if y_norm < 1 / 3 else ("mid" if y_norm < 2 / 3 else "bottom")
            col_band = "left" if x_norm < 1 / 3 else ("center" if x_norm < 2 / 3 else "right")
            edge_norm = edge_proximity(gx1, gy1, gx2, gy2, img_w, img_h)

            results.append(
                {
                    "image_id": image_id,
                    "class_id": int(gt["category_id"]),
                    "best_iou_with_any_pred": round(float(best_iou), 4),
                    "cx_norm": round(float(x_norm), 4),
                    "cy_norm": round(float(y_norm), 4),
                    "area_frac": round(float(area_frac), 6),
                    "aspect_wh": round(float(aspect), 3),
                    "grid_3x3": f"{cell_3x3[0]},{cell_3x3[1]}",
                    "row_band": row_band,
                    "col_band": col_band,
                    "edge_proximity_norm": round(float(edge_norm), 4),
                }
            )

    # Aggregate
    n_miss = len(results)
    grid_counts = Counter(r["grid_3x3"] for r in results)
    row_counts = Counter(r["row_band"] for r in results)
    col_counts = Counter(r["col_band"] for r in results)
    class_counts = Counter(r["class_id"] for r in results)
    image_miss_counts = Counter(r["image_id"] for r in results)

    # Edge: fraction within 5% of border (by min side)
    near_edge = sum(1 for r in results if r["edge_proximity_norm"] < 0.05)
    # Small boxes: area_frac < 1e-3 (0.1% of image)
    tiny = sum(1 for r in results if r["area_frac"] < 1e-3)
    small = sum(1 for r in results if 1e-3 <= r["area_frac"] < 1e-2)
    med = sum(1 for r in results if 1e-2 <= r["area_frac"] < 0.05)
    large = sum(1 for r in results if r["area_frac"] >= 0.05)

    # Best IoU histogram (how close did we get?)
    iou_bins = Counter()
    for r in results:
        bi = r["best_iou_with_any_pred"]
        if bi < 0.1:
            iou_bins["0-0.1"] += 1
        elif bi < 0.3:
            iou_bins["0.1-0.3"] += 1
        elif bi < 0.5:
            iou_bins["0.3-0.5"] += 1
        else:
            iou_bins[">=0.5 (should not happen)"] += 1

    summary = {
        "iou_threshold": iou_threshold,
        "total_gt_boxes": sum(len(gt_by_image[i]) for i in gt_by_image),
        "missing_count": n_miss,
        "missing_rate": round(n_miss / max(1, sum(len(gt_by_image[i]) for i in gt_by_image)), 6),
        "grid_3x3_counts": dict(sorted(grid_counts.items(), key=lambda x: -x[1])),
        "row_band_counts": dict(row_counts),
        "col_band_counts": dict(col_counts),
        "area_bucket_counts": {"tiny_lt_0.1pct": tiny, "small_0.1-1pct": small, "med_1-5pct": med, "large_ge_5pct": large},
        "near_edge_frac_lt5pct_border": round(near_edge / max(1, n_miss), 4) if n_miss else 0.0,
        "best_iou_when_missing": dict(iou_bins),
        "top_classes_by_misses": [{"class_id": c, "count": n} for c, n in class_counts.most_common(15)],
        "top_images_by_miss_count": [{"image_id": i, "misses": n} for i, n in image_miss_counts.most_common(10)],
    }
    return {"summary": summary, "events": results}


def main() -> None:
    parser = argparse.ArgumentParser(description="Spatial analysis of missing GT boxes (IoU match).")
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--val-dir", type=Path, default=Path("data/yolo/val"))
    parser.add_argument("--categories-json", type=Path, default=Path("data/classifier/categories.json"))
    parser.add_argument("--iou", type=float, default=0.5)
    parser.add_argument("--score-threshold", type=float, default=0.0)
    parser.add_argument("--output-json", type=Path, default=Path("sweep_results/missing_spatial_analysis.json"))
    parser.add_argument("--print-events", type=int, default=0, help="Print first N raw events")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    pred_path = args.predictions if args.predictions.is_absolute() else root / args.predictions
    val_dir = args.val_dir if args.val_dir.is_absolute() else root / args.val_dir

    gt_by_image = load_ground_truth(val_dir)
    pred_by_image = load_predictions(pred_path, score_threshold=args.score_threshold)
    image_sizes = index_val_images(val_dir / "images")
    names = load_category_names(args.categories_json if args.categories_json.exists() else None)

    out = analyze(gt_by_image, pred_by_image, image_sizes, iou_threshold=args.iou)
    summary = out["summary"]

    print("=== Missing box spatial analysis ===")
    print(f"Predictions: {pred_path}")
    print(f"IoU threshold: {args.iou}")
    print(f"Total GT boxes: {summary['total_gt_boxes']}")
    print(f"Missing (no pred IoU>={args.iou}): {summary['missing_count']}  ({100*summary['missing_rate']:.2f}%)")
    print("")
    print("Where (3x3 grid, cell = col,row 0..2 from top-left):")
    for k, v in summary["grid_3x3_counts"].items():
        print(f"  {k}: {v}")
    print("")
    print("Vertical band (thirds):")
    for k in ("top", "mid", "bottom"):
        print(f"  {k}: {summary['row_band_counts'].get(k, 0)}")
    print("")
    print("Horizontal band (thirds):")
    for k in ("left", "center", "right"):
        print(f"  {k}: {summary['col_band_counts'].get(k, 0)}")
    print("")
    print("GT area (fraction of image area):")
    for k, v in summary["area_bucket_counts"].items():
        print(f"  {k}: {v}")
    print("")
    print(f"Share of misses with box near border (edge proximity < 5% of min side): {summary['near_edge_frac_lt5pct_border']}")
    print("")
    print("Best IoU to *some* pred when still 'missing':")
    for k, v in summary["best_iou_when_missing"].items():
        print(f"  {k}: {v}")
    print("")
    print("Top classes by miss count:")
    for row in summary["top_classes_by_misses"][:10]:
        cid = row["class_id"]
        nm = names.get(cid, "")
        print(f"  class {cid} ({nm}): {row['count']}")
    print("")
    print("Images with most misses:")
    for row in summary["top_images_by_miss_count"]:
        print(f"  image_id={row['image_id']}: {row['misses']} misses")

    if args.print_events:
        for ev in out["events"][: args.print_events]:
            print(ev)

    out_path = args.output_json if args.output_json.is_absolute() else root / args.output_json
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(out, indent=2))
    print(f"\nWrote {out_path}")


if __name__ == "__main__":
    main()
