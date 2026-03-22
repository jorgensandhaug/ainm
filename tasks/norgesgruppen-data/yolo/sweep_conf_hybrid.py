"""Sweep confidence thresholds and NMS IoU to maximize hybrid score."""
from __future__ import annotations
import argparse
import json
import sys
from pathlib import Path
from ultralytics import YOLO

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compare_predictions import load_ground_truth, evaluate_hybrid


def run_eval(model, val_images, imgsz, conf, iou, device):
    results = model.predict(
        source=str(val_images),
        imgsz=imgsz,
        conf=conf,
        iou=iou,
        device=device,
        verbose=False,
        save=False,
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
    # convert to format expected by evaluate_hybrid
    from collections import defaultdict
    pred_by_image = defaultdict(list)
    for p in predictions:
        pred_by_image[p["image_id"]].append(p)
    for img_id in pred_by_image:
        pred_by_image[img_id].sort(key=lambda x: x["score"], reverse=True)
    return dict(pred_by_image), len(predictions)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--device", type=int, default=2)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    val_images = root / "data/yolo/val/images"
    val_dir = root / "data/yolo/val"
    gt_by_image = load_ground_truth(val_dir)

    model = YOLO(str(args.weights))

    conf_values = [0.0001, 0.0003, 0.0005, 0.001, 0.003, 0.005, 0.01, 0.02, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3]
    iou_values = [0.45, 0.50, 0.55, 0.60, 0.65]

    results = []

    # First sweep conf with fixed iou=0.55
    print("=== Conf sweep (NMS IoU=0.55) ===")
    for conf in conf_values:
        pred_by_image, n_preds = run_eval(model, val_images, args.imgsz, conf, 0.55, args.device)
        metrics = evaluate_hybrid(gt_by_image, pred_by_image, iou_threshold=0.5, num_classes=356)
        r = {
            "conf": conf, "nms_iou": 0.55,
            "det_ap": metrics["detection_ap50"],
            "cls_map_present": metrics["classification_map50_present_classes"],
            "cls_map_all": metrics["classification_map50_all_classes"],
            "hybrid_present": metrics["hybrid_score_present_classes"],
            "hybrid_all": metrics["hybrid_score_all_classes"],
            "n_preds": n_preds,
        }
        results.append(r)
        print(f"  conf={conf:.4f} | det={r['det_ap']:.4f} cls_all={r['cls_map_all']:.4f} hybrid_all={r['hybrid_all']:.4f} | preds={n_preds}")

    # Find best conf, then sweep iou
    best_conf = max(results, key=lambda x: x["hybrid_all"])["conf"]
    print(f"\nBest conf: {best_conf}")

    print(f"\n=== NMS IoU sweep (conf={best_conf}) ===")
    for iou in iou_values:
        pred_by_image, n_preds = run_eval(model, val_images, args.imgsz, best_conf, iou, args.device)
        metrics = evaluate_hybrid(gt_by_image, pred_by_image, iou_threshold=0.5, num_classes=356)
        r = {
            "conf": best_conf, "nms_iou": iou,
            "det_ap": metrics["detection_ap50"],
            "cls_map_present": metrics["classification_map50_present_classes"],
            "cls_map_all": metrics["classification_map50_all_classes"],
            "hybrid_present": metrics["hybrid_score_present_classes"],
            "hybrid_all": metrics["hybrid_score_all_classes"],
            "n_preds": n_preds,
        }
        results.append(r)
        print(f"  iou={iou:.2f} | det={r['det_ap']:.4f} cls_all={r['cls_map_all']:.4f} hybrid_all={r['hybrid_all']:.4f} | preds={n_preds}")

    # Overall best
    best = max(results, key=lambda x: x["hybrid_all"])
    print(f"\n=== BEST CONFIG ===")
    print(f"conf={best['conf']}, nms_iou={best['nms_iou']}")
    print(f"det_ap={best['det_ap']:.4f}, cls_map_all={best['cls_map_all']:.4f}")
    print(f"hybrid_all={best['hybrid_all']:.4f}, hybrid_present={best['hybrid_present']:.4f}")
    print(f"n_preds={best['n_preds']}")

    out_path = root / "sweep_results" / "conf_iou_sweep.json"
    out_path.write_text(json.dumps(results, indent=2))
    print(f"\nSaved to {out_path}")


if __name__ == "__main__":
    main()
