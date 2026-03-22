#!/usr/bin/env python3
"""Sweep conf and NMS IoU thresholds for a YOLO model on val."""
import json
import sys
from pathlib import Path
from itertools import product

from ultralytics import YOLO
from PIL import Image


def predict_val(model, val_images_dir, imgsz, conf, iou, device=0):
    image_paths = sorted(
        list(val_images_dir.glob("*.jpg")) +
        list(val_images_dir.glob("*.jpeg")) +
        list(val_images_dir.glob("*.png"))
    )
    predictions = []
    for img_path in image_paths:
        token = img_path.stem.split("_")[-1]
        image_id = int(token)
        results = model.predict(
            source=str(img_path), imgsz=imgsz, conf=conf, iou=iou,
            device=device, verbose=False, max_det=600,
        )
        for r in results:
            boxes = r.boxes
            for i in range(len(boxes)):
                xyxy = boxes.xyxy[i].cpu().numpy()
                cls_id = int(boxes.cls[i].cpu().item())
                score = float(boxes.conf[i].cpu().item())
                x1, y1, x2, y2 = xyxy
                predictions.append({
                    "image_id": image_id,
                    "category_id": cls_id,
                    "bbox": [float(x1), float(y1), float(x2 - x1), float(y2 - y1)],
                    "score": score,
                })
    return predictions


def main():
    root = Path(__file__).resolve().parent
    sys.path.insert(0, str(root))
    from compare_predictions import load_ground_truth, load_predictions, evaluate_hybrid

    weights = sys.argv[1] if len(sys.argv) > 1 else str(
        root / "runs/960_confcurr_s2_final_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt"
    )
    imgsz = int(sys.argv[2]) if len(sys.argv) > 2 else 960
    val_dir = root / "data/yolo/val"
    val_images = val_dir / "images"

    conf_values = [0.0001, 0.0003, 0.0005, 0.001, 0.003, 0.005, 0.01, 0.02, 0.05]
    iou_values = [0.35, 0.45, 0.55, 0.65]

    model = YOLO(weights)
    gt_by_image = load_ground_truth(val_dir)

    results = []
    # First pass: sweep conf at default iou=0.55
    print(f"=== Conf sweep (iou=0.55) for {weights} at imgsz={imgsz} ===")
    for conf in conf_values:
        preds = predict_val(model, val_images, imgsz, conf, iou=0.55)
        out_path = root / f"sweep_results/sweep_preds/pred_c{conf}_iou0p55.json"
        out_path.parent.mkdir(parents=True, exist_ok=True)
        out_path.write_text(json.dumps(preds))

        pred_by_image = {}
        for p in preds:
            pred_by_image.setdefault(p["image_id"], []).append({
                "category_id": p["category_id"],
                "score": p["score"],
                "bbox_xyxy": (p["bbox"][0], p["bbox"][1],
                              p["bbox"][0]+p["bbox"][2], p["bbox"][1]+p["bbox"][3]),
            })
        for img_id in pred_by_image:
            pred_by_image[img_id].sort(key=lambda x: x["score"], reverse=True)

        metrics = evaluate_hybrid(gt_by_image, pred_by_image, iou_threshold=0.5, num_classes=356)
        row = {
            "conf": conf, "nms_iou": 0.55,
            "det_ap50": metrics["detection_ap50"],
            "cls_map50_present": metrics["classification_map50_present_classes"],
            "cls_map50_all": metrics["classification_map50_all_classes"],
            "hybrid_present": metrics["hybrid_score_present_classes"],
            "hybrid_all": metrics["hybrid_score_all_classes"],
            "pred_count": len(preds),
        }
        results.append(row)
        print(f"  conf={conf:.4f} det={row['det_ap50']:.4f} cls_all={row['cls_map50_all']:.4f} "
              f"hybrid_all={row['hybrid_all']:.4f} hybrid_present={row['hybrid_present']:.4f} preds={len(preds)}")

    # Find best conf for hybrid_all
    best_conf_row = max(results, key=lambda r: r["hybrid_all"])
    best_conf = best_conf_row["conf"]
    print(f"\nBest conf for hybrid_all: {best_conf} → {best_conf_row['hybrid_all']:.4f}")

    # Second pass: sweep iou at best conf
    print(f"\n=== IoU sweep (conf={best_conf}) ===")
    for iou in iou_values:
        if iou == 0.55:  # already done
            continue
        preds = predict_val(model, val_images, imgsz, best_conf, iou=iou)
        pred_by_image = {}
        for p in preds:
            pred_by_image.setdefault(p["image_id"], []).append({
                "category_id": p["category_id"],
                "score": p["score"],
                "bbox_xyxy": (p["bbox"][0], p["bbox"][1],
                              p["bbox"][0]+p["bbox"][2], p["bbox"][1]+p["bbox"][3]),
            })
        for img_id in pred_by_image:
            pred_by_image[img_id].sort(key=lambda x: x["score"], reverse=True)

        metrics = evaluate_hybrid(gt_by_image, pred_by_image, iou_threshold=0.5, num_classes=356)
        row = {
            "conf": best_conf, "nms_iou": iou,
            "det_ap50": metrics["detection_ap50"],
            "cls_map50_present": metrics["classification_map50_present_classes"],
            "cls_map50_all": metrics["classification_map50_all_classes"],
            "hybrid_present": metrics["hybrid_score_present_classes"],
            "hybrid_all": metrics["hybrid_score_all_classes"],
            "pred_count": len(preds),
        }
        results.append(row)
        print(f"  iou={iou:.2f} det={row['det_ap50']:.4f} cls_all={row['cls_map50_all']:.4f} "
              f"hybrid_all={row['hybrid_all']:.4f} hybrid_present={row['hybrid_present']:.4f} preds={len(preds)}")

    # Third pass: TTA with best settings
    best_row = max(results, key=lambda r: r["hybrid_all"])
    print(f"\n=== BEST OVERALL ===")
    print(f"conf={best_row['conf']} iou={best_row['nms_iou']} "
          f"hybrid_all={best_row['hybrid_all']:.4f} hybrid_present={best_row['hybrid_present']:.4f}")

    (root / "sweep_results/inference_sweep_960.json").write_text(
        json.dumps({"results": results, "best": best_row}, indent=2)
    )


if __name__ == "__main__":
    main()
