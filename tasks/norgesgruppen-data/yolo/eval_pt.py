#!/usr/bin/env python3
"""Run .pt YOLO inference on val set, output predictions JSON, then run compare_predictions."""
from __future__ import annotations
import argparse
import json
import subprocess
import sys
from pathlib import Path
from ultralytics import YOLO


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser()
    parser.add_argument("--weights", type=Path, required=True)
    parser.add_argument("--val-dir", type=Path, default=root / "data/yolo/val")
    parser.add_argument("--out", type=Path, default=root / "sweep_results/pt_eval.json")
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--conf", type=float, default=0.0005)
    parser.add_argument("--iou", type=float, default=0.55)
    parser.add_argument("--device", default="1")
    args = parser.parse_args()

    model = YOLO(str(args.weights))
    images_dir = args.val_dir / "images"
    image_paths = sorted(p for p in images_dir.iterdir() if p.suffix.lower() in {".jpg", ".jpeg", ".png"})

    predictions = []
    for img_path in image_paths:
        stem = img_path.stem
        token = stem.split("_")[-1]
        image_id = int(token)

        results = model.predict(
            source=str(img_path),
            imgsz=args.imgsz,
            conf=args.conf,
            iou=args.iou,
            device=args.device,
            verbose=False,
        )
        for r in results:
            boxes = r.boxes
            for i in range(len(boxes)):
                x1, y1, x2, y2 = boxes.xyxy[i].tolist()
                w = x2 - x1
                h = y2 - y1
                predictions.append({
                    "image_id": image_id,
                    "category_id": int(boxes.cls[i].item()),
                    "bbox": [x1, y1, w, h],
                    "score": float(boxes.conf[i].item()),
                })

    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(predictions, indent=2))
    print(f"Wrote {len(predictions)} predictions to {args.out}")

    # Run compare_predictions
    subprocess.run([
        sys.executable, str(root / "compare_predictions.py"),
        "--predictions", str(args.out),
        "--val-dir", str(args.val_dir),
        "--iou", "0.5",
        "--num-classes", "356",
        "--show-worst", "0",
    ], cwd=str(root), check=True)


if __name__ == "__main__":
    main()
