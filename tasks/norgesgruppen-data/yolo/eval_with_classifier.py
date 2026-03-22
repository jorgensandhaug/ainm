"""Evaluate YOLO + classifier fusion on val set."""
from __future__ import annotations

import argparse
import json
from pathlib import Path

import numpy as np
import torch
import torch.nn.functional as F
from PIL import Image
from torchvision import transforms
from ultralytics import YOLO
import timm


def load_classifier(model_name: str, num_classes: int, weights_path: Path, device: torch.device):
    model = timm.create_model(model_name, pretrained=False, num_classes=num_classes)
    state = torch.load(weights_path, map_location=device, weights_only=True)
    model.load_state_dict(state)
    model = model.to(device)
    model.eval()
    return model


def classify_crops(
    classifier,
    image: Image.Image,
    boxes_xyxy: list[list[float]],
    transform,
    device: torch.device,
    batch_size: int = 64,
) -> tuple[np.ndarray, np.ndarray]:
    """Classify cropped regions, return (class_ids, probs)."""
    if not boxes_xyxy:
        return np.array([], dtype=np.int64), np.array([], dtype=np.float32)

    crops = []
    for box in boxes_xyxy:
        x1, y1, x2, y2 = box
        x1 = max(0, int(x1))
        y1 = max(0, int(y1))
        x2 = min(image.width, int(x2))
        y2 = min(image.height, int(y2))
        if x2 <= x1 or y2 <= y1:
            crops.append(None)
            continue
        crop = image.crop((x1, y1, x2, y2))
        crops.append(transform(crop))

    # Batch inference
    all_class_ids = []
    all_probs = []
    valid_crops = [(i, c) for i, c in enumerate(crops) if c is not None]

    for batch_start in range(0, len(valid_crops), batch_size):
        batch = valid_crops[batch_start:batch_start + batch_size]
        tensors = torch.stack([c for _, c in batch]).to(device)
        with torch.no_grad():
            logits = classifier(tensors)
            probs = F.softmax(logits, dim=1)
            cls_ids = probs.argmax(dim=1)

        for (orig_idx, _), cls_id, prob in zip(batch, cls_ids.cpu(), probs.cpu()):
            all_class_ids.append((orig_idx, cls_id.item()))
            all_probs.append((orig_idx, prob[cls_id].item()))

    # Build full arrays matching input order
    result_ids = np.zeros(len(crops), dtype=np.int64)
    result_probs = np.zeros(len(crops), dtype=np.float32)
    for idx, cls_id in all_class_ids:
        result_ids[idx] = cls_id
    for idx, prob in all_probs:
        result_probs[idx] = prob

    return result_ids, result_probs


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--yolo-weights", type=Path,
                        default=Path("runs/960_confcurr_s2_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt"))
    parser.add_argument("--classifier-weights", type=Path, default=Path("runs/classifier/best.pth"))
    parser.add_argument("--classifier-model", default="mobilenetv3_large_100")
    parser.add_argument("--num-classes", type=int, default=356)
    parser.add_argument("--val-images", type=Path, default=Path("data/yolo/val/images"))
    parser.add_argument("--conf-thres", type=float, default=0.0003)
    parser.add_argument("--nms-iou", type=float, default=0.55)
    parser.add_argument("--cls-blend", type=float, default=0.5,
                        help="Weight for classifier vs YOLO class: 0=YOLO only, 1=classifier only")
    parser.add_argument("--cls-threshold", type=float, default=0.0,
                        help="Only reclassify if YOLO confidence below this (0=always reclassify)")
    parser.add_argument("--device", type=int, default=0)
    parser.add_argument("--output", type=Path, default=Path("sweep_results/val_fusion_preds.json"))
    parser.add_argument("--img-size", type=int, default=224)
    args = parser.parse_args()

    device = torch.device(f"cuda:{args.device}" if torch.cuda.is_available() else "cpu")

    # Load models
    yolo = YOLO(str(args.yolo_weights))
    classifier = load_classifier(args.classifier_model, args.num_classes, args.classifier_weights, device)

    cls_transform = transforms.Compose([
        transforms.Resize((args.img_size, args.img_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    predictions = []
    for img_path in sorted(args.val_images.iterdir()):
        if img_path.suffix.lower() not in {".jpg", ".jpeg", ".png"}:
            continue
        image_id = int(img_path.stem.split("_")[-1])

        # YOLO detection
        results = yolo.predict(str(img_path), imgsz=960, conf=args.conf_thres, iou=args.nms_iou,
                               device=args.device, verbose=False)
        r = results[0]
        boxes = r.boxes
        if len(boxes) == 0:
            continue

        xyxy_list = boxes.xyxy.cpu().tolist()
        yolo_cls = boxes.cls.cpu().numpy().astype(int)
        yolo_conf = boxes.conf.cpu().numpy()

        # Classifier reclassification
        pil_img = Image.open(img_path).convert("RGB")
        cls_ids, cls_probs = classify_crops(classifier, pil_img, xyxy_list, cls_transform, device)

        for i in range(len(boxes)):
            x1, y1, x2, y2 = xyxy_list[i]
            w = x2 - x1
            h = y2 - y1

            yolo_class = yolo_cls[i]
            yolo_score = float(yolo_conf[i])
            cls_class = int(cls_ids[i])
            cls_prob = float(cls_probs[i])

            # Fusion logic
            if args.cls_threshold > 0 and yolo_score > args.cls_threshold:
                # High-confidence YOLO: keep YOLO class
                final_class = yolo_class
                final_score = yolo_score
            else:
                # Blend: use classifier class if it's more confident
                blend = args.cls_blend
                if cls_prob > (1 - blend) * yolo_score / max(yolo_score, 1e-8):
                    final_class = cls_class
                    final_score = yolo_score  # Keep YOLO detection score
                else:
                    final_class = yolo_class
                    final_score = yolo_score

            predictions.append({
                "image_id": image_id,
                "category_id": int(final_class),
                "bbox": [x1, y1, w, h],
                "score": float(final_score),
            })

    args.output.parent.mkdir(parents=True, exist_ok=True)
    Path(args.output).write_text(json.dumps(predictions, indent=2))
    print(f"Wrote {len(predictions)} predictions to {args.output}")


if __name__ == "__main__":
    main()
