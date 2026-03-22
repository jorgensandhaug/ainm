#!/usr/bin/env python3
"""Evaluate final 960 pipeline model: predict on val, compute hybrid score."""
import json
import sys
from pathlib import Path

import torch
from ultralytics import YOLO
from PIL import Image


def main():
    root = Path(__file__).resolve().parent
    weights = sys.argv[1] if len(sys.argv) > 1 else str(
        root / "runs/960_confcurr_s2_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt"
    )
    val_images = root / "data/yolo/val/images"
    out_json = root / "sweep_results/pred_eval_960_final.json"

    model = YOLO(weights)
    image_paths = sorted(
        list(val_images.glob("*.jpg")) +
        list(val_images.glob("*.jpeg")) +
        list(val_images.glob("*.png"))
    )
    print(f"Running inference on {len(image_paths)} val images with {weights}")

    predictions = []
    for img_path in image_paths:
        stem = img_path.stem
        token = stem.split("_")[-1]
        image_id = int(token)

        with Image.open(img_path) as im:
            orig_w, orig_h = im.size

        results = model.predict(
            source=str(img_path),
            imgsz=960,
            conf=0.001,
            iou=0.55,
            device=0,
            verbose=False,
            max_det=600,
        )
        for r in results:
            boxes = r.boxes
            for i in range(len(boxes)):
                xyxy = boxes.xyxy[i].cpu().numpy()
                cls_id = int(boxes.cls[i].cpu().item())
                score = float(boxes.conf[i].cpu().item())
                x1, y1, x2, y2 = xyxy
                bbox = [float(x1), float(y1), float(x2 - x1), float(y2 - y1)]
                predictions.append({
                    "image_id": image_id,
                    "category_id": cls_id,
                    "bbox": bbox,
                    "score": score,
                })

    out_json.parent.mkdir(parents=True, exist_ok=True)
    out_json.write_text(json.dumps(predictions))
    print(f"Wrote {len(predictions)} predictions to {out_json}")

    # Now run compare_predictions.py
    import subprocess
    subprocess.run([
        sys.executable,
        str(root / "compare_predictions.py"),
        "--predictions", str(out_json),
        "--val-dir", str(root / "data/yolo/val"),
        "--show-worst", "0",
        "--show-worst-classes", "10",
    ], cwd=str(root), check=True)


if __name__ == "__main__":
    main()
