#!/usr/bin/env python3
"""Manual TTA: horizontal flip + optional multi-scale, with WBF merge."""
import json
import sys
from pathlib import Path

import numpy as np
from ultralytics import YOLO
from PIL import Image


def predict_single(model, img_path, imgsz, conf, iou, device=0):
    """Run inference, return list of (x1,y1,x2,y2, cls_id, score)."""
    results = model.predict(
        source=str(img_path), imgsz=imgsz, conf=conf, iou=iou,
        device=device, verbose=False, max_det=600,
    )
    dets = []
    for r in results:
        boxes = r.boxes
        for i in range(len(boxes)):
            xyxy = boxes.xyxy[i].cpu().numpy()
            cls_id = int(boxes.cls[i].cpu().item())
            score = float(boxes.conf[i].cpu().item())
            dets.append((*xyxy, cls_id, score))
    return dets


def flip_dets_h(dets, img_w):
    """Flip detections horizontally."""
    flipped = []
    for x1, y1, x2, y2, cls_id, score in dets:
        flipped.append((img_w - x2, y1, img_w - x1, y2, cls_id, score))
    return flipped


def nms_merge(all_dets, iou_threshold=0.55):
    """Simple per-class NMS on merged detections."""
    if not all_dets:
        return []

    by_class = {}
    for x1, y1, x2, y2, cls_id, score in all_dets:
        by_class.setdefault(cls_id, []).append((x1, y1, x2, y2, score))

    merged = []
    for cls_id, boxes in by_class.items():
        boxes.sort(key=lambda b: b[4], reverse=True)
        keep = []
        while boxes:
            best = boxes.pop(0)
            keep.append(best)
            remaining = []
            for b in boxes:
                iou = compute_iou(best[:4], b[:4])
                if iou < iou_threshold:
                    remaining.append(b)
            boxes = remaining
        for x1, y1, x2, y2, score in keep:
            merged.append((x1, y1, x2, y2, cls_id, score))

    return merged


def wbf_merge(all_dets_list, iou_threshold=0.55, weights=None):
    """Weighted Box Fusion across multiple prediction sets."""
    if not all_dets_list:
        return []
    if weights is None:
        weights = [1.0] * len(all_dets_list)

    # Flatten with source weights
    all_weighted = []
    for dets, w in zip(all_dets_list, weights):
        for x1, y1, x2, y2, cls_id, score in dets:
            all_weighted.append((x1, y1, x2, y2, cls_id, score * w))

    # Group by class, then apply WBF
    by_class = {}
    for x1, y1, x2, y2, cls_id, score in all_weighted:
        by_class.setdefault(cls_id, []).append((x1, y1, x2, y2, score))

    merged = []
    for cls_id, boxes in by_class.items():
        boxes.sort(key=lambda b: b[4], reverse=True)
        clusters = []
        used = [False] * len(boxes)

        for i, b in enumerate(boxes):
            if used[i]:
                continue
            cluster = [b]
            used[i] = True
            for j in range(i + 1, len(boxes)):
                if used[j]:
                    continue
                iou = compute_iou(b[:4], boxes[j][:4])
                if iou >= iou_threshold:
                    cluster.append(boxes[j])
                    used[j] = True
            # Weighted average of cluster
            total_w = sum(c[4] for c in cluster)
            if total_w <= 0:
                continue
            avg_x1 = sum(c[0] * c[4] for c in cluster) / total_w
            avg_y1 = sum(c[1] * c[4] for c in cluster) / total_w
            avg_x2 = sum(c[2] * c[4] for c in cluster) / total_w
            avg_y2 = sum(c[3] * c[4] for c in cluster) / total_w
            avg_score = total_w / len(all_dets_list)  # normalize by num models
            merged.append((avg_x1, avg_y1, avg_x2, avg_y2, cls_id, avg_score))

    return merged


def compute_iou(a, b):
    x1 = max(a[0], b[0])
    y1 = max(a[1], b[1])
    x2 = min(a[2], b[2])
    y2 = min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = max(0, a[2] - a[0]) * max(0, a[3] - a[1])
    area_b = max(0, b[2] - b[0]) * max(0, b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0


def main():
    root = Path(__file__).resolve().parent
    sys.path.insert(0, str(root))
    from compare_predictions import load_ground_truth, evaluate_hybrid

    weights = sys.argv[1] if len(sys.argv) > 1 else str(
        root / "runs/960_confcurr_s2_final_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt"
    )
    val_dir = root / "data/yolo/val"
    val_images = val_dir / "images"
    model = YOLO(weights)
    gt_by_image = load_ground_truth(val_dir)

    image_paths = sorted(
        list(val_images.glob("*.jpg")) +
        list(val_images.glob("*.jpeg")) +
        list(val_images.glob("*.png"))
    )

    conf = 0.0001
    iou_nms = 0.55

    configs = [
        ("no_tta", [960], False),
        ("flip_only", [960], True),
        ("multiscale_960_1280", [960, 1280], False),
        ("flip_multiscale", [960, 1280], True),
        ("multiscale_640_960_1280", [640, 960, 1280], False),
        ("flip_multiscale_3", [640, 960, 1280], True),
    ]

    for name, scales, do_flip in configs:
        print(f"\n=== {name} (scales={scales}, flip={do_flip}, conf={conf}) ===")
        all_predictions = []

        for img_path in image_paths:
            token = img_path.stem.split("_")[-1]
            image_id = int(token)
            with Image.open(img_path) as im:
                img_w, img_h = im.size

            det_sets = []
            for imgsz in scales:
                dets = predict_single(model, img_path, imgsz, conf, iou_nms)
                det_sets.append(dets)
                if do_flip:
                    flipped = Image.open(img_path).transpose(Image.FLIP_LEFT_RIGHT)
                    tmp_path = root / "_tmp_flip.jpg"
                    flipped.save(str(tmp_path))
                    flipped.close()
                    flip_dets = predict_single(model, tmp_path, imgsz, conf, iou_nms)
                    flip_dets = flip_dets_h(flip_dets, img_w)
                    det_sets.append(flip_dets)

            # WBF merge all detection sets
            if len(det_sets) == 1:
                merged = det_sets[0]
            else:
                merged = wbf_merge(det_sets, iou_threshold=0.55)

            for x1, y1, x2, y2, cls_id, score in merged:
                all_predictions.append({
                    "image_id": image_id,
                    "category_id": int(cls_id),
                    "bbox": [float(x1), float(y1), float(x2 - x1), float(y2 - y1)],
                    "score": float(score),
                })

        # Evaluate
        pred_by_image = {}
        for p in all_predictions:
            pred_by_image.setdefault(p["image_id"], []).append({
                "category_id": p["category_id"],
                "score": p["score"],
                "bbox_xyxy": (p["bbox"][0], p["bbox"][1],
                              p["bbox"][0]+p["bbox"][2], p["bbox"][1]+p["bbox"][3]),
            })
        for img_id in pred_by_image:
            pred_by_image[img_id].sort(key=lambda x: x["score"], reverse=True)

        metrics = evaluate_hybrid(gt_by_image, pred_by_image, iou_threshold=0.5, num_classes=356)
        print(f"  det_AP50     = {metrics['detection_ap50']:.4f}")
        print(f"  cls_present  = {metrics['classification_map50_present_classes']:.4f}")
        print(f"  cls_all      = {metrics['classification_map50_all_classes']:.4f}")
        print(f"  hybrid_pres  = {metrics['hybrid_score_present_classes']:.4f}")
        print(f"  hybrid_all   = {metrics['hybrid_score_all_classes']:.4f}")
        print(f"  preds        = {len(all_predictions)}")

    # Cleanup
    tmp = root / "_tmp_flip.jpg"
    if tmp.exists():
        tmp.unlink()


if __name__ == "__main__":
    main()
