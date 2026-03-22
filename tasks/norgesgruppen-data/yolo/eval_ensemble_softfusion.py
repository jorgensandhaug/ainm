#!/usr/bin/env python3
"""Ensemble with soft class fusion: average logits across models for each detection."""
from __future__ import annotations
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from ultralytics import YOLO
from compare_predictions import load_ground_truth, evaluate_hybrid
from yolo.eval_tta import wbf


def run_inference_with_crops(model, img_path, imgsz, conf, iou, device, flip=False):
    """Run inference, return boxes + softmax class distributions (not just argmax)."""
    img = Image.open(img_path)
    orig_w, orig_h = img.size

    if flip:
        img = img.transpose(Image.FLIP_LEFT_RIGHT)

    results = model.predict(source=img, imgsz=imgsz, conf=conf, iou=iou, device=device, verbose=False)

    boxes = []
    scores = []
    labels = []
    # Get raw class distributions from detection output
    cls_confs = []  # per-detection class confidence vectors

    for r in results:
        for i in range(len(r.boxes)):
            x1, y1, x2, y2 = r.boxes.xyxy[i].tolist()
            if flip:
                x1_new = orig_w - x2
                x2_new = orig_w - x1
                x1, x2 = x1_new, x2_new
            boxes.append([x1 / orig_w, y1 / orig_h, x2 / orig_w, y2 / orig_h])
            scores.append(float(r.boxes.conf[i].item()))
            labels.append(int(r.boxes.cls[i].item()))
            # Store the confidence and class for soft fusion later
            cls_confs.append((int(r.boxes.cls[i].item()), float(r.boxes.conf[i].item())))

    return (
        np.array(boxes) if boxes else np.zeros((0, 4)),
        np.array(scores),
        np.array(labels, dtype=int),
        cls_confs,
    )


def soft_wbf(boxes_list, scores_list, labels_list, cls_confs_list, iou_thr=0.55, n_classes=356):
    """WBF with soft class voting: average class scores across matched detections."""
    if len(boxes_list) == 0:
        return np.zeros((0, 4)), np.zeros(0), np.zeros(0, dtype=int)

    all_boxes = []
    all_scores = []
    all_labels = []
    all_cls_info = []
    all_model_idx = []

    for model_idx, (boxes, scores, labels, cls_confs) in enumerate(
        zip(boxes_list, scores_list, labels_list, cls_confs_list)
    ):
        for i in range(len(boxes)):
            all_boxes.append(boxes[i])
            all_scores.append(scores[i])
            all_labels.append(labels[i])
            all_cls_info.append(cls_confs[i] if i < len(cls_confs) else (labels[i], scores[i]))
            all_model_idx.append(model_idx)

    if len(all_boxes) == 0:
        return np.zeros((0, 4)), np.zeros(0), np.zeros(0, dtype=int)

    all_boxes = np.array(all_boxes)
    all_scores = np.array(all_scores)
    all_labels = np.array(all_labels, dtype=int)
    all_model_idx = np.array(all_model_idx)

    order = np.argsort(-all_scores)
    all_boxes = all_boxes[order]
    all_scores = all_scores[order]
    all_labels = all_labels[order]
    all_cls_info = [all_cls_info[i] for i in order]
    all_model_idx = all_model_idx[order]

    n_models = len(boxes_list)
    used = np.zeros(len(all_boxes), dtype=bool)

    fused_boxes = []
    fused_scores = []
    fused_labels = []

    for i in range(len(all_boxes)):
        if used[i]:
            continue

        # Collect cluster (class-agnostic matching for soft fusion!)
        cluster_boxes = [all_boxes[i]]
        cluster_scores = [all_scores[i]]
        cluster_cls_info = [all_cls_info[i]]
        cluster_models = {all_model_idx[i]}
        used[i] = True

        for j in range(i + 1, len(all_boxes)):
            if used[j]:
                continue
            # Class-agnostic IoU matching
            iou = _iou(all_boxes[i], all_boxes[j])
            if iou > iou_thr:
                cluster_boxes.append(all_boxes[j])
                cluster_scores.append(all_scores[j])
                cluster_cls_info.append(all_cls_info[j])
                cluster_models.add(all_model_idx[j])
                used[j] = True

        # Weighted box average
        weights = np.array(cluster_scores)
        avg_box = np.average(np.array(cluster_boxes), axis=0, weights=weights)
        avg_score = weights.sum() / len(cluster_scores) * (len(cluster_models) / n_models)

        # Soft class voting: weighted vote by confidence
        class_votes = np.zeros(n_classes)
        for (cls_id, cls_conf), score in zip(cluster_cls_info, cluster_scores):
            class_votes[cls_id] += score  # Weight by detection confidence

        best_class = int(np.argmax(class_votes))

        fused_boxes.append(avg_box)
        fused_scores.append(avg_score)
        fused_labels.append(best_class)

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


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, nargs="+", required=True)
    parser.add_argument("--scales", type=int, nargs="+", default=[640, 960, 1280])
    parser.add_argument("--flip", action="store_true", default=True)
    parser.add_argument("--no-flip", dest="flip", action="store_false")
    parser.add_argument("--val-dir", type=Path, default=Path(__file__).resolve().parents[1] / "data/yolo/val")
    parser.add_argument("--conf", type=float, default=0.0001)
    parser.add_argument("--iou", type=float, default=0.7)
    parser.add_argument("--wbf-iou", type=float, default=0.7)
    parser.add_argument("--device", default="1")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    gt_by_image = load_ground_truth(args.val_dir)
    images_dir = args.val_dir / "images"
    image_paths = sorted(p for p in images_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})

    models = [YOLO(str(w)) for w in args.weights]
    configs = []
    for model_idx, model in enumerate(models):
        for scale in args.scales:
            configs.append((model_idx, model, scale, False))
            if args.flip:
                configs.append((model_idx, model, scale, True))

    print(f"Soft fusion: {len(models)} models, {len(configs)} configs")

    all_predictions = []
    for img_path in image_paths:
        image_id = int(img_path.stem.split("_")[-1])
        img = Image.open(img_path)
        orig_w, orig_h = img.size

        boxes_list, scores_list, labels_list, cls_confs_list = [], [], [], []
        for model_idx, model, scale, flip in configs:
            boxes, scores, labels, cls_confs = run_inference_with_crops(
                model, img_path, scale, args.conf, args.iou, args.device, flip=flip
            )
            boxes_list.append(boxes)
            scores_list.append(scores)
            labels_list.append(labels)
            cls_confs_list.append(cls_confs)

        fused_boxes, fused_scores, fused_labels = soft_wbf(
            boxes_list, scores_list, labels_list, cls_confs_list, iou_thr=args.wbf_iou
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

    print(f"\n=== Soft Fusion Ensemble ({len(models)} models, scales={args.scales}) ===")
    print(f"Detection AP@0.5: {metrics['detection_ap50']:.4f}")
    print(f"Classification mAP@0.5 (present): {metrics['classification_map50_present_classes']:.4f}")
    print(f"Hybrid (present): {metrics['hybrid_score_present_classes']:.4f}")
    print(f"Hybrid (all): {metrics['hybrid_score_all_classes']:.4f}")

    out = args.out or root / "sweep_results" / "softfusion_eval.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    result = {
        "weights": [str(w) for w in args.weights],
        "scales": args.scales,
        "wbf_iou": args.wbf_iou,
        "metrics": {
            "det": metrics["detection_ap50"],
            "cls_present": metrics["classification_map50_present_classes"],
            "hybrid_present": metrics["hybrid_score_present_classes"],
            "hybrid_all": metrics["hybrid_score_all_classes"],
        }
    }
    out.write_text(json.dumps(result, indent=2))
    print(f"Saved to {out}")


if __name__ == "__main__":
    main()
