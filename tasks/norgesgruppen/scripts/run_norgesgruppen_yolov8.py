#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path


def load_overrides(value: str | None) -> dict:
    if not value:
        return {}
    raw = value.strip()
    if raw.startswith("{"):
        payload = raw
    else:
        payload = Path(raw).read_text()
    parsed = json.loads(payload)
    if not isinstance(parsed, dict):
        raise ValueError("--overrides-json must parse to a JSON object")
    return parsed


def register_ultralytics_safe_globals() -> None:
    import torch
    from ultralytics.nn.tasks import (
        BaseModel,
        ClassificationModel,
        DetectionModel,
        OBBModel,
        PoseModel,
        SegmentationModel,
    )

    add_safe_globals = getattr(torch.serialization, "add_safe_globals", None)
    if add_safe_globals is None:
        return
    add_safe_globals(
        [
            BaseModel,
            DetectionModel,
            SegmentationModel,
            ClassificationModel,
            PoseModel,
            OBBModel,
        ]
    )


def relax_torch_load_weights_only() -> None:
    import torch

    original_torch_load = torch.load
    if getattr(original_torch_load, "_norgesgruppen_relaxed", False):
        return

    def patched_torch_load(*args, **kwargs):
        kwargs.setdefault("weights_only", False)
        return original_torch_load(*args, **kwargs)

    patched_torch_load._norgesgruppen_relaxed = True  # type: ignore[attr-defined]
    torch.load = patched_torch_load  # type: ignore[assignment]


def train(args: argparse.Namespace) -> None:
    from ultralytics import YOLO

    relax_torch_load_weights_only()
    register_ultralytics_safe_globals()
    model = YOLO(args.model)
    train_kwargs = {
        "data": str(Path(args.data).resolve()),
        "epochs": args.epochs,
        "imgsz": args.imgsz,
        "batch": args.batch,
        "device": args.device,
        "workers": args.workers,
        "project": str(Path(args.project).resolve()),
        "name": args.name,
        "seed": args.seed,
        "verbose": not args.quiet,
    }
    train_kwargs.update(load_overrides(args.overrides_json))
    result = model.train(
        **train_kwargs,
    )
    print(result)


def predict(args: argparse.Namespace) -> None:
    from ultralytics import YOLO

    relax_torch_load_weights_only()
    register_ultralytics_safe_globals()
    model = YOLO(args.model)
    predict_kwargs = {
        "source": str(Path(args.source).resolve()),
        "project": str(Path(args.project).resolve()),
        "name": args.name,
        "conf": args.conf,
        "iou": args.iou,
        "imgsz": args.imgsz,
        "device": args.device,
        "save_txt": True,
        "save_conf": True,
        "verbose": not args.quiet,
    }
    predict_kwargs.update(load_overrides(args.overrides_json))
    results = model.predict(
        **predict_kwargs,
    )
    print({"result_count": len(results)})


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Canonical YOLOv8 runner for NorgesGruppen experiments.")
    subparsers = parser.add_subparsers(dest="command", required=True)

    train_parser = subparsers.add_parser("train", help="Run YOLOv8 training.")
    train_parser.add_argument("--model", required=True, help="Model name or local weights path, e.g. yolov8n.pt")
    train_parser.add_argument("--data", required=True, help="Dataset yaml path")
    train_parser.add_argument("--project", required=True, help="Output project dir")
    train_parser.add_argument("--name", required=True, help="Run name")
    train_parser.add_argument("--epochs", type=int, default=50)
    train_parser.add_argument("--imgsz", type=int, default=1280)
    train_parser.add_argument("--batch", type=int, default=8)
    train_parser.add_argument("--device", default="cpu")
    train_parser.add_argument("--workers", type=int, default=0)
    train_parser.add_argument("--seed", type=int, default=20260320)
    train_parser.add_argument("--overrides-json", default=None, help="JSON object or path to JSON object merged into YOLO train kwargs")
    train_parser.add_argument("--quiet", action="store_true")
    train_parser.set_defaults(func=train)

    predict_parser = subparsers.add_parser("predict", help="Run YOLOv8 prediction and save txt outputs.")
    predict_parser.add_argument("--model", required=True, help="Weights path")
    predict_parser.add_argument("--source", required=True, help="Image directory or file")
    predict_parser.add_argument("--project", required=True, help="Output project dir")
    predict_parser.add_argument("--name", required=True, help="Run name")
    predict_parser.add_argument("--conf", type=float, default=0.001)
    predict_parser.add_argument("--iou", type=float, default=0.7)
    predict_parser.add_argument("--imgsz", type=int, default=1280)
    predict_parser.add_argument("--device", default="cpu")
    predict_parser.add_argument("--overrides-json", default=None, help="JSON object or path to JSON object merged into YOLO predict kwargs")
    predict_parser.add_argument("--quiet", action="store_true")
    predict_parser.set_defaults(func=predict)

    return parser


def main() -> None:
    parser = build_parser()
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
