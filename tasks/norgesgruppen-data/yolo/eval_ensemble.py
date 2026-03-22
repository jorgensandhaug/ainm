#!/usr/bin/env python3
"""Ensemble multiple YOLO models with WBF."""
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
from yolo.eval_tta import wbf, run_inference_single


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, nargs="+", required=True)
    parser.add_argument("--scales", type=int, nargs="+", default=[960, 1280])
    parser.add_argument("--flip", action="store_true", default=True)
    parser.add_argument("--no-flip", dest="flip", action="store_false")
    parser.add_argument("--val-dir", type=Path, default=Path(__file__).resolve().parents[1] / "data/yolo/val")
    parser.add_argument("--conf", type=float, default=0.0001)
    parser.add_argument("--iou", type=float, default=0.7)
    parser.add_argument("--wbf-iou", type=float, default=0.6)
    parser.add_argument("--device", default="1")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    gt_by_image = load_ground_truth(args.val_dir)
    images_dir = args.val_dir / "images"
    image_paths = sorted(p for p in images_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})

    # Load all models
    models = [YOLO(str(w)) for w in args.weights]
    print(f"Loaded {len(models)} models")

    # Build all (model, scale, flip) configs
    configs = []
    for model_idx, model in enumerate(models):
        for scale in args.scales:
            configs.append((model_idx, model, scale, False))
            if args.flip:
                configs.append((model_idx, model, scale, True))

    print(f"Total configs: {len(configs)}")

    all_predictions = []

    for img_path in image_paths:
        token = img_path.stem.split("_")[-1]
        image_id = int(token)
        img = Image.open(img_path)
        orig_w, orig_h = img.size

        boxes_list = []
        scores_list = []
        labels_list = []

        for model_idx, model, scale, flip in configs:
            boxes, scores, labels = run_inference_single(
                model, img_path, scale, args.conf, args.iou, args.device, flip=flip
            )
            boxes_list.append(boxes)
            scores_list.append(scores)
            labels_list.append(labels)

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

    print(f"Total ensemble predictions: {len(all_predictions)}")

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

    print(f"\n=== Ensemble Results ({len(models)} models, scales={args.scales}, flip={args.flip}, wbf_iou={args.wbf_iou}) ===")
    print(f"Detection AP@0.5: {metrics['detection_ap50']:.4f}")
    print(f"Classification mAP@0.5 (present): {metrics['classification_map50_present_classes']:.4f}")
    print(f"Classification mAP@0.5 (all): {metrics['classification_map50_all_classes']:.4f}")
    print(f"Hybrid (present): {metrics['hybrid_score_present_classes']:.4f}")
    print(f"Hybrid (all): {metrics['hybrid_score_all_classes']:.4f}")

    out = args.out or root / "sweep_results" / "ensemble_eval.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    result = {
        "weights": [str(w) for w in args.weights],
        "scales": args.scales,
        "flip": args.flip,
        "wbf_iou": args.wbf_iou,
        "n_predictions": len(all_predictions),
        "metrics": {
            "detection_ap50": metrics["detection_ap50"],
            "cls_present": metrics["classification_map50_present_classes"],
            "cls_all": metrics["classification_map50_all_classes"],
            "hybrid_present": metrics["hybrid_score_present_classes"],
            "hybrid_all": metrics["hybrid_score_all_classes"],
        }
    }
    out.write_text(json.dumps(result, indent=2))
    print(f"Saved to {out}")


if __name__ == "__main__":
    main()
