from __future__ import annotations

import argparse
import shutil
from pathlib import Path

import torch
from timm import create_model
from ultralytics import YOLO


def export_yolo_to_onnx(
    weights_path: Path | str,
    output_path: Path | str,
    imgsz: int = 640,
    opset: int = 17,
    dynamic: bool = False,
    fp16: bool = False,
) -> Path:
    """Export a trained Ultralytics YOLO detector to ONNX."""
    weights = Path(weights_path).expanduser().resolve()
    output = Path(output_path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    model = YOLO(str(weights))
    exported_path = model.export(
        format="onnx",
        imgsz=imgsz,
        simplify=True,
        dynamic=dynamic,
        opset=opset,
        half=fp16,
    )

    exported = Path(exported_path).resolve()
    if exported != output:
        shutil.copy2(exported, output)
    return output


def export_dino_to_onnx(
    model_name: str,
    output_path: Path | str,
    image_size: int = 518,
    opset: int = 17,
    device: str = "cpu",
) -> Path:
    """Export a timm DINOv2 embedder to ONNX."""
    output = Path(output_path).expanduser().resolve()
    output.parent.mkdir(parents=True, exist_ok=True)

    export_device = torch.device(device)
    model = create_model(model_name, pretrained=True, num_classes=0)
    model.eval().to(export_device)

    dummy = torch.randn(1, 3, image_size, image_size, device=export_device)
    input_names = ["images"]
    output_names = ["embeddings"]
    dynamic_axes = {
        "images": {0: "batch"},
        "embeddings": {0: "batch"},
    }

    export_kwargs = {
        "export_params": True,
        "do_constant_folding": True,
        "input_names": input_names,
        "output_names": output_names,
        "dynamic_axes": dynamic_axes,
        "opset_version": opset,
    }
    try:
        # Keep weights embedded in a single .onnx file.
        torch.onnx.export(
            model,
            dummy,
            str(output),
            external_data=False,
            **export_kwargs,
        )
    except TypeError:
        # Compatibility with older torch versions.
        torch.onnx.export(
            model,
            dummy,
            str(output),
            use_external_data_format=False,
            **export_kwargs,
        )
    return output


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export models to ONNX.")
    subparsers = parser.add_subparsers(dest="model_type", required=True)

    yolo_parser = subparsers.add_parser("yolo", help="Export a YOLO detector.")
    yolo_parser.add_argument("--weights", required=True, help="Path to YOLO .pt weights.")
    yolo_parser.add_argument("--output", required=True, help="Path for ONNX output.")
    yolo_parser.add_argument("--imgsz", type=int, default=640, help="Input image size.")
    yolo_parser.add_argument("--opset", type=int, default=17, help="ONNX opset version.")
    yolo_parser.add_argument(
        "--dynamic",
        action="store_true",
        help="Use dynamic input/image axes.",
    )
    yolo_parser.add_argument(
        "--fp16",
        action="store_true",
        help="Export model in FP16 where supported.",
    )

    dino_parser = subparsers.add_parser("dino", help="Export a DINOv2 embedder.")
    dino_parser.add_argument(
        "--model",
        default="vit_small_patch14_dinov2.lvd142m",
        help="timm model name.",
    )
    dino_parser.add_argument("--output", required=True, help="Path for ONNX output.")
    dino_parser.add_argument(
        "--image-size",
        type=int,
        default=518,
        help="Square input size for export.",
    )
    dino_parser.add_argument("--opset", type=int, default=17, help="ONNX opset version.")
    dino_parser.add_argument(
        "--device",
        default="cpu",
        choices=["cpu", "cuda"],
        help="Device used while exporting.",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    if args.model_type == "yolo":
        output = export_yolo_to_onnx(
            weights_path=args.weights,
            output_path=args.output,
            imgsz=args.imgsz,
            opset=args.opset,
            dynamic=args.dynamic,
            fp16=args.fp16,
        )
    else:
        output = export_dino_to_onnx(
            model_name=args.model,
            output_path=args.output,
            image_size=args.image_size,
            opset=args.opset,
            device=args.device,
        )
    print(f"ONNX model written to: {output}")


if __name__ == "__main__":
    main()