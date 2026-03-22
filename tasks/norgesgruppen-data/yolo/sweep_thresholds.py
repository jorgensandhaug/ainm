#!/usr/bin/env python3
"""Sweep conf/iou thresholds to maximize hybrid score."""
from __future__ import annotations
import json
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from ultralytics import YOLO
from compare_predictions import load_ground_truth, evaluate_hybrid


def run_inference(model, images_dir, imgsz, conf, iou, device):
    image_paths = sorted(p for p in images_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    predictions = []
    for img_path in image_paths:
        token = img_path.stem.split("_")[-1]
        image_id = int(token)
        results = model.predict(source=str(img_path), imgsz=imgsz, conf=conf, iou=iou, device=device, verbose=False)
        for r in results:
            boxes = r.boxes
            for i in range(len(boxes)):
                x1, y1, x2, y2 = boxes.xyxy[i].tolist()
                predictions.append({
                    "image_id": image_id,
                    "category_id": int(boxes.cls[i].item()),
                    "bbox": [x1, y1, x2 - x1, y2 - y1],
                    "score": float(boxes.conf[i].item()),
                })
    return predictions


def pred_to_by_image(predictions):
    from collections import defaultdict
    by_image = defaultdict(list)
    for p in predictions:
        by_image[p["image_id"]].append({
            "category_id": p["category_id"],
            "score": p["score"],
            "bbox_xyxy": (p["bbox"][0], p["bbox"][1], p["bbox"][0] + p["bbox"][2], p["bbox"][1] + p["bbox"][3]),
        })
    for img_id in by_image:
        by_image[img_id].sort(key=lambda x: x["score"], reverse=True)
    return dict(by_image)


def main():
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--val-dir", type=Path, default=Path(__file__).resolve().parents[1] / "data/yolo/val")
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--device", default="1")
    args = parser.parse_args()

    model = YOLO(str(args.weights))
    gt_by_image = load_ground_truth(args.val_dir)

    # Run inference once at very low conf to get all predictions
    print("Running inference at conf=0.0001...")
    all_preds = run_inference(model, args.val_dir / "images", args.imgsz, conf=0.0001, iou=0.7, device=args.device)
    print(f"Total predictions: {len(all_preds)}")

    best_hybrid = 0
    best_params = {}
    results = []

    # Sweep score thresholds (filter predictions post-hoc)
    conf_thresholds = [0.0001, 0.0003, 0.0005, 0.001, 0.003, 0.005, 0.01, 0.03, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]
    nms_ious = [0.4, 0.45, 0.5, 0.55, 0.6, 0.65, 0.7]

    # First sweep conf with fixed NMS (already applied at 0.7)
    for conf_t in conf_thresholds:
        filtered = [p for p in all_preds if p["score"] >= conf_t]
        pred_by_image = pred_to_by_image(filtered)
        metrics = evaluate_hybrid(gt_by_image, pred_by_image, iou_threshold=0.5, num_classes=356)
        hybrid_present = metrics["hybrid_score_present_classes"]
        hybrid_all = metrics["hybrid_score_all_classes"]
        det = metrics["detection_ap50"]
        cls_present = metrics["classification_map50_present_classes"]
        cls_all = metrics["classification_map50_all_classes"]
        results.append({
            "conf": conf_t, "nms_iou": 0.7,
            "hybrid_present": round(hybrid_present, 4),
            "hybrid_all": round(hybrid_all, 4),
            "det_ap50": round(det, 4),
            "cls_present": round(cls_present, 4),
            "cls_all": round(cls_all, 4),
            "n_preds": len(filtered),
        })
        if hybrid_present > best_hybrid:
            best_hybrid = hybrid_present
            best_params = {"conf": conf_t, "nms_iou": 0.7}
        print(f"conf={conf_t:.4f} nms=0.7 | hybrid_p={hybrid_present:.4f} hybrid_a={hybrid_all:.4f} "
              f"det={det:.4f} cls_p={cls_present:.4f} preds={len(filtered)}")

    # Now sweep NMS IoU at different values (need to re-run inference)
    best_conf = best_params.get("conf", 0.0005)
    print(f"\nBest conf so far: {best_conf}, sweeping NMS IoU...")

    for nms_iou in nms_ious:
        preds = run_inference(model, args.val_dir / "images", args.imgsz, conf=best_conf, iou=nms_iou, device=args.device)
        pred_by_image = pred_to_by_image(preds)
        metrics = evaluate_hybrid(gt_by_image, pred_by_image, iou_threshold=0.5, num_classes=356)
        hybrid_present = metrics["hybrid_score_present_classes"]
        hybrid_all = metrics["hybrid_score_all_classes"]
        det = metrics["detection_ap50"]
        cls_present = metrics["classification_map50_present_classes"]
        results.append({
            "conf": best_conf, "nms_iou": nms_iou,
            "hybrid_present": round(hybrid_present, 4),
            "hybrid_all": round(hybrid_all, 4),
            "det_ap50": round(det, 4),
            "cls_present": round(cls_present, 4),
            "n_preds": len(preds),
        })
        if hybrid_present > best_hybrid:
            best_hybrid = hybrid_present
            best_params = {"conf": best_conf, "nms_iou": nms_iou}
        print(f"conf={best_conf:.4f} nms={nms_iou:.2f} | hybrid_p={hybrid_present:.4f} "
              f"det={det:.4f} cls_p={cls_present:.4f} preds={len(preds)}")

    print(f"\n=== BEST: hybrid_present={best_hybrid:.4f}, params={best_params} ===")

    out = Path(__file__).resolve().parents[1] / "sweep_results" / "threshold_sweep.json"
    out.write_text(json.dumps({"best": best_params, "best_hybrid_present": best_hybrid, "results": results}, indent=2))
    print(f"Saved to {out}")


if __name__ == "__main__":
    main()
