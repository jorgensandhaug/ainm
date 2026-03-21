#!/usr/bin/env python3
"""Run ONNX inference on val + print compare_predictions metrics (one command)."""
from __future__ import annotations

import argparse
import subprocess
import sys
from pathlib import Path


def main() -> None:
    root = Path(__file__).resolve().parents[1]
    parser = argparse.ArgumentParser(description="Evaluate predictions on data/yolo/val.")
    parser.add_argument("--onnx", type=Path, default=Path("model.onnx"))
    parser.add_argument("--out", type=Path, default=Path("sweep_results/pred_eval.json"))
    parser.add_argument("--conf-thres", type=float, default=0.0005)
    parser.add_argument("--nms-iou", type=float, default=0.55)
    parser.add_argument(
        "--allow-cpu-fallback",
        action="store_true",
        help="Pass through to run.py (local debugging).",
    )
    args = parser.parse_args()

    out_path = args.out if args.out.is_absolute() else root / args.out
    onnx_path = args.onnx if args.onnx.is_absolute() else root / args.onnx

    run_py = [
        sys.executable,
        str(root / "run.py"),
        "--onnx",
        str(onnx_path),
        "--input",
        str(root / "data/yolo/val/images"),
        "--output",
        str(out_path),
        "--conf-thres",
        str(args.conf_thres),
        "--nms-iou",
        str(args.nms_iou),
        "--disable-context-rule",
    ]
    if args.allow_cpu_fallback:
        run_py.append("--allow-cpu-fallback")

    subprocess.run(run_py, cwd=str(root), check=True)

    cmp_py = [
        sys.executable,
        str(root / "compare_predictions.py"),
        "--predictions",
        str(out_path),
        "--val-dir",
        str(root / "data/yolo/val"),
        "--show-worst",
        "0",
    ]
    subprocess.run(cmp_py, cwd=str(root), check=True)


if __name__ == "__main__":
    main()
