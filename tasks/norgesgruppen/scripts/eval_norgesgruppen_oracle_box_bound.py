#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path
from statistics import mean, median
from typing import Any

from eval_norgesgruppen_crop_rankings import load_ranking_rows, normalize_ranking_row
from eval_norgesgruppen_predictions import evaluate_predictions
from norgesgruppen_crop_benchmark_common import load_crop_eval_context, normalize_relative_path
from norgesgruppen_prep_common import display_path, write_json


def percentile(sorted_values: list[float], fraction: float) -> float:
    if not sorted_values:
        return 0.0
    if len(sorted_values) == 1:
        return sorted_values[0]
    position = max(0.0, min(1.0, fraction)) * (len(sorted_values) - 1)
    lower = int(position)
    upper = min(len(sorted_values) - 1, lower + 1)
    if lower == upper:
        return sorted_values[lower]
    weight = position - lower
    return sorted_values[lower] * (1.0 - weight) + sorted_values[upper] * weight


def summarize_scores(values: list[float]) -> dict[str, float]:
    if not values:
        return {
            "count": 0,
            "min": 0.0,
            "p10": 0.0,
            "median": 0.0,
            "mean": 0.0,
            "p90": 0.0,
            "max": 0.0,
        }
    ordered = sorted(values)
    return {
        "count": len(values),
        "min": round(ordered[0], 6),
        "p10": round(percentile(ordered, 0.10), 6),
        "median": round(median(ordered), 6),
        "mean": round(mean(values), 6),
        "p90": round(percentile(ordered, 0.90), 6),
        "max": round(ordered[-1], 6),
    }


def load_ranked_category_ids_by_annotation(rankings_path: Path) -> tuple[dict[str, Any], dict[int, list[int]]]:
    metadata, rows = load_ranking_rows(rankings_path)
    ranked_category_ids_by_annotation = {}
    for row in rows:
        annotation_id, ranked_category_ids = normalize_ranking_row(row)
        ranked_category_ids_by_annotation[annotation_id] = ranked_category_ids
    return metadata, ranked_category_ids_by_annotation


def rescale_cosine_to_unit_interval(score: float) -> float:
    return max(0.0, min(1.0, (score + 1.0) / 2.0))


def load_cache_score_index(
    query_cache_path: Path,
    gallery_cache_path: Path,
    gallery_json_path: Path,
    ranked_category_ids_by_annotation: dict[int, list[int]],
) -> tuple[dict[int, dict[str, float | int]], dict[str, Any]]:
    try:
        import torch
    except ModuleNotFoundError as exc:
        raise RuntimeError(
            "Missing torch for cache-based scoring. Use .venv-crop via scripts/run_norgesgruppen_crop_python.sh."
        ) from exc

    query_embeddings = torch.load(query_cache_path, map_location="cpu", weights_only=False)
    gallery_embeddings = torch.load(gallery_cache_path, map_location="cpu", weights_only=False)
    gallery_entries = json.loads(gallery_json_path.read_text())

    gallery_vectors = []
    gallery_category_ids = []
    for entry in gallery_entries:
        spec_id = f"gallery::{entry['path']}"
        gallery_vectors.append(gallery_embeddings[spec_id])
        gallery_category_ids.append(int(entry["category_id"]))
    gallery_matrix = torch.stack(gallery_vectors)

    category_ids_in_gallery = sorted(set(gallery_category_ids))
    category_to_entry_indices = {
        category_id: [index for index, value in enumerate(gallery_category_ids) if value == category_id]
        for category_id in category_ids_in_gallery
    }

    score_index = {}
    top1_mismatch_count = 0
    mismatch_examples = []
    for annotation_id, ranked_category_ids in ranked_category_ids_by_annotation.items():
        if not ranked_category_ids:
            continue
        query_spec_id = f"query::{annotation_id}"
        query_embedding = query_embeddings[query_spec_id]
        entry_scores = gallery_matrix @ query_embedding

        category_scores = {}
        for category_id, entry_indices in category_to_entry_indices.items():
            best_score = max(float(entry_scores[index].item()) for index in entry_indices)
            category_scores[category_id] = best_score

        ordered_category_ids = [
            category_id
            for category_id, _score in sorted(category_scores.items(), key=lambda item: (-item[1], item[0]))
        ]
        predicted_category_id = ranked_category_ids[0]
        if ordered_category_ids and ordered_category_ids[0] != predicted_category_id:
            top1_mismatch_count += 1
            if len(mismatch_examples) < 20:
                mismatch_examples.append(
                    {
                        "annotation_id": annotation_id,
                        "rankings_top1_category_id": predicted_category_id,
                        "cache_top1_category_id": ordered_category_ids[0],
                    }
                )

        predicted_score = category_scores[predicted_category_id]
        next_best_category_id = ranked_category_ids[1] if len(ranked_category_ids) > 1 else None
        next_best_score = category_scores[next_best_category_id] if next_best_category_id is not None else None
        score_index[annotation_id] = {
            "predicted_category_id": predicted_category_id,
            "raw_top1_score": predicted_score,
            "score": rescale_cosine_to_unit_interval(predicted_score),
            "raw_top1_margin": predicted_score - next_best_score if next_best_score is not None else predicted_score,
            "cache_top1_category_id": ordered_category_ids[0] if ordered_category_ids else None,
        }

    summary = {
        "score_source": "cache_cosine_rescaled",
        "query_cache_path": normalize_relative_path(query_cache_path),
        "gallery_cache_path": normalize_relative_path(gallery_cache_path),
        "gallery_json_path": normalize_relative_path(gallery_json_path),
        "top1_mismatch_count": top1_mismatch_count,
        "mismatch_examples": mismatch_examples,
    }
    return score_index, summary


def build_oracle_predictions(
    rankings_path: Path,
    score_source: str,
    query_cache_path: Path | None,
    gallery_cache_path: Path | None,
    gallery_json_path: Path | None,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    metadata, ranked_category_ids_by_annotation = load_ranked_category_ids_by_annotation(rankings_path)
    crop_eval_context = load_crop_eval_context(gallery_mode="representative")
    query_rows = crop_eval_context["gt_rows"]
    query_by_annotation_id = {
        row["annotation_id"]: row
        for row in query_rows
    }

    score_index = {}
    score_summary = {
        "score_source": score_source,
    }
    if score_source == "cache_cosine_rescaled":
        if query_cache_path is None or gallery_cache_path is None or gallery_json_path is None:
            raise ValueError("cache_cosine_rescaled requires --query-cache, --gallery-cache, and --gallery-json")
        score_index, score_summary = load_cache_score_index(
            query_cache_path=query_cache_path,
            gallery_cache_path=gallery_cache_path,
            gallery_json_path=gallery_json_path,
            ranked_category_ids_by_annotation=ranked_category_ids_by_annotation,
        )
    elif score_source != "flat_one":
        raise ValueError(f"Unsupported score source: {score_source}")

    predictions = []
    missing_ranking_ids = []
    score_values = []
    raw_score_values = []
    margin_values = []

    for query_row in query_rows:
        annotation_id = query_row["annotation_id"]
        ranked_category_ids = ranked_category_ids_by_annotation.get(annotation_id, [])
        if not ranked_category_ids:
            missing_ranking_ids.append(annotation_id)
            continue

        predicted_category_id = ranked_category_ids[0]
        if score_source == "cache_cosine_rescaled":
            score_meta = score_index[annotation_id]
            prediction_score = float(score_meta["score"])
            raw_score_values.append(float(score_meta["raw_top1_score"]))
            margin_values.append(float(score_meta["raw_top1_margin"]))
        else:
            prediction_score = 1.0

        score_values.append(prediction_score)
        predictions.append(
            {
                "image_id": query_row["image_id"],
                "category_id": predicted_category_id,
                "bbox": [float(value) for value in query_row["bbox_xywh"]],
                "score": round(prediction_score, 6),
            }
        )

    manifest = {
        "rankings_path": normalize_relative_path(rankings_path),
        "ranking_metadata": metadata,
        "query_count_total": len(query_rows),
        "prediction_count": len(predictions),
        "missing_ranking_count": len(missing_ranking_ids),
        "missing_ranking_annotation_ids": missing_ranking_ids[:200],
        "score_summary": {
            **score_summary,
            "prediction_score_stats": summarize_scores(score_values),
            "raw_top1_score_stats": summarize_scores(raw_score_values),
            "raw_top1_margin_stats": summarize_scores(margin_values),
        },
    }
    return predictions, manifest


def run_oracle_box_bound(
    rankings_path: Path,
    output_dir: Path,
    score_source: str,
    query_cache_path: Path | None,
    gallery_cache_path: Path | None,
    gallery_json_path: Path | None,
    count_score_threshold: float,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    predictions, manifest = build_oracle_predictions(
        rankings_path=rankings_path,
        score_source=score_source,
        query_cache_path=query_cache_path,
        gallery_cache_path=gallery_cache_path,
        gallery_json_path=gallery_json_path,
    )
    predictions_path = output_dir / "predictions.json"
    write_json(predictions_path, predictions)

    eval_result = evaluate_predictions(
        predictions_path=predictions_path,
        output_dir=output_dir,
        count_score_threshold=count_score_threshold,
    )
    summary = {
        "rankings_path": display_path(rankings_path),
        "predictions_path": display_path(predictions_path),
        "output_dir": display_path(output_dir),
        "count_score_threshold": count_score_threshold,
        "oracle_box_manifest": manifest,
        "metrics": eval_result["metrics"],
    }
    write_json(output_dir / "bound_manifest.json", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Evaluate oracle-box upper bounds by turning GT crop rankings into full-image competition predictions."
    )
    parser.add_argument("--rankings", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--score-source", choices=["cache_cosine_rescaled", "flat_one"], default="cache_cosine_rescaled")
    parser.add_argument("--query-cache", type=Path, default=None)
    parser.add_argument("--gallery-cache", type=Path, default=None)
    parser.add_argument("--gallery-json", type=Path, default=None)
    parser.add_argument("--count-score-threshold", type=float, default=0.05)
    args = parser.parse_args()

    summary = run_oracle_box_bound(
        rankings_path=args.rankings,
        output_dir=args.output_dir,
        score_source=args.score_source,
        query_cache_path=args.query_cache,
        gallery_cache_path=args.gallery_cache,
        gallery_json_path=args.gallery_json,
        count_score_threshold=args.count_score_threshold,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
