#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from statistics import mean, median
from typing import Any

from eval_norgesgruppen_oracle_class_bound import run_oracle_class_bound
from eval_norgesgruppen_predictions import build_context, evaluate_predictions, xywh_to_xyxy
from norgesgruppen_crop_benchmark_common import load_crop_eval_context, normalize_relative_path
from norgesgruppen_prep_common import COCO_IMAGES, write_json, write_jsonl
from norgesgruppen_retrieval_backends import build_backend, compute_crop_box_from_bbox_xyxy
from run_norgesgruppen_crop_retrieval import build_gallery_specs, load_or_compute_embeddings, slug_fragment
from sweep_norgesgruppen_detection_postprocess import filter_predictions_for_config, load_predictions


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def require_close(actual: float, expected: float, tolerance: float, message: str) -> None:
    if abs(actual - expected) > tolerance:
        raise AssertionError(f"{message}: actual={actual} expected={expected} tolerance={tolerance}")


def build_prediction_query_specs(
    predictions: list[dict[str, Any]],
    images_by_id: dict[int, dict[str, Any]],
    padding_px: int,
    padding_frac: float,
) -> list[dict[str, Any]]:
    specs = []
    for prediction in predictions:
        image = images_by_id[prediction["image_id"]]
        crop_box = compute_crop_box_from_bbox_xyxy(
            bbox_xyxy=xywh_to_xyxy(prediction["bbox"]),
            image_width=image["width"],
            image_height=image["height"],
            padding_px=padding_px,
            padding_frac=padding_frac,
        )
        specs.append(
            {
                "spec_id": f"prediction::{prediction['prediction_index']}",
                "source_path": COCO_IMAGES / image["file_name"],
                "crop_box": crop_box,
                "prediction_index": prediction["prediction_index"],
                "image_id": prediction["image_id"],
            }
        )
    return specs


def build_detector_only_predictions(
    predictions: list[dict[str, Any]],
    output_path: Path,
) -> Path:
    rows = [
        {
            "image_id": row["image_id"],
            "category_id": row["category_id"],
            "bbox": row["bbox"],
            "score": row["score"],
        }
        for row in predictions
    ]
    write_json(output_path, rows)
    return output_path


def run_pipeline(
    *,
    detector_predictions_path: Path,
    output_dir: Path,
    backend_name: str,
    model_id: str | None,
    gallery_mode: str,
    device: str,
    batch_size: int,
    min_score: float,
    max_det_per_image: int | None,
    padding_px: int,
    padding_frac: float,
    ranking_top_k: int,
    count_score_threshold: float,
    experiment_id: str | None,
    label: str | None,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    artifacts_dir = output_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    cache_dir = artifacts_dir / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    eval_context = build_context()
    crop_eval_context = load_crop_eval_context(gallery_mode=gallery_mode)
    full_gallery_entries = crop_eval_context["slice_defs"]["full"]["gallery_entries"]
    require(full_gallery_entries, "Full gallery is empty.")

    backend = build_backend(
        backend_name=backend_name,
        model_id=model_id,
        device=device,
        batch_size=batch_size,
    )

    raw_predictions, input_meta = load_predictions(
        predictions_path=detector_predictions_path,
        val_image_ids=eval_context["val_image_ids"],
    )
    filtered_predictions = filter_predictions_for_config(
        predictions=raw_predictions,
        min_score=min_score,
        max_det_per_image=max_det_per_image,
    )
    require(filtered_predictions, "No predictions remain after detector filtering.")

    gallery_specs = build_gallery_specs(full_gallery_entries)
    query_specs = build_prediction_query_specs(
        predictions=filtered_predictions,
        images_by_id=eval_context["images_by_id"],
        padding_px=padding_px,
        padding_frac=padding_frac,
    )

    model_fragment = slug_fragment(backend.model_id or "none")
    filter_fragment = f"ms{min_score}-md{max_det_per_image if max_det_per_image is not None else 'all'}"
    crop_fragment = f"padpx{padding_px}-padfrac{padding_frac}"
    gallery_cache_path = cache_dir / f"gallery-{backend_name}-{model_fragment}-{gallery_mode}.cache"
    query_cache_path = cache_dir / f"predictions-{backend_name}-{model_fragment}-{gallery_mode}-{filter_fragment}-{crop_fragment}.cache"

    print(f"[pipe] backend={backend_name} model_id={backend.model_id} device={backend.resolved_device()}")
    print(f"[pipe] raw_predictions={len(raw_predictions)} filtered_predictions={len(filtered_predictions)} gallery_entries={len(full_gallery_entries)}")
    gallery_embeddings = load_or_compute_embeddings(
        backend=backend,
        specs=gallery_specs,
        cache_path=gallery_cache_path,
        label="gallery",
    )
    query_embeddings = load_or_compute_embeddings(
        backend=backend,
        specs=query_specs,
        cache_path=query_cache_path,
        label="predicted-query",
    )

    gallery_entries_with_spec_ids = []
    for entry in full_gallery_entries:
        gallery_entries_with_spec_ids.append(
            {
                **entry,
                "spec_id": f"gallery::{normalize_relative_path(entry['path'])}",
            }
        )

    detector_only_predictions_path = artifacts_dir / "filtered-detector-predictions.json"
    build_detector_only_predictions(filtered_predictions, detector_only_predictions_path)

    assignment_rows = []
    final_predictions = []
    assignment_source_counts = Counter()
    predicted_category_counts = Counter()
    margin_values = []
    score_values = []
    category_name_by_id = {
        row["id"]: row["name"]
        for row in eval_context["val_coco"]["categories"]
    }

    for index, prediction in enumerate(filtered_predictions, start=1):
        query_spec_id = f"prediction::{prediction['prediction_index']}"
        ranked_rows = backend.rank_category_scores(
            query_embedding=query_embeddings[query_spec_id],
            gallery_embeddings=gallery_embeddings,
            gallery_entries=gallery_entries_with_spec_ids,
        )
        require(ranked_rows, f"No ranked categories produced for prediction {prediction['prediction_index']}.")
        top_rows = ranked_rows[:ranking_top_k]
        top1 = top_rows[0]
        second_score = top_rows[1]["score"] if len(top_rows) > 1 else None
        score_margin = top1["score"] - second_score if second_score is not None else None
        if score_margin is not None:
            margin_values.append(score_margin)
        score_values.append(top1["score"])
        assignment_source_counts[top1["source"]] += 1
        predicted_category_counts[top1["category_id"]] += 1

        assignment_rows.append(
            {
                "prediction_index": prediction["prediction_index"],
                "image_id": prediction["image_id"],
                "detector_score": prediction["score"],
                "bbox": prediction["bbox"],
                "chosen_category_id": top1["category_id"],
                "chosen_category_name": category_name_by_id[top1["category_id"]],
                "chosen_product_code": top1["product_code"],
                "chosen_source": top1["source"],
                "retrieval_top1_score": top1["score"],
                "retrieval_top2_score": second_score,
                "retrieval_margin": score_margin,
                "top_candidates": [
                    {
                        "category_id": row["category_id"],
                        "category_name": category_name_by_id[row["category_id"]],
                        "product_code": row["product_code"],
                        "source": row["source"],
                        "score": row["score"],
                    }
                    for row in top_rows
                ],
            }
        )
        final_predictions.append(
            {
                "image_id": prediction["image_id"],
                "category_id": top1["category_id"],
                "bbox": prediction["bbox"],
                "score": prediction["score"],
            }
        )
        if index % 250 == 0 or index == len(filtered_predictions):
            print(f"[pipe] assigned {index}/{len(filtered_predictions)} predictions")

    assignments_jsonl = artifacts_dir / "retrieval-assignments.jsonl"
    write_jsonl(assignments_jsonl, assignment_rows)
    final_predictions_path = artifacts_dir / "predictions.json"
    write_json(final_predictions_path, final_predictions)
    write_json(
        artifacts_dir / "gallery-full.json",
        [
            {
                "category_id": entry["category_id"],
                "category_name": entry["category_name"],
                "product_code": entry["product_code"],
                "path": normalize_relative_path(entry["path"]),
                "source": entry["source"],
            }
            for entry in full_gallery_entries
        ],
    )

    detector_only_eval = evaluate_predictions(
        predictions_path=detector_only_predictions_path,
        output_dir=output_dir / "eval-detector-only",
        count_score_threshold=count_score_threshold,
    )
    pipeline_eval = evaluate_predictions(
        predictions_path=final_predictions_path,
        output_dir=output_dir / "eval-pipeline",
        count_score_threshold=count_score_threshold,
    )
    oracle_summary = run_oracle_class_bound(
        predictions_path=detector_only_predictions_path,
        output_dir=output_dir / "oracle-class-bound",
        background_category_id=0,
        count_score_threshold=count_score_threshold,
    )

    detector_only_global = detector_only_eval["metrics"]["global"]
    pipeline_global = pipeline_eval["metrics"]["global"]
    oracle_global = oracle_summary["metrics"]["global"]

    require_close(
        pipeline_global["detection_ap50_ignore_class"],
        detector_only_global["detection_ap50_ignore_class"],
        1e-12,
        "Pipeline detection AP50 drifted away from detector-only baseline",
    )
    require_close(
        pipeline_global["miss_rate"],
        detector_only_global["miss_rate"],
        1e-12,
        "Pipeline miss-rate drifted away from detector-only baseline",
    )
    require_close(
        pipeline_global["duplicate_box_rate"],
        detector_only_global["duplicate_box_rate"],
        1e-12,
        "Pipeline duplicate-rate drifted away from detector-only baseline",
    )

    detector_only_cls = detector_only_global["classification_map50"]
    pipeline_cls = pipeline_global["classification_map50"]
    oracle_cls = oracle_global["classification_map50"]
    cls_denominator = oracle_cls - detector_only_cls
    cls_recovery = None if cls_denominator <= 0 else (pipeline_cls - detector_only_cls) / cls_denominator

    summary = {
        "experiment_id": experiment_id,
        "label": label or backend_name,
        "backend": backend_name,
        "model_id": backend.model_id,
        "gallery_mode": gallery_mode,
        "detector_predictions_path": normalize_relative_path(detector_predictions_path),
        "detector_filter": {
            "min_score": min_score,
            "max_det_per_image": max_det_per_image,
        },
        "query_crop": {
            "padding_px": padding_px,
            "padding_frac": padding_frac,
        },
        "ranking_top_k": ranking_top_k,
        "backend_details": backend.describe(),
        "input_prediction_meta": input_meta,
        "gallery_cache_path": normalize_relative_path(gallery_cache_path),
        "query_cache_path": normalize_relative_path(query_cache_path),
        "filtered_prediction_count": len(filtered_predictions),
        "gallery_image_count": len(full_gallery_entries),
        "gallery_category_count": len({entry["category_id"] for entry in full_gallery_entries}),
        "assignment_source_counts": dict(sorted(assignment_source_counts.items())),
        "predicted_category_count": len(predicted_category_counts),
        "top_predicted_categories": [
            {
                "category_id": category_id,
                "category_name": category_name_by_id[category_id],
                "count": count,
            }
            for category_id, count in predicted_category_counts.most_common(20)
        ],
        "retrieval_score_summary": {
            "top1_score_mean": round(mean(score_values), 6),
            "top1_score_median": round(median(score_values), 6),
            "margin_mean": round(mean(margin_values), 6) if margin_values else None,
            "margin_median": round(median(margin_values), 6) if margin_values else None,
        },
        "artifacts": {
            "detector_only_predictions_json": normalize_relative_path(detector_only_predictions_path),
            "pipeline_predictions_json": normalize_relative_path(final_predictions_path),
            "retrieval_assignments_jsonl": normalize_relative_path(assignments_jsonl),
            "detector_only_eval_dir": normalize_relative_path(output_dir / "eval-detector-only"),
            "pipeline_eval_dir": normalize_relative_path(output_dir / "eval-pipeline"),
            "oracle_class_bound_dir": normalize_relative_path(output_dir / "oracle-class-bound"),
        },
        "detector_only_global": detector_only_global,
        "pipeline_global": pipeline_global,
        "oracle_class_global": oracle_global,
        "gaps": {
            "classification_map50_gain_vs_detector_only": round(pipeline_cls - detector_only_cls, 6),
            "hybrid_gain_vs_detector_only": round(pipeline_global["hybrid_proxy"] - detector_only_global["hybrid_proxy"], 6),
            "classification_map50_gap_to_oracle": round(oracle_cls - pipeline_cls, 6),
            "hybrid_gap_to_oracle": round(oracle_global["hybrid_proxy"] - pipeline_global["hybrid_proxy"], 6),
            "classification_recovery_fraction_vs_oracle": round(cls_recovery, 6) if cls_recovery is not None else None,
        },
    }
    write_json(output_dir / "summary.json", summary)
    write_json(
        artifacts_dir / "run-manifest.json",
        {
            key: value
            for key, value in summary.items()
            if key not in {"detector_only_global", "pipeline_global", "oracle_class_global", "gaps"}
        },
    )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the first real detector-plus-retrieval NorgesGruppen pipeline on saved detector predictions.")
    parser.add_argument("--detector-predictions", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--backend", choices=["hash_debug", "pe_core_openclip", "dinov3_timm", "dinov3_transformers"], required=True)
    parser.add_argument("--model-id", default=None)
    parser.add_argument("--gallery-mode", choices=["representative", "all"], default="representative")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--min-score", type=float, default=0.4)
    parser.add_argument("--max-det-per-image", type=int, default=None)
    parser.add_argument("--padding-px", type=int, default=0)
    parser.add_argument("--padding-frac", type=float, default=0.0)
    parser.add_argument("--ranking-top-k", type=int, default=5)
    parser.add_argument("--count-score-threshold", type=float, default=0.05)
    parser.add_argument("--experiment-id", default=None)
    parser.add_argument("--label", default=None)
    args = parser.parse_args()

    summary = run_pipeline(
        detector_predictions_path=args.detector_predictions,
        output_dir=args.output_dir,
        backend_name=args.backend,
        model_id=args.model_id,
        gallery_mode=args.gallery_mode,
        device=args.device,
        batch_size=args.batch_size,
        min_score=args.min_score,
        max_det_per_image=args.max_det_per_image,
        padding_px=args.padding_px,
        padding_frac=args.padding_frac,
        ranking_top_k=args.ranking_top_k,
        count_score_threshold=args.count_score_threshold,
        experiment_id=args.experiment_id,
        label=args.label,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
