from __future__ import annotations

import argparse
import shutil
from pathlib import Path

from ultralytics import YOLO


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export a trained YOLO model to ONNX.")
    parser.add_argument(
        "--weights",
        default="runs/detect2/weights/best.pt",
        help="Path to trained .pt weights.",
    )
    parser.add_argument(
        "--output",
        default="model.onnx",
        help="Where to write the ONNX file.",
    )
    parser.add_argument(
        "--imgsz",
        type=int,
        default=640,
        help="Input image size used for export.",
    )
    parser.add_argument(
        "--opset",
        type=int,
        default=12,
        help="ONNX opset version.",
    )
    parser.add_argument(
        "--dynamic",
        action="store_true",
        help="Export with dynamic axes (variable batch/image size).",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    root = Path(__file__).resolve().parents[1]

    weights_path = (root / args.weights).resolve()
    output_path = (root / args.output).resolve()
    output_path.parent.mkdir(parents=True, exist_ok=True)

    model = YOLO(str(weights_path))
    exported_path = model.export(
        format="onnx",
        imgsz=args.imgsz,
        simplify=True,
        dynamic=args.dynamic,
        opset=args.opset,
    )

    exported_path = Path(exported_path).resolve()
    if exported_path != output_path:
        shutil.copy2(exported_path, output_path)

    print(f"ONNX model written to: {output_path}")


if __name__ == "__main__":
    main()
