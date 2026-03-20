#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import json
from collections import defaultdict
from pathlib import Path
from typing import Any

from eval_norgesgruppen_class_agnostic_detection import (
    build_context,
    bucket_image_ids,
    compute_subset_metrics,
)
from eval_norgesgruppen_predictions import normalize_prediction
from norgesgruppen_prep_common import display_path, read_json, write_json


def parse_float_list(raw: str) -> list[float]:
    return [float(part.strip()) for part in raw.split(",") if part.strip()]


def parse_int_list(raw: str) -> list[int]:
    return [int(part.strip()) for part in raw.split(",") if part.strip()]


def load_predictions(predictions_path: Path, val_image_ids: set[int]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    raw_predictions = read_json(predictions_path)
    if not isinstance(raw_predictions, list):
        raise ValueError("predictions json must contain a top-level array")

    valid_predictions = []
    invalid_examples = []
    invalid_count = 0
    ignored_out_of_split = 0
    for index, raw in enumerate(raw_predictions):
        try:
            prediction = normalize_prediction(raw, index)
        except Exception as exc:
            invalid_count += 1
            if len(invalid_examples) < 20:
                invalid_examples.append({"prediction_index": index, "error": str(exc)})
            continue
        if prediction["image_id"] not in val_image_ids:
            ignored_out_of_split += 1
            continue
        valid_predictions.append(prediction)

    valid_predictions.sort(key=lambda row: (-row["score"], row["prediction_index"]))
    meta = {
        "input_prediction_count": len(raw_predictions),
        "valid_prediction_count": len(valid_predictions),
        "invalid_prediction_count": invalid_count,
        "ignored_out_of_split_prediction_count": ignored_out_of_split,
        "invalid_examples": invalid_examples,
    }
    return valid_predictions, meta


def filter_predictions_for_config(
    predictions: list[dict[str, Any]],
    min_score: float,
    max_det_per_image: int | None,
) -> list[dict[str, Any]]:
    grouped: dict[int, list[dict[str, Any]]] = defaultdict(list)
    for prediction in predictions:
        if prediction["score"] < min_score:
            continue
        grouped[prediction["image_id"]].append(prediction)

    kept = []
    for image_id in sorted(grouped):
        rows = grouped[image_id]
        rows.sort(key=lambda row: (-row["score"], row["prediction_index"]))
        if max_det_per_image is not None:
            rows = rows[:max_det_per_image]
        kept.extend(rows)

    kept.sort(key=lambda row: (-row["score"], row["prediction_index"]))
    return kept


def summarize_config(
    context: dict[str, Any],
    predictions: list[dict[str, Any]],
    min_score: float,
    max_det_per_image: int | None,
    count_score_threshold: float,
) -> dict[str, Any]:
    overall, _ = compute_subset_metrics(
        gt_annotations=context["annotations"],
        predictions=predictions,
        image_ids=context["val_image_ids"],
        count_score_threshold=count_score_threshold,
    )

    by_theme = {}
    for bucket, image_ids in bucket_image_ids(context, "dominant_theme").items():
        bucket_metrics, _ = compute_subset_metrics(
            gt_annotations=context["annotations"],
            predictions=predictions,
            image_ids=image_ids,
            count_score_threshold=count_score_threshold,
        )
        by_theme[bucket] = {
            "ap50_ignore_class": bucket_metrics["ap50_ignore_class"],
            "map50_95_ignore_class": bucket_metrics["map50_95_ignore_class"],
            "miss_rate_iou50": bucket_metrics["miss_rate_iou50"],
            "count_mae": bucket_metrics["count_mae"],
        }

    return {
        "min_score": min_score,
        "max_det_per_image": max_det_per_image,
        "prediction_count": len(predictions),
        "overall": overall,
        "by_image_dominant_theme": by_theme,
    }


def run_sweep(
    predictions_path: Path,
    output_dir: Path,
    min_scores: list[float],
    max_det_values: list[int],
    count_score_threshold: float,
) -> dict[str, Any]:
    context = build_context()
    predictions, load_meta = load_predictions(predictions_path, context["val_image_ids"])
    output_dir.mkdir(parents=True, exist_ok=True)

    rows = []
    for min_score in min_scores:
        for max_det_per_image in max_det_values:
            filtered_predictions = filter_predictions_for_config(
                predictions=predictions,
                min_score=min_score,
                max_det_per_image=max_det_per_image,
            )
            summary = summarize_config(
                context=context,
                predictions=filtered_predictions,
                min_score=min_score,
                max_det_per_image=max_det_per_image,
                count_score_threshold=count_score_threshold,
            )
            rows.append(summary)

    rows.sort(
        key=lambda row: (
            -row["overall"]["ap50_ignore_class"],
            -row["overall"]["map50_95_ignore_class"],
            row["overall"]["background_fp_rate_iou50"],
            row["overall"]["duplicate_box_rate_iou50"],
            row["overall"]["count_mae"],
        )
    )

    best = rows[0] if rows else None
    manifest = {
        "predictions_path": display_path(predictions_path),
        "output_dir": display_path(output_dir),
        "count_score_threshold": count_score_threshold,
        "min_scores": min_scores,
        "max_det_values": max_det_values,
        "prediction_loading": load_meta,
        "config_count": len(rows),
        "best_by_ap50": best,
    }

    write_json(output_dir / "sweep-summary.json", manifest)
    write_json(output_dir / "sweep-results.json", rows)

    with (output_dir / "sweep-results.csv").open("w", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "min_score",
                "max_det_per_image",
                "prediction_count",
                "ap50_ignore_class",
                "ap75_ignore_class",
                "map50_95_ignore_class",
                "miss_rate_iou50",
                "duplicate_box_rate_iou50",
                "background_fp_rate_iou50",
                "count_mae",
                "egg_ap50",
                "frokost_ap50",
                "knekkebrod_ap50",
                "other_ap50",
                "varmedrikker_ap50",
            ],
        )
        writer.writeheader()
        for row in rows:
            overall = row["overall"]
            themes = row["by_image_dominant_theme"]
            writer.writerow(
                {
                    "min_score": row["min_score"],
                    "max_det_per_image": row["max_det_per_image"],
                    "prediction_count": row["prediction_count"],
                    "ap50_ignore_class": overall["ap50_ignore_class"],
                    "ap75_ignore_class": overall["ap75_ignore_class"],
                    "map50_95_ignore_class": overall["map50_95_ignore_class"],
                    "miss_rate_iou50": overall["miss_rate_iou50"],
                    "duplicate_box_rate_iou50": overall["duplicate_box_rate_iou50"],
                    "background_fp_rate_iou50": overall["background_fp_rate_iou50"],
                    "count_mae": overall["count_mae"],
                    "egg_ap50": themes.get("egg", {}).get("ap50_ignore_class"),
                    "frokost_ap50": themes.get("frokost", {}).get("ap50_ignore_class"),
                    "knekkebrod_ap50": themes.get("knekkebrod", {}).get("ap50_ignore_class"),
                    "other_ap50": themes.get("other", {}).get("ap50_ignore_class"),
                    "varmedrikker_ap50": themes.get("varmedrikker", {}).get("ap50_ignore_class"),
                }
            )

    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description="Sweep detector score/max-det postprocess settings on saved class-agnostic predictions.")
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--min-scores", default="0.001,0.01,0.025,0.05,0.1,0.2,0.3,0.4,0.5")
    parser.add_argument("--max-det-values", default="50,100,150,200,300")
    parser.add_argument("--count-score-threshold", type=float, default=0.25)
    args = parser.parse_args()

    summary = run_sweep(
        predictions_path=args.predictions,
        output_dir=args.output_dir,
        min_scores=parse_float_list(args.min_scores),
        max_det_values=parse_int_list(args.max_det_values),
        count_score_threshold=args.count_score_threshold,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
