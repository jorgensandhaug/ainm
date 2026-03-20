#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from eval_norgesgruppen_predictions import build_context, filter_predictions, match_predictions
from norgesgruppen_prep_common import ROOT, display_path, write_json


SUPPORTED_READINESS_BUCKETS = {
    "ambiguous_reference",
    "exact_reference_high_view",
    "exact_reference_low_view",
    "exact_reference_medium_view",
    "provisional_alias_reference",
}

MARGIN_BINS = [
    ("lt_0.01", 0.0, 0.01),
    ("0.01_to_0.025", 0.01, 0.025),
    ("0.025_to_0.05", 0.025, 0.05),
    ("0.05_to_0.1", 0.05, 0.1),
    ("ge_0.1", 0.1, None),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--pipeline-dir",
        required=True,
        help="Directory containing EXP-0008-style artifacts and eval outputs.",
    )
    parser.add_argument(
        "--output",
        help="Optional output JSON path. Defaults to <pipeline-dir>/retrieval-analysis.json",
    )
    return parser.parse_args()


def prediction_key(image_id: int, bbox: list[float], score: float) -> tuple[int, tuple[float, float, float, float], float]:
    return (
        int(image_id),
        tuple(round(float(value), 4) for value in bbox),
        round(float(score), 6),
    )


def aggregate_rows(rows: list[dict[str, Any]]) -> dict[str, Any]:
    if not rows:
        return {
            "count": 0,
            "top1_rate": 0.0,
            "top5_rate": 0.0,
            "top1_score_mean": 0.0,
            "margin_mean": 0.0,
        }
    count = len(rows)
    return {
        "count": count,
        "top1_rate": round(sum(row["top1_hit"] for row in rows) / count, 6),
        "top5_rate": round(sum(row["top5_hit"] for row in rows) / count, 6),
        "top1_score_mean": round(sum(row["retrieval_top1_score"] for row in rows) / count, 6),
        "margin_mean": round(sum(row["retrieval_margin"] for row in rows) / count, 6),
    }


def assign_margin_bin(margin: float) -> str:
    for label, lower, upper in MARGIN_BINS:
        if margin < lower:
            continue
        if upper is None or margin < upper:
            return label
    raise AssertionError(f"Unhandled margin: {margin}")


def main() -> None:
    args = parse_args()
    pipeline_dir = Path(args.pipeline_dir)
    output_path = Path(args.output) if args.output else pipeline_dir / "retrieval-analysis.json"

    predictions_path = pipeline_dir / "artifacts" / "predictions.json"
    assignments_path = pipeline_dir / "artifacts" / "retrieval-assignments.jsonl"
    summary_path = pipeline_dir / "summary.json"

    if not predictions_path.is_file():
        raise FileNotFoundError(predictions_path)
    if not assignments_path.is_file():
        raise FileNotFoundError(assignments_path)

    context = build_context()
    predictions_raw = json.loads(predictions_path.read_text())
    predictions, prediction_meta = filter_predictions(predictions_raw, context["val_image_ids"])
    match = match_predictions(context["annotations"], predictions)
    annotations_by_id = {row["id"]: row for row in context["annotations"]}

    match_by_prediction_key = {}
    for prediction, result in zip(predictions, match["prediction_results"], strict=True):
        match_by_prediction_key[prediction_key(prediction["image_id"], prediction["bbox"], prediction["score"])] = result

    rows = []
    unmatched_assignment_count = 0
    non_tp_assignment_count = 0
    with assignments_path.open() as handle:
        for line in handle:
            assignment = json.loads(line)
            result = match_by_prediction_key.get(
                prediction_key(assignment["image_id"], assignment["bbox"], assignment["detector_score"])
            )
            if result is None:
                unmatched_assignment_count += 1
                continue
            if not result["is_true_positive"]:
                non_tp_assignment_count += 1
                continue
            annotation = annotations_by_id[result["matched_gt_id"]]
            top_candidates = assignment["top_candidates"]
            top_category_ids = [candidate["category_id"] for candidate in top_candidates]
            rows.append(
                {
                    "image_id": assignment["image_id"],
                    "prediction_index": assignment["prediction_index"],
                    "gt_category_id": annotation["category_id"],
                    "theme": annotation["theme"],
                    "readiness_bucket": annotation["readiness_bucket"],
                    "retrieval_top1_score": float(assignment["retrieval_top1_score"]),
                    "retrieval_margin": float(assignment["retrieval_margin"]),
                    "top1_hit": int(bool(top_category_ids) and top_category_ids[0] == annotation["category_id"]),
                    "top5_hit": int(annotation["category_id"] in top_category_ids),
                    "margin_bin": assign_margin_bin(float(assignment["retrieval_margin"])),
                }
            )

    by_theme = defaultdict(list)
    by_readiness = defaultdict(list)
    by_margin_bin = defaultdict(list)
    for row in rows:
        by_theme[row["theme"]].append(row)
        by_readiness[row["readiness_bucket"]].append(row)
        by_margin_bin[row["margin_bin"]].append(row)

    supported_rows = [row for row in rows if row["readiness_bucket"] in SUPPORTED_READINESS_BUCKETS]
    summary = json.loads(summary_path.read_text()) if summary_path.is_file() else {}

    analysis = {
        "pipeline_dir": display_path(pipeline_dir),
        "source_summary_path": display_path(summary_path) if summary_path.is_file() else None,
        "prediction_meta": prediction_meta,
        "match_summary": {
            "matched_true_positive_count": len(rows),
            "filtered_prediction_count": len(predictions),
            "true_positive_fraction_of_filtered_predictions": round(len(rows) / len(predictions), 6) if predictions else 0.0,
            "unmatched_assignment_count": unmatched_assignment_count,
            "non_true_positive_assignment_count": non_tp_assignment_count,
        },
        "topk_on_matched_true_positives": {
            "global": aggregate_rows(rows),
            "supported_reference_like_only": aggregate_rows(supported_rows),
            "by_theme": {
                theme: aggregate_rows(theme_rows)
                for theme, theme_rows in sorted(by_theme.items())
            },
            "by_readiness_bucket": {
                bucket: aggregate_rows(bucket_rows)
                for bucket, bucket_rows in sorted(by_readiness.items())
            },
            "by_margin_bin": {
                label: aggregate_rows(by_margin_bin[label])
                for label, _, _ in MARGIN_BINS
            },
        },
        "linked_pipeline_metrics": {
            "detector_only_global": summary.get("detector_only_global"),
            "pipeline_global": summary.get("pipeline_global"),
            "oracle_class_global": summary.get("oracle_class_global"),
            "gaps": summary.get("gaps"),
        },
    }
    write_json(output_path, analysis)
    print(json.dumps(analysis, indent=2))


if __name__ == "__main__":
    main()
