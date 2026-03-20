#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

from norgesgruppen_crop_benchmark_common import (
    bucket_queries,
    evaluate_ranked_queries,
    load_crop_eval_context,
    normalize_relative_path,
)
from norgesgruppen_prep_common import iter_jsonl, write_json


def dedupe_preserve_order(values: list[int]) -> list[int]:
    seen = set()
    ordered = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        ordered.append(value)
    return ordered


def load_ranking_rows(path: Path) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    if path.suffix == ".jsonl":
        return {}, list(iter_jsonl(path))

    payload = json.loads(path.read_text())
    if isinstance(payload, list):
        return {}, payload
    if isinstance(payload, dict):
        if "rankings" in payload:
            metadata = {
                key: value
                for key, value in payload.items()
                if key != "rankings"
            }
            return metadata, payload["rankings"]
        if payload and all(str(key).isdigit() for key in payload):
            return {}, [
                {
                    "annotation_id": int(annotation_id),
                    "ranked_category_ids": ranked_category_ids,
                }
                for annotation_id, ranked_category_ids in payload.items()
            ]
    raise ValueError(f"Unsupported rankings payload format: {path}")


def normalize_ranking_row(row: dict[str, Any]) -> tuple[int, list[int]]:
    annotation_id = int(row["annotation_id"])
    if "ranked_category_ids" in row:
        ranked_category_ids = [int(category_id) for category_id in row["ranked_category_ids"]]
    elif "ranked_ids" in row:
        ranked_category_ids = [int(category_id) for category_id in row["ranked_ids"]]
    elif "category_ids" in row:
        ranked_category_ids = [int(category_id) for category_id in row["category_ids"]]
    elif "candidates" in row:
        ranked_category_ids = [
            int(candidate["category_id"])
            for candidate in sorted(
                row["candidates"],
                key=lambda candidate: (-float(candidate.get("score", 0.0)), int(candidate["category_id"])),
            )
        ]
    elif "scores_by_category_id" in row:
        ranked_category_ids = [
            int(category_id)
            for category_id, _score in sorted(
                row["scores_by_category_id"].items(),
                key=lambda item: (-float(item[1]), int(item[0])),
            )
        ]
    else:
        raise ValueError(f"Ranking row missing supported ranking fields: {row}")
    return annotation_id, dedupe_preserve_order(ranked_category_ids)


def build_rankings_index(rows: list[dict[str, Any]]) -> tuple[dict[int, list[int]], dict[str, Any]]:
    ranked_category_ids_by_query = {}
    duplicate_query_ids = Counter()
    ranked_length_counter = Counter()
    for row in rows:
        annotation_id, ranked_category_ids = normalize_ranking_row(row)
        if annotation_id in ranked_category_ids_by_query:
            duplicate_query_ids[annotation_id] += 1
        ranked_category_ids_by_query[annotation_id] = ranked_category_ids
        ranked_length_counter[len(ranked_category_ids)] += 1
    summary = {
        "row_count_loaded": len(rows),
        "unique_query_count": len(ranked_category_ids_by_query),
        "duplicate_query_id_count": len(duplicate_query_ids),
        "duplicate_query_ids": sorted(duplicate_query_ids)[:200],
        "ranked_length_histogram": {
            str(length): count
            for length, count in sorted(ranked_length_counter.items())
        },
    }
    return ranked_category_ids_by_query, summary


def evaluate_rankings(
    rankings_path: Path,
    output_dir: Path,
    gallery_mode: str,
    label: str,
    experiment_id: str | None,
    model_name: str | None,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    metadata, ranking_rows = load_ranking_rows(rankings_path)
    ranked_category_ids_by_query, ranking_input_summary = build_rankings_index(ranking_rows)
    crop_eval_context = load_crop_eval_context(gallery_mode=gallery_mode)
    slice_defs = crop_eval_context["slice_defs"]
    all_val_query_ids = {row["annotation_id"] for row in crop_eval_context["gt_rows"]}
    extra_query_ids = sorted(query_id for query_id in ranked_category_ids_by_query if query_id not in all_val_query_ids)

    effective_label = label or metadata.get("label") or metadata.get("model_name") or rankings_path.stem
    effective_experiment_id = experiment_id or metadata.get("experiment_id")
    effective_model_name = model_name or metadata.get("model_name")

    metrics = {
        "experiment_id": effective_experiment_id,
        "label": effective_label,
        "model_name": effective_model_name,
        "gallery_mode": gallery_mode,
        "rankings_path": normalize_relative_path(rankings_path),
        "ranking_input_summary": {
            **ranking_input_summary,
            "extra_query_id_count": len(extra_query_ids),
            "extra_query_ids": extra_query_ids[:200],
        },
        "slices": {},
    }
    error_summary = {}

    for slice_name, slice_def in slice_defs.items():
        eligible_category_ids = sorted({entry["category_id"] for entry in slice_def["gallery_entries"]})
        slice_metrics, slice_errors = evaluate_ranked_queries(
            queries=slice_def["queries"],
            ranked_category_ids_by_query=ranked_category_ids_by_query,
            eligible_category_ids=eligible_category_ids,
        )
        bucketed = {}
        for key in ("theme", "classification_readiness_bucket"):
            bucketed[key] = {}
            for bucket, bucket_rows in bucket_queries(slice_def["queries"], key).items():
                bucket_metrics, _ = evaluate_ranked_queries(
                    queries=bucket_rows,
                    ranked_category_ids_by_query=ranked_category_ids_by_query,
                    eligible_category_ids=eligible_category_ids,
                )
                bucketed[key][bucket] = bucket_metrics
        metrics["slices"][slice_name] = {
            "query_count": len(slice_def["queries"]),
            "gallery_image_count": len(slice_def["gallery_entries"]),
            "gallery_category_count": len(slice_def["gallery_category_ids"]),
            "result": {
                "slice": slice_name,
                "label": effective_label,
                **slice_metrics,
                "bucketed_metrics": bucketed,
            },
        }
        error_summary[slice_name] = {
            effective_label: slice_errors,
        }

    if metadata:
        metrics["ranking_metadata"] = metadata

    write_json(output_dir / "metrics.json", metrics)
    write_json(output_dir / "error_summary.json", error_summary)
    return metrics


def main() -> None:
    parser = argparse.ArgumentParser(description="Evaluate GT-crop ranked category predictions for NorgesGruppen.")
    parser.add_argument("--rankings", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--gallery-mode", choices=["representative", "all"], default="representative")
    parser.add_argument("--label", default="")
    parser.add_argument("--experiment-id")
    parser.add_argument("--model-name")
    args = parser.parse_args()

    metrics = evaluate_rankings(
        rankings_path=args.rankings,
        output_dir=args.output_dir,
        gallery_mode=args.gallery_mode,
        label=args.label,
        experiment_id=args.experiment_id,
        model_name=args.model_name,
    )
    print(json.dumps(metrics, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
