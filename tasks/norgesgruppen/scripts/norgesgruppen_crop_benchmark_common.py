#!/usr/bin/env python3

from __future__ import annotations

from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean
from typing import Any

from norgesgruppen_prep_common import (
    CATEGORY_MANIFEST_JSON,
    CATEGORY_STRATEGY_MANIFEST_JSON,
    GT_CROP_MANIFEST_JSONL,
    PRODUCT_ROOT,
    ROOT,
    iter_jsonl,
    read_json,
)


def best_reference_image_types(image_types: list[str], gallery_mode: str) -> list[str]:
    if gallery_mode == "all":
        return sorted(image_types)
    for candidate in ("main", "front"):
        if candidate in image_types:
            return [candidate]
    return [sorted(image_types)[0]] if image_types else []


def category_gallery_entries(
    category_row: dict[str, Any],
    category_strategy_row: dict[str, Any],
    gallery_mode: str,
) -> list[dict[str, Any]]:
    entries = []
    exact_status = category_row["exact_match_status"]
    decision = category_row["manual_review_decision"]

    if exact_status == "exact_unique_with_images":
        product = category_row["exact_match_products"][0]
        for image_type in best_reference_image_types(product["image_types"], gallery_mode):
            path = PRODUCT_ROOT / product["product_code"] / f"{image_type}.jpg"
            if path.exists():
                entries.append(
                    {
                        "category_id": category_row["category_id"],
                        "category_name": category_row["category_name"],
                        "product_code": product["product_code"],
                        "path": path,
                        "source": "exact",
                    }
                )

    if decision == "map_likely":
        product_code = category_strategy_row["best_reference_product_code"]
        image_types = category_strategy_row["best_reference_image_types"]
        for image_type in best_reference_image_types(image_types, gallery_mode):
            path = PRODUCT_ROOT / product_code / f"{image_type}.jpg"
            if path.exists():
                entries.append(
                    {
                        "category_id": category_row["category_id"],
                        "category_name": category_row["category_name"],
                        "product_code": product_code,
                        "path": path,
                        "source": "map_likely",
                    }
                )

    if exact_status == "exact_name_ambiguous":
        for product in category_row["exact_match_products"]:
            if not product["has_images"]:
                continue
            for image_type in best_reference_image_types(product["image_types"], gallery_mode):
                path = PRODUCT_ROOT / product["product_code"] / f"{image_type}.jpg"
                if path.exists():
                    entries.append(
                        {
                            "category_id": category_row["category_id"],
                            "category_name": category_row["category_name"],
                            "product_code": product["product_code"],
                            "path": path,
                            "source": "ambiguous_exact_name",
                        }
                    )

    unique = {}
    for entry in entries:
        key = (entry["category_id"], entry["product_code"], str(entry["path"]))
        unique[key] = entry
    return list(unique.values())


def build_slice_definitions(
    category_manifest: list[dict[str, Any]],
    category_strategy: list[dict[str, Any]],
    gt_rows: list[dict[str, Any]],
    gallery_mode: str,
) -> dict[str, dict[str, Any]]:
    category_strategy_by_id = {
        row["category_id"]: row
        for row in category_strategy
    }

    strict_category_ids = sorted(
        row["category_id"]
        for row in category_manifest
        if row["exact_match_status"] == "exact_unique_with_images"
    )
    extended_category_ids = sorted(
        row["category_id"]
        for row in category_manifest
        if row["exact_match_status"] == "exact_unique_with_images" or row["manual_review_decision"] == "map_likely"
    )
    full_gallery_category_ids = sorted(
        row["category_id"]
        for row in category_manifest
        if row["exact_match_status"] == "exact_unique_with_images"
        or row["manual_review_decision"] == "map_likely"
        or row["exact_match_status"] == "exact_name_ambiguous"
    )

    slice_defs = {
        "strict": {
            "query_filter": lambda row: row["exact_match_status"] == "exact_unique_with_images",
            "gallery_category_ids": set(strict_category_ids),
        },
        "extended": {
            "query_filter": lambda row: row["exact_match_status"] == "exact_unique_with_images" or row["manual_review_decision"] == "map_likely",
            "gallery_category_ids": set(extended_category_ids),
        },
        "full": {
            "query_filter": lambda row: True,
            "gallery_category_ids": set(full_gallery_category_ids),
        },
    }

    for slice_name, slice_def in slice_defs.items():
        slice_def["queries"] = [
            row
            for row in gt_rows
            if row["split"] == "val" and slice_def["query_filter"](row)
        ]
        gallery_entries = []
        for category_row in category_manifest:
            if category_row["category_id"] not in slice_def["gallery_category_ids"]:
                continue
            gallery_entries.extend(
                category_gallery_entries(
                    category_row=category_row,
                    category_strategy_row=category_strategy_by_id[category_row["category_id"]],
                    gallery_mode=gallery_mode,
                )
            )
        slice_def["gallery_entries"] = gallery_entries
        slice_def["gallery_category_ids"] = sorted({entry["category_id"] for entry in gallery_entries})
    return slice_defs


def load_crop_eval_context(gallery_mode: str) -> dict[str, Any]:
    category_manifest = read_json(CATEGORY_MANIFEST_JSON)
    category_strategy = read_json(CATEGORY_STRATEGY_MANIFEST_JSON)
    category_strategy_by_id = {
        row["category_id"]: row
        for row in category_strategy
    }
    gt_rows = []
    for row in iter_jsonl(GT_CROP_MANIFEST_JSONL):
        if row["split"] != "val":
            continue
        strategy = category_strategy_by_id[row["category_id"]]
        gt_rows.append(
            {
                **row,
                "classification_readiness_bucket": strategy["classification_readiness_bucket"],
            }
        )

    slice_defs = build_slice_definitions(
        category_manifest=category_manifest,
        category_strategy=category_strategy,
        gt_rows=gt_rows,
        gallery_mode=gallery_mode,
    )
    return {
        "category_manifest": category_manifest,
        "category_strategy": category_strategy,
        "gt_rows": gt_rows,
        "slice_defs": slice_defs,
    }


def bucket_queries(queries: list[dict[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    buckets = defaultdict(list)
    for query in queries:
        buckets[query[key]].append(query)
    return dict(sorted(buckets.items()))


def evaluate_ranked_queries(
    queries: list[dict[str, Any]],
    ranked_category_ids_by_query: dict[int, list[int]],
    eligible_category_ids: list[int],
) -> tuple[dict[str, Any], dict[str, Any]]:
    total_queries = len(queries)
    eligible_category_ids_set = set(eligible_category_ids)
    evaluable_queries = [query for query in queries if query["category_id"] in eligible_category_ids]
    evaluable_query_ids = {query["annotation_id"] for query in evaluable_queries}

    top1_hits = 0
    top5_hits = 0
    top10_hits = 0
    ap20_values = []
    top1_hits_evaluable = 0
    top5_hits_evaluable = 0
    top10_hits_evaluable = 0
    ap20_values_evaluable = []
    impossible_by_category = Counter()
    confusion_counts = Counter()
    missing_ranking_ids = []
    empty_ranking_ids = []
    provided_ranking_query_count = 0
    nonempty_ranking_query_count = 0
    filtered_empty_ranking_ids = []
    filtered_nonempty_ranking_query_count = 0

    for query in queries:
        annotation_id = query["annotation_id"]
        ranked_ids_raw = ranked_category_ids_by_query.get(annotation_id)
        if ranked_ids_raw is None:
            ranked_ids_raw = []
            missing_ranking_ids.append(annotation_id)
        else:
            provided_ranking_query_count += 1
            if ranked_ids_raw:
                nonempty_ranking_query_count += 1
            else:
                empty_ranking_ids.append(annotation_id)

        ranked_ids = [
            category_id
            for category_id in ranked_ids_raw
            if category_id in eligible_category_ids_set
        ]
        if ranked_ids:
            filtered_nonempty_ranking_query_count += 1
        else:
            filtered_empty_ranking_ids.append(annotation_id)

        true_category_id = query["category_id"]
        if true_category_id not in eligible_category_ids:
            impossible_by_category[true_category_id] += 1
            ap20_values.append(0.0)
            continue

        rank = ranked_ids.index(true_category_id) + 1 if true_category_id in ranked_ids else None
        top1 = rank == 1
        top5 = rank is not None and rank <= 5
        top10 = rank is not None and rank <= 10
        ap20 = (1.0 / rank) if rank is not None and rank <= 20 else 0.0

        top1_hits += int(top1)
        top5_hits += int(top5)
        top10_hits += int(top10)
        ap20_values.append(ap20)
        top1_hits_evaluable += int(top1)
        top5_hits_evaluable += int(top5)
        top10_hits_evaluable += int(top10)
        ap20_values_evaluable.append(ap20)

        if not top1 and ranked_ids:
            confusion_counts[(true_category_id, ranked_ids[0])] += 1

    metrics = {
        "query_count_total": total_queries,
        "query_count_evaluable": len(evaluable_queries),
        "query_count_unevaluable": total_queries - len(evaluable_queries),
        "evaluable_query_fraction": round(len(evaluable_queries) / total_queries, 6) if total_queries else 0.0,
        "gallery_category_count": len(eligible_category_ids),
        "provided_ranking_query_count": provided_ranking_query_count,
        "provided_ranking_query_fraction": round(provided_ranking_query_count / total_queries, 6) if total_queries else 0.0,
        "nonempty_ranking_query_count": nonempty_ranking_query_count,
        "nonempty_ranking_query_fraction": round(nonempty_ranking_query_count / total_queries, 6) if total_queries else 0.0,
        "filtered_nonempty_ranking_query_count": filtered_nonempty_ranking_query_count,
        "filtered_nonempty_ranking_query_fraction": round(filtered_nonempty_ranking_query_count / total_queries, 6) if total_queries else 0.0,
        "top1_overall": round(top1_hits / total_queries, 6) if total_queries else 0.0,
        "top5_overall": round(top5_hits / total_queries, 6) if total_queries else 0.0,
        "top10_overall": round(top10_hits / total_queries, 6) if total_queries else 0.0,
        "map20_overall": round(mean(ap20_values), 6) if ap20_values else 0.0,
        "top1_evaluable_only": round(top1_hits_evaluable / len(evaluable_queries), 6) if evaluable_queries else 0.0,
        "top5_evaluable_only": round(top5_hits_evaluable / len(evaluable_queries), 6) if evaluable_queries else 0.0,
        "top10_evaluable_only": round(top10_hits_evaluable / len(evaluable_queries), 6) if evaluable_queries else 0.0,
        "map20_evaluable_only": round(mean(ap20_values_evaluable), 6) if ap20_values_evaluable else 0.0,
    }
    error_summary = {
        "top_impossible_categories": [
            {"category_id": category_id, "count": count}
            for category_id, count in impossible_by_category.most_common(10)
        ],
        "top_top1_confusions": [
            {"gt_category_id": gt_category_id, "pred_category_id": pred_category_id, "count": count}
            for (gt_category_id, pred_category_id), count in confusion_counts.most_common(10)
        ],
        "missing_ranking_count": len(missing_ranking_ids),
        "missing_ranking_query_ids": sorted(missing_ranking_ids)[:200],
        "empty_ranking_count": len(empty_ranking_ids),
        "empty_ranking_query_ids": sorted(empty_ranking_ids)[:200],
        "filtered_empty_ranking_count": len(filtered_empty_ranking_ids),
        "filtered_empty_ranking_query_ids": sorted(filtered_empty_ranking_ids)[:200],
        "evaluable_query_ids": sorted(evaluable_query_ids),
    }
    return metrics, error_summary


def normalize_relative_path(path: Path) -> str:
    try:
        return str(path.resolve().relative_to(ROOT))
    except ValueError:
        return str(path.resolve())
