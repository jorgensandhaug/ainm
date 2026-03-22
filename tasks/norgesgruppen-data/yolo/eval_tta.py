"""Evaluate with TTA (test-time augmentation) using Ultralytics augment=True."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
from ultralytics import YOLO

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compare_predictions import load_ground_truth, evaluate_hybrid, load_predictions


def run_predict(model, val_images, imgsz, conf, iou, device, augment=False):
    results = model.predict(
        source=str(val_images),
        imgsz=imgsz,
        conf=conf,
        iou=iou,
        device=device,
        verbose=False,
        save=False,
        augment=augment,
    )
    predictions = []
    for r in results:
        stem = Path(r.path).stem
        token = stem.split("_")[-1]
        image_id = int(token)
        boxes = r.boxes
        for i in range(len(boxes)):
            xyxy = boxes.xyxy[i].cpu().tolist()
            x1, y1, x2, y2 = xyxy
            predictions.append({
                "image_id": image_id,
                "category_id": int(boxes.cls[i].item()),
                "bbox": [x1, y1, x2 - x1, y2 - y1],
                "score": float(boxes.conf[i].item()),
                "bbox_xyxy": (x1, y1, x2, y2),
            })
    from collections import defaultdict
    pred_by_image = defaultdict(list)
    for p in predictions:
        pred_by_image[p["image_id"]].append(p)
    for img_id in pred_by_image:
        pred_by_image[img_id].sort(key=lambda x: x["score"], reverse=True)
    return dict(pred_by_image), predictions


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--device", type=int, default=2)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    val_images = root / "data/yolo/val/images"
    val_dir = root / "data/yolo/val"
    gt_by_image = load_ground_truth(val_dir)
    model = YOLO(str(args.weights))

    configs = [
        {"label": "baseline 960", "imgsz": 960, "conf": 0.0003, "iou": 0.55, "augment": False},
        {"label": "TTA 960", "imgsz": 960, "conf": 0.0003, "iou": 0.55, "augment": True},
        {"label": "baseline 1280", "imgsz": 1280, "conf": 0.0003, "iou": 0.55, "augment": False},
        {"label": "TTA 1280", "imgsz": 1280, "conf": 0.0003, "iou": 0.55, "augment": True},
        {"label": "baseline 1536", "imgsz": 1536, "conf": 0.0003, "iou": 0.55, "augment": False},
    ]

    for cfg in configs:
        pred_by_image, preds_list = run_predict(
            model, val_images, cfg["imgsz"], cfg["conf"], cfg["iou"], args.device, cfg["augment"]
        )
        metrics = evaluate_hybrid(gt_by_image, pred_by_image, iou_threshold=0.5, num_classes=356)
        print(f"{cfg['label']:20s} | det={metrics['detection_ap50']:.4f} "
              f"cls_present={metrics['classification_map50_present_classes']:.4f} "
              f"cls_all={metrics['classification_map50_all_classes']:.4f} "
              f"hybrid_all={metrics['hybrid_score_all_classes']:.4f} "
              f"preds={len(preds_list)}")


if __name__ == "__main__":
    main()
