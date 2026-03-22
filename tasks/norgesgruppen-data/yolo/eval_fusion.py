#!/usr/bin/env python3
"""Evaluate YOLO + classifier fusion with hybrid score computation."""
from __future__ import annotations
import argparse
import json
import sys
from collections import defaultdict
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms
from ultralytics import YOLO
import timm

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from compare_predictions import load_ground_truth, evaluate_hybrid


def load_classifier(model_name, num_classes, weights_path, device):
    model = timm.create_model(model_name, pretrained=False, num_classes=num_classes)
    state = torch.load(weights_path, map_location=device, weights_only=True)
    model.load_state_dict(state)
    model = model.to(device)
    model.eval()
    return model


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--yolo-weights", type=Path, required=True)
    parser.add_argument("--cls-weights", type=Path, required=True)
    parser.add_argument("--cls-model", default="mobilenetv3_large_100")
    parser.add_argument("--val-dir", type=Path, default=Path(__file__).resolve().parents[1] / "data/yolo/val")
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--conf", type=float, default=0.0001)
    parser.add_argument("--iou", type=float, default=0.7)
    parser.add_argument("--cls-img-size", type=int, default=224)
    parser.add_argument("--blend", type=float, default=0.5, help="0=YOLO only, 1=classifier only")
    parser.add_argument("--device", default="1")
    parser.add_argument("--out", type=Path, default=None)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    device_torch = torch.device(f"cuda:{args.device}")

    yolo = YOLO(str(args.yolo_weights))
    classifier = load_classifier(args.cls_model, 356, args.cls_weights, device_torch)

    cls_transform = transforms.Compose([
        transforms.Resize((args.cls_img_size, args.cls_img_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    gt_by_image = load_ground_truth(args.val_dir)
    images_dir = args.val_dir / "images"
    image_paths = sorted(p for p in images_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})

    predictions = []

    for img_path in image_paths:
        image_id = int(img_path.stem.split("_")[-1])

        results = yolo.predict(str(img_path), imgsz=args.imgsz, conf=args.conf, iou=args.iou,
                               device=args.device, verbose=False)
        r = results[0]
        boxes = r.boxes
        if len(boxes) == 0:
            continue

        pil_img = Image.open(img_path).convert("RGB")
        xyxy_list = boxes.xyxy.cpu().tolist()
        yolo_cls = boxes.cls.cpu().numpy().astype(int)
        yolo_conf = boxes.conf.cpu().numpy()

        # Batch classify crops
        crops = []
        valid_indices = []
        for i, (x1, y1, x2, y2) in enumerate(xyxy_list):
            cx1 = max(0, int(x1))
            cy1 = max(0, int(y1))
            cx2 = min(pil_img.width, int(x2))
            cy2 = min(pil_img.height, int(y2))
            if cx2 <= cx1 or cy2 <= cy1:
                continue
            crop = pil_img.crop((cx1, cy1, cx2, cy2))
            crops.append(cls_transform(crop))
            valid_indices.append(i)

        cls_ids = np.full(len(boxes), -1, dtype=int)
        cls_probs = np.zeros(len(boxes), dtype=float)

        if crops:
            batch = torch.stack(crops).to(device_torch)
            with torch.no_grad():
                logits = classifier(batch)
                probs = F.softmax(logits, dim=1)
                top_ids = probs.argmax(dim=1)
                top_probs = probs.gather(1, top_ids.unsqueeze(1)).squeeze(1)

            for j, orig_idx in enumerate(valid_indices):
                cls_ids[orig_idx] = top_ids[j].item()
                cls_probs[orig_idx] = top_probs[j].item()

        # Fusion
        for i in range(len(boxes)):
            x1, y1, x2, y2 = xyxy_list[i]

            if cls_ids[i] >= 0:
                # Use classifier class weighted by blend
                if cls_probs[i] > args.blend:
                    final_class = int(cls_ids[i])
                else:
                    final_class = int(yolo_cls[i])
            else:
                final_class = int(yolo_cls[i])

            predictions.append({
                "image_id": image_id,
                "category_id": final_class,
                "bbox": [x1, y1, x2 - x1, y2 - y1],
                "score": float(yolo_conf[i]),
            })

    # Evaluate
    pred_by_image = defaultdict(list)
    for p in predictions:
        x, y, w, h = p["bbox"]
        pred_by_image[p["image_id"]].append({
            "category_id": p["category_id"],
            "score": p["score"],
            "bbox_xyxy": (x, y, x + w, y + h),
        })
    for img_id in pred_by_image:
        pred_by_image[img_id].sort(key=lambda x: x["score"], reverse=True)

    metrics = evaluate_hybrid(gt_by_image, dict(pred_by_image), iou_threshold=0.5, num_classes=356)

    print(f"\n=== YOLO+Classifier Fusion (blend={args.blend}) ===")
    print(f"Detection AP@0.5: {metrics['detection_ap50']:.4f}")
    print(f"Classification mAP@0.5 (present): {metrics['classification_map50_present_classes']:.4f}")
    print(f"Classification mAP@0.5 (all): {metrics['classification_map50_all_classes']:.4f}")
    print(f"Hybrid (present): {metrics['hybrid_score_present_classes']:.4f}")
    print(f"Hybrid (all): {metrics['hybrid_score_all_classes']:.4f}")

    out = args.out or root / "sweep_results" / f"fusion_blend{args.blend}.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    result = {
        "blend": args.blend,
        "yolo_weights": str(args.yolo_weights),
        "cls_weights": str(args.cls_weights),
        "imgsz": args.imgsz,
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
