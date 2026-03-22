"""Ensemble multiple models with flip TTA and NMS fusion."""
from __future__ import annotations
import argparse
import sys
import numpy as np
from pathlib import Path
from PIL import Image
from ultralytics import YOLO
import tempfile, os

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compare_predictions import load_ground_truth, evaluate_hybrid


def predict_image(model, img_path, imgsz, conf, iou, device):
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


def predict_flipped(model, img_path, imgsz, conf, iou, device):
    img = Image.open(img_path)
    img_w = img.size[0]
    flipped = img.transpose(Image.FLIP_LEFT_RIGHT)
    with tempfile.NamedTemporaryFile(suffix=".jpg", delete=False) as f:
        flipped.save(f.name)
        tmp_path = f.name
    try:
        xyxy, scores, classes = predict_image(model, tmp_path, imgsz, conf, iou, device)
    finally:
        os.unlink(tmp_path)
    if len(xyxy) > 0:
        new_x1 = img_w - xyxy[:, 2]
        new_x2 = img_w - xyxy[:, 0]
        xyxy[:, 0] = new_x1
        xyxy[:, 2] = new_x2
    return xyxy, scores, classes


def nms_class_aware(boxes, scores, classes, iou_thres=0.55):
    if len(boxes) == 0:
        return np.array([]).reshape(0, 4), np.array([]), np.array([])
    x1, y1, x2, y2 = boxes[:, 0], boxes[:, 1], boxes[:, 2], boxes[:, 3]
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
        mask = (iou <= iou_thres) | (classes[rest] != classes[i])
        order = rest[mask]
    keep = np.array(keep)
    return boxes[keep], scores[keep], classes[keep]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, nargs="+", required=True)
    parser.add_argument("--device", type=int, default=2)
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--conf", type=float, default=0.0003)
    parser.add_argument("--iou", type=float, default=0.55)
    parser.add_argument("--flip", action="store_true", help="Add horizontal flip TTA")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    val_images = root / "data/yolo/val/images"
    val_dir = root / "data/yolo/val"
    gt_by_image = load_ground_truth(val_dir)

    models = [YOLO(str(w)) for w in args.weights]
    n_models = len(models)
    flip = args.flip
    label = f"{'flip+' if flip else ''}{n_models}model"
    print(f"Config: {label}, {n_models} models, flip={flip}")

    from collections import defaultdict
    pred_by_image = defaultdict(list)
    image_paths = sorted(val_images.glob("*.jpg")) + sorted(val_images.glob("*.png"))

    for img_path in image_paths:
        stem = img_path.stem
        token = stem.split("_")[-1]
        image_id = int(token)

        all_boxes, all_scores, all_cls = [], [], []

        for model in models:
            xyxy, scores, classes = predict_image(
                model, img_path, args.imgsz, args.conf, args.iou, args.device
            )
            if len(xyxy) > 0:
                all_boxes.append(xyxy)
                all_scores.append(scores)
                all_cls.append(classes)

            if flip:
                xyxy_f, scores_f, cls_f = predict_flipped(
                    model, img_path, args.imgsz, args.conf, args.iou, args.device
                )
                if len(xyxy_f) > 0:
                    all_boxes.append(xyxy_f)
                    all_scores.append(scores_f)
                    all_cls.append(cls_f)

        if all_boxes:
            merged_boxes = np.concatenate(all_boxes)
            merged_scores = np.concatenate(all_scores)
            merged_cls = np.concatenate(all_cls)

            fused_b, fused_s, fused_c = nms_class_aware(
                merged_boxes, merged_scores, merged_cls, args.iou
            )

            for i in range(len(fused_b)):
                x1, y1, x2, y2 = fused_b[i]
                pred_by_image[image_id].append({
                    "category_id": int(fused_c[i]),
                    "score": float(fused_s[i]),
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
          f"hybrid_present={metrics['hybrid_score_present_classes']:.4f} "
          f"preds={n_preds}")


if __name__ == "__main__":
    main()
