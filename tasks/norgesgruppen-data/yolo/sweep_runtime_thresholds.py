from __future__ import annotations

import argparse
import json
import subprocess
import time
from pathlib import Path


def parse_metric(line: str) -> float:
    return float(line.rsplit(" ", 1)[-1].strip())


def evaluate_predictions(pred_path: Path, val_dir: Path) -> dict[str, float]:
    cmd = [
        "uv",
        "run",
        "python",
        "compare_predictions.py",
        "--predictions",
        str(pred_path),
        "--val-dir",
        str(val_dir),
        "--show-worst",
        "0",
    ]
    out = subprocess.check_output(cmd, text=True)
    metrics: dict[str, float] = {}
    for line in out.splitlines():
        if line.startswith("Detection AP@0.5"):
            metrics["det_ap50"] = parse_metric(line)
        elif line.startswith("Classification mAP@0.5 (present GT classes):"):
            metrics["cls_map50_present"] = float(line.split(":", 1)[1].split("(")[0].strip())
        elif line.startswith("Hybrid score (0.7*det + 0.3*cls, present GT classes):"):
            metrics["hybrid_present"] = parse_metric(line)
    return metrics


def run_once(args: argparse.Namespace, conf: float, out_dir: Path) -> dict[str, float]:
    tag = f"c{str(conf).replace('.', 'p')}_iou{str(args.nms_iou).replace('.', 'p')}"
    pred_path = out_dir / f"pred_{tag}.json"
    run_cmd = [
        "uv",
        "run",
        "python",
        "run.py",
        "--input",
        str(args.input_dir),
        "--output",
        str(pred_path),
        "--conf-thres",
        str(conf),
        "--nms-iou",
        str(args.nms_iou),
        "--topk-pre-nms",
        str(args.topk_pre_nms),
        "--max-det",
        str(args.max_det),
    ]
    if args.onnx:
        run_cmd.extend(["--onnx", str(args.onnx)])
    if args.disable_context_rule:
        run_cmd.append("--disable-context-rule")
    if args.allow_cpu_fallback:
        run_cmd.append("--allow-cpu-fallback")
    start = time.perf_counter()
    subprocess.run(run_cmd, check=True)
    infer_s = time.perf_counter() - start
    metrics = evaluate_predictions(pred_path, args.val_dir)
    metrics.update(
        {
            "conf": conf,
            "infer_seconds": round(infer_s, 3),
            "predictions_path": str(pred_path),
        }
    )
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Sweep detection thresholds under runtime constraints.")
    parser.add_argument("--input-dir", type=Path, default=Path("data/yolo/val/images"))
    parser.add_argument("--val-dir", type=Path, default=Path("data/yolo/val"))
    parser.add_argument("--output-json", type=Path, default=Path("threshold_runtime_sweep.json"))
    parser.add_argument("--conf-values", type=float, nargs="+", default=[0.005, 0.01, 0.02, 0.05, 0.1])
    parser.add_argument("--nms-iou", type=float, default=0.45)
    parser.add_argument("--topk-pre-nms", type=int, default=0)
    parser.add_argument("--max-det", type=int, default=0)
    parser.add_argument(
        "--onnx",
        type=Path,
        default=None,
        help="Optional ONNX path (relative to repo root if not absolute).",
    )
    parser.add_argument(
        "--disable-context-rule",
        action="store_true",
        help="Match benchmark runs that disable context reranking.",
    )
    parser.add_argument(
        "--allow-cpu-fallback",
        action="store_true",
        help="Allow CPU-only ORT (local debugging).",
    )
    args = parser.parse_args()

    out_dir = args.output_json.parent / "sweep_preds"
    out_dir.mkdir(parents=True, exist_ok=True)
    results = [run_once(args, conf, out_dir) for conf in args.conf_values]
    best = max(results, key=lambda row: row["hybrid_present"])
    payload = {"results": results, "best_by_hybrid_present": best}
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
