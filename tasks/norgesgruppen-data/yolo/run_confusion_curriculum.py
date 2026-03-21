from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path


def run(cmd: list[str], cwd: Path) -> None:
    print(f"$ {' '.join(cmd)}")
    subprocess.run(cmd, cwd=str(cwd), check=True)


def train_run_name(run_tag: str, epochs: int, imgsz: int, batch: int, lr0: float, mixup: float, copy_paste: float, seed: int) -> str:
    return (
        f"{run_tag}_e{epochs}_img{imgsz}_b{batch}_"
        f"lr{lr0:g}_mix{mixup:g}_cp{copy_paste:g}_seed{seed}"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description="Two-stage confusion-pair curriculum fine-tune.")
    parser.add_argument("--base-weights", type=Path, required=True, help="Starting .pt weights")
    parser.add_argument("--src-yolo-root", type=Path, default=Path("data/yolo"))
    parser.add_argument("--confusion-json", type=Path, default=Path("sweep_results/error_analysis.json"))
    parser.add_argument("--curriculum-root", type=Path, default=Path("data/yolo_confusion_curriculum"))
    parser.add_argument("--seed", type=int, default=123)
    parser.add_argument("--imgsz", type=int, default=640)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--workers", type=int, default=8)

    parser.add_argument("--build-top-pairs", type=int, default=30)
    parser.add_argument("--build-max-repeats", type=int, default=4)
    parser.add_argument("--build-pair-boost", type=float, default=1.3)
    parser.add_argument("--build-class-boost", type=float, default=0.5)

    parser.add_argument("--stage1-epochs", type=int, default=12)
    parser.add_argument("--stage1-lr0", type=float, default=2e-4)
    parser.add_argument("--stage1-lrf", type=float, default=0.05)
    parser.add_argument("--stage1-freeze", type=int, default=10)
    parser.add_argument("--stage1-mixup", type=float, default=0.02)
    parser.add_argument("--stage1-copy-paste", type=float, default=0.03)
    parser.add_argument("--stage1-hsv-s", type=float, default=0.35)
    parser.add_argument("--stage1-hsv-v", type=float, default=0.25)
    parser.add_argument("--stage1-tag", default="confcurr_s1")

    parser.add_argument("--stage2-epochs", type=int, default=18)
    parser.add_argument("--stage2-lr0", type=float, default=8e-5)
    parser.add_argument("--stage2-lrf", type=float, default=0.03)
    parser.add_argument("--stage2-freeze", type=int, default=16)
    parser.add_argument("--stage2-mixup", type=float, default=0.0)
    parser.add_argument("--stage2-copy-paste", type=float, default=0.0)
    parser.add_argument("--stage2-hsv-s", type=float, default=0.2)
    parser.add_argument("--stage2-hsv-v", type=float, default=0.15)
    parser.add_argument("--stage2-tag", default="confcurr_s2")

    parser.add_argument("--skip-build", action="store_true")
    args = parser.parse_args()

    repo = Path(__file__).resolve().parents[1]

    if not args.skip_build:
        build_cmd = [
            "uv",
            "run",
            "python",
            "yolo/build_confusion_curriculum_dataset.py",
            "--src-yolo-root",
            str(args.src_yolo_root),
            "--confusion-json",
            str(args.confusion_json),
            "--output-root",
            str(args.curriculum_root),
            "--top-pairs",
            str(args.build_top_pairs),
            "--max-repeats",
            str(args.build_max_repeats),
            "--pair-boost",
            str(args.build_pair_boost),
            "--class-boost",
            str(args.build_class_boost),
        ]
        run(build_cmd, cwd=repo)

    curriculum_yaml = args.curriculum_root / "data.yaml"
    full_yaml = args.src_yolo_root / "data.yaml"

    stage1_cmd = [
        "uv",
        "run",
        "python",
        "yolo/train.py",
        "--weights",
        str(args.base_weights),
        "--data",
        str(curriculum_yaml),
        "--epochs",
        str(args.stage1_epochs),
        "--imgsz",
        str(args.imgsz),
        "--batch",
        str(args.batch),
        "--lr0",
        str(args.stage1_lr0),
        "--lrf",
        str(args.stage1_lrf),
        "--optimizer",
        "AdamW",
        "--weight-decay",
        "0.0004",
        "--warmup-epochs",
        "1.0",
        "--patience",
        "20",
        "--close-mosaic",
        "10",
        "--mixup",
        str(args.stage1_mixup),
        "--copy-paste",
        str(args.stage1_copy_paste),
        "--hsv-h",
        "0.01",
        "--hsv-s",
        str(args.stage1_hsv_s),
        "--hsv-v",
        str(args.stage1_hsv_v),
        "--translate",
        "0.06",
        "--scale",
        "0.25",
        "--degrees",
        "0.0",
        "--fliplr",
        "0.5",
        "--freeze",
        str(args.stage1_freeze),
        "--workers",
        str(args.workers),
        "--seed",
        str(args.seed),
        "--run-tag",
        args.stage1_tag,
    ]
    run(stage1_cmd, cwd=repo)

    stage1_name = train_run_name(
        run_tag=args.stage1_tag,
        epochs=args.stage1_epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        lr0=args.stage1_lr0,
        mixup=args.stage1_mixup,
        copy_paste=args.stage1_copy_paste,
        seed=args.seed,
    )
    stage1_best = repo / "runs" / stage1_name / "weights" / "best.pt"

    stage2_cmd = [
        "uv",
        "run",
        "python",
        "yolo/train.py",
        "--weights",
        str(stage1_best),
        "--data",
        str(full_yaml),
        "--epochs",
        str(args.stage2_epochs),
        "--imgsz",
        str(args.imgsz),
        "--batch",
        str(args.batch),
        "--lr0",
        str(args.stage2_lr0),
        "--lrf",
        str(args.stage2_lrf),
        "--optimizer",
        "AdamW",
        "--weight-decay",
        "0.00035",
        "--warmup-epochs",
        "1.0",
        "--patience",
        "25",
        "--close-mosaic",
        "15",
        "--mixup",
        str(args.stage2_mixup),
        "--copy-paste",
        str(args.stage2_copy_paste),
        "--hsv-h",
        "0.008",
        "--hsv-s",
        str(args.stage2_hsv_s),
        "--hsv-v",
        str(args.stage2_hsv_v),
        "--translate",
        "0.04",
        "--scale",
        "0.18",
        "--degrees",
        "0.0",
        "--fliplr",
        "0.5",
        "--freeze",
        str(args.stage2_freeze),
        "--workers",
        str(args.workers),
        "--seed",
        str(args.seed),
        "--run-tag",
        args.stage2_tag,
    ]
    run(stage2_cmd, cwd=repo)

    stage2_name = train_run_name(
        run_tag=args.stage2_tag,
        epochs=args.stage2_epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        lr0=args.stage2_lr0,
        mixup=args.stage2_mixup,
        copy_paste=args.stage2_copy_paste,
        seed=args.seed,
    )
    stage2_best = repo / "runs" / stage2_name / "weights" / "best.pt"

    report = {
        "base_weights": str(args.base_weights),
        "confusion_json": str(args.confusion_json),
        "curriculum_yaml": str(curriculum_yaml),
        "full_yaml": str(full_yaml),
        "stage1": {"run_name": stage1_name, "best_pt": str(stage1_best)},
        "stage2": {"run_name": stage2_name, "best_pt": str(stage2_best)},
    }
    out = repo / "sweep_results" / "confusion_curriculum_runs.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(report, indent=2))
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
