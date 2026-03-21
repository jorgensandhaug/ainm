from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def run_cmd(cmd: list[str]) -> str:
    return subprocess.check_output(cmd, text=True)


def parse_metrics(text: str) -> dict[str, float]:
    out: dict[str, float] = {}
    for line in text.splitlines():
        if line.startswith("Detection AP@0.5"):
            out["det_ap50"] = float(line.rsplit(" ", 1)[-1])
        elif line.startswith("Classification mAP@0.5 (present GT classes):"):
            out["cls_map50_present"] = float(line.split(":", 1)[1].split("(")[0].strip())
        elif line.startswith("Hybrid score (0.7*det + 0.3*cls, present GT classes):"):
            out["hybrid_present"] = float(line.rsplit(" ", 1)[-1])
        elif line.startswith("Pred boxes:"):
            out["pred_boxes"] = float(line.rsplit(" ", 1)[-1])
    return out


def run_variant(
    name: str,
    run_args: list[str],
    input_dir: Path,
    val_dir: Path,
    workdir: Path,
) -> dict:
    pred_path = workdir / "sweep_results" / f"rerank_{name}.json"
    pred_path.parent.mkdir(parents=True, exist_ok=True)
    infer_cmd = [
        "uv",
        "run",
        "python",
        "run.py",
        "--input",
        str(input_dir),
        "--output",
        str(pred_path),
        *run_args,
    ]
    subprocess.run(infer_cmd, check=True)
    eval_cmd = [
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
    metrics = parse_metrics(run_cmd(eval_cmd))
    return {"name": name, "args": run_args, "predictions": str(pred_path), **metrics}


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark reranking rule variants.")
    parser.add_argument("--input-dir", type=Path, default=Path("data/yolo/val/images"))
    parser.add_argument("--val-dir", type=Path, default=Path("data/yolo/val"))
    parser.add_argument("--output-json", type=Path, default=Path("sweep_results/reranking_benchmark.json"))
    args = parser.parse_args()

    workdir = Path(__file__).resolve().parents[1]
    variants = [
        ("baseline", ["--disable-context-rule", "--conf-thres", "0.0005", "--nms-iou", "0.55"]),
        ("context_only", ["--conf-thres", "0.0005", "--nms-iou", "0.55", "--context-alpha", "0.15", "--context-topk", "60"]),
        (
            "context_plus_neighbor",
            [
                "--conf-thres",
                "0.0005",
                "--nms-iou",
                "0.55",
                "--context-alpha",
                "0.15",
                "--context-topk",
                "60",
                "--enable-neighbor-rule",
                "--neighbor-alpha",
                "0.12",
                "--neighbor-k",
                "6",
                "--neighbor-self-weight",
                "0.5",
            ],
        ),
    ]

    rows = [run_variant(name, run_args, args.input_dir, args.val_dir, workdir) for name, run_args in variants]
    rows.sort(key=lambda x: x.get("hybrid_present", 0.0), reverse=True)
    payload = {"results": rows, "best": rows[0] if rows else None}
    args.output_json.parent.mkdir(parents=True, exist_ok=True)
    args.output_json.write_text(json.dumps(payload, indent=2))
    print(json.dumps(payload, indent=2))


if __name__ == "__main__":
    main()
