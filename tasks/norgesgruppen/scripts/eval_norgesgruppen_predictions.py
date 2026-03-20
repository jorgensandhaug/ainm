#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean
from typing import Any

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


IOU_THRESHOLD = 0.5


def xywh_to_xyxy(bbox: list[float]) -> tuple[float, float, float, float]:
    x, y, width, height = bbox
    return x, y, x + width, y + height


def bbox_iou(a: list[float], b: list[float]) -> float:
    ax1, ay1, ax2, ay2 = xywh_to_xyxy(a)
    bx1, by1, bx2, by2 = xywh_to_xyxy(b)
    inter_x1 = max(ax1, bx1)
    inter_y1 = max(ay1, by1)
    inter_x2 = min(ax2, bx2)
    inter_y2 = min(ay2, by2)
    inter_w = max(0.0, inter_x2 - inter_x1)
    inter_h = max(0.0, inter_y2 - inter_y1)
    inter_area = inter_w * inter_h
    if inter_area <= 0.0:
        return 0.0
    area_a = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    area_b = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = area_a + area_b - inter_area
    if union <= 0.0:
        return 0.0
    return inter_area / union


def ap_from_ranked_results(results: list[dict[str, Any]], gt_count: int) -> float:
    if gt_count <= 0:
        return 0.0
    if not results:
        return 0.0

    cumulative_tp = 0
    cumulative_fp = 0
    recalls = []
    precisions = []
    for result in results:
        if result["is_true_positive"]:
            cumulative_tp += 1
        else:
            cumulative_fp += 1
        recalls.append(cumulative_tp / gt_count)
        precisions.append(cumulative_tp / (cumulative_tp + cumulative_fp))

    mrec = [0.0] + recalls + [1.0]
    mpre = [0.0] + precisions + [0.0]
    for index in range(len(mpre) - 2, -1, -1):
        mpre[index] = max(mpre[index], mpre[index + 1])

    ap = 0.0
    for index in range(len(mrec) - 1):
        if mrec[index + 1] != mrec[index]:
            ap += (mrec[index + 1] - mrec[index]) * mpre[index + 1]
    return ap


def normalize_prediction(raw: dict[str, Any], index: int) -> dict[str, Any]:
    if not isinstance(raw, dict):
        raise ValueError("prediction must be an object")
    required_fields = ["image_id", "category_id", "bbox", "score"]
    missing = [field for field in required_fields if field not in raw]
    if missing:
        raise ValueError(f"missing fields: {missing}")
    bbox = raw["bbox"]
    if not isinstance(bbox, list) or len(bbox) != 4:
        raise ValueError("bbox must be a list of length 4")
    image_id = int(raw["image_id"])
    category_id = int(raw["category_id"])
    score = float(raw["score"])
    return {
        "prediction_index": index,
        "image_id": image_id,
        "category_id": category_id,
        "bbox": [float(value) for value in bbox],
        "score": score,
    }


def build_context() -> dict[str, Any]:
    val_coco = read_json(VAL_COCO_JSON)
    training_manifest = read_json(TRAINING_MANIFEST_JSON)
    category_strategy = read_json(CATEGORY_STRATEGY_MANIFEST_JSON)
    image_manifest = read_json(IMAGE_MANIFEST_JSON)
    image_sampling_manifest = read_json(IMAGE_SAMPLING_MANIFEST_JSON)

    categories_by_id = {
        row["id"]: row
        for row in val_coco["categories"]
    }
    category_strategy_by_id = {
        row["category_id"]: row
        for row in category_strategy
    }
    images_by_id = {
        row["id"]: row
        for row in val_coco["images"]
    }
    image_manifest_by_id = {
        row["image_id"]: row
        for row in image_manifest
    }
    image_sampling_by_id = {
        row["image_id"]: row
        for row in image_sampling_manifest
    }
    annotations = []
    for row in val_coco["annotations"]:
        strategy = category_strategy_by_id[row["category_id"]]
        image_row = image_manifest_by_id[row["image_id"]]
        sampling_row = image_sampling_by_id[row["image_id"]]
        annotations.append(
            {
                "id": row["id"],
                "image_id": row["image_id"],
                "category_id": row["category_id"],
                "bbox": [float(value) for value in row["bbox"]],
                "theme": strategy["theme"],
                "readiness_bucket": strategy["classification_readiness_bucket"],
                "dominant_theme": image_row["dominant_theme"],
                "image_difficulty_bucket": sampling_row["heuristic_sampler_bucket"],
            }
        )

    return {
        "val_coco": val_coco,
        "training_manifest": training_manifest,
        "annotations": annotations,
        "categories_by_id": categories_by_id,
        "category_strategy_by_id": category_strategy_by_id,
        "images_by_id": images_by_id,
        "image_manifest_by_id": image_manifest_by_id,
        "image_sampling_by_id": image_sampling_by_id,
        "val_image_ids": set(training_manifest["splits"]["val"]["image_ids"]),
    }


def filter_predictions(
    raw_predictions: list[Any],
    val_image_ids: set[int],
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    valid_predictions = []
    invalid_count = 0
    ignored_out_of_split = 0
    invalid_examples = []
    for index, raw in enumerate(raw_predictions):
        try:
            prediction = normalize_prediction(raw, index)
        except Exception as exc:
            invalid_count += 1
            if len(invalid_examples) < 10:
                invalid_examples.append({"prediction_index": index, "error": str(exc)})
            continue
        if prediction["image_id"] not in val_image_ids:
            ignored_out_of_split += 1
            continue
        valid_predictions.append(prediction)
    valid_predictions.sort(key=lambda row: (-row["score"], row["prediction_index"]))
    return valid_predictions, {
        "input_prediction_count": len(raw_predictions),
        "valid_prediction_count": len(valid_predictions),
        "invalid_prediction_count": invalid_count,
        "ignored_out_of_split_prediction_count": ignored_out_of_split,
        "invalid_examples": invalid_examples,
    }


def match_predictions(
    gt_annotations: list[dict[str, Any]],
    predictions: list[dict[str, Any]],
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

        is_true_positive = best_unmatched_gt is not None and best_unmatched_iou >= IOU_THRESHOLD
        if is_true_positive:
            matched_gt_ids.add(best_unmatched_gt["id"])
            outcome = "tp"
            matched_gt = best_unmatched_gt
        else:
            matched_gt = None
            if best_any_gt is not None and best_any_iou >= IOU_THRESHOLD:
                outcome = "fp_duplicate"
            else:
                outcome = "fp_background"

        prediction_results.append(
            {
                "prediction_index": prediction["prediction_index"],
                "image_id": prediction["image_id"],
                "category_id": prediction["category_id"],
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


def compute_detection_metrics(
    gt_annotations: list[dict[str, Any]],
    predictions: list[dict[str, Any]],
    image_ids: set[int],
    count_score_threshold: float,
) -> dict[str, Any]:
    subset_gt = [annotation for annotation in gt_annotations if annotation["image_id"] in image_ids]
    subset_predictions = [prediction for prediction in predictions if prediction["image_id"] in image_ids]
    match = match_predictions(subset_gt, subset_predictions)
    ap50 = ap_from_ranked_results(match["prediction_results"], len(subset_gt))

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

    prediction_outcomes = Counter(result["outcome"] for result in match["prediction_results"])
    return {
        "image_count": len(image_ids),
        "gt_annotation_count": len(subset_gt),
        "prediction_count": len(subset_predictions),
        "detection_ap50_ignore_class": round(ap50, 6),
        "miss_rate": round(len(match["unmatched_gt_ids"]) / len(subset_gt), 6) if subset_gt else 0.0,
        "duplicate_box_rate": round(prediction_outcomes["fp_duplicate"] / len(subset_predictions), 6) if subset_predictions else 0.0,
        "background_fp_rate": round(prediction_outcomes["fp_background"] / len(subset_predictions), 6) if subset_predictions else 0.0,
        "count_mae": round(mean(count_errors), 6) if count_errors else 0.0,
        "true_positive_count": prediction_outcomes["tp"],
        "duplicate_false_positive_count": prediction_outcomes["fp_duplicate"],
        "background_false_positive_count": prediction_outcomes["fp_background"],
    }


def compute_classification_metrics(
    gt_annotations: list[dict[str, Any]],
    predictions: list[dict[str, Any]],
    category_ids: list[int],
) -> dict[str, Any]:
    gt_by_category = defaultdict(list)
    predictions_by_category = defaultdict(list)
    for annotation in gt_annotations:
        if annotation["category_id"] in category_ids:
            gt_by_category[annotation["category_id"]].append(annotation)
    for prediction in predictions:
        if prediction["category_id"] in category_ids:
            predictions_by_category[prediction["category_id"]].append(prediction)

    per_category = []
    total_tp = 0
    total_gt = 0
    for category_id in category_ids:
        category_gt = gt_by_category[category_id]
        if not category_gt:
            continue
        category_predictions = predictions_by_category[category_id]
        match = match_predictions(category_gt, category_predictions)
        ap50 = ap_from_ranked_results(match["prediction_results"], len(category_gt))
        tp_count = sum(1 for result in match["prediction_results"] if result["is_true_positive"])
        total_tp += tp_count
        total_gt += len(category_gt)
        per_category.append(
            {
                "category_id": category_id,
                "gt_annotation_count": len(category_gt),
                "prediction_count": len(category_predictions),
                "ap50": ap50,
            }
        )

    present_category_count = len(per_category)
    map50 = mean(row["ap50"] for row in per_category) if per_category else 0.0
    return {
        "category_count_with_gt": present_category_count,
        "gt_annotation_count": total_gt,
        "classification_map50": round(map50, 6),
        "classification_true_positive_count": total_tp,
        "per_category": per_category,
    }


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


def bucket_category_ids(context: dict[str, Any], key: str) -> dict[str, list[int]]:
    buckets = defaultdict(list)
    category_ids_in_val = sorted({annotation["category_id"] for annotation in context["annotations"]})
    for category_id in category_ids_in_val:
        if key == "theme":
            bucket = context["category_strategy_by_id"][category_id]["theme"]
        elif key == "classification_readiness_bucket":
            bucket = context["category_strategy_by_id"][category_id]["classification_readiness_bucket"]
        else:
            raise ValueError(f"Unsupported category bucket key: {key}")
        buckets[bucket].append(category_id)
    return dict(sorted(buckets.items()))


def build_error_summary(
    context: dict[str, Any],
    predictions: list[dict[str, Any]],
    detection_metrics: dict[str, Any],
    classification_metrics: dict[str, Any],
    detection_match: dict[str, Any],
    filtered_meta: dict[str, Any],
) -> dict[str, Any]:
    gt_by_id = {
        annotation["id"]: annotation
        for annotation in context["annotations"]
    }
    prediction_results = detection_match["prediction_results"]
    missed_by_category = Counter(gt_by_id[annotation_id]["category_id"] for annotation_id in detection_match["unmatched_gt_ids"])
    missed_by_image = Counter(gt_by_id[annotation_id]["image_id"] for annotation_id in detection_match["unmatched_gt_ids"])
    fp_by_image = Counter(result["image_id"] for result in prediction_results if result["outcome"] != "tp")

    confusion_counts = Counter()
    for result in prediction_results:
        best_gt_category_id = result["best_gt_category_id_any"]
        if best_gt_category_id is None:
            continue
        if result["best_iou_any_gt"] < IOU_THRESHOLD:
            continue
        if best_gt_category_id == result["category_id"]:
            continue
        confusion_counts[(best_gt_category_id, result["category_id"])] += 1

    categories_by_id = context["categories_by_id"]
    top_missed_categories = [
        {
            "category_id": category_id,
            "category_name": categories_by_id[category_id]["name"],
            "count": count,
        }
        for category_id, count in missed_by_category.most_common(10)
    ]
    top_confusions = [
        {
            "gt_category_id": gt_category_id,
            "gt_category_name": categories_by_id[gt_category_id]["name"],
            "pred_category_id": pred_category_id,
            "pred_category_name": categories_by_id[pred_category_id]["name"],
            "count": count,
        }
        for (gt_category_id, pred_category_id), count in confusion_counts.most_common(10)
    ]
    top_images_by_miss = [
        {"image_id": image_id, "count": count}
        for image_id, count in missed_by_image.most_common(10)
    ]
    top_images_by_fp = [
        {"image_id": image_id, "count": count}
        for image_id, count in fp_by_image.most_common(10)
    ]

    return {
        **filtered_meta,
        "gt_annotation_count": len(context["annotations"]),
        "detection_true_positive_count": detection_metrics["true_positive_count"],
        "classification_true_positive_count": classification_metrics["classification_true_positive_count"],
        "missed_gt_detection_count": len(detection_match["unmatched_gt_ids"]),
        "duplicate_false_positive_count": detection_metrics["duplicate_false_positive_count"],
        "background_false_positive_count": detection_metrics["background_false_positive_count"],
        "top_missed_categories": top_missed_categories,
        "top_detection_miss_images": top_images_by_miss,
        "top_detection_fp_images": top_images_by_fp,
        "top_wrong_class_confusions": top_confusions,
    }


def evaluate_predictions(
    predictions_path: Path,
    output_dir: Path | None,
    count_score_threshold: float,
) -> dict[str, Any]:
    context = build_context()
    raw_predictions = read_json(predictions_path)
    if not isinstance(raw_predictions, list):
        raise ValueError("predictions json must contain a top-level array")
    predictions, filtered_meta = filter_predictions(raw_predictions, context["val_image_ids"])

    detection_metrics = compute_detection_metrics(
        gt_annotations=context["annotations"],
        predictions=predictions,
        image_ids=context["val_image_ids"],
        count_score_threshold=count_score_threshold,
    )
    detection_match = match_predictions(context["annotations"], predictions)
    category_ids_in_val = sorted({annotation["category_id"] for annotation in context["annotations"]})
    classification_metrics = compute_classification_metrics(
        gt_annotations=context["annotations"],
        predictions=predictions,
        category_ids=category_ids_in_val,
    )
    hybrid_proxy = round(
        0.7 * detection_metrics["detection_ap50_ignore_class"] + 0.3 * classification_metrics["classification_map50"],
        6,
    )

    by_image_dominant_theme = {}
    for bucket, image_ids in bucket_image_ids(context, "dominant_theme").items():
        bucket_detection = compute_detection_metrics(
            gt_annotations=context["annotations"],
            predictions=predictions,
            image_ids=image_ids,
            count_score_threshold=count_score_threshold,
        )
        bucket_eval_category_ids = sorted({
            annotation["category_id"]
            for annotation in context["annotations"]
            if annotation["image_id"] in image_ids
        })
        bucket_classification = compute_classification_metrics(
            gt_annotations=context["annotations"],
            predictions=predictions,
            category_ids=bucket_eval_category_ids,
        )
        by_image_dominant_theme[bucket] = {
            **bucket_detection,
            "classification_map50": bucket_classification["classification_map50"],
            "hybrid_proxy": round(
                0.7 * bucket_detection["detection_ap50_ignore_class"] + 0.3 * bucket_classification["classification_map50"],
                6,
            ),
        }

    by_image_difficulty_bucket = {}
    for bucket, image_ids in bucket_image_ids(context, "image_difficulty_bucket").items():
        bucket_detection = compute_detection_metrics(
            gt_annotations=context["annotations"],
            predictions=predictions,
            image_ids=image_ids,
            count_score_threshold=count_score_threshold,
        )
        bucket_eval_category_ids = sorted({
            annotation["category_id"]
            for annotation in context["annotations"]
            if annotation["image_id"] in image_ids
        })
        bucket_classification = compute_classification_metrics(
            gt_annotations=context["annotations"],
            predictions=predictions,
            category_ids=bucket_eval_category_ids,
        )
        by_image_difficulty_bucket[bucket] = {
            **bucket_detection,
            "classification_map50": bucket_classification["classification_map50"],
            "hybrid_proxy": round(
                0.7 * bucket_detection["detection_ap50_ignore_class"] + 0.3 * bucket_classification["classification_map50"],
                6,
            ),
        }

    by_category_theme = {}
    for bucket, category_ids in bucket_category_ids(context, "theme").items():
        bucket_metrics = compute_classification_metrics(
            gt_annotations=context["annotations"],
            predictions=predictions,
            category_ids=category_ids,
        )
        by_category_theme[bucket] = {
            "category_count_with_gt": bucket_metrics["category_count_with_gt"],
            "gt_annotation_count": bucket_metrics["gt_annotation_count"],
            "classification_map50": bucket_metrics["classification_map50"],
        }

    by_readiness_bucket = {}
    for bucket, category_ids in bucket_category_ids(context, "classification_readiness_bucket").items():
        bucket_metrics = compute_classification_metrics(
            gt_annotations=context["annotations"],
            predictions=predictions,
            category_ids=category_ids,
        )
        by_readiness_bucket[bucket] = {
            "category_count_with_gt": bucket_metrics["category_count_with_gt"],
            "gt_annotation_count": bucket_metrics["gt_annotation_count"],
            "classification_map50": bucket_metrics["classification_map50"],
        }

    metrics = {
        "predictions_path": display_path(predictions_path),
        "count_score_threshold": count_score_threshold,
        "global": {
            **detection_metrics,
            "classification_map50": classification_metrics["classification_map50"],
            "hybrid_proxy": hybrid_proxy,
        },
        "by_image_dominant_theme": by_image_dominant_theme,
        "by_image_difficulty_bucket": by_image_difficulty_bucket,
        "by_category_theme": by_category_theme,
        "by_readiness_bucket": by_readiness_bucket,
    }
    error_summary = build_error_summary(
        context=context,
        predictions=predictions,
        detection_metrics=detection_metrics,
        classification_metrics=classification_metrics,
        detection_match=detection_match,
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
    parser = argparse.ArgumentParser(description="Evaluate NorgesGruppen prediction JSON files on the frozen validation surface.")
    parser.add_argument("--predictions", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, default=None)
    parser.add_argument("--count-score-threshold", type=float, default=0.05)
    args = parser.parse_args()

    result = evaluate_predictions(
        predictions_path=args.predictions,
        output_dir=args.output_dir,
        count_score_threshold=args.count_score_threshold,
    )
    print(json.dumps(result["metrics"], indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
