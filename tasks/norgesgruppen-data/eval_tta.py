#!/usr/bin/env python3
"""Evaluate with TTA (Test-Time Augmentation) using ultralytics augment mode."""
import json
import sys
from pathlib import Path

from ultralytics import YOLO


def predict_val_tta(model, val_images_dir, imgsz, conf, iou, device=0):
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
            augment=True,  # TTA: flips + multi-scale
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
    from compare_predictions import load_ground_truth, evaluate_hybrid

    weights = sys.argv[1] if len(sys.argv) > 1 else str(
        root / "runs/960_confcurr_s2_final_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt"
    )
    val_dir = root / "data/yolo/val"
    model = YOLO(weights)
    gt_by_image = load_ground_truth(val_dir)

    for conf in [0.0001, 0.0005, 0.001]:
        print(f"\n=== TTA, conf={conf}, iou=0.55, imgsz=960 ===")
        preds = predict_val_tta(model, val_dir / "images", 960, conf, 0.55)

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
        print(f"  det_AP50={metrics['detection_ap50']:.4f}")
        print(f"  cls_mAP50_present={metrics['classification_map50_present_classes']:.4f}")
        print(f"  cls_mAP50_all={metrics['classification_map50_all_classes']:.4f}")
        print(f"  hybrid_present={metrics['hybrid_score_present_classes']:.4f}")
        print(f"  hybrid_all={metrics['hybrid_score_all_classes']:.4f}")
        print(f"  pred_count={len(preds)}")

        out = root / f"sweep_results/pred_tta_c{conf}.json"
        out.write_text(json.dumps(preds))


if __name__ == "__main__":
    main()
