"""Evaluate a .pt YOLO checkpoint using the hybrid score from compare_predictions.py."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from ultralytics import YOLO


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--val-images", type=Path, default=Path("data/yolo/val/images"))
    parser.add_argument("--out", type=Path, default=Path("sweep_results/eval_pt_preds.json"))
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--conf", type=float, default=0.0003)
    parser.add_argument("--iou", type=float, default=0.55)
    parser.add_argument("--device", type=int, default=2)
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    val_images = args.val_images if args.val_images.is_absolute() else root / args.val_images
    out_path = args.out if args.out.is_absolute() else root / args.out

    model = YOLO(str(args.weights))
    results = model.predict(
        source=str(val_images),
        imgsz=args.imgsz,
        conf=args.conf,
        iou=args.iou,
        device=args.device,
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
            w = x2 - x1
            h = y2 - y1
            predictions.append({
                "image_id": image_id,
                "category_id": int(boxes.cls[i].item()),
                "bbox": [x1, y1, w, h],
                "score": float(boxes.conf[i].item()),
            })

    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(predictions, indent=2))
    print(f"Wrote {len(predictions)} predictions to {out_path}")


if __name__ == "__main__":
    main()
