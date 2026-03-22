"""Ensemble multiple YOLO checkpoints with WBF fusion."""
from __future__ import annotations
import argparse
import json
import sys
import numpy as np
from pathlib import Path
from ultralytics import YOLO

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compare_predictions import load_ground_truth, evaluate_hybrid


def compute_iou(box_a, box_b):
    x1 = max(box_a[0], box_b[0])
    y1 = max(box_a[1], box_b[1])
    x2 = min(box_a[2], box_b[2])
    y2 = min(box_a[3], box_b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = (box_a[2] - box_a[0]) * (box_a[3] - box_a[1])
    area_b = (box_b[2] - box_b[0]) * (box_b[3] - box_b[1])
    union = area_a + area_b - inter
    return inter / max(union, 1e-6)


def wbf_fuse(all_boxes, all_scores, all_classes, iou_thres=0.55, n_models=1):
    if len(all_boxes) == 0:
        return np.array([]).reshape(0, 4), np.array([]), np.array([])

    order = all_scores.argsort()[::-1]
    all_boxes = all_boxes[order]
    all_scores = all_scores[order]
    all_classes = all_classes[order]

    merged_boxes = []
    merged_scores = []
    merged_classes = []
    used = np.zeros(len(all_boxes), dtype=bool)

    for i in range(len(all_boxes)):
        if used[i]:
            continue
        cluster_boxes = [all_boxes[i]]
        cluster_scores = [all_scores[i]]
        cls_i = all_classes[i]
        used[i] = True

        for j in range(i + 1, len(all_boxes)):
            if used[j] or all_classes[j] != cls_i:
                continue
            iou = compute_iou(all_boxes[i], all_boxes[j])
            if iou >= iou_thres:
                cluster_boxes.append(all_boxes[j])
                cluster_scores.append(all_scores[j])
                used[j] = True

        weights = np.array(cluster_scores)
        weights = weights / weights.sum()
        fused_box = np.average(np.array(cluster_boxes), axis=0, weights=weights)
        # Score boost: detections confirmed by multiple models get boosted
        fused_score = np.max(cluster_scores) * min(len(cluster_scores) / n_models + 0.5, 1.0)

        merged_boxes.append(fused_box)
        merged_scores.append(fused_score)
        merged_classes.append(cls_i)

    return (np.array(merged_boxes), np.array(merged_scores), np.array(merged_classes))


def predict_single(model, img_path, imgsz, conf, iou, device):
    results = model.predict(
        source=str(img_path), imgsz=imgsz, conf=conf, iou=iou,
        device=device, verbose=False, save=False,
    )
    r = results[0]
    boxes = r.boxes
    if len(boxes) == 0:
        return np.array([]).reshape(0, 4), np.array([]), np.array([])
    return (boxes.xyxy.cpu().numpy(), boxes.conf.cpu().numpy(),
            boxes.cls.cpu().numpy().astype(int))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, nargs="+", required=True)
    parser.add_argument("--device", type=int, default=2)
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--conf", type=float, default=0.0003)
    parser.add_argument("--iou", type=float, default=0.55)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    val_images = root / "data/yolo/val/images"
    val_dir = root / "data/yolo/val"
    gt_by_image = load_ground_truth(val_dir)

    models = [YOLO(str(w)) for w in args.weights]
    n_models = len(models)
    print(f"Loaded {n_models} models")

    from collections import defaultdict
    pred_by_image = defaultdict(list)
    image_paths = sorted(val_images.glob("*.jpg")) + sorted(val_images.glob("*.png"))

    for img_path in image_paths:
        stem = img_path.stem
        token = stem.split("_")[-1]
        image_id = int(token)

        all_boxes_list = []
        all_scores_list = []
        all_cls_list = []

        for model in models:
            xyxy, scores, classes = predict_single(
                model, img_path, args.imgsz, args.conf, args.iou, args.device
            )
            if len(xyxy) > 0:
                all_boxes_list.append(xyxy)
                all_scores_list.append(scores)
                all_cls_list.append(classes)

        if all_boxes_list:
            all_boxes = np.concatenate(all_boxes_list)
            all_scores = np.concatenate(all_scores_list)
            all_cls = np.concatenate(all_cls_list)

            fused_boxes, fused_scores, fused_cls = wbf_fuse(
                all_boxes, all_scores, all_cls, args.iou, n_models
            )

            for i in range(len(fused_boxes)):
                x1, y1, x2, y2 = fused_boxes[i]
                pred_by_image[image_id].append({
                    "category_id": int(fused_cls[i]),
                    "score": float(fused_scores[i]),
                    "bbox_xyxy": (float(x1), float(y1), float(x2), float(y2)),
                    "image_id": image_id,
                })

    for img_id in pred_by_image:
        pred_by_image[img_id].sort(key=lambda x: x["score"], reverse=True)

    metrics = evaluate_hybrid(gt_by_image, dict(pred_by_image), iou_threshold=0.5, num_classes=356)
    n_preds = sum(len(v) for v in pred_by_image.values())
    print(f"det={metrics['detection_ap50']:.4f} "
          f"cls_present={metrics['classification_map50_present_classes']:.4f} "
          f"cls_all={metrics['classification_map50_all_classes']:.4f} "
          f"hybrid_all={metrics['hybrid_score_all_classes']:.4f} "
          f"preds={n_preds}")


if __name__ == "__main__":
    main()
