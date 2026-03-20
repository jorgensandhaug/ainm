#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from convert_yolo_txt_predictions import convert_predictions
from eval_norgesgruppen_class_agnostic_detection import evaluate_predictions as evaluate_detection_predictions
from eval_norgesgruppen_oracle_class_bound import run_oracle_class_bound
from norgesgruppen_prep_common import ROOT, VAL_COCO_JSON, display_path, reset_dir, write_json
from run_norgesgruppen_yolov8 import register_ultralytics_safe_globals, relax_torch_load_weights_only


def read_last_results_row(results_csv: Path) -> dict[str, Any] | None:
    if not results_csv.exists():
        return None
    rows = list(csv.DictReader(results_csv.open()))
    if not rows:
        return None
    row = rows[-1]
    clean = {key.strip(): value.strip() for key, value in row.items()}
    parsed: dict[str, Any] = {}
    for key, value in clean.items():
        try:
            parsed[key] = int(value)
        except ValueError:
            try:
                parsed[key] = float(value)
            except ValueError:
                parsed[key] = value
    return parsed


def run_prediction(
    weights_path: Path,
    source: Path,
    output_dir: Path,
    conf: float,
    iou: float,
    imgsz: int,
    device: str,
) -> dict[str, Any]:
    from ultralytics import YOLO

    relax_torch_load_weights_only()
    register_ultralytics_safe_globals()

    reset_dir(output_dir)
    model = YOLO(str(weights_path))
    results = model.predict(
        source=str(source.resolve()),
        project=str(output_dir.parent.resolve()),
        name=output_dir.name,
        conf=conf,
        iou=iou,
        imgsz=imgsz,
        device=device,
        save_txt=True,
        save_conf=True,
        verbose=False,
        exist_ok=True,
    )
    labels_dir = output_dir / "labels"
    if not labels_dir.exists():
        raise FileNotFoundError(f"Expected YOLO labels dir to exist: {labels_dir}")
    return {
        "weights_path": display_path(weights_path),
        "source": display_path(source),
        "output_dir": display_path(output_dir),
        "labels_dir": display_path(labels_dir),
        "result_count": len(results),
        "conf": conf,
        "iou": iou,
        "imgsz": imgsz,
        "device": device,
    }


def finalize_run(
    run_dir: Path,
    source: Path,
    predict_dir: Path,
    predictions_json: Path,
    eval_dir: Path,
    oracle_dir: Path | None,
    conf: float,
    iou: float,
    imgsz: int,
    device: str,
    force_category_id: int | None,
    count_score_threshold: float,
) -> dict[str, Any]:
    weights_path = run_dir / "weights" / "best.pt"
    if not weights_path.exists():
        raise FileNotFoundError(f"Missing weights file: {weights_path}")

    prediction_summary = run_prediction(
        weights_path=weights_path,
        source=source,
        output_dir=predict_dir,
        conf=conf,
        iou=iou,
        imgsz=imgsz,
        device=device,
    )

    predictions_json.parent.mkdir(parents=True, exist_ok=True)
    convert_summary = convert_predictions(
        input_dir=predict_dir / "labels",
        output_json=predictions_json,
        coco_json=VAL_COCO_JSON,
        force_category_id=force_category_id,
    )

    eval_result = evaluate_detection_predictions(
        predictions_path=predictions_json,
        output_dir=eval_dir,
        label=f"{run_dir.name}_canonical_eval",
        count_score_threshold=count_score_threshold,
    )

    oracle_summary = None
    if oracle_dir is not None:
        oracle_summary = run_oracle_class_bound(
            predictions_path=predictions_json,
            output_dir=oracle_dir,
            background_category_id=0,
            count_score_threshold=0.05,
        )

    summary = {
        "run_dir": display_path(run_dir),
        "weights_path": display_path(weights_path),
        "results_csv_row": read_last_results_row(run_dir / "results.csv"),
        "prediction": prediction_summary,
        "conversion": convert_summary,
        "canonical_eval": {
            "metrics_path": display_path(eval_dir / "metrics.json"),
            "error_summary_path": display_path(eval_dir / "error_summary.json"),
            "overall": eval_result["metrics"]["overall"],
        },
        "oracle_class_bound": None
        if oracle_summary is None
        else {
            "output_dir": oracle_summary["output_dir"],
            "metrics_path": display_path(oracle_dir / "metrics.json"),
            "bound_manifest_path": display_path(oracle_dir / "bound_manifest.json"),
            "global": oracle_summary["metrics"]["global"],
        },
    }
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Finalize a YOLO detector run by predicting val, converting outputs, scoring canonically, and optionally computing oracle-class bounds.")
    parser.add_argument("--run-dir", type=Path, required=True)
    parser.add_argument("--source", type=Path, default=ROOT / "data" / "2026-03-19" / "derived" / "yolo-class-agnostic" / "images" / "val")
    parser.add_argument("--predict-dir", type=Path, required=True)
    parser.add_argument("--predictions-json", type=Path, required=True)
    parser.add_argument("--eval-dir", type=Path, required=True)
    parser.add_argument("--oracle-dir", type=Path, default=None)
    parser.add_argument("--conf", type=float, default=0.001)
    parser.add_argument("--iou", type=float, default=0.7)
    parser.add_argument("--imgsz", type=int, default=1280)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--force-category-id", type=int, default=0)
    parser.add_argument("--count-score-threshold", type=float, default=0.25)
    parser.add_argument("--summary-json", type=Path, default=None)
    args = parser.parse_args()

    summary = finalize_run(
        run_dir=args.run_dir,
        source=args.source,
        predict_dir=args.predict_dir,
        predictions_json=args.predictions_json,
        eval_dir=args.eval_dir,
        oracle_dir=args.oracle_dir,
        conf=args.conf,
        iou=args.iou,
        imgsz=args.imgsz,
        device=args.device,
        force_category_id=args.force_category_id,
        count_score_threshold=args.count_score_threshold,
    )
    if args.summary_json is not None:
        write_json(args.summary_json, summary)
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
