"""Detect with YOLO, classify crops with separate classifier, evaluate hybrid score."""
from __future__ import annotations
import argparse
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
    model_name = ckpt["model_name"]
    num_classes = ckpt["num_classes"]
    img_size = ckpt["img_size"]
    model = timm.create_model(model_name, pretrained=False, num_classes=num_classes)
    model.load_state_dict(ckpt["model_state_dict"])
    model = model.to(device).eval()
    transform = transforms.Compose([
        transforms.Resize((img_size, img_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    return model, transform, num_classes


def classify_crops(classifier, transform, crops, device, batch_size=64):
    """Classify a list of PIL Image crops, return (class_ids, scores)."""
    if not crops:
        return np.array([]), np.array([])

    all_logits = []
    for i in range(0, len(crops), batch_size):
        batch = crops[i:i+batch_size]
        tensors = torch.stack([transform(c) for c in batch]).to(device)
        with torch.no_grad():
            logits = classifier(tensors)
        all_logits.append(logits.cpu())

    all_logits = torch.cat(all_logits, dim=0)
    probs = F.softmax(all_logits, dim=1)
    scores, class_ids = probs.max(dim=1)
    return class_ids.numpy(), scores.numpy()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--yolo-weights", type=Path, required=True)
    parser.add_argument("--classifier-weights", type=Path, required=True)
    parser.add_argument("--device", type=int, default=2)
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--conf", type=float, default=0.0003)
    parser.add_argument("--iou", type=float, default=0.55)
    parser.add_argument("--cls-weight", type=float, default=0.5,
                        help="Weight of classifier score (0=YOLO only, 1=classifier only)")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    val_images = root / "data/yolo/val/images"
    val_dir = root / "data/yolo/val"
    gt_by_image = load_ground_truth(val_dir)
    device = torch.device(f"cuda:{args.device}")

    yolo = YOLO(str(args.yolo_weights))
    classifier, cls_transform, num_classes = load_classifier(args.classifier_weights, device)

    from collections import defaultdict
    image_paths = sorted(val_images.glob("*.jpg")) + sorted(val_images.glob("*.png"))

    cls_weights = [0.0, 0.2, 0.4, 0.5, 0.6, 0.8, 1.0]

    for cw in cls_weights:
        pred_by_image = defaultdict(list)

        for img_path in image_paths:
            stem = img_path.stem
            token = stem.split("_")[-1]
            image_id = int(token)

            results = yolo.predict(
                source=str(img_path), imgsz=args.imgsz, conf=args.conf,
                iou=args.iou, device=args.device, verbose=False, save=False,
            )
            r = results[0]
            boxes = r.boxes
            if len(boxes) == 0:
                continue

            img = Image.open(img_path)
            xyxy = boxes.xyxy.cpu().numpy()
            yolo_scores = boxes.conf.cpu().numpy()
            yolo_classes = boxes.cls.cpu().numpy().astype(int)

            # Crop and classify
            crops = []
            for i in range(len(xyxy)):
                x1, y1, x2, y2 = [int(v) for v in xyxy[i]]
                x1, y1 = max(0, x1), max(0, y1)
                crop = img.crop((x1, y1, x2, y2))
                if crop.size[0] < 10 or crop.size[1] < 10:
                    crop = img.crop((max(0, x1-5), max(0, y1-5), x2+5, y2+5))
                crops.append(crop.convert("RGB"))

            cls_ids, cls_scores = classify_crops(classifier, cls_transform, crops, device)

            for i in range(len(xyxy)):
                x1, y1, x2, y2 = xyxy[i]

                if cw == 0.0:
                    final_class = int(yolo_classes[i])
                    final_score = float(yolo_scores[i])
                elif cw == 1.0:
                    final_class = int(cls_ids[i])
                    final_score = float(cls_scores[i])
                else:
                    # Blend: use classifier class if its score is high enough
                    yolo_conf = float(yolo_scores[i])
                    cls_conf = float(cls_scores[i])

                    # Weight the decision
                    if cls_conf * cw > yolo_conf * (1 - cw):
                        final_class = int(cls_ids[i])
                    else:
                        final_class = int(yolo_classes[i])
                    final_score = yolo_conf * (1 - cw) + cls_conf * cw

                pred_by_image[image_id].append({
                    "category_id": final_class,
                    "score": final_score,
                    "bbox_xyxy": (float(x1), float(y1), float(x2), float(y2)),
                    "image_id": image_id,
                })

        for img_id in pred_by_image:
            pred_by_image[img_id].sort(key=lambda x: x["score"], reverse=True)

        metrics = evaluate_hybrid(gt_by_image, dict(pred_by_image), iou_threshold=0.5, num_classes=356)
        n_preds = sum(len(v) for v in pred_by_image.values())
        print(f"cls_weight={cw:.1f} | det={metrics['detection_ap50']:.4f} "
              f"cls_present={metrics['classification_map50_present_classes']:.4f} "
              f"cls_all={metrics['classification_map50_all_classes']:.4f} "
              f"hybrid_all={metrics['hybrid_score_all_classes']:.4f} "
              f"preds={n_preds}")


if __name__ == "__main__":
    main()
