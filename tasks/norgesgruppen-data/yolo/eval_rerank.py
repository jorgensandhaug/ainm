"""Rerank YOLO predictions: keep boxes and scores, optionally replace class using classifier."""
from __future__ import annotations
import argparse
import json
import sys
import numpy as np
import torch
import torch.nn.functional as F
from torchvision import transforms
from pathlib import Path
from PIL import Image
from ultralytics import YOLO
import timm

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compare_predictions import load_ground_truth, evaluate_hybrid


def load_classifier(ckpt_path, device):
    ckpt = torch.load(str(ckpt_path), map_location="cpu", weights_only=False)
    model = timm.create_model(ckpt["model_name"], pretrained=False, num_classes=ckpt["num_classes"])
    model.load_state_dict(ckpt["model_state_dict"])
    model = model.to(device).eval()
    img_size = ckpt["img_size"]
    transform = transforms.Compose([
        transforms.Resize((img_size, img_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    return model, transform


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--yolo-weights", type=Path, required=True)
    parser.add_argument("--classifier-weights", type=Path, required=True)
    parser.add_argument("--device", type=int, default=2)
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--conf", type=float, default=0.0003)
    parser.add_argument("--iou", type=float, default=0.55)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    val_images = root / "data/yolo/val/images"
    val_dir = root / "data/yolo/val"
    gt_by_image = load_ground_truth(val_dir)
    device = torch.device(f"cuda:{args.device}")

    yolo = YOLO(str(args.yolo_weights))
    classifier, cls_transform = load_classifier(args.classifier_weights, device)

    # Run YOLO on all val images at once (matches standalone eval)
    results = yolo.predict(
        source=str(val_images), imgsz=args.imgsz, conf=args.conf,
        iou=args.iou, device=args.device, verbose=False, save=False,
    )

    # Collect all predictions and classify each crop
    from collections import defaultdict
    all_preds = []  # (image_id, x1, y1, x2, y2, yolo_class, yolo_score)

    for r in results:
        stem = Path(r.path).stem
        image_id = int(stem.split("_")[-1])
        img = Image.open(r.path)
        boxes = r.boxes

        for i in range(len(boxes)):
            xyxy = boxes.xyxy[i].cpu().tolist()
            x1, y1, x2, y2 = xyxy
            yolo_cls = int(boxes.cls[i].item())
            yolo_score = float(boxes.conf[i].item())

            # Crop
            cx1, cy1, cx2, cy2 = int(max(0, x1)), int(max(0, y1)), int(x2), int(y2)
            if cx2 - cx1 < 5 or cy2 - cy1 < 5:
                cls_class = yolo_cls
                cls_conf = 0.0
            else:
                crop = img.crop((cx1, cy1, cx2, cy2)).convert("RGB")
                tensor = cls_transform(crop).unsqueeze(0).to(device)
                with torch.no_grad():
                    logits = classifier(tensor)
                probs = F.softmax(logits, dim=1)
                cls_conf, cls_class = probs[0].max(0)
                cls_class = int(cls_class.item())
                cls_conf = float(cls_conf.item())

            all_preds.append({
                "image_id": image_id,
                "x1": x1, "y1": y1, "x2": x2, "y2": y2,
                "yolo_class": yolo_cls, "yolo_score": yolo_score,
                "cls_class": cls_class, "cls_conf": cls_conf,
            })

    print(f"Total predictions: {len(all_preds)}")

    # Evaluate different reranking strategies
    strategies = {
        "yolo_only": lambda p: (p["yolo_class"], p["yolo_score"]),
        "classifier_only": lambda p: (p["cls_class"], p["yolo_score"]),  # Keep YOLO score, change class
        "cls_if_agree": lambda p: (p["yolo_class"] if p["yolo_class"] == p["cls_class"] else p["cls_class"],
                                   p["yolo_score"] * (1.1 if p["yolo_class"] == p["cls_class"] else 0.9)),
        "cls_highconf": lambda p: (p["cls_class"] if p["cls_conf"] > 0.5 else p["yolo_class"],
                                   p["yolo_score"]),
        "cls_veryhighconf": lambda p: (p["cls_class"] if p["cls_conf"] > 0.8 else p["yolo_class"],
                                       p["yolo_score"]),
    }

    for name, strategy in strategies.items():
        pred_by_image = defaultdict(list)
        for p in all_preds:
            final_class, final_score = strategy(p)
            pred_by_image[p["image_id"]].append({
                "category_id": int(final_class),
                "score": float(final_score),
                "bbox_xyxy": (p["x1"], p["y1"], p["x2"], p["y2"]),
                "image_id": p["image_id"],
            })
        for img_id in pred_by_image:
            pred_by_image[img_id].sort(key=lambda x: x["score"], reverse=True)

        metrics = evaluate_hybrid(gt_by_image, dict(pred_by_image), iou_threshold=0.5, num_classes=356)
        print(f"{name:20s} | det={metrics['detection_ap50']:.4f} "
              f"cls_present={metrics['classification_map50_present_classes']:.4f} "
              f"cls_all={metrics['classification_map50_all_classes']:.4f} "
              f"hybrid_all={metrics['hybrid_score_all_classes']:.4f}")


if __name__ == "__main__":
    main()
