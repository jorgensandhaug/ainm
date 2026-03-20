#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path
from tempfile import TemporaryDirectory
from typing import Any

from eval_norgesgruppen_predictions import evaluate_predictions
from norgesgruppen_prep_common import display_path, write_json


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--pipeline-dir",
        required=True,
        help="Directory containing EXP-0008-style predictions and retrieval assignments.",
    )
    parser.add_argument(
        "--output",
        help="Optional output JSON path. Defaults to <pipeline-dir>/score-fusion-sweep.json",
    )
    return parser.parse_args()


def prediction_key(image_id: int, bbox: list[float], score: float) -> tuple[int, tuple[float, float, float, float], float]:
    return (
        int(image_id),
        tuple(round(float(value), 4) for value in bbox),
        round(float(score), 6),
    )


def load_inputs(pipeline_dir: Path) -> tuple[list[dict[str, Any]], dict[tuple[int, tuple[float, float, float, float], float], dict[str, Any]]]:
    predictions = json.loads((pipeline_dir / "artifacts" / "predictions.json").read_text())
    assignments = []
    with (pipeline_dir / "artifacts" / "retrieval-assignments.jsonl").open() as handle:
        for line in handle:
            assignments.append(json.loads(line))
    assignment_by_key = {
        prediction_key(row["image_id"], row["bbox"], row["detector_score"]): row
        for row in assignments
    }
    return predictions, assignment_by_key


def build_variants() -> list[tuple[str, str, Any]]:
    return [
        ("detector_only", "detector_score", lambda score, top1, margin: score),
        ("times_top1", "detector_score * retrieval_top1_score", lambda score, top1, margin: score * top1),
        ("times_top1_sqrt", "detector_score * sqrt(retrieval_top1_score)", lambda score, top1, margin: score * math.sqrt(max(top1, 0.0))),
        ("times_blend_05", "detector_score * (0.5 + 0.5 * retrieval_top1_score)", lambda score, top1, margin: score * (0.5 + 0.5 * top1)),
        ("times_marginx10_cap1", "detector_score * clip(retrieval_margin * 10, 0, 1)", lambda score, top1, margin: score * min(max(margin * 10.0, 0.0), 1.0)),
        ("times_margin_plus_025", "detector_score * min(1, 0.25 + retrieval_margin * 5)", lambda score, top1, margin: score * min(1.0, 0.25 + margin * 5.0)),
        ("gate_margin_0025", "detector_score * (1.0 if retrieval_margin >= 0.025 else 0.25)", lambda score, top1, margin: score * (1.0 if margin >= 0.025 else 0.25)),
        ("gate_margin_005", "detector_score * (1.0 if retrieval_margin >= 0.05 else 0.25)", lambda score, top1, margin: score * (1.0 if margin >= 0.05 else 0.25)),
    ]


def evaluate_variant(
    predictions: list[dict[str, Any]],
    assignment_by_key: dict[tuple[int, tuple[float, float, float, float], float], dict[str, Any]],
    score_fn: Any,
) -> dict[str, Any]:
    rescored_predictions = []
    for prediction in predictions:
        assignment = assignment_by_key[prediction_key(prediction["image_id"], prediction["bbox"], prediction["score"])]
        rescored_predictions.append(
            {
                **prediction,
                "score": round(
                    float(
                        score_fn(
                            float(prediction["score"]),
                            float(assignment["retrieval_top1_score"]),
                            float(assignment["retrieval_margin"]),
                        )
                    ),
                    6,
                ),
            }
        )
    with TemporaryDirectory() as tempdir:
        predictions_path = Path(tempdir) / "predictions.json"
        predictions_path.write_text(json.dumps(rescored_predictions))
        return evaluate_predictions(predictions_path, None, 0.05)["metrics"]["global"]


def main() -> None:
    args = parse_args()
    pipeline_dir = Path(args.pipeline_dir)
    output_path = Path(args.output) if args.output else pipeline_dir / "score-fusion-sweep.json"

    predictions, assignment_by_key = load_inputs(pipeline_dir)
    rows = []
    for variant_id, description, score_fn in build_variants():
        metrics = evaluate_variant(predictions, assignment_by_key, score_fn)
        rows.append(
            {
                "variant_id": variant_id,
                "score_formula": description,
                "detection_ap50_ignore_class": metrics["detection_ap50_ignore_class"],
                "classification_map50": metrics["classification_map50"],
                "hybrid_proxy": metrics["hybrid_proxy"],
            }
        )
    best_by_hybrid = max(rows, key=lambda row: row["hybrid_proxy"])
    output = {
        "pipeline_dir": display_path(pipeline_dir),
        "variant_count": len(rows),
        "best_by_hybrid": best_by_hybrid,
        "variants": rows,
    }
    write_json(output_path, output)
    print(json.dumps(output, indent=2))


if __name__ == "__main__":
    main()
