#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

from eval_norgesgruppen_predictions import build_context, evaluate_predictions, filter_predictions, match_predictions
from norgesgruppen_prep_common import display_path, read_json, write_json


def build_oracle_class_predictions(
    predictions_path: Path,
    background_category_id: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    context = build_context()
    raw_predictions = read_json(predictions_path)
    if not isinstance(raw_predictions, list):
        raise ValueError("predictions json must contain a top-level array")

    predictions, filtered_meta = filter_predictions(raw_predictions, context["val_image_ids"])
    detection_match = match_predictions(context["annotations"], predictions)
    gt_by_id = {
        annotation["id"]: annotation
        for annotation in context["annotations"]
    }

    oracle_predictions = []
    assignment_source_counts = Counter()
    reassignment_pair_counts = Counter()
    per_prediction_examples = []

    prediction_results_by_index = {
        row["prediction_index"]: row
        for row in detection_match["prediction_results"]
    }

    for prediction in predictions:
        result = prediction_results_by_index[prediction["prediction_index"]]
        if result["matched_gt_id"] is not None:
            oracle_category_id = gt_by_id[result["matched_gt_id"]]["category_id"]
            assignment_source = "matched_tp"
        elif result["best_gt_category_id_any"] is not None and result["best_iou_any_gt"] >= 0.5:
            oracle_category_id = int(result["best_gt_category_id_any"])
            assignment_source = "duplicate_or_overlap"
        else:
            oracle_category_id = background_category_id
            assignment_source = "background_fallback"

        assignment_source_counts[assignment_source] += 1
        if oracle_category_id != prediction["category_id"]:
            reassignment_pair_counts[(prediction["category_id"], oracle_category_id)] += 1

        if len(per_prediction_examples) < 20:
            per_prediction_examples.append(
                {
                    "prediction_index": prediction["prediction_index"],
                    "image_id": prediction["image_id"],
                    "original_category_id": prediction["category_id"],
                    "oracle_category_id": oracle_category_id,
                    "assignment_source": assignment_source,
                    "score": prediction["score"],
                    "best_iou_any_gt": result["best_iou_any_gt"],
                    "matched_gt_id": result["matched_gt_id"],
                    "best_gt_id_any": result["best_gt_id_any"],
                }
            )

        oracle_predictions.append(
            {
                "image_id": prediction["image_id"],
                "category_id": oracle_category_id,
                "bbox": prediction["bbox"],
                "score": prediction["score"],
            }
        )

    manifest = {
        "source_predictions_path": display_path(predictions_path),
        "background_category_id": background_category_id,
        "prediction_filtering": filtered_meta,
        "source_prediction_count": len(predictions),
        "assignment_source_counts": dict(sorted(assignment_source_counts.items())),
        "reassigned_prediction_count": sum(reassignment_pair_counts.values()),
        "top_reassignment_pairs": [
            {
                "from_category_id": from_category_id,
                "to_category_id": to_category_id,
                "count": count,
            }
            for (from_category_id, to_category_id), count in reassignment_pair_counts.most_common(20)
        ],
        "example_rows": per_prediction_examples,
    }
    return oracle_predictions, manifest


def run_oracle_class_bound(
    predictions_path: Path,
    output_dir: Path,
    background_category_id: int,
    count_score_threshold: float,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    oracle_predictions, manifest = build_oracle_class_predictions(
        predictions_path=predictions_path,
        background_category_id=background_category_id,
    )
    oracle_predictions_path = output_dir / "predictions.json"
    write_json(oracle_predictions_path, oracle_predictions)

    eval_result = evaluate_predictions(
        predictions_path=oracle_predictions_path,
        output_dir=output_dir,
        count_score_threshold=count_score_threshold,
    )
    summary = {
        "source_predictions_path": display_path(predictions_path),
        "oracle_predictions_path": display_path(oracle_predictions_path),
        "output_dir": display_path(output_dir),
        "background_category_id": background_category_id,
        "count_score_threshold": count_score_threshold,
        "oracle_class_manifest": manifest,
        "metrics": eval_result["metrics"],
    }
    write_json(output_dir / "bound_manifest.json", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate detector-box oracle-class bounds by relabeling saved predictions with oracle GT categories."
    )
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--background-category-id", type=int, default=0)
    parser.add_argument("--count-score-threshold", type=float, default=0.05)
    args = parser.parse_args()

    summary = run_oracle_class_bound(
        predictions_path=args.predictions,
        output_dir=args.output_dir,
        background_category_id=args.background_category_id,
        count_score_threshold=args.count_score_threshold,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
