from __future__ import annotations

import argparse
import json
from pathlib import Path

from ultralytics import YOLO


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Evaluate an ONNX YOLO model and report mAP@50.")
    parser.add_argument(
        "--model",
        default="model.onnx",
        help="Path to the ONNX model to validate.",
    )
    parser.add_argument(
        "--data",
        default="data/yolo/data.yaml",
        help="Path to Ultralytics data.yaml file.",
    )
    parser.add_argument(
        "--split",
        default="val",
        choices=["train", "val", "test"],
        help="Dataset split used for evaluation.",
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=640,
        help="Input image size for validation.",
    )
    parser.add_argument(
        "--batch",
        type=int,
        default=16,
        help="Batch size for validation.",
    )
    parser.add_argument(
        "--device",
        default="cpu",
        help="Device for validation, e.g. cpu or 0.",
    )
    parser.add_argument(
        "--output-json",
        default="runs/onnx_eval/metrics.json",
        help="Where to write a JSON file with key metrics.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parents[1]

    model_path = (root / args.model).resolve()
    data_path = (root / args.data).resolve()
    output_json_path = (root / args.output_json).resolve()
    output_json_path.parent.mkdir(parents=True, exist_ok=True)

    model = YOLO(str(model_path), task="detect")
    metrics = model.val(
        data=str(data_path),
        split=args.split,
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        single_cls=True,
        verbose=True,
    )

    summary = {
        "model": str(model_path),
        "data": str(data_path),
        "split": args.split,
        "map50": float(metrics.box.map50),
        "map50_95": float(metrics.box.map),
        "precision": float(metrics.box.mp),
        "recall": float(metrics.box.mr),
    }

    output_json_path.write_text(json.dumps(summary, indent=2))
    print(json.dumps(summary, indent=2))
    print(f"Metrics written to: {output_json_path}")


if __name__ == "__main__":
    main()
