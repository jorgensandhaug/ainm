#!/usr/bin/env python3
"""TTA evaluation: multi-scale + flip, merge via WBF."""
from __future__ import annotations
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ultralytics import YOLO
from compare_predictions import load_ground_truth, evaluate_hybrid


def wbf(boxes_list, scores_list, labels_list, iou_thr=0.55, skip_box_thr=0.0001):
    """Weighted Boxes Fusion (simplified implementation).

    boxes_list: list of arrays, each [N, 4] in [x1,y1,x2,y2] normalized [0,1]
    scores_list: list of arrays, each [N]
    labels_list: list of arrays, each [N] int
    """
    if len(boxes_list) == 0:
        return np.zeros((0, 4)), np.zeros(0), np.zeros(0, dtype=int)

    # Collect all boxes
    all_boxes = []
    all_scores = []
    all_labels = []
    all_model_idx = []

    for model_idx, (boxes, scores, labels) in enumerate(zip(boxes_list, scores_list, labels_list)):
        for i in range(len(boxes)):
            if scores[i] < skip_box_thr:
                continue
            all_boxes.append(boxes[i])
            all_scores.append(scores[i])
            all_labels.append(labels[i])
            all_model_idx.append(model_idx)

    if len(all_boxes) == 0:
        return np.zeros((0, 4)), np.zeros(0), np.zeros(0, dtype=int)

    all_boxes = np.array(all_boxes)
    all_scores = np.array(all_scores)
    all_labels = np.array(all_labels, dtype=int)

    # Sort by score descending
    order = np.argsort(-all_scores)
    all_boxes = all_boxes[order]
    all_scores = all_scores[order]
    all_labels = all_labels[order]
    all_model_idx = np.array(all_model_idx)[order]

    n_models = len(boxes_list)
    used = np.zeros(len(all_boxes), dtype=bool)

    fused_boxes = []
    fused_scores = []
    fused_labels = []

    for i in range(len(all_boxes)):
        if used[i]:
            continue

        cluster_boxes = [all_boxes[i]]
        cluster_scores = [all_scores[i]]
        cluster_labels = [all_labels[i]]
        cluster_models = {all_model_idx[i]}
        used[i] = True

        for j in range(i + 1, len(all_boxes)):
            if used[j]:
                continue
            # IoU check
            iou = _iou(all_boxes[i], all_boxes[j])
            if iou > iou_thr and all_labels[j] == all_labels[i]:
                cluster_boxes.append(all_boxes[j])
                cluster_scores.append(all_scores[j])
                cluster_labels.append(all_labels[j])
                cluster_models.add(all_model_idx[j])
                used[j] = True

        # Weighted average of boxes
        weights = np.array(cluster_scores)
        w_sum = weights.sum()
        avg_box = np.average(np.array(cluster_boxes), axis=0, weights=weights)
        # Score: average score * (n_models_contributing / n_models)
        avg_score = w_sum / len(cluster_scores) * (len(cluster_models) / n_models)

        fused_boxes.append(avg_box)
        fused_scores.append(avg_score)
        fused_labels.append(cluster_labels[0])

    return np.array(fused_boxes), np.array(fused_scores), np.array(fused_labels, dtype=int)


def _iou(a, b):
    x1 = max(a[0], b[0])
    y1 = max(a[1], b[1])
    x2 = min(a[2], b[2])
    y2 = min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = (a[2] - a[0]) * (a[3] - a[1])
    area_b = (b[2] - b[0]) * (b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0


def run_inference_single(model, img_path, imgsz, conf, iou, device, flip=False):
    """Run inference, optionally with horizontal flip."""
    from PIL import Image
    img = Image.open(img_path)
    orig_w, orig_h = img.size

    if flip:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)

    results = model.predict(source=img, imgsz=imgsz, conf=conf, iou=iou, device=device, verbose=False)

    boxes = []
    scores = []
    labels = []
    for r in results:
        for i in range(len(r.boxes)):
            x1, y1, x2, y2 = r.boxes.xyxy[i].tolist()
            if flip:
                x1_new = orig_w - x2
                x2_new = orig_w - x1
                x1, x2 = x1_new, x2_new
            # Normalize to [0, 1]
            boxes.append([x1 / orig_w, y1 / orig_h, x2 / orig_w, y2 / orig_h])
            scores.append(float(r.boxes.conf[i].item()))
            labels.append(int(r.boxes.cls[i].item()))

    return np.array(boxes) if boxes else np.zeros((0, 4)), np.array(scores), np.array(labels, dtype=int)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--val-dir", type=Path, default=Path(__file__).resolve().parents[1] / "data/yolo/val")
    parser.add_argument("--scales", type=int, nargs="+", default=[640, 960, 1280])
    parser.add_argument("--flip", action="store_true", default=True)
    parser.add_argument("--no-flip", dest="flip", action="store_false")
    parser.add_argument("--conf", type=float, default=0.0001)
    parser.add_argument("--iou", type=float, default=0.7)
    parser.add_argument("--wbf-iou", type=float, default=0.55)
    parser.add_argument("--device", default="1")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    model = YOLO(str(args.weights))
    gt_by_image = load_ground_truth(args.val_dir)
    images_dir = args.val_dir / "images"
    image_paths = sorted(p for p in images_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})

    # Build list of (scale, flip) configs
    configs = []
    for s in args.scales:
        configs.append((s, False))
        if args.flip:
            configs.append((s, True))

    print(f"TTA configs: {len(configs)} = scales {args.scales} x flip={args.flip}")

    all_predictions = []

    for img_path in image_paths:
        token = img_path.stem.split("_")[-1]
        image_id = int(token)
        img = Image.open(img_path)
        orig_w, orig_h = img.size

        boxes_list = []
        scores_list = []
        labels_list = []

        for scale, flip in configs:
            boxes, scores, labels = run_inference_single(
                model, img_path, scale, args.conf, args.iou, args.device, flip=flip
            )
            boxes_list.append(boxes)
            scores_list.append(scores)
            labels_list.append(labels)

        # WBF fusion
        fused_boxes, fused_scores, fused_labels = wbf(
            boxes_list, scores_list, labels_list, iou_thr=args.wbf_iou
        )

        for i in range(len(fused_boxes)):
            x1 = fused_boxes[i][0] * orig_w
            y1 = fused_boxes[i][1] * orig_h
            x2 = fused_boxes[i][2] * orig_w
            y2 = fused_boxes[i][3] * orig_h
            all_predictions.append({
                "image_id": image_id,
                "category_id": int(fused_labels[i]),
                "bbox": [x1, y1, x2 - x1, y2 - y1],
                "score": float(fused_scores[i]),
            })

    print(f"Total TTA predictions: {len(all_predictions)}")

    # Convert to eval format
    pred_by_image = defaultdict(list)
    for p in all_predictions:
        x, y, w, h = p["bbox"]
        pred_by_image[p["image_id"]].append({
            "category_id": p["category_id"],
            "score": p["score"],
            "bbox_xyxy": (x, y, x + w, y + h),
        })
    for img_id in pred_by_image:
        pred_by_image[img_id].sort(key=lambda x: x["score"], reverse=True)

    metrics = evaluate_hybrid(gt_by_image, dict(pred_by_image), iou_threshold=0.5, num_classes=356)

    print(f"\n=== TTA Results (scales={args.scales}, flip={args.flip}, wbf_iou={args.wbf_iou}) ===")
    print(f"Detection AP@0.5: {metrics['detection_ap50']:.4f}")
    print(f"Classification mAP@0.5 (present): {metrics['classification_map50_present_classes']:.4f}")
    print(f"Classification mAP@0.5 (all): {metrics['classification_map50_all_classes']:.4f}")
    print(f"Hybrid (present): {metrics['hybrid_score_present_classes']:.4f}")
    print(f"Hybrid (all): {metrics['hybrid_score_all_classes']:.4f}")

    out = args.out or root / "sweep_results" / "tta_eval.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    result = {
        "scales": args.scales,
        "flip": args.flip,
        "wbf_iou": args.wbf_iou,
        "conf": args.conf,
        "n_predictions": len(all_predictions),
        "metrics": {
            "detection_ap50": metrics["detection_ap50"],
            "classification_map50_present": metrics["classification_map50_present_classes"],
            "classification_map50_all": metrics["classification_map50_all_classes"],
            "hybrid_present": metrics["hybrid_score_present_classes"],
            "hybrid_all": metrics["hybrid_score_all_classes"],
        }
    }
    out.write_text(json.dumps(result, indent=2))
    print(f"Saved to {out}")


if __name__ == "__main__":
    main()
