#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from eval_norgesgruppen_crop_rankings import build_rankings_index, load_ranking_rows
from norgesgruppen_crop_benchmark_common import bucket_queries, evaluate_ranked_queries, normalize_relative_path
from norgesgruppen_crop_classifier_common import (
    CLASSIFIER_BUCKET_KEYS,
    build_classifier_slice_defs,
    build_label_maps,
    load_classifier_manifest,
)
from norgesgruppen_prep_common import CROP_CLASSIFIER_TRAIN_JSONL, CROP_CLASSIFIER_VAL_JSONL, write_json


def evaluate_classifier_rankings(
    rankings_path: Path,
    output_dir: Path,
    train_manifest_path: Path,
    val_manifest_path: Path,
    label: str,
    experiment_id: str | None,
    model_name: str | None,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    metadata, ranking_rows = load_ranking_rows(rankings_path)
    ranked_category_ids_by_query, ranking_input_summary = build_rankings_index(ranking_rows)

    train_rows = load_classifier_manifest(train_manifest_path)
    val_rows = load_classifier_manifest(val_manifest_path)
    label_maps = build_label_maps(train_rows)
    eligible_category_ids = label_maps["eligible_category_ids"]
    eligible_category_id_set = set(eligible_category_ids)
    slice_defs = build_classifier_slice_defs(val_rows)
    all_val_query_ids = {int(row["annotation_id"]) for row in val_rows}
    extra_query_ids = sorted(query_id for query_id in ranked_category_ids_by_query if query_id not in all_val_query_ids)

    effective_label = label or metadata.get("label") or metadata.get("model_name") or rankings_path.stem
    effective_experiment_id = experiment_id or metadata.get("experiment_id")
    effective_model_name = model_name or metadata.get("model_name")

    metrics = {
        "experiment_id": effective_experiment_id,
        "label": effective_label,
        "model_name": effective_model_name,
        "rankings_path": normalize_relative_path(rankings_path),
        "train_manifest_path": normalize_relative_path(train_manifest_path),
        "val_manifest_path": normalize_relative_path(val_manifest_path),
        "ranking_input_summary": {
            **ranking_input_summary,
            "extra_query_id_count": len(extra_query_ids),
            "extra_query_ids": extra_query_ids[:200],
        },
        "eligible_category_count": len(eligible_category_ids),
        "eligible_category_ids": eligible_category_ids,
        "num_classes": label_maps["num_classes"],
        "slices": {},
    }
    error_summary = {}

    for slice_name, queries in slice_defs.items():
        slice_metrics, slice_errors = evaluate_ranked_queries(
            queries=queries,
            ranked_category_ids_by_query=ranked_category_ids_by_query,
            eligible_category_ids=eligible_category_ids,
        )
        bucketed = {}
        for key in CLASSIFIER_BUCKET_KEYS:
            bucketed[key] = {}
            for bucket, bucket_rows in bucket_queries(queries, key).items():
                bucket_metrics, _ = evaluate_ranked_queries(
                    queries=bucket_rows,
                    ranked_category_ids_by_query=ranked_category_ids_by_query,
                    eligible_category_ids=eligible_category_ids,
                )
                bucketed[key][bucket] = bucket_metrics
        metrics["slices"][slice_name] = {
            "query_count": len(queries),
            "eligible_category_count": len(eligible_category_ids),
            "eligible_category_count_in_slice": len(
                {int(row["category_id"]) for row in queries if int(row["category_id"]) in eligible_category_id_set}
            ),
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
    parser = argparse.ArgumentParser(description="Evaluate NorgesGruppen closed-set crop-classifier rankings.")
    parser.add_argument("--rankings", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--train-manifest", type=Path, default=CROP_CLASSIFIER_TRAIN_JSONL)
    parser.add_argument("--val-manifest", type=Path, default=CROP_CLASSIFIER_VAL_JSONL)
    parser.add_argument("--label", default="")
    parser.add_argument("--experiment-id")
    parser.add_argument("--model-name")
    args = parser.parse_args()

    metrics = evaluate_classifier_rankings(
        rankings_path=args.rankings,
        output_dir=args.output_dir,
        train_manifest_path=args.train_manifest,
        val_manifest_path=args.val_manifest,
        label=args.label,
        experiment_id=args.experiment_id,
        model_name=args.model_name,
    )
    print(json.dumps(metrics, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
