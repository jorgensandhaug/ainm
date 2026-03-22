"""Manual TTA: run inference with original + flipped, merge predictions via WBF-like approach."""
from __future__ import annotations
import argparse
import json
import sys
import numpy as np
from pathlib import Path
from PIL import Image
from ultralytics import YOLO

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compare_predictions import load_ground_truth, evaluate_hybrid


def nms_merge(boxes, scores, classes, iou_thres=0.55):
    """Simple NMS across merged predictions."""
    if len(boxes) == 0:
        return np.array([]), np.array([]), np.array([])

    x1 = boxes[:, 0]
    y1 = boxes[:, 1]
    x2 = boxes[:, 2]
    y2 = boxes[:, 3]
    areas = (x2 - x1) * (y2 - y1)
    order = scores.argsort()[::-1]

    keep = []
    while order.size > 0:
        i = order[0]
        keep.append(i)
        if order.size == 1:
            break
        rest = order[1:]
        xx1 = np.maximum(x1[i], x1[rest])
        yy1 = np.maximum(y1[i], y1[rest])
        xx2 = np.minimum(x2[i], x2[rest])
        yy2 = np.minimum(y2[i], y2[rest])
        inter = np.maximum(0, xx2 - xx1) * np.maximum(0, yy2 - yy1)
        union = areas[i] + areas[rest] - inter
        iou = inter / np.maximum(union, 1e-6)
        # Keep if different class or low IoU
        mask = (iou <= iou_thres) | (classes[rest] != classes[i])
        order = rest[mask]

    keep = np.array(keep)
    return boxes[keep], scores[keep], classes[keep]


def wbf_merge(boxes_list, scores_list, classes_list, iou_thres=0.55, score_mode="avg"):
    """Weighted box fusion across multiple model predictions."""
    all_boxes = np.concatenate(boxes_list, axis=0) if boxes_list else np.array([])
    all_scores = np.concatenate(scores_list, axis=0) if scores_list else np.array([])
    all_classes = np.concatenate(classes_list, axis=0) if classes_list else np.array([])

    if len(all_boxes) == 0:
        return np.array([]).reshape(0, 4), np.array([]), np.array([])

    # Sort by score
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
        if score_mode == "avg":
            fused_score = np.mean(cluster_scores)
        elif score_mode == "max":
            fused_score = np.max(cluster_scores)
        else:
            fused_score = np.mean(cluster_scores) * min(len(cluster_scores) / len(boxes_list), 1.0)

        merged_boxes.append(fused_box)
        merged_scores.append(fused_score)
        merged_classes.append(cls_i)

    return (np.array(merged_boxes) if merged_boxes else np.array([]).reshape(0, 4),
            np.array(merged_scores),
            np.array(merged_classes))


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


def predict_image(model, img_path, imgsz, conf, iou, device):
    results = model.predict(
        source=str(img_path),
        imgsz=imgsz,
        conf=conf,
        iou=iou,
        device=device,
        verbose=False,
        save=False,
    )
    r = results[0]
    boxes = r.boxes
    if len(boxes) == 0:
        return np.array([]).reshape(0, 4), np.array([]), np.array([])
    xyxy = boxes.xyxy.cpu().numpy()
    scores = boxes.conf.cpu().numpy()
    classes = boxes.cls.cpu().numpy().astype(int)
    return xyxy, scores, classes


def predict_flipped(model, img_path, imgsz, conf, iou, device):
    """Run inference on horizontally flipped image, then flip boxes back."""
    img = Image.open(img_path)
    img_w, img_h = img.size
    flipped = img.transpose(Image.FLIP_LEFT_RIGHT)

    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        flipped.save(f.name)
        tmp_path = f.name

    try:
        xyxy, scores, classes = predict_image(model, tmp_path, imgsz, conf, iou, device)
    finally:
        os.unlink(tmp_path)

    if len(xyxy) > 0:
        # Flip x coordinates back
        new_x1 = img_w - xyxy[:, 2]
        new_x2 = img_w - xyxy[:, 0]
        xyxy[:, 0] = new_x1
        xyxy[:, 2] = new_x2

    return xyxy, scores, classes


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--device", type=int, default=2)
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--conf", type=float, default=0.0003)
    parser.add_argument("--iou", type=float, default=0.55)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    val_images = root / "data/yolo/val/images"
    val_dir = root / "data/yolo/val"
    gt_by_image = load_ground_truth(val_dir)
    model = YOLO(str(args.weights))

    from collections import defaultdict

    configs = {
        "no_tta": {"flip": False, "fusion": None},
        "flip_nms": {"flip": True, "fusion": "nms"},
        "flip_wbf_avg": {"flip": True, "fusion": "wbf_avg"},
        "flip_wbf_max": {"flip": True, "fusion": "wbf_max"},
    }

    for name, cfg in configs.items():
        pred_by_image = defaultdict(list)
        image_paths = sorted(val_images.glob("*.jpg")) + sorted(val_images.glob("*.png")) + sorted(val_images.glob("*.jpeg"))

        for img_path in image_paths:
            stem = img_path.stem
            token = stem.split("_")[-1]
            image_id = int(token)

            xyxy_orig, scores_orig, cls_orig = predict_image(
                model, img_path, args.imgsz, args.conf, args.iou, args.device
            )

            if cfg["flip"]:
                xyxy_flip, scores_flip, cls_flip = predict_flipped(
                    model, img_path, args.imgsz, args.conf, args.iou, args.device
                )

                if cfg["fusion"] == "nms":
                    all_boxes = np.concatenate([xyxy_orig, xyxy_flip]) if len(xyxy_orig) > 0 and len(xyxy_flip) > 0 else (xyxy_orig if len(xyxy_orig) > 0 else xyxy_flip)
                    all_scores = np.concatenate([scores_orig, scores_flip]) if len(scores_orig) > 0 and len(scores_flip) > 0 else (scores_orig if len(scores_orig) > 0 else scores_flip)
                    all_cls = np.concatenate([cls_orig, cls_flip]) if len(cls_orig) > 0 and len(cls_flip) > 0 else (cls_orig if len(cls_orig) > 0 else cls_flip)
                    xyxy_out, scores_out, cls_out = nms_merge(all_boxes, all_scores, all_cls, args.iou)
                else:
                    boxes_list = [b for b in [xyxy_orig, xyxy_flip] if len(b) > 0]
                    scores_list = [s for s in [scores_orig, scores_flip] if len(s) > 0]
                    cls_list = [c for c in [cls_orig, cls_flip] if len(c) > 0]
                    score_mode = "avg" if cfg["fusion"] == "wbf_avg" else "max"
                    xyxy_out, scores_out, cls_out = wbf_merge(
                        boxes_list, scores_list, cls_list, args.iou, score_mode
                    )
            else:
                xyxy_out, scores_out, cls_out = xyxy_orig, scores_orig, cls_orig

            for i in range(len(xyxy_out)):
                x1, y1, x2, y2 = xyxy_out[i]
                pred_by_image[image_id].append({
                    "category_id": int(cls_out[i]),
                    "score": float(scores_out[i]),
                    "bbox_xyxy": (float(x1), float(y1), float(x2), float(y2)),
                    "bbox": [float(x1), float(y1), float(x2 - x1), float(y2 - y1)],
                    "image_id": image_id,
                })

        for img_id in pred_by_image:
            pred_by_image[img_id].sort(key=lambda x: x["score"], reverse=True)

        metrics = evaluate_hybrid(gt_by_image, dict(pred_by_image), iou_threshold=0.5, num_classes=356)
        n_preds = sum(len(v) for v in pred_by_image.values())
        print(f"{name:20s} | det={metrics['detection_ap50']:.4f} "
              f"cls_present={metrics['classification_map50_present_classes']:.4f} "
              f"cls_all={metrics['classification_map50_all_classes']:.4f} "
              f"hybrid_all={metrics['hybrid_score_all_classes']:.4f} "
              f"preds={n_preds}")


if __name__ == "__main__":
    main()
