#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import random
import subprocess
from collections import Counter, defaultdict
from pathlib import Path
from statistics import mean
from typing import Any

from norgesgruppen_crop_benchmark_common import (
    evaluate_ranked_queries as common_evaluate_ranked_queries,
    load_crop_eval_context,
)
from norgesgruppen_prep_common import (
    PRODUCT_ROOT,
    ROOT,
    read_json,
    write_json,
)


FEATURE_SIZE = 16


def clamp(value: int, lower: int, upper: int) -> int:
    return max(lower, min(upper, value))


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


def ffmpeg_rgb16(source_path: Path, crop_box: tuple[int, int, int, int] | None) -> bytes:
    filters = []
    if crop_box is not None:
        crop_x1, crop_y1, crop_x2, crop_y2 = crop_box
        crop_width = max(1, crop_x2 - crop_x1)
        crop_height = max(1, crop_y2 - crop_y1)
        filters.append(f"crop={crop_width}:{crop_height}:{crop_x1}:{crop_y1}")
    filters.append(f"scale={FEATURE_SIZE}:{FEATURE_SIZE}:flags=lanczos")
    command = [
        "ffmpeg",
        "-v",
        "error",
        "-i",
        str(source_path),
        "-vf",
        ",".join(filters),
        "-frames:v",
        "1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
    ]
    result = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True)
    expected_size = FEATURE_SIZE * FEATURE_SIZE * 3
    if len(result.stdout) != expected_size:
        raise ValueError(f"Unexpected raw frame size from {source_path}: {len(result.stdout)} != {expected_size}")
    return result.stdout


def block_average(values: list[int], x0: int, y0: int, block_size: int) -> int:
    total = 0
    count = 0
    for y in range(y0, y0 + block_size):
        row_offset = y * FEATURE_SIZE
        for x in range(x0, x0 + block_size):
            total += values[row_offset + x]
            count += 1
    return round(total / count)


def rgb_feature_from_raw(raw_rgb: bytes) -> dict[str, Any]:
    pixels = list(raw_rgb)
    reds = []
    greens = []
    blues = []
    luminance = []
    for index in range(0, len(pixels), 3):
        red = pixels[index]
        green = pixels[index + 1]
        blue = pixels[index + 2]
        reds.append(red)
        greens.append(green)
        blues.append(blue)
        luminance.append((77 * red + 150 * green + 29 * blue) >> 8)

    lum_8x8 = []
    for y in range(0, FEATURE_SIZE, 2):
        for x in range(0, FEATURE_SIZE, 2):
            lum_8x8.append(block_average(luminance, x, y, 2))
    lum_mean = sum(lum_8x8) / len(lum_8x8)
    ahash = 0
    for value in lum_8x8:
        ahash = (ahash << 1) | int(value >= lum_mean)

    red_mean = round(sum(reds) / len(reds))
    green_mean = round(sum(greens) / len(greens))
    blue_mean = round(sum(blues) / len(blues))

    color_hashes = {"red": 0, "green": 0, "blue": 0}
    for channel_name, channel_values, channel_mean in (
        ("red", reds, red_mean),
        ("green", greens, green_mean),
        ("blue", blues, blue_mean),
    ):
        for y in range(0, FEATURE_SIZE, 4):
            for x in range(0, FEATURE_SIZE, 4):
                block_value = block_average(channel_values, x, y, 4)
                color_hashes[channel_name] = (color_hashes[channel_name] << 1) | int(block_value >= channel_mean)

    return {
        "ahash": ahash,
        "color_hash_red": color_hashes["red"],
        "color_hash_green": color_hashes["green"],
        "color_hash_blue": color_hashes["blue"],
        "mean_rgb": [red_mean, green_mean, blue_mean],
    }


def feature_distance(a: dict[str, Any], b: dict[str, Any]) -> float:
    ahash_distance = (a["ahash"] ^ b["ahash"]).bit_count()
    color_distance = (
        (a["color_hash_red"] ^ b["color_hash_red"]).bit_count()
        + (a["color_hash_green"] ^ b["color_hash_green"]).bit_count()
        + (a["color_hash_blue"] ^ b["color_hash_blue"]).bit_count()
    )
    mean_rgb_distance = sum(abs(x - y) for x, y in zip(a["mean_rgb"], b["mean_rgb"]))
    return ahash_distance + 0.5 * color_distance + (mean_rgb_distance / 64.0)


def load_or_compute_gallery_cache(
    gallery_entries: list[dict[str, Any]],
    cache_path: Path,
) -> dict[str, dict[str, Any]]:
    cache = read_json(cache_path) if cache_path.exists() else {}
    changed = False
    for entry in gallery_entries:
        key = str(entry["path"].relative_to(ROOT))
        if key in cache:
            continue
        raw = ffmpeg_rgb16(entry["path"], crop_box=None)
        cache[key] = {
            "path": key,
            **rgb_feature_from_raw(raw),
        }
        changed = True
    if changed:
        write_json(cache_path, cache)
    return cache


def compute_query_crop_box(row: dict[str, Any], padding_px: int, padding_frac: float) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = row["bbox_xyxy"]
    width = x2 - x1
    height = y2 - y1
    pad_x = padding_px + round(width * padding_frac)
    pad_y = padding_px + round(height * padding_frac)
    crop_x1 = clamp(int(x1 - pad_x), 0, row["image_width"])
    crop_y1 = clamp(int(y1 - pad_y), 0, row["image_height"])
    crop_x2 = clamp(int(x2 + pad_x), 0, row["image_width"])
    crop_y2 = clamp(int(y2 + pad_y), 0, row["image_height"])
    if crop_x2 <= crop_x1:
        crop_x2 = min(row["image_width"], crop_x1 + 1)
    if crop_y2 <= crop_y1:
        crop_y2 = min(row["image_height"], crop_y1 + 1)
    return crop_x1, crop_y1, crop_x2, crop_y2


def load_or_compute_query_cache(
    query_rows: list[dict[str, Any]],
    cache_path: Path,
    padding_px: int,
    padding_frac: float,
) -> dict[str, dict[str, Any]]:
    cache = read_json(cache_path) if cache_path.exists() else {}
    changed = False
    pending_writes = 0
    for row in query_rows:
        key = str(row["annotation_id"])
        if key in cache:
            continue
        source_path = ROOT / row["image_file"]
        crop_box = compute_query_crop_box(row, padding_px=padding_px, padding_frac=padding_frac)
        raw = ffmpeg_rgb16(source_path, crop_box=crop_box)
        cache[key] = {
            "annotation_id": row["annotation_id"],
            **rgb_feature_from_raw(raw),
        }
        changed = True
        pending_writes += 1
        if pending_writes >= 100:
            write_json(cache_path, cache)
            pending_writes = 0
    if changed:
        write_json(cache_path, cache)
    return cache


def rank_categories_by_similarity(
    query_feature: dict[str, Any],
    gallery_entries: list[dict[str, Any]],
    gallery_cache: dict[str, dict[str, Any]],
) -> list[tuple[int, float]]:
    best_by_category = {}
    for entry in gallery_entries:
        cache_key = str(entry["path"].relative_to(ROOT))
        distance = feature_distance(query_feature, gallery_cache[cache_key])
        current = best_by_category.get(entry["category_id"])
        if current is None or distance < current:
            best_by_category[entry["category_id"]] = distance
    return sorted(best_by_category.items(), key=lambda item: (item[1], item[0]))


def evaluate_ranked_queries(
    queries: list[dict[str, Any]],
    ranked_category_ids_by_query: dict[int, list[int]],
    eligible_category_ids: list[int],
) -> tuple[dict[str, Any], dict[str, Any]]:
    total_queries = len(queries)
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

    for query in queries:
        ranked_ids = ranked_category_ids_by_query[query["annotation_id"]]
        true_category_id = query["category_id"]
        if true_category_id not in eligible_category_ids:
            impossible_by_category[true_category_id] += 1
            ap20_values.append(0.0)
            continue

        rank = ranked_ids.index(true_category_id) + 1
        top1 = rank <= 1
        top5 = rank <= 5
        top10 = rank <= 10
        ap20 = 1.0 / rank if rank <= 20 else 0.0

        top1_hits += int(top1)
        top5_hits += int(top5)
        top10_hits += int(top10)
        ap20_values.append(ap20)
        top1_hits_evaluable += int(top1)
        top5_hits_evaluable += int(top5)
        top10_hits_evaluable += int(top10)
        ap20_values_evaluable.append(ap20)

        if not top1:
            confusion_counts[(true_category_id, ranked_ids[0])] += 1

    metrics = {
        "query_count_total": total_queries,
        "query_count_evaluable": len(evaluable_queries),
        "query_count_unevaluable": total_queries - len(evaluable_queries),
        "evaluable_query_fraction": round(len(evaluable_queries) / total_queries, 6) if total_queries else 0.0,
        "gallery_category_count": len(eligible_category_ids),
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
        "evaluable_query_ids": sorted(evaluable_query_ids),
    }
    return metrics, error_summary


def bucket_queries(queries: list[dict[str, Any]], key: str) -> dict[str, list[dict[str, Any]]]:
    buckets = defaultdict(list)
    for query in queries:
        buckets[query[key]].append(query)
    return dict(sorted(buckets.items()))


def evaluate_baseline(
    baseline_name: str,
    slice_name: str,
    queries: list[dict[str, Any]],
    gallery_entries: list[dict[str, Any]],
    gallery_cache: dict[str, dict[str, Any]],
    query_cache: dict[str, dict[str, Any]],
    seed: int,
) -> tuple[dict[str, Any], dict[str, Any]]:
    eligible_category_ids = sorted({entry["category_id"] for entry in gallery_entries})
    ranked_category_ids_by_query = {}

    if baseline_name == "random":
        for query in queries:
            rng = random.Random(seed + query["annotation_id"])
            ranked_ids = list(eligible_category_ids)
            rng.shuffle(ranked_ids)
            ranked_category_ids_by_query[query["annotation_id"]] = ranked_ids
    elif baseline_name == "nearest_neighbor_hash":
        for query in queries:
            query_feature = query_cache[str(query["annotation_id"])]
            ranked = rank_categories_by_similarity(query_feature, gallery_entries, gallery_cache)
            ranked_category_ids_by_query[query["annotation_id"]] = [category_id for category_id, _ in ranked]
    else:
        raise ValueError(f"Unsupported baseline: {baseline_name}")

    metrics, error_summary = common_evaluate_ranked_queries(
        queries=queries,
        ranked_category_ids_by_query=ranked_category_ids_by_query,
        eligible_category_ids=eligible_category_ids,
    )
    bucketed = {}
    for key in ("theme", "classification_readiness_bucket"):
        bucketed[key] = {}
        for bucket, bucket_queries_rows in bucket_queries(queries, key).items():
            bucket_metrics, _ = common_evaluate_ranked_queries(
                queries=bucket_queries_rows,
                ranked_category_ids_by_query=ranked_category_ids_by_query,
                eligible_category_ids=eligible_category_ids,
            )
            bucketed[key][bucket] = bucket_metrics

    return (
        {
            "slice": slice_name,
            "baseline": baseline_name,
            **metrics,
            "bucketed_metrics": bucketed,
        },
        error_summary,
    )


def run_benchmark(
    output_dir: Path,
    gallery_mode: str,
    padding_px: int,
    padding_frac: float,
    seed: int,
) -> dict[str, Any]:
    output_dir.mkdir(parents=True, exist_ok=True)
    artifacts_dir = output_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    crop_eval_context = load_crop_eval_context(gallery_mode=gallery_mode)
    gt_rows = crop_eval_context["gt_rows"]
    slice_defs = crop_eval_context["slice_defs"]

    all_gallery_entries = []
    for slice_def in slice_defs.values():
        all_gallery_entries.extend(slice_def["gallery_entries"])
    unique_gallery_entries = {}
    for entry in all_gallery_entries:
        unique_gallery_entries[str(entry["path"].relative_to(ROOT))] = entry
    gallery_entries_all = list(unique_gallery_entries.values())

    gallery_cache = load_or_compute_gallery_cache(
        gallery_entries=gallery_entries_all,
        cache_path=artifacts_dir / "gallery-features.json",
    )
    query_cache = load_or_compute_query_cache(
        query_rows=gt_rows,
        cache_path=artifacts_dir / "query-features-val.json",
        padding_px=padding_px,
        padding_frac=padding_frac,
    )

    metrics = {
        "experiment_id": "EXP-0002",
        "gallery_mode": gallery_mode,
        "padding_px": padding_px,
        "padding_frac": padding_frac,
        "seed": seed,
        "slices": {},
    }
    error_summary = {}

    for slice_name, slice_def in slice_defs.items():
        metrics["slices"][slice_name] = {
            "query_count": len(slice_def["queries"]),
            "gallery_image_count": len(slice_def["gallery_entries"]),
            "gallery_category_count": len(slice_def["gallery_category_ids"]),
            "baselines": {},
        }
        error_summary[slice_name] = {}
        for baseline_name in ("random", "nearest_neighbor_hash"):
            baseline_metrics, baseline_errors = evaluate_baseline(
                baseline_name=baseline_name,
                slice_name=slice_name,
                queries=slice_def["queries"],
                gallery_entries=slice_def["gallery_entries"],
                gallery_cache=gallery_cache,
                query_cache=query_cache,
                seed=seed,
            )
            metrics["slices"][slice_name]["baselines"][baseline_name] = baseline_metrics
            error_summary[slice_name][baseline_name] = baseline_errors

    write_json(output_dir / "metrics.json", metrics)
    write_json(output_dir / "error_summary.json", error_summary)
    return {
        "metrics": metrics,
        "error_summary": error_summary,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark GT-crop recognition baselines for NorgesGruppen.")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=ROOT / "data" / "2026-03-19" / "experiments" / "EXP-0002-crop-random-and-nearest-neighbor-floor",
    )
    parser.add_argument("--gallery-mode", choices=["representative", "all"], default="representative")
    parser.add_argument("--padding-px", type=int, default=0)
    parser.add_argument("--padding-frac", type=float, default=0.0)
    parser.add_argument("--seed", type=int, default=20260320)
    args = parser.parse_args()

    result = run_benchmark(
        output_dir=args.output_dir,
        gallery_mode=args.gallery_mode,
        padding_px=args.padding_px,
        padding_frac=args.padding_frac,
        seed=args.seed,
    )
    print(json.dumps(result["metrics"], indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
