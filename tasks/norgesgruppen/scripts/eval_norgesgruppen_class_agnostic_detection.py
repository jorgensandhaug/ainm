#!/usr/bin/env python3

from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean
from typing import Any

from eval_norgesgruppen_predictions import (
    ap_from_ranked_results,
    filter_predictions,
    normalize_prediction,
    bbox_iou,
)
from norgesgruppen_prep_common import (
    CATEGORY_STRATEGY_MANIFEST_JSON,
    IMAGE_MANIFEST_JSON,
    IMAGE_SAMPLING_MANIFEST_JSON,
    ROOT,
    TRAINING_MANIFEST_JSON,
    VAL_COCO_JSON,
    display_path,
    read_json,
    write_json,
)


PRIMARY_IOU = 0.5
SECONDARY_IOU = 0.75
IOU_SWEEP = [round(0.5 + 0.05 * index, 2) for index in range(10)]
COCO_SMALL_AREA = 32 * 32
COCO_MEDIUM_AREA = 96 * 96


def area_bucket(area: float) -> str:
    if area < COCO_SMALL_AREA:
        return "small"
    if area < COCO_MEDIUM_AREA:
        return "medium"
    return "large"


def edge_bucket(bbox: list[float], image_width: int, image_height: int) -> str:
    x, y, width, height = bbox
    margin_x = image_width * 0.01
    margin_y = image_height * 0.01
    if (
        x <= margin_x
        or y <= margin_y
        or (x + width) >= (image_width - margin_x)
        or (y + height) >= (image_height - margin_y)
    ):
        return "near_edge_1pct"
    return "interior"


def build_context() -> dict[str, Any]:
    val_coco = read_json(VAL_COCO_JSON)
    training_manifest = read_json(TRAINING_MANIFEST_JSON)
    category_strategy = read_json(CATEGORY_STRATEGY_MANIFEST_JSON)
    image_manifest = read_json(IMAGE_MANIFEST_JSON)
    image_sampling_manifest = read_json(IMAGE_SAMPLING_MANIFEST_JSON)

    category_strategy_by_id = {
        row["category_id"]: row
        for row in category_strategy
    }
    image_manifest_by_id = {
        row["image_id"]: row
        for row in image_manifest
    }
    image_sampling_by_id = {
        row["image_id"]: row
        for row in image_sampling_manifest
    }
    images_by_id = {
        row["id"]: row
        for row in val_coco["images"]
    }
    categories_by_id = {
        row["id"]: row
        for row in val_coco["categories"]
    }

    annotations = []
    for row in val_coco["annotations"]:
        image_row = images_by_id[row["image_id"]]
        strategy_row = category_strategy_by_id[row["category_id"]]
        image_manifest_row = image_manifest_by_id[row["image_id"]]
        image_sampling_row = image_sampling_by_id[row["image_id"]]
        box_area = float(row.get("area", row["bbox"][2] * row["bbox"][3]))
        annotations.append(
            {
                "id": row["id"],
                "image_id": row["image_id"],
                "category_id": row["category_id"],
                "bbox": [float(value) for value in row["bbox"]],
                "area": box_area,
                "theme": strategy_row["theme"],
                "readiness_bucket": strategy_row["classification_readiness_bucket"],
                "image_difficulty_bucket": image_sampling_row["heuristic_sampler_bucket"],
                "dominant_theme": image_manifest_row["dominant_theme"],
                "area_bucket": area_bucket(box_area),
                "edge_bucket": edge_bucket(
                    bbox=[float(value) for value in row["bbox"]],
                    image_width=image_row["width"],
                    image_height=image_row["height"],
                ),
            }
        )

    return {
        "annotations": annotations,
        "val_image_ids": set(training_manifest["splits"]["val"]["image_ids"]),
        "image_manifest_by_id": image_manifest_by_id,
        "image_sampling_by_id": image_sampling_by_id,
        "images_by_id": images_by_id,
        "categories_by_id": categories_by_id,
    }


def match_predictions_at_iou(
    gt_annotations: list[dict[str, Any]],
    predictions: list[dict[str, Any]],
    iou_threshold: float,
) -> dict[str, Any]:
    gt_by_image = defaultdict(list)
    for annotation in gt_annotations:
        gt_by_image[annotation["image_id"]].append(annotation)

    matched_gt_ids = set()
    prediction_results = []
    for prediction in predictions:
        candidates = gt_by_image[prediction["image_id"]]
        best_any_iou = 0.0
        best_any_gt = None
        best_unmatched_iou = 0.0
        best_unmatched_gt = None
        for annotation in candidates:
            iou = bbox_iou(prediction["bbox"], annotation["bbox"])
            if iou > best_any_iou:
                best_any_iou = iou
                best_any_gt = annotation
            if annotation["id"] in matched_gt_ids:
                continue
            if iou > best_unmatched_iou:
                best_unmatched_iou = iou
                best_unmatched_gt = annotation

        is_true_positive = best_unmatched_gt is not None and best_unmatched_iou >= iou_threshold
        if is_true_positive:
            matched_gt_ids.add(best_unmatched_gt["id"])
            outcome = "tp"
            matched_gt = best_unmatched_gt
        else:
            matched_gt = None
            if best_any_gt is not None and best_any_iou >= iou_threshold:
                outcome = "fp_duplicate"
            else:
                outcome = "fp_background"

        prediction_results.append(
            {
                "prediction_index": prediction["prediction_index"],
                "image_id": prediction["image_id"],
                "score": prediction["score"],
                "is_true_positive": is_true_positive,
                "outcome": outcome,
                "matched_gt_id": matched_gt["id"] if matched_gt else None,
                "best_iou_any_gt": round(best_any_iou, 6),
                "best_gt_id_any": best_any_gt["id"] if best_any_gt else None,
                "best_gt_category_id_any": best_any_gt["category_id"] if best_any_gt else None,
            }
        )

    unmatched_gt_ids = {
        annotation["id"]
        for annotation in gt_annotations
        if annotation["id"] not in matched_gt_ids
    }
    return {
        "prediction_results": prediction_results,
        "matched_gt_ids": matched_gt_ids,
        "unmatched_gt_ids": unmatched_gt_ids,
    }


def compute_subset_metrics(
    gt_annotations: list[dict[str, Any]],
    predictions: list[dict[str, Any]],
    image_ids: set[int],
    count_score_threshold: float,
) -> tuple[dict[str, Any], dict[str, Any]]:
    subset_gt = [annotation for annotation in gt_annotations if annotation["image_id"] in image_ids]
    subset_predictions = [prediction for prediction in predictions if prediction["image_id"] in image_ids]

    ap_by_iou = {}
    primary_match = None
    for iou_threshold in IOU_SWEEP:
        match = match_predictions_at_iou(subset_gt, subset_predictions, iou_threshold=iou_threshold)
        ap_by_iou[f"{iou_threshold:.2f}"] = ap_from_ranked_results(match["prediction_results"], len(subset_gt))
        if iou_threshold == PRIMARY_IOU:
            primary_match = match

    assert primary_match is not None

    gt_count_by_image = Counter(annotation["image_id"] for annotation in subset_gt)
    pred_count_by_image = Counter(
        prediction["image_id"]
        for prediction in subset_predictions
        if prediction["score"] >= count_score_threshold
    )
    count_errors = [
        abs(gt_count_by_image[image_id] - pred_count_by_image[image_id])
        for image_id in sorted(image_ids)
    ]
    primary_outcomes = Counter(result["outcome"] for result in primary_match["prediction_results"])

    metrics = {
        "image_count": len(image_ids),
        "gt_annotation_count": len(subset_gt),
        "prediction_count": len(subset_predictions),
        "ap50_ignore_class": round(ap_by_iou["0.50"], 6),
        "ap75_ignore_class": round(ap_by_iou["0.75"], 6),
        "map50_95_ignore_class": round(mean(ap_by_iou.values()), 6) if ap_by_iou else 0.0,
        "ap_by_iou_threshold": {
            threshold: round(value, 6)
            for threshold, value in ap_by_iou.items()
        },
        "miss_rate_iou50": round(len(primary_match["unmatched_gt_ids"]) / len(subset_gt), 6) if subset_gt else 0.0,
        "duplicate_box_rate_iou50": round(primary_outcomes["fp_duplicate"] / len(subset_predictions), 6) if subset_predictions else 0.0,
        "background_fp_rate_iou50": round(primary_outcomes["fp_background"] / len(subset_predictions), 6) if subset_predictions else 0.0,
        "count_mae": round(mean(count_errors), 6) if count_errors else 0.0,
        "true_positive_count_iou50": primary_outcomes["tp"],
        "duplicate_false_positive_count_iou50": primary_outcomes["fp_duplicate"],
        "background_false_positive_count_iou50": primary_outcomes["fp_background"],
    }
    return metrics, primary_match


def bucket_image_ids(context: dict[str, Any], key: str) -> dict[str, set[int]]:
    buckets = defaultdict(set)
    for image_id in context["val_image_ids"]:
        if key == "dominant_theme":
            bucket = context["image_manifest_by_id"][image_id]["dominant_theme"]
        elif key == "image_difficulty_bucket":
            bucket = context["image_sampling_by_id"][image_id]["heuristic_sampler_bucket"]
        else:
            raise ValueError(f"Unsupported image bucket key: {key}")
        buckets[bucket].add(image_id)
    return dict(sorted(buckets.items()))


def gt_hit_rates(
    gt_annotations: list[dict[str, Any]],
    matched_gt_ids: set[int],
    key: str,
) -> dict[str, dict[str, Any]]:
    totals = Counter(annotation[key] for annotation in gt_annotations)
    hits = Counter(annotation[key] for annotation in gt_annotations if annotation["id"] in matched_gt_ids)
    rows = {}
    for bucket in sorted(totals):
        hit_count = hits[bucket]
        total_count = totals[bucket]
        rows[bucket] = {
            "gt_count": total_count,
            "matched_gt_count": hit_count,
            "missed_gt_count": total_count - hit_count,
            "hit_rate_iou50": round(hit_count / total_count, 6) if total_count else 0.0,
        }
    return rows


def build_error_summary(
    context: dict[str, Any],
    predictions: list[dict[str, Any]],
    primary_metrics: dict[str, Any],
    primary_match: dict[str, Any],
    filtered_meta: dict[str, Any],
) -> dict[str, Any]:
    gt_by_id = {
        annotation["id"]: annotation
        for annotation in context["annotations"]
    }
    prediction_results = primary_match["prediction_results"]

    missed_by_category = Counter(gt_by_id[annotation_id]["category_id"] for annotation_id in primary_match["unmatched_gt_ids"])
    missed_by_image = Counter(gt_by_id[annotation_id]["image_id"] for annotation_id in primary_match["unmatched_gt_ids"])
    missed_by_theme = Counter(gt_by_id[annotation_id]["theme"] for annotation_id in primary_match["unmatched_gt_ids"])
    missed_by_readiness = Counter(gt_by_id[annotation_id]["readiness_bucket"] for annotation_id in primary_match["unmatched_gt_ids"])
    missed_by_area = Counter(gt_by_id[annotation_id]["area_bucket"] for annotation_id in primary_match["unmatched_gt_ids"])
    missed_by_edge = Counter(gt_by_id[annotation_id]["edge_bucket"] for annotation_id in primary_match["unmatched_gt_ids"])
    duplicate_fp_by_image = Counter(result["image_id"] for result in prediction_results if result["outcome"] == "fp_duplicate")
    background_fp_by_image = Counter(result["image_id"] for result in prediction_results if result["outcome"] == "fp_background")

    categories_by_id = context["categories_by_id"]
    return {
        **filtered_meta,
        "prediction_count": len(predictions),
        "gt_annotation_count": len(context["annotations"]),
        "ap50_ignore_class": primary_metrics["ap50_ignore_class"],
        "ap75_ignore_class": primary_metrics["ap75_ignore_class"],
        "map50_95_ignore_class": primary_metrics["map50_95_ignore_class"],
        "matched_gt_count_iou50": len(primary_match["matched_gt_ids"]),
        "missed_gt_count_iou50": len(primary_match["unmatched_gt_ids"]),
        "duplicate_false_positive_count_iou50": primary_metrics["duplicate_false_positive_count_iou50"],
        "background_false_positive_count_iou50": primary_metrics["background_false_positive_count_iou50"],
        "top_missed_categories": [
            {
                "category_id": category_id,
                "category_name": categories_by_id[category_id]["name"],
                "count": count,
            }
            for category_id, count in missed_by_category.most_common(10)
        ],
        "top_miss_images": [
            {"image_id": image_id, "count": count}
            for image_id, count in missed_by_image.most_common(10)
        ],
        "top_duplicate_fp_images": [
            {"image_id": image_id, "count": count}
            for image_id, count in duplicate_fp_by_image.most_common(10)
        ],
        "top_background_fp_images": [
            {"image_id": image_id, "count": count}
            for image_id, count in background_fp_by_image.most_common(10)
        ],
        "missed_gt_theme_counts": dict(sorted(missed_by_theme.items())),
        "missed_gt_readiness_counts": dict(sorted(missed_by_readiness.items())),
        "missed_gt_area_bucket_counts": dict(sorted(missed_by_area.items())),
        "missed_gt_edge_bucket_counts": dict(sorted(missed_by_edge.items())),
    }


def evaluate_predictions(
    predictions_path: Path,
    output_dir: Path | None,
    label: str,
    count_score_threshold: float,
) -> dict[str, Any]:
    context = build_context()
    raw_predictions = read_json(predictions_path)
    if not isinstance(raw_predictions, list):
        raise ValueError("predictions json must contain a top-level array")

    predictions, filtered_meta = filter_predictions(raw_predictions, context["val_image_ids"])
    primary_metrics, primary_match = compute_subset_metrics(
        gt_annotations=context["annotations"],
        predictions=predictions,
        image_ids=context["val_image_ids"],
        count_score_threshold=count_score_threshold,
    )

    by_image_dominant_theme = {}
    for bucket, image_ids in bucket_image_ids(context, "dominant_theme").items():
        bucket_metrics, _ = compute_subset_metrics(
            gt_annotations=context["annotations"],
            predictions=predictions,
            image_ids=image_ids,
            count_score_threshold=count_score_threshold,
        )
        by_image_dominant_theme[bucket] = bucket_metrics

    by_image_difficulty_bucket = {}
    for bucket, image_ids in bucket_image_ids(context, "image_difficulty_bucket").items():
        bucket_metrics, _ = compute_subset_metrics(
            gt_annotations=context["annotations"],
            predictions=predictions,
            image_ids=image_ids,
            count_score_threshold=count_score_threshold,
        )
        by_image_difficulty_bucket[bucket] = bucket_metrics

    gt_hit_rate_iou50 = {
        "theme": gt_hit_rates(context["annotations"], primary_match["matched_gt_ids"], key="theme"),
        "readiness_bucket": gt_hit_rates(context["annotations"], primary_match["matched_gt_ids"], key="readiness_bucket"),
        "area_bucket": gt_hit_rates(context["annotations"], primary_match["matched_gt_ids"], key="area_bucket"),
        "edge_bucket": gt_hit_rates(context["annotations"], primary_match["matched_gt_ids"], key="edge_bucket"),
    }

    metrics = {
        "label": label,
        "predictions_path": display_path(predictions_path),
        "count_score_threshold": count_score_threshold,
        "prediction_filtering": filtered_meta,
        "overall": primary_metrics,
        "by_image_dominant_theme": by_image_dominant_theme,
        "by_image_difficulty_bucket": by_image_difficulty_bucket,
        "gt_hit_rate_iou50": gt_hit_rate_iou50,
    }
    error_summary = build_error_summary(
        context=context,
        predictions=predictions,
        primary_metrics=primary_metrics,
        primary_match=primary_match,
        filtered_meta=filtered_meta,
    )

    if output_dir is not None:
        output_dir.mkdir(parents=True, exist_ok=True)
        write_json(output_dir / "metrics.json", metrics)
        write_json(output_dir / "error_summary.json", error_summary)

    return {
        "metrics": metrics,
        "error_summary": error_summary,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate class-agnostic shelf detection predictions on the fixed blocked validation split.")
    parser.add_argument("--predictions", required=True, help="Path to competition-style predictions.json")
    parser.add_argument("--output-dir", required=False, help="Optional directory for metrics.json and error_summary.json")
    parser.add_argument("--label", default="detection_eval", help="Short label written into metrics.")
    parser.add_argument("--count-score-threshold", type=float, default=0.25, help="Score threshold used for count MAE.")
    args = parser.parse_args()

    result = evaluate_predictions(
        predictions_path=Path(args.predictions),
        output_dir=Path(args.output_dir) if args.output_dir else None,
        label=args.label,
        count_score_threshold=args.count_score_threshold,
    )
    print(result["metrics"]["overall"])


if __name__ == "__main__":
    main()
