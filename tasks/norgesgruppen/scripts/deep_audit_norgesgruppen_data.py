#!/usr/bin/env python3

import difflib
import hashlib
import itertools
import json
import math
import re
import statistics
import subprocess
import unicodedata
import zipfile
from collections import Counter, defaultdict
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_DATE = "2026-03-19"
DATA_ROOT = ROOT / "data" / DATA_DATE
EXTRACTED_ROOT = DATA_ROOT / "extracted"
COCO_ROOT = EXTRACTED_ROOT / "coco" / "train"
COCO_IMAGES = COCO_ROOT / "images"
COCO_ANNOTATIONS = COCO_ROOT / "annotations.json"
PRODUCT_ROOT = EXTRACTED_ROOT / "product_images"
PRODUCT_METADATA = PRODUCT_ROOT / "metadata.json"
README = ROOT / "docs" / "norgesgruppen-data" / "README.md"
REPORT_JSON = ROOT / "docs" / "norgesgruppen-data" / "deep-audit-summary.json"
REPORT_MD = ROOT / "docs" / "norgesgruppen-data" / "deep-audit-summary.md"
ZIP_PATHS = {
    "coco": DATA_ROOT / "NM_NGD_coco_dataset.zip",
    "product_images": DATA_ROOT / "NM_NGD_product_images.zip",
}


def normalize_name(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).upper()
    value = re.sub(r"[^0-9A-ZÆØÅ]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def percentile(sorted_values, fraction):
    if not sorted_values:
        return None
    index = (len(sorted_values) - 1) * fraction
    lower = int(index)
    upper = min(lower + 1, len(sorted_values) - 1)
    remainder = index - lower
    return round(sorted_values[lower] * (1 - remainder) + sorted_values[upper] * remainder, 6)


def describe(values):
    sorted_values = sorted(values)
    if not sorted_values:
        return None
    return {
        "min": min(sorted_values),
        "p01": percentile(sorted_values, 0.01),
        "p05": percentile(sorted_values, 0.05),
        "p25": percentile(sorted_values, 0.25),
        "median": statistics.median(sorted_values),
        "mean": round(statistics.mean(sorted_values), 6),
        "p75": percentile(sorted_values, 0.75),
        "p95": percentile(sorted_values, 0.95),
        "p99": percentile(sorted_values, 0.99),
        "max": max(sorted_values),
    }


def shannon_entropy(counts):
    total = sum(counts)
    if total <= 0:
        return 0.0
    return -sum((count / total) * math.log(count / total) for count in counts if count)


def gini(values):
    sorted_values = sorted(values)
    if not sorted_values:
        return 0.0
    total = sum(sorted_values)
    if total == 0:
        return 0.0
    weighted_sum = sum((index + 1) * value for index, value in enumerate(sorted_values))
    return round((2 * weighted_sum) / (len(sorted_values) * total) - (len(sorted_values) + 1) / len(sorted_values), 6)


def bbox_iou(left_bbox, right_bbox):
    left_x, left_y, left_width, left_height = left_bbox
    right_x, right_y, right_width, right_height = right_bbox
    left_x2 = left_x + left_width
    left_y2 = left_y + left_height
    right_x2 = right_x + right_width
    right_y2 = right_y + right_height
    intersection_width = max(0.0, min(left_x2, right_x2) - max(left_x, right_x))
    intersection_height = max(0.0, min(left_y2, right_y2) - max(left_y, right_y))
    intersection = intersection_width * intersection_height
    if intersection <= 0:
        return 0.0
    union = left_width * left_height + right_width * right_height - intersection
    return round(intersection / union, 6)


def read_json(path: Path):
    return json.loads(path.read_text())


def sha256(path: Path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def ffprobe_dimensions(path: Path):
    proc = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-select_streams",
            "v:0",
            "-show_entries",
            "stream=width,height,codec_name",
            "-of",
            "default=noprint_wrappers=1:nokey=0",
            str(path),
        ],
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        return None, proc.stderr.strip()
    values = dict(
        line.split("=", 1)
        for line in proc.stdout.strip().splitlines()
        if "=" in line
    )
    return {
        "width": int(values["width"]),
        "height": int(values["height"]),
        "codec_name": values.get("codec_name"),
    }, ""


def ahash(path: Path):
    proc = subprocess.run(
        [
            "ffmpeg",
            "-v",
            "error",
            "-i",
            str(path),
            "-vf",
            "scale=8:8:flags=area,format=gray",
            "-f",
            "rawvideo",
            "-pix_fmt",
            "gray",
            "-",
        ],
        capture_output=True,
    )
    if proc.returncode != 0 or len(proc.stdout) != 64:
        return None
    values = list(proc.stdout)
    mean_value = sum(values) / len(values)
    bits = "".join("1" if value >= mean_value else "0" for value in values)
    return int(bits, 2)


def hamming_distance(left: int, right: int):
    return (left ^ right).bit_count()


def infer_theme(name: str):
    normalized = unicodedata.normalize("NFKC", name).upper()
    if any(token in normalized for token in ["KNEKKE", "WASA", "LEKSANDS", "FRIGGS", "RISKAKER", "MAISKAKER", "FLATBRØD", "RUGSPRØ", "SIGDAL", "FRØKRISP"]):
        return "knekkebrod"
    if any(
        token in normalized
        for token in [
            "KAFFE",
            "KOKMALT",
            "FILTERMALT",
            "PRESS",
            "BØNNER",
            "ESPRESSO",
            "LATTE",
            "CAPPUCC",
            "TE ",
            " TE",
            "NESCAFE",
            "DOLCE",
            "FRIELE",
            "EVERGOOD",
            "JACOBS",
            "ALI ",
            "ALI ORIGINAL",
            "O'BOY",
            "NESQUIK",
            "KAKAO",
            "SJOKOLADEDRIKK",
            "TODDY",
            "RETT I KOPPEN",
            "MOCHA",
            "FILTERPOSER",
            "KAFFEFILTER",
        ]
    ):
        return "varmedrikker"
    if any(token in normalized for token in ["EGG", "GÅRDSEGG", "FRITTGÅENDE", "PRIOR", "SUNNMØRSEGG", "VILJE", "VINGULMARK", "SOLEGG", "TOTEN"]):
        return "egg"
    if any(
        token in normalized
        for token in [
            "MÜSLI",
            "MUSLI",
            "GRYN",
            "FROKOST",
            "WEETABIX",
            "CORN",
            "LION",
            "CHEERIOS",
            "CINI",
            "CEREAL",
            "GRANOLA",
            "CRUESLI",
            "SMACKS",
            "POPS",
            "ALL-BRAN",
            "SPECIAL K",
            "HAVREFRAS",
            "SUPERGRØT",
            "HAVREGRØT",
            "MELLOMBAR",
            "PUFFET",
            "KORN",
            "QUINOA",
            "TRESOR",
        ]
    ):
        return "frokost"
    return "other"


def load_inputs():
    annotations = read_json(COCO_ANNOTATIONS)
    metadata = read_json(PRODUCT_METADATA)
    image_paths = sorted(path for path in COCO_IMAGES.iterdir() if path.is_file())
    product_dirs = sorted(path for path in PRODUCT_ROOT.iterdir() if path.is_dir())
    return annotations, metadata, image_paths, product_dirs


def audit_archives():
    sums_path = DATA_ROOT / "SHA256SUMS"
    expected = {}
    for line in sums_path.read_text().splitlines():
        if not line.strip():
            continue
        digest, name = line.split(None, 1)
        expected[name.strip()] = digest

    results = {}
    for key, zip_path in ZIP_PATHS.items():
        with zipfile.ZipFile(zip_path) as handle:
            infos = handle.infolist()
            files = [info for info in infos if not info.is_dir()]
        results[key] = {
            "path": str(zip_path),
            "sha256_expected": expected[zip_path.name],
            "sha256_actual": sha256(zip_path),
            "sha256_match": expected[zip_path.name] == sha256(zip_path),
            "zip_entries_total": len(infos),
            "zip_file_entries": len(files),
            "zip_uncompressed_bytes": sum(info.file_size for info in files),
            "zip_compressed_bytes": sum(info.compress_size for info in files),
            "zip_first_entries": [info.filename for info in infos[:10]],
        }
    return results


def audit_coco(annotations, image_paths):
    images = annotations["images"]
    categories = annotations["categories"]
    boxes = annotations["annotations"]
    images_by_id = {image["id"]: image for image in images}
    categories_by_id = {category["id"]: category for category in categories}
    image_paths_by_name = {path.name: path for path in image_paths}
    annotation_counts_by_image = Counter(box["image_id"] for box in boxes)
    annotation_counts_by_category = Counter(box["category_id"] for box in boxes)
    orientation_counts = Counter()
    dimension_counts = Counter()
    codec_counts = Counter()
    per_image_category_counts = defaultdict(Counter)
    boxes_by_image = defaultdict(list)
    missing_files = sorted({image["file_name"] for image in images} - set(image_paths_by_name))
    extra_files = sorted(set(image_paths_by_name) - {image["file_name"] for image in images})
    decode_errors = []
    dimension_mismatches = []
    bad_image_ids = []
    bad_category_ids = []
    negative_boxes = []
    out_of_bounds_boxes = []
    area_mismatches = []
    exact_duplicates = Counter()
    iscrowd_counts = Counter()
    annotation_ids = []
    aspect_ratios = []
    relative_widths = []
    relative_heights = []
    bbox_area_fractions = []
    per_image_labeled_area = defaultdict(float)
    center_bins = Counter()
    edge_margin_fractions = []
    edge_touch_1pct_counts_by_image = Counter()
    edge_touch_zero_counts_by_image = Counter()
    edge_touch_1pct_counts_by_category = Counter()

    for image in images:
        width = image["width"]
        height = image["height"]
        if width > height:
            orientation_counts["landscape"] += 1
        elif width < height:
            orientation_counts["portrait"] += 1
        else:
            orientation_counts["square"] += 1
        dimension_counts[(width, height)] += 1
        probed, error = ffprobe_dimensions(image_paths_by_name[image["file_name"]])
        if probed is None:
            decode_errors.append({"file_name": image["file_name"], "error": error})
            continue
        codec_counts[probed["codec_name"]] += 1
        if (width, height) != (probed["width"], probed["height"]):
            dimension_mismatches.append(
                {
                    "file_name": image["file_name"],
                    "expected": [width, height],
                    "actual": [probed["width"], probed["height"]],
                    "codec_name": probed["codec_name"],
                }
            )

    for box in boxes:
        annotation_ids.append(box["id"])
        if box["image_id"] not in images_by_id:
            bad_image_ids.append(box["id"])
            continue
        if box["category_id"] not in categories_by_id:
            bad_category_ids.append(box["id"])
        image = images_by_id[box["image_id"]]
        x, y, width, height = box["bbox"]
        per_image_category_counts[box["image_id"]][box["category_id"]] += 1
        boxes_by_image[box["image_id"]].append(box)
        exact_duplicates[(box["image_id"], box["category_id"], tuple(box["bbox"]))] += 1
        iscrowd_counts[box.get("iscrowd")] += 1
        if width <= 0 or height <= 0 or x < 0 or y < 0:
            negative_boxes.append({"annotation_id": box["id"], "bbox": box["bbox"]})
        if x + width > image["width"] or y + height > image["height"]:
            out_of_bounds_boxes.append(
                {
                    "annotation_id": box["id"],
                    "image_id": box["image_id"],
                    "bbox": box["bbox"],
                    "image_size": [image["width"], image["height"]],
                }
            )
        area = width * height
        if abs(area - box["area"]) > 1e-6:
            area_mismatches.append({"annotation_id": box["id"], "bbox": box["bbox"], "area": box["area"], "computed": area})
        aspect_ratios.append(round(width / height, 6))
        relative_widths.append(round(width / image["width"], 6))
        relative_heights.append(round(height / image["height"], 6))
        bbox_area_fraction = round(box["area"] / (image["width"] * image["height"]), 6)
        bbox_area_fractions.append(bbox_area_fraction)
        per_image_labeled_area[box["image_id"]] += box["area"]
        center_x = (x + width / 2) / image["width"]
        center_y = (y + height / 2) / image["height"]
        edge_margin_fraction = min(
            x / image["width"],
            y / image["height"],
            (image["width"] - (x + width)) / image["width"],
            (image["height"] - (y + height)) / image["height"],
        )
        edge_margin_fractions.append(round(edge_margin_fraction, 6))
        if edge_margin_fraction <= 0.01:
            edge_touch_1pct_counts_by_image[box["image_id"]] += 1
            edge_touch_1pct_counts_by_category[box["category_id"]] += 1
        if edge_margin_fraction == 0:
            edge_touch_zero_counts_by_image[box["image_id"]] += 1
        bin_x = min(4, int(center_x * 5))
        bin_y = min(4, int(center_y * 5))
        center_bins[(bin_x, bin_y)] += 1

    image_area_fractions = []
    for image_id, labeled_area in per_image_labeled_area.items():
        image = images_by_id[image_id]
        image_area_fractions.append(round(labeled_area / (image["width"] * image["height"]), 6))

    annotation_id_gaps = []
    sorted_ids = sorted(annotation_ids)
    for left, right in zip(sorted_ids, sorted_ids[1:]):
        if right != left + 1:
            annotation_id_gaps.append({"after": left, "before": right, "gap_size": right - left - 1})

    suspicious_categories = []
    for category in categories:
        name = category["name"]
        if not name.strip() or "  " in name or name.endswith(" W") or name.endswith(" LV"):
            suspicious_categories.append({"id": category["id"], "name": name})

    most_annotated_images = []
    least_annotated_images = []
    for image_id, count in sorted(annotation_counts_by_image.items(), key=lambda item: (-item[1], item[0]))[:15]:
        most_annotated_images.append({"image_id": image_id, "file_name": images_by_id[image_id]["file_name"], "count": count})
    for image_id, count in sorted(annotation_counts_by_image.items(), key=lambda item: (item[1], item[0]))[:15]:
        least_annotated_images.append({"image_id": image_id, "file_name": images_by_id[image_id]["file_name"], "count": count})

    category_image_coverage = defaultdict(set)
    for box in boxes:
        category_image_coverage[box["category_id"]].add(box["image_id"])
    category_image_counts = {category_id: len(image_ids) for category_id, image_ids in category_image_coverage.items()}
    most_widespread_categories = []
    least_widespread_categories = []
    for category_id in sorted(category_image_counts, key=lambda item: (-category_image_counts[item], item))[:15]:
        most_widespread_categories.append(
            {"category_id": category_id, "name": categories_by_id[category_id]["name"], "image_count": category_image_counts[category_id]}
        )
    for category_id in sorted(category_image_counts, key=lambda item: (category_image_counts[item], item))[:15]:
        least_widespread_categories.append(
            {"category_id": category_id, "name": categories_by_id[category_id]["name"], "image_count": category_image_counts[category_id]}
        )

    image_ids = sorted(images_by_id)
    image_id_gaps = []
    for left, right in zip(image_ids, image_ids[1:]):
        if right != left + 1:
            image_id_gaps.append({"after": left, "before": right, "gap_size": right - left - 1})

    distinct_categories_per_image = [len(per_image_category_counts[image["id"]]) for image in images]
    image_class_entropies = []
    image_top_class_fractions = []
    image_diversity_rows = []
    edge_touch_rows = []
    overlap_thresholds = [0.1, 0.25, 0.5, 0.75]
    overlap_pair_counts = Counter()
    same_category_overlap_pair_counts = Counter()
    cross_category_overlap_pair_counts = Counter()
    overlap_pair_count_per_image = {}
    max_overlap_iou_per_image = {}
    high_iou_pairs = []
    high_iou_cross_category_pairs = []
    total_box_pair_count = 0

    for image in images:
        image_id = image["id"]
        category_counts = per_image_category_counts[image_id]
        count_values = list(category_counts.values())
        image_entropy = round(shannon_entropy(count_values), 6)
        top_class_fraction = round(max(count_values) / sum(count_values), 6)
        image_class_entropies.append(image_entropy)
        image_top_class_fractions.append(top_class_fraction)
        image_diversity_rows.append(
            {
                "image_id": image_id,
                "file_name": image["file_name"],
                "annotation_count": annotation_counts_by_image[image_id],
                "distinct_category_count": len(category_counts),
                "class_entropy": image_entropy,
                "top_class_fraction": top_class_fraction,
                "top_categories": [
                    {
                        "category_id": category_id,
                        "name": categories_by_id[category_id]["name"],
                        "count": count,
                    }
                    for category_id, count in category_counts.most_common(5)
                ],
            }
        )
        edge_touch_rows.append(
            {
                "image_id": image_id,
                "file_name": image["file_name"],
                "annotation_count": annotation_counts_by_image[image_id],
                "edge_touch_zero_count": edge_touch_zero_counts_by_image[image_id],
                "edge_touch_1pct_count": edge_touch_1pct_counts_by_image[image_id],
                "edge_touch_1pct_fraction": round(edge_touch_1pct_counts_by_image[image_id] / annotation_counts_by_image[image_id], 6),
            }
        )

        image_boxes = boxes_by_image[image_id]
        image_overlap_pair_count = 0
        image_max_iou = 0.0
        for left_index, left_box in enumerate(image_boxes):
            for right_box in image_boxes[left_index + 1:]:
                total_box_pair_count += 1
                iou = bbox_iou(left_box["bbox"], right_box["bbox"])
                if iou > 0:
                    image_overlap_pair_count += 1
                    image_max_iou = max(image_max_iou, iou)
                for threshold in overlap_thresholds:
                    if iou >= threshold:
                        overlap_pair_counts[threshold] += 1
                        if left_box["category_id"] == right_box["category_id"]:
                            same_category_overlap_pair_counts[threshold] += 1
                        else:
                            cross_category_overlap_pair_counts[threshold] += 1
                if iou >= 0.5:
                    row = {
                        "image_id": image_id,
                        "file_name": image["file_name"],
                        "iou": iou,
                        "left_annotation_id": left_box["id"],
                        "left_category_id": left_box["category_id"],
                        "left_name": categories_by_id[left_box["category_id"]]["name"],
                        "right_annotation_id": right_box["id"],
                        "right_category_id": right_box["category_id"],
                        "right_name": categories_by_id[right_box["category_id"]]["name"],
                        "same_category": left_box["category_id"] == right_box["category_id"],
                    }
                    high_iou_pairs.append(row)
                    if not row["same_category"]:
                        high_iou_cross_category_pairs.append(row)
        overlap_pair_count_per_image[image_id] = image_overlap_pair_count
        max_overlap_iou_per_image[image_id] = round(image_max_iou, 6)

    edge_touch_categories = []
    for category_id, total_count in annotation_counts_by_category.items():
        edge_count = edge_touch_1pct_counts_by_category[category_id]
        edge_touch_categories.append(
            {
                "category_id": category_id,
                "name": categories_by_id[category_id]["name"],
                "annotation_count": total_count,
                "edge_touch_1pct_count": edge_count,
                "edge_touch_1pct_fraction": round(edge_count / total_count, 6),
            }
        )

    category_count_values = list(annotation_counts_by_category.values())
    category_count_values_sorted_desc = sorted(category_count_values, reverse=True)
    total_annotations = sum(category_count_values)
    class_entropy = shannon_entropy(category_count_values)

    return {
        "counts": {
            "images": len(images),
            "image_files_on_disk": len(image_paths),
            "annotations": len(boxes),
            "categories": len(categories),
        },
        "orientation_counts": dict(orientation_counts),
        "file_extension_counts": dict(sorted(Counter(path.suffix.lower() for path in image_paths).items())),
        "codec_counts": dict(codec_counts),
        "integrity": {
            "missing_files": missing_files,
            "extra_files": extra_files,
            "decode_errors": decode_errors,
            "dimension_mismatches": dimension_mismatches,
        },
        "schema_validation": {
            "annotation_fields": sorted({key for box in boxes for key in box}),
            "image_fields": sorted({key for image in images for key in image}),
            "category_fields": sorted({key for category in categories for key in category}),
            "image_id_min": min(image_ids),
            "image_id_max": max(image_ids),
            "image_id_gap_count": len(image_id_gaps),
            "missing_image_ids_total": sum(row["gap_size"] for row in image_id_gaps),
            "largest_image_id_gaps": sorted(image_id_gaps, key=lambda row: (-row["gap_size"], row["after"]))[:20],
            "annotation_ids_unique": len(set(annotation_ids)) == len(annotation_ids),
            "annotation_id_min": min(annotation_ids),
            "annotation_id_max": max(annotation_ids),
            "annotation_id_gap_count": len(annotation_id_gaps),
            "largest_annotation_id_gaps": sorted(annotation_id_gaps, key=lambda row: -row["gap_size"])[:20],
            "bad_image_id_annotations": bad_image_ids,
            "bad_category_id_annotations": bad_category_ids,
            "negative_or_zero_boxes": negative_boxes,
            "out_of_bounds_boxes": out_of_bounds_boxes,
            "area_mismatches": area_mismatches,
            "iscrowd_counts": dict(iscrowd_counts),
            "exact_duplicate_annotations": [
                {"image_id": image_id, "category_id": category_id, "bbox": list(bbox), "count": count}
                for (image_id, category_id, bbox), count in exact_duplicates.items()
                if count > 1
            ],
            "empty_category_names": [
                {"id": category["id"], "name": category["name"]}
                for category in categories
                if not category["name"].strip()
            ],
            "suspicious_category_names": suspicious_categories,
        },
        "distribution": {
            "image_dimension_top20": [
                {"width": width, "height": height, "count": count}
                for (width, height), count in dimension_counts.most_common(20)
            ],
            "unique_image_dimensions": len(dimension_counts),
            "annotations_per_image": describe(annotation_counts_by_image.values()),
            "annotations_per_category": describe(annotation_counts_by_category.values()),
            "distinct_categories_per_image": describe(distinct_categories_per_image),
            "distinct_images_per_category": describe(category_image_counts.values()),
            "image_class_entropy": describe(image_class_entropies),
            "image_top_class_fraction": describe(image_top_class_fractions),
            "bbox_aspect_ratio": describe(aspect_ratios),
            "bbox_relative_width": describe(relative_widths),
            "bbox_relative_height": describe(relative_heights),
            "bbox_area_fraction_of_image": describe(bbox_area_fractions),
            "per_image_labeled_area_fraction": describe(image_area_fractions),
            "annotation_frequency_buckets": {
                "classes_le_5": sum(1 for count in annotation_counts_by_category.values() if count <= 5),
                "classes_le_10": sum(1 for count in annotation_counts_by_category.values() if count <= 10),
                "classes_le_25": sum(1 for count in annotation_counts_by_category.values() if count <= 25),
            },
            "annotation_mass_in_frequency_buckets": {
                "annotations_in_classes_le_5": sum(count for count in annotation_counts_by_category.values() if count <= 5),
                "annotations_in_classes_le_10": sum(count for count in annotation_counts_by_category.values() if count <= 10),
                "annotations_in_classes_le_25": sum(count for count in annotation_counts_by_category.values() if count <= 25),
            },
            "annotation_concentration": {
                "gini": gini(category_count_values),
                "class_entropy": round(class_entropy, 6),
                "effective_number_of_classes": round(math.exp(class_entropy), 6),
                "top_1_annotation_mass_fraction": round(sum(category_count_values_sorted_desc[:1]) / total_annotations, 6),
                "top_5_annotation_mass_fraction": round(sum(category_count_values_sorted_desc[:5]) / total_annotations, 6),
                "top_10_annotation_mass_fraction": round(sum(category_count_values_sorted_desc[:10]) / total_annotations, 6),
                "top_20_annotation_mass_fraction": round(sum(category_count_values_sorted_desc[:20]) / total_annotations, 6),
                "top_50_annotation_mass_fraction": round(sum(category_count_values_sorted_desc[:50]) / total_annotations, 6),
                "top_100_annotation_mass_fraction": round(sum(category_count_values_sorted_desc[:100]) / total_annotations, 6),
                "bottom_half_annotation_mass_fraction": round(sum(sorted(category_count_values)[: len(category_count_values) // 2]) / total_annotations, 6),
            },
            "most_annotated_images": most_annotated_images,
            "least_annotated_images": least_annotated_images,
            "most_diverse_images_by_distinct_categories": sorted(
                image_diversity_rows,
                key=lambda row: (-row["distinct_category_count"], -row["annotation_count"], row["image_id"]),
            )[:15],
            "highest_entropy_images": sorted(
                image_diversity_rows,
                key=lambda row: (-row["class_entropy"], row["image_id"]),
            )[:15],
            "lowest_entropy_images": sorted(
                image_diversity_rows,
                key=lambda row: (row["class_entropy"], row["image_id"]),
            )[:15],
            "most_widespread_categories": most_widespread_categories,
            "least_widespread_categories": least_widespread_categories,
            "top_categories_by_annotation_count": [
                {"category_id": category_id, "name": categories_by_id[category_id]["name"], "count": count}
                for category_id, count in sorted(annotation_counts_by_category.items(), key=lambda item: (-item[1], item[0]))[:15]
            ],
            "bottom_categories_by_annotation_count": [
                {"category_id": category_id, "name": categories_by_id[category_id]["name"], "count": count}
                for category_id, count in sorted(annotation_counts_by_category.items(), key=lambda item: (item[1], item[0]))[:15]
            ],
        },
        "spatial": {
            "center_heatmap_5x5": [
                [center_bins[(bin_x, bin_y)] for bin_x in range(5)]
                for bin_y in range(5)
            ],
            "edge_margin_fraction": describe(edge_margin_fractions),
            "edge_touch_summary": {
                "edge_touch_zero_count": sum(edge_touch_zero_counts_by_image.values()),
                "edge_touch_1pct_count": sum(edge_touch_1pct_counts_by_image.values()),
                "edge_touch_1pct_fraction": round(sum(edge_touch_1pct_counts_by_image.values()) / len(boxes), 6),
                "top_images_by_edge_touch_fraction": sorted(
                    edge_touch_rows,
                    key=lambda row: (-row["edge_touch_1pct_fraction"], -row["edge_touch_1pct_count"], row["image_id"]),
                )[:20],
                "top_categories_by_edge_touch_fraction_min10": [
                    row
                    for row in sorted(
                        edge_touch_categories,
                        key=lambda row: (-row["edge_touch_1pct_fraction"], -row["edge_touch_1pct_count"], row["category_id"]),
                    )
                    if row["annotation_count"] >= 10
                ][:20],
            },
        },
        "overlap": {
            "total_box_pair_count": total_box_pair_count,
            "pair_count_with_iou_gt_0": sum(overlap_pair_count_per_image.values()),
            "images_with_any_overlap": sum(1 for count in overlap_pair_count_per_image.values() if count > 0),
            "pair_counts_at_thresholds": {str(threshold): overlap_pair_counts[threshold] for threshold in overlap_thresholds},
            "same_category_pair_counts_at_thresholds": {str(threshold): same_category_overlap_pair_counts[threshold] for threshold in overlap_thresholds},
            "cross_category_pair_counts_at_thresholds": {str(threshold): cross_category_overlap_pair_counts[threshold] for threshold in overlap_thresholds},
            "top_images_by_overlap_pair_count": [
                {
                    "image_id": image_id,
                    "file_name": images_by_id[image_id]["file_name"],
                    "annotation_count": annotation_counts_by_image[image_id],
                    "overlap_pair_count": overlap_pair_count_per_image[image_id],
                }
                for image_id in sorted(
                    overlap_pair_count_per_image,
                    key=lambda image_id: (-overlap_pair_count_per_image[image_id], -annotation_counts_by_image[image_id], image_id),
                )[:20]
            ],
            "top_images_by_max_overlap_iou": [
                {
                    "image_id": image_id,
                    "file_name": images_by_id[image_id]["file_name"],
                    "annotation_count": annotation_counts_by_image[image_id],
                    "max_iou": max_overlap_iou_per_image[image_id],
                }
                for image_id in sorted(
                    max_overlap_iou_per_image,
                    key=lambda image_id: (-max_overlap_iou_per_image[image_id], image_id),
                )[:20]
            ],
            "high_iou_pairs_iou_ge_0_5_top30": sorted(
                high_iou_pairs,
                key=lambda row: (-row["iou"], row["image_id"], row["left_annotation_id"], row["right_annotation_id"]),
            )[:30],
            "high_iou_cross_category_pairs_iou_ge_0_5": sorted(
                high_iou_cross_category_pairs,
                key=lambda row: (-row["iou"], row["image_id"], row["left_annotation_id"], row["right_annotation_id"]),
            ),
        },
    }


def audit_packshots(metadata, product_dirs):
    metadata_products = metadata["products"]
    metadata_codes = {product["product_code"] for product in metadata_products}
    product_image_paths = sorted(path for path in PRODUCT_ROOT.rglob("*.jpg"))
    disk_codes = {path.name for path in product_dirs}
    codec_counts = Counter()
    dimension_counts = Counter()
    decode_errors = []
    image_type_mismatches = []
    duplicate_groups = defaultdict(list)
    per_product_duplicate_groups = []
    missing_type_patterns = Counter()
    metadata_by_norm = defaultdict(list)

    for product in metadata_products:
        metadata_by_norm[normalize_name(product["product_name"])].append(product)

    for product in metadata_products:
        product_dir = PRODUCT_ROOT / product["product_code"]
        if product["has_images"] and product_dir.is_dir():
            actual_types = sorted(path.stem for path in product_dir.iterdir() if path.is_file())
            if actual_types != sorted(product["image_types"]):
                image_type_mismatches.append(
                    {
                        "product_code": product["product_code"],
                        "metadata_types": sorted(product["image_types"]),
                        "disk_types": actual_types,
                    }
                )

    for product_dir in product_dirs:
        file_names = sorted(path.name for path in product_dir.iterdir() if path.is_file())
        missing_type_patterns[
            tuple(name for name in ["front", "main", "back", "left", "right", "top", "bottom"] if f"{name}.jpg" not in file_names)
        ] += 1
        hashes = defaultdict(list)
        for path in product_dir.iterdir():
            if not path.is_file():
                continue
            digest = sha256(path)
            hashes[digest].append(path.name)
            duplicate_groups[digest].append(str(path.relative_to(PRODUCT_ROOT)))
            probed, error = ffprobe_dimensions(path)
            if probed is None:
                decode_errors.append({"path": str(path.relative_to(PRODUCT_ROOT)), "error": error})
                continue
            codec_counts[probed["codec_name"]] += 1
            dimension_counts[(probed["width"], probed["height"])] += 1
        for names in hashes.values():
            if len(names) > 1:
                per_product_duplicate_groups.append({"product_code": product_dir.name, "files": sorted(names)})

    custom_dirs = []
    for path in sorted(path for path in product_dirs if path.name.startswith("CUSTOM_")):
        file_rows = []
        for file_path in sorted(path.iterdir()):
            probed, _ = ffprobe_dimensions(file_path)
            file_rows.append(
                {
                    "file_name": file_path.name,
                    "bytes": file_path.stat().st_size,
                    "dimensions": [probed["width"], probed["height"]] if probed else None,
                    "duplicate_matches": [
                        rel_path
                        for rel_path in duplicate_groups[sha256(file_path)]
                        if rel_path != str(file_path.relative_to(PRODUCT_ROOT))
                    ],
                }
            )
        custom_dirs.append({"dir_name": path.name, "files": file_rows})

    def valid_gtin(code: str):
        if not code.isdigit() or len(code) not in (8, 12, 13, 14):
            return False
        digits = [int(char) for char in code]
        check_digit = digits[-1]
        body = digits[:-1]
        total = 0
        for index, digit in enumerate(reversed(body), start=1):
            total += digit * (3 if index % 2 == 1 else 1)
        calculated = (10 - (total % 10)) % 10
        return calculated == check_digit

    def valid_upc11(code: str):
        return code.isdigit() and len(code) == 11 and valid_gtin(f"0{code}")

    metadata_barcode_counts = Counter()
    metadata_invalid_rows = []
    for product in metadata_products:
        code = product["product_code"]
        if valid_gtin(code):
            metadata_barcode_counts[f"valid_gtin_{len(code)}"] += 1
        elif valid_upc11(code):
            metadata_barcode_counts["valid_upc11_via_leading_zero"] += 1
        else:
            metadata_barcode_counts[f"invalid_len_{len(code)}"] += 1
            metadata_invalid_rows.append(
                {
                    "product_code": code,
                    "product_name": product["product_name"],
                    "annotation_count": product["annotation_count"],
                    "image_types": product["image_types"],
                }
            )

    disk_barcode_counts = Counter()
    for code in sorted(code for code in disk_codes if code.isdigit()):
        if valid_gtin(code):
            disk_barcode_counts[f"valid_gtin_{len(code)}"] += 1
        elif valid_upc11(code):
            disk_barcode_counts["valid_upc11_via_leading_zero"] += 1
        else:
            disk_barcode_counts[f"invalid_len_{len(code)}"] += 1

    normalized_name_collisions = [
        {
            "normalized_name": normalized_name,
            "product_count": len(products),
            "annotation_count_sum": sum(product["annotation_count"] for product in products),
            "products": [
                {
                    "product_code": product["product_code"],
                    "product_name": product["product_name"],
                    "annotation_count": product["annotation_count"],
                    "corrected_count": product["corrected_count"],
                    "has_images": product["has_images"],
                    "image_types": product["image_types"],
                }
                for product in products
            ],
        }
        for normalized_name, products in metadata_by_norm.items()
        if len(products) > 1
    ]

    representative_rows = []
    normal_representative_rows = []
    custom_representative_rows = []
    for product_dir in product_dirs:
        representative_path = product_dir / "main.jpg"
        if not representative_path.is_file():
            candidate_files = sorted(path for path in product_dir.iterdir() if path.is_file())
            representative_path = candidate_files[0] if candidate_files else None
        if representative_path is None:
            continue
        probed, _ = ffprobe_dimensions(representative_path)
        image_hash = ahash(representative_path)
        row = {
            "product_code": product_dir.name,
            "representative_path": str(representative_path.relative_to(PRODUCT_ROOT)),
            "dimensions": [probed["width"], probed["height"]] if probed else None,
            "aspect_ratio": round(probed["width"] / probed["height"], 6) if probed else None,
            "ahash": image_hash,
        }
        representative_rows.append(row)
        if product_dir.name.startswith("CUSTOM_"):
            custom_representative_rows.append(row)
        else:
            normal_representative_rows.append(row)

    normal_nearest_rows = []
    for left_row in normal_representative_rows:
        if left_row["ahash"] is None:
            continue
        best_distance = None
        best_match = None
        for right_row in normal_representative_rows:
            if left_row["product_code"] == right_row["product_code"] or right_row["ahash"] is None:
                continue
            distance = hamming_distance(left_row["ahash"], right_row["ahash"])
            if best_distance is None or distance < best_distance:
                best_distance = distance
                best_match = right_row
        if best_match is not None:
            normal_nearest_rows.append(
                {
                    "product_code": left_row["product_code"],
                    "nearest_product_code": best_match["product_code"],
                    "distance": best_distance,
                }
            )

    custom_to_normal_nearest_rows = []
    for custom_row in custom_representative_rows:
        if custom_row["ahash"] is None:
            continue
        best_distance = None
        best_match = None
        for normal_row in normal_representative_rows:
            if normal_row["ahash"] is None:
                continue
            distance = hamming_distance(custom_row["ahash"], normal_row["ahash"])
            if best_distance is None or distance < best_distance:
                best_distance = distance
                best_match = normal_row
        if best_match is not None:
            custom_to_normal_nearest_rows.append(
                {
                    "custom_dir": custom_row["product_code"],
                    "nearest_product_code": best_match["product_code"],
                    "nearest_path": best_match["representative_path"],
                    "distance": best_distance,
                    "custom_aspect_ratio": custom_row["aspect_ratio"],
                    "nearest_aspect_ratio": best_match["aspect_ratio"],
                }
            )

    cross_product_duplicate_groups = []
    for paths in duplicate_groups.values():
        if len(paths) <= 1:
            continue
        product_codes = {Path(path).parts[0] for path in paths}
        if len(product_codes) > 1:
            cross_product_duplicate_groups.append(sorted(paths))

    return {
        "metadata_counts": {
            "total_products": metadata["total_products"],
            "products_with_images": metadata["products_with_images"],
            "products_without_images": metadata["products_without_images"],
            "total_images": metadata["total_images"],
        },
        "disk_counts": {
            "product_dirs": len(product_dirs),
            "jpg_files": len(product_image_paths),
            "metadata_json_present": PRODUCT_METADATA.is_file(),
        },
        "integrity": {
            "decode_errors": decode_errors,
            "image_type_mismatches": image_type_mismatches,
            "metadata_only_product_codes": sorted(metadata_codes - disk_codes),
            "disk_only_product_dirs": sorted(disk_codes - metadata_codes),
            "metadata_missing_rows": metadata["missing"],
        },
        "distribution": {
            "codec_counts": dict(codec_counts),
            "unique_dimensions": len(dimension_counts),
            "top_dimensions": [
                {"width": width, "height": height, "count": count}
                for (width, height), count in dimension_counts.most_common(20)
            ],
            "images_per_product_distribution": dict(
                sorted(
                    Counter(
                        len([path for path in product_dir.iterdir() if path.is_file()])
                        for product_dir in product_dirs
                    ).items()
                )
            ),
            "image_type_counts": dict(
                sorted(
                    Counter(path.stem for path in product_image_paths).items()
                )
            ),
            "missing_type_patterns_top20": [
                {"missing_types": list(pattern), "count": count}
                for pattern, count in missing_type_patterns.most_common(20)
            ],
            "metadata_code_length_distribution": dict(sorted(Counter(len(code) for code in metadata_codes).items())),
            "disk_dir_length_distribution": dict(sorted(Counter(len(code) for code in disk_codes).items())),
            "disk_non_digit_dirs": sorted(code for code in disk_codes if not code.isdigit()),
            "short_numeric_dirs": sorted(code for code in disk_codes if code.isdigit() and len(code) < 8),
            "metadata_barcode_validity": dict(metadata_barcode_counts),
            "disk_barcode_validity": dict(disk_barcode_counts),
            "metadata_invalid_barcode_rows": metadata_invalid_rows,
            "normalized_name_collisions": sorted(
                normalized_name_collisions,
                key=lambda row: (-row["annotation_count_sum"], row["normalized_name"]),
            ),
            "normal_representative_aspect_ratio": describe(
                [row["aspect_ratio"] for row in normal_representative_rows if row["aspect_ratio"] is not None]
            ),
            "custom_representative_aspect_ratio": describe(
                [row["aspect_ratio"] for row in custom_representative_rows if row["aspect_ratio"] is not None]
            ),
            "normal_nearest_neighbor_distance": describe(
                [row["distance"] for row in normal_nearest_rows]
            ),
            "custom_to_normal_nearest_neighbor_distance": describe(
                [row["distance"] for row in custom_to_normal_nearest_rows]
            ),
            "custom_to_normal_nearest_neighbors": sorted(
                custom_to_normal_nearest_rows,
                key=lambda row: (row["distance"], row["custom_dir"]),
            ),
        },
        "duplicates": {
            "exact_duplicate_binary_groups": [
                sorted(paths)
                for paths in duplicate_groups.values()
                if len(paths) > 1
            ],
            "per_product_duplicate_groups": per_product_duplicate_groups,
            "cross_product_duplicate_binary_groups": cross_product_duplicate_groups,
        },
        "custom_dirs": custom_dirs,
        "top_products_by_metadata_annotation_count": sorted(
            (
                {
                    "product_code": product["product_code"],
                    "product_name": product["product_name"],
                    "annotation_count": product["annotation_count"],
                    "corrected_count": product["corrected_count"],
                    "has_images": product["has_images"],
                    "image_types": product["image_types"],
                }
                for product in metadata_products
            ),
            key=lambda row: (-row["annotation_count"], row["product_code"]),
        )[:20],
        "metadata_annotation_count_sum": sum(product["annotation_count"] for product in metadata_products),
        "metadata_corrected_count_sum": sum(product["corrected_count"] for product in metadata_products),
    }


def audit_alignment(annotations, metadata):
    categories = annotations["categories"]
    boxes = annotations["annotations"]
    category_counts = Counter(box["category_id"] for box in boxes)
    metadata_by_norm = defaultdict(list)
    for product in metadata["products"]:
        metadata_by_norm[normalize_name(product["product_name"])].append(product)

    matched_categories = []
    unmatched_categories = []
    category_count_alignment = []
    annotation_mass_by_match_status = Counter()
    annotation_mass_by_view_count = Counter()
    category_count_by_view_count = Counter()
    close_unmatched = []
    hard_unmatched = []
    ambiguous_name_matches = []
    exact_match_annotation_mass_by_theme = Counter()
    close_unmatched_annotation_mass_by_theme = Counter()
    hard_unmatched_annotation_mass_by_theme = Counter()
    theme_annotation_totals = Counter()
    theme_exact_unique_category_counts = Counter()
    theme_low_view_annotation_mass = Counter()
    theme_low_view_category_counts = Counter()

    normalized_metadata_names = list(metadata_by_norm)

    for category in categories:
        normalized = normalize_name(category["name"])
        count = category_counts[category["id"]]
        theme_name = infer_theme(category["name"])
        theme_annotation_totals[theme_name] += count
        products = metadata_by_norm.get(normalized)
        if products:
            matched_categories.append(
                {
                    "category_id": category["id"],
                    "category_name": category["name"],
                    "annotation_count": count,
                    "products": [
                        {
                            "product_code": product["product_code"],
                            "product_name": product["product_name"],
                            "annotation_count": product["annotation_count"],
                            "corrected_count": product["corrected_count"],
                            "has_images": product["has_images"],
                            "image_types": product["image_types"],
                        }
                        for product in products
                    ],
                }
            )
            has_images = any(product["has_images"] for product in products)
            ambiguous = len(products) > 1
            if has_images:
                if ambiguous:
                    annotation_mass_by_match_status["matched_with_images_ambiguous"] += count
                else:
                    annotation_mass_by_match_status["matched_with_images_unique"] += count
                    exact_match_annotation_mass_by_theme[theme_name] += count
                    theme_exact_unique_category_counts[theme_name] += 1
                    annotation_mass_by_view_count[len(products[0]["image_types"])] += count
                    category_count_by_view_count[len(products[0]["image_types"])] += 1
                    if len(products[0]["image_types"]) <= 2:
                        theme_low_view_annotation_mass[theme_name] += count
                        theme_low_view_category_counts[theme_name] += 1
            else:
                if ambiguous:
                    annotation_mass_by_match_status["matched_no_images_ambiguous"] += count
                else:
                    annotation_mass_by_match_status["matched_no_images_unique"] += count
            if ambiguous:
                ambiguous_name_matches.append(
                    {
                        "category_id": category["id"],
                        "category_name": category["name"],
                        "annotation_count": count,
                        "products": [
                            {
                                "product_code": product["product_code"],
                                "product_name": product["product_name"],
                                "annotation_count": product["annotation_count"],
                                "corrected_count": product["corrected_count"],
                                "has_images": product["has_images"],
                                "image_types": product["image_types"],
                            }
                            for product in products
                        ],
                    }
                )
            for product in products:
                category_count_alignment.append(
                    {
                        "category_id": category["id"],
                        "category_name": category["name"],
                        "product_code": product["product_code"],
                        "product_name": product["product_name"],
                        "coco_annotation_count": count,
                        "metadata_annotation_count": product["annotation_count"],
                        "corrected_count": product["corrected_count"],
                        "absolute_diff_metadata": abs(count - product["annotation_count"]),
                        "absolute_diff_corrected": abs(count - product["corrected_count"]),
                    }
                )
        else:
            annotation_mass_by_match_status["no_match"] += count
            suggestions = []
            best_match = None
            best_ratio = 0.0
            for candidate in normalized_metadata_names:
                ratio = difflib.SequenceMatcher(None, normalized, candidate).ratio()
                if ratio > best_ratio:
                    best_ratio = ratio
                    best_match = candidate
            for candidate in difflib.get_close_matches(normalized, normalized_metadata_names, n=3, cutoff=0.6):
                suggestions.append(
                    {
                        "normalized_name": candidate,
                        "product_name": metadata_by_norm[candidate][0]["product_name"],
                        "ratio": round(difflib.SequenceMatcher(None, normalized, candidate).ratio(), 3),
                    }
                )
            row = {
                "category_id": category["id"],
                "category_name": category["name"],
                "annotation_count": count,
                "best_ratio": round(best_ratio, 3),
                "best_match_product_name": metadata_by_norm[best_match][0]["product_name"] if best_match else None,
                "suggestions": suggestions,
            }
            unmatched_categories.append(row)
            if best_ratio >= 0.75:
                close_unmatched.append(row)
                close_unmatched_annotation_mass_by_theme[theme_name] += count
            else:
                hard_unmatched.append(row)
                hard_unmatched_annotation_mass_by_theme[theme_name] += count

    unmatched_products = []
    category_norms = {normalize_name(category["name"]) for category in categories}
    for product in metadata["products"]:
        if normalize_name(product["product_name"]) not in category_norms:
            unmatched_products.append(
                {
                    "product_code": product["product_code"],
                    "product_name": product["product_name"],
                    "annotation_count": product["annotation_count"],
                    "corrected_count": product["corrected_count"],
                    "has_images": product["has_images"],
                    "image_types": product["image_types"],
                }
            )

    close_unmatched.sort(key=lambda row: (-row["annotation_count"], row["category_id"]))
    hard_unmatched.sort(key=lambda row: (-row["annotation_count"], row["category_id"]))
    unmatched_categories.sort(key=lambda row: (-row["annotation_count"], row["category_id"]))

    theme_packshot_readiness = {}
    for theme_name, total_count in sorted(theme_annotation_totals.items()):
        exact_count = exact_match_annotation_mass_by_theme[theme_name]
        close_count = close_unmatched_annotation_mass_by_theme[theme_name]
        hard_count = hard_unmatched_annotation_mass_by_theme[theme_name]
        ambiguous_count = sum(
            row["annotation_count"]
            for row in ambiguous_name_matches
            if infer_theme(row["category_name"]) == theme_name
        )
        no_image_count = sum(
            row["annotation_count"]
            for row in matched_categories
            if infer_theme(row["category_name"]) == theme_name
            and len(row["products"]) == 1
            and not row["products"][0]["has_images"]
        )
        theme_packshot_readiness[theme_name] = {
            "annotation_total": total_count,
            "exact_unique_with_images_annotation_count": exact_count,
            "exact_unique_with_images_fraction": round(exact_count / total_count, 6),
            "ambiguous_exact_name_annotation_count": ambiguous_count,
            "ambiguous_exact_name_fraction": round(ambiguous_count / total_count, 6),
            "matched_but_no_image_annotation_count": no_image_count,
            "matched_but_no_image_fraction": round(no_image_count / total_count, 6),
            "close_unmatched_annotation_count": close_count,
            "close_unmatched_fraction": round(close_count / total_count, 6),
            "hard_unmatched_annotation_count": hard_count,
            "hard_unmatched_fraction": round(hard_count / total_count, 6),
            "low_view_exact_annotation_count": theme_low_view_annotation_mass[theme_name],
            "low_view_exact_fraction_of_exact": round(theme_low_view_annotation_mass[theme_name] / exact_count, 6) if exact_count else None,
            "exact_unique_category_count": theme_exact_unique_category_counts[theme_name],
            "low_view_exact_category_count": theme_low_view_category_counts[theme_name],
        }

    metadata_gt_coco = sum(1 for row in category_count_alignment if row["metadata_annotation_count"] > row["coco_annotation_count"])
    metadata_eq_coco = sum(1 for row in category_count_alignment if row["metadata_annotation_count"] == row["coco_annotation_count"])
    metadata_lt_coco = sum(1 for row in category_count_alignment if row["metadata_annotation_count"] < row["coco_annotation_count"])
    corrected_gt_coco = sum(1 for row in category_count_alignment if row["corrected_count"] > row["coco_annotation_count"])
    corrected_eq_coco = sum(1 for row in category_count_alignment if row["corrected_count"] == row["coco_annotation_count"])
    corrected_lt_coco = sum(1 for row in category_count_alignment if row["corrected_count"] < row["coco_annotation_count"])

    unique_count_alignment = [
        row
        for row in category_count_alignment
        if not any(match["category_id"] == row["category_id"] for match in ambiguous_name_matches)
    ]
    coco_counts = [row["coco_annotation_count"] for row in unique_count_alignment]
    metadata_counts = [row["metadata_annotation_count"] for row in unique_count_alignment]
    corrected_counts = [row["corrected_count"] for row in unique_count_alignment]

    def pearson(left_values, right_values):
        left_mean = sum(left_values) / len(left_values)
        right_mean = sum(right_values) / len(right_values)
        numerator = sum((left - left_mean) * (right - right_mean) for left, right in zip(left_values, right_values))
        denominator = (
            sum((left - left_mean) ** 2 for left in left_values)
            * sum((right - right_mean) ** 2 for right in right_values)
        ) ** 0.5
        return round(numerator / denominator, 6)

    metadata_ratios = sorted(row["metadata_annotation_count"] / row["coco_annotation_count"] for row in unique_count_alignment if row["coco_annotation_count"] > 0)
    corrected_ratios = sorted(row["corrected_count"] / row["coco_annotation_count"] for row in unique_count_alignment if row["coco_annotation_count"] > 0)
    metadata_minus_corrected = [max(0, row["metadata_annotation_count"] - row["corrected_count"]) for row in unique_count_alignment]

    def mae(predictions, targets):
        return round(sum(abs(prediction - target) for prediction, target in zip(predictions, targets)) / len(targets), 6)

    def token_set(value):
        return {token for token in normalize_name(value).split() if token}

    unresolved_join_triage = []
    for row in unmatched_categories:
        category_tokens = token_set(row["category_name"])
        best_product_name = row["best_match_product_name"] or ""
        best_tokens = token_set(best_product_name)
        shared_tokens = sorted(category_tokens & best_tokens)
        token_jaccard = round(len(shared_tokens) / len(category_tokens | best_tokens), 6) if (category_tokens or best_tokens) else 1.0
        numeric_tokens = sorted(token for token in shared_tokens if token.isdigit())
        if not row["category_name"].strip() or normalize_name(row["category_name"]) == "UNKNOWN PRODUCT":
            triage = "non_resolvable_from_name"
        elif row["best_ratio"] >= 0.82 and (token_jaccard >= 0.5 or numeric_tokens):
            triage = "high_confidence_text_alias_candidate"
        elif row["best_ratio"] >= 0.7 and len(shared_tokens) >= 2:
            triage = "medium_confidence_family_candidate"
        else:
            triage = "likely_missing_reference_or_weak_match"
        unresolved_join_triage.append(
            {
                **row,
                "shared_tokens": shared_tokens,
                "token_jaccard": token_jaccard,
                "triage": triage,
            }
        )

    return {
        "matched_categories": len(matched_categories),
        "unmatched_categories_count": len(unmatched_categories),
        "unmatched_products_count": len(unmatched_products),
        "ambiguous_name_matches": ambiguous_name_matches,
        "annotation_mass_by_match_status": dict(annotation_mass_by_match_status),
        "annotation_mass_by_packshot_view_count": dict(sorted(annotation_mass_by_view_count.items())),
        "category_count_by_packshot_view_count": dict(sorted(category_count_by_view_count.items())),
        "theme_annotation_totals": dict(theme_annotation_totals),
        "theme_packshot_readiness": theme_packshot_readiness,
        "exact_match_annotation_mass_by_theme": dict(exact_match_annotation_mass_by_theme),
        "close_unmatched_annotation_mass_by_theme": dict(close_unmatched_annotation_mass_by_theme),
        "hard_unmatched_annotation_mass_by_theme": dict(hard_unmatched_annotation_mass_by_theme),
        "close_unmatched_annotation_mass": sum(row["annotation_count"] for row in close_unmatched),
        "hard_unmatched_annotation_mass": sum(row["annotation_count"] for row in hard_unmatched),
        "count_alignment": {
            "metadata_gt_coco": metadata_gt_coco,
            "metadata_eq_coco": metadata_eq_coco,
            "metadata_lt_coco": metadata_lt_coco,
            "corrected_gt_coco": corrected_gt_coco,
            "corrected_eq_coco": corrected_eq_coco,
            "corrected_lt_coco": corrected_lt_coco,
            "unique_match_count": len(unique_count_alignment),
            "metadata_vs_coco_pearson_unique": pearson(coco_counts, metadata_counts),
            "corrected_vs_coco_pearson_unique": pearson(coco_counts, corrected_counts),
            "metadata_over_coco_ratio_summary_unique": describe(metadata_ratios),
            "corrected_over_coco_ratio_summary_unique": describe(corrected_ratios),
            "mae_metadata_vs_coco_unique": mae(metadata_counts, coco_counts),
            "mae_corrected_vs_coco_unique": mae(corrected_counts, coco_counts),
            "mae_metadata_minus_corrected_vs_coco_unique": mae(metadata_minus_corrected, coco_counts),
            "worst_metadata_mismatches_top20": sorted(
                category_count_alignment,
                key=lambda row: (-row["absolute_diff_metadata"], row["category_id"]),
            )[:20],
            "corrected_gt_coco_rows": [
                row
                for row in sorted(category_count_alignment, key=lambda row: (-row["absolute_diff_corrected"], row["category_id"]))
                if row["corrected_count"] > row["coco_annotation_count"]
            ][:20],
        },
        "close_unmatched_categories": close_unmatched,
        "hard_unmatched_categories": hard_unmatched,
        "unresolved_join_triage_top40": sorted(
            unresolved_join_triage,
            key=lambda row: (-row["annotation_count"], row["category_id"]),
        )[:40],
        "unmatched_categories": unmatched_categories,
        "unmatched_products": unmatched_products,
        "categories_with_le_2_packshot_views_top40": [
            {
                "annotation_count": row["annotation_count"],
                "category_id": row["category_id"],
                "category_name": row["category_name"],
                "product_code": row["products"][0]["product_code"],
                "view_count": len(row["products"][0]["image_types"]),
                "image_types": row["products"][0]["image_types"],
            }
            for row in sorted(
                [
                    row
                    for row in matched_categories
                    if len(row["products"]) == 1 and row["products"][0]["has_images"] and len(row["products"][0]["image_types"]) <= 2
                ],
                key=lambda row: (-row["annotation_count"], row["category_id"]),
            )[:40]
        ],
    }


def audit_structure(annotations):
    categories_by_id = {category["id"]: category["name"] for category in annotations["categories"]}
    images_by_id = {image["id"]: image["file_name"] for image in annotations["images"]}
    image_size_by_id = {image["id"]: (image["width"], image["height"]) for image in annotations["images"]}
    per_image_counts = defaultdict(Counter)
    image_to_category_set = defaultdict(set)
    boxes_by_image = defaultdict(list)
    for box in annotations["annotations"]:
        per_image_counts[box["image_id"]][box["category_id"]] += 1
        image_to_category_set[box["image_id"]].add(box["category_id"])
        boxes_by_image[box["image_id"]].append(box)

    image_theme_rows = []
    dominant_theme_image_counts = Counter()
    annotation_theme_totals = Counter()

    for image_id in sorted(per_image_counts):
        theme_counts = Counter()
        for category_id, count in per_image_counts[image_id].items():
            theme_counts[infer_theme(categories_by_id[category_id])] += count
        dominant_theme = theme_counts.most_common(1)[0][0]
        dominant_theme_image_counts[dominant_theme] += 1
        annotation_theme_totals.update(theme_counts)
        image_theme_rows.append(
            {
                "image_id": image_id,
                "file_name": images_by_id[image_id],
                "dominant_theme": dominant_theme,
                "theme_counts": dict(theme_counts),
                "total_annotations": sum(theme_counts.values()),
            }
        )

    contiguous_runs = []
    start = image_theme_rows[0]["image_id"]
    last = image_theme_rows[0]["image_id"]
    current_theme = image_theme_rows[0]["dominant_theme"]
    count = 1
    for row in image_theme_rows[1:]:
        if row["dominant_theme"] == current_theme and row["image_id"] == last + 1:
            count += 1
        else:
            contiguous_runs.append({"start_image_id": start, "end_image_id": last, "theme": current_theme, "length": count})
            start = row["image_id"]
            current_theme = row["dominant_theme"]
            count = 1
        last = row["image_id"]
    contiguous_runs.append({"start_image_id": start, "end_image_id": last, "theme": current_theme, "length": count})

    pair_counts = Counter()
    for category_ids in image_to_category_set.values():
        for left, right in itertools.combinations(sorted(category_ids), 2):
            pair_counts[(left, right)] += 1

    ordered_image_ids = [row["image_id"] for row in image_theme_rows]
    main_themes = ["varmedrikker", "egg", "frokost", "knekkebrod"]
    prefix_scores = {theme_name: [0] for theme_name in main_themes}
    other_prefix = [0]
    for row in image_theme_rows:
        for theme_name in main_themes:
            prefix_scores[theme_name].append(prefix_scores[theme_name][-1] + row["theme_counts"].get(theme_name, 0))
        other_prefix.append(other_prefix[-1] + row["theme_counts"].get("other", 0))

    def segment_score(theme_name, start_index, end_index):
        return prefix_scores[theme_name][end_index] - prefix_scores[theme_name][start_index]

    best_segmentation = None
    image_count = len(ordered_image_ids)
    for permutation in itertools.permutations(main_themes):
        dp = [[(-10**18, None) for _ in range(image_count + 1)] for __ in range(5)]
        dp[0][0] = (0, None)
        for segment_index in range(1, 5):
            theme_name = permutation[segment_index - 1]
            for right_index in range(segment_index, image_count + 1):
                best_state = (-10**18, None)
                for left_index in range(segment_index - 1, right_index):
                    previous_score = dp[segment_index - 1][left_index][0]
                    if previous_score <= -10**17:
                        continue
                    candidate = previous_score + segment_score(theme_name, left_index, right_index)
                    if candidate > best_state[0]:
                        best_state = (candidate, left_index)
                dp[segment_index][right_index] = best_state
        candidate = (dp[4][image_count][0], permutation, dp)
        if best_segmentation is None or candidate[0] > best_segmentation[0]:
            best_segmentation = candidate

    segmentation_score, permutation, dp = best_segmentation
    cuts = [image_count]
    current = image_count
    for segment_index in range(4, 0, -1):
        current = dp[segment_index][current][1]
        cuts.append(current)
    cuts = list(reversed(cuts))
    four_section_segmentation = []
    for segment_index, theme_name in enumerate(permutation):
        start_index = cuts[segment_index]
        end_index = cuts[segment_index + 1]
        segment_image_ids = ordered_image_ids[start_index:end_index]
        totals = {name: segment_score(name, start_index, end_index) for name in main_themes}
        totals["other"] = other_prefix[end_index] - other_prefix[start_index]
        total_annotations = sum(totals.values())
        four_section_segmentation.append(
            {
                "segment_index": segment_index + 1,
                "theme": theme_name,
                "image_count": end_index - start_index,
                "start_image_id": segment_image_ids[0],
                "end_image_id": segment_image_ids[-1],
                "purity": round(totals[theme_name] / total_annotations, 6),
                "theme_annotation_counts": totals,
            }
        )

    consecutive_jaccard = []
    for left_image_id, right_image_id in zip(ordered_image_ids, ordered_image_ids[1:]):
        left_set = image_to_category_set[left_image_id]
        right_set = image_to_category_set[right_image_id]
        jaccard = len(left_set & right_set) / len(left_set | right_set)
        consecutive_jaccard.append(
            {
                "left_image_id": left_image_id,
                "right_image_id": right_image_id,
                "jaccard": round(jaccard, 6),
            }
        )

    unknown_category_id = next((category["id"] for category in annotations["categories"] if category["name"] == "unknown_product"), None)
    unknown_rows = []
    unknown_box_x = []
    unknown_box_y = []
    unknown_box_width = []
    unknown_box_height = []
    unknown_box_area = []
    all_box_area = []
    if unknown_category_id is not None:
        unknown_counts_by_image = []
        for image_id, category_counts in per_image_counts.items():
            image_width, image_height = image_size_by_id[image_id]
            for box in boxes_by_image[image_id]:
                x, y, width, height = box["bbox"]
                area_fraction = box["area"] / (image_width * image_height)
                all_box_area.append(area_fraction)
                if box["category_id"] == unknown_category_id:
                    unknown_box_x.append((x + width / 2) / image_width)
                    unknown_box_y.append((y + height / 2) / image_height)
                    unknown_box_width.append(width / image_width)
                    unknown_box_height.append(height / image_height)
                    unknown_box_area.append(area_fraction)
            if unknown_category_id in category_counts:
                unknown_counts_by_image.append(
                    {
                        "image_id": image_id,
                        "file_name": images_by_id[image_id],
                        "unknown_count": category_counts[unknown_category_id],
                        "dominant_theme": next(row["dominant_theme"] for row in image_theme_rows if row["image_id"] == image_id),
                    }
                )
        unknown_rows = sorted(unknown_counts_by_image, key=lambda row: (-row["unknown_count"], row["image_id"]))

    return {
        "dominant_theme_image_counts": dict(dominant_theme_image_counts),
        "annotation_theme_totals": dict(annotation_theme_totals),
        "longest_contiguous_theme_runs": sorted(contiguous_runs, key=lambda row: (-row["length"], row["start_image_id"]))[:20],
        "best_four_section_segmentation": {
            "theme_order": list(permutation),
            "score": segmentation_score,
            "segments": four_section_segmentation,
            "lowest_consecutive_jaccard_boundaries": sorted(consecutive_jaccard, key=lambda row: (row["jaccard"], row["left_image_id"]))[:25],
        },
        "top_category_cooccurrence_pairs": [
            {
                "image_count": count,
                "left_category_id": left,
                "left_name": categories_by_id[left],
                "right_category_id": right,
                "right_name": categories_by_id[right],
            }
            for (left, right), count in pair_counts.most_common(25)
        ],
        "unknown_product": {
            "category_id": unknown_category_id,
            "image_count": len(unknown_rows),
            "top_images": unknown_rows[:20],
            "theme_counts": dict(Counter(row["dominant_theme"] for row in unknown_rows)),
            "geometry_vs_all": {
                "center_x": describe(unknown_box_x),
                "center_y": describe(unknown_box_y),
                "relative_width": describe(unknown_box_width),
                "relative_height": describe(unknown_box_height),
                "area_fraction": describe(unknown_box_area),
                "all_boxes_area_fraction": describe(all_box_area),
            },
        },
    }


def audit_shelf_duplicates(image_paths):
    by_hash = defaultdict(list)
    for path in image_paths:
        by_hash[sha256(path)].append(path.name)
    exact_duplicate_groups = [sorted(names) for names in by_hash.values() if len(names) > 1]

    hashes = []
    for path in image_paths:
        image_hash = ahash(path)
        hashes.append((path.name, image_hash))

    near_duplicates = []
    for (left_name, left_hash), (right_name, right_hash) in itertools.combinations(hashes, 2):
        if left_hash is None or right_hash is None:
            continue
        distance = hamming_distance(left_hash, right_hash)
        if distance <= 5:
            near_duplicates.append({"distance": distance, "left": left_name, "right": right_name})
    near_duplicates.sort(key=lambda row: (row["distance"], row["left"], row["right"]))

    return {
        "exact_duplicate_file_groups": exact_duplicate_groups,
        "perceptual_near_duplicate_pairs_distance_le_5": near_duplicates,
    }


def readme_claims():
    return {
        "coco_images": 254,
        "coco_annotations_about": 22300,
        "coco_categories": 357,
        "coco_category_id_max": 356,
        "product_images_products": 327,
        "submission_category_id_range_text": "0-356",
        "yolo_nc": 357,
    }


def build_report():
    annotations, metadata, image_paths, product_dirs = load_inputs()
    archives = audit_archives()
    coco = audit_coco(annotations, image_paths)
    packshots = audit_packshots(metadata, product_dirs)
    alignment = audit_alignment(annotations, metadata)
    structure = audit_structure(annotations)
    duplicates = audit_shelf_duplicates(image_paths)

    return {
        "paths": {
            "readme": str(README),
            "coco_annotations": str(COCO_ANNOTATIONS),
            "coco_images": str(COCO_IMAGES),
            "product_metadata": str(PRODUCT_METADATA),
            "product_images_root": str(PRODUCT_ROOT),
        },
        "readme_claims": readme_claims(),
        "archives": archives,
        "coco": coco,
        "packshots": packshots,
        "alignment": alignment,
        "structure": structure,
        "duplicates": duplicates,
    }


def render_markdown(report):
    archives = report["archives"]
    coco = report["coco"]
    packshots = report["packshots"]
    alignment = report["alignment"]
    structure = report["structure"]
    duplicates = report["duplicates"]
    claims = report["readme_claims"]

    lines = [
        "# NorgesGruppen Deep Audit",
        "",
        "This report is derived from the extracted payload plus local zip/hash verification.",
        "",
        "## Verification Status",
        "",
        f"- COCO zip SHA256 matches `SHA256SUMS`: `{archives['coco']['sha256_match']}`",
        f"- Product-images zip SHA256 matches `SHA256SUMS`: `{archives['product_images']['sha256_match']}`",
        f"- COCO zip entries: `{archives['coco']['zip_entries_total']}` total / `{archives['coco']['zip_file_entries']}` files",
        f"- Product-images zip entries: `{archives['product_images']['zip_entries_total']}` total / `{archives['product_images']['zip_file_entries']}` files",
        "",
        "## README Claims vs Verified Payload",
        "",
        f"- README claims `254` shelf images; verified payload has `{coco['counts']['images']}`.",
        f"- README claims about `22,300` annotations; verified payload has `{coco['counts']['annotations']}`.",
        f"- README claims `357` categories with max id `356`; verified payload has `{coco['counts']['categories']}` categories with max id `355`.",
        f"- README uses submission category range `0-356` and YOLO `nc=357`; payload actually uses ids `0..355`.",
        f"- README says `327` product-image products; metadata actually has `{packshots['metadata_counts']['total_products']}` products, `{packshots['metadata_counts']['products_with_images']}` with images, `{packshots['metadata_counts']['products_without_images']}` without.",
        f"- Disk actually contains `{packshots['disk_counts']['product_dirs']}` product dirs because `17` extra `CUSTOM_*` dirs are present in the archive.",
        "",
        "## COCO Validation",
        "",
        f"- All referenced image files present: `{not coco['integrity']['missing_files']}`",
        f"- No extra shelf images beyond annotations: `{not coco['integrity']['extra_files']}`",
        f"- No shelf decode failures: `{not coco['integrity']['decode_errors']}`",
        f"- No shelf dimension mismatches vs `annotations.json`: `{not coco['integrity']['dimension_mismatches']}`",
        f"- No bad image/category refs: `{not coco['schema_validation']['bad_image_id_annotations'] and not coco['schema_validation']['bad_category_id_annotations']}`",
        f"- No negative/out-of-bounds/area-mismatched boxes: `{not coco['schema_validation']['negative_or_zero_boxes'] and not coco['schema_validation']['out_of_bounds_boxes'] and not coco['schema_validation']['area_mismatches']}`",
        f"- Image id range / missing ids: `{coco['schema_validation']['image_id_min']}..{coco['schema_validation']['image_id_max']}` with `{coco['schema_validation']['missing_image_ids_total']}` missing positions across `{coco['schema_validation']['image_id_gap_count']}` gaps",
        f"- `iscrowd` values: `{coco['schema_validation']['iscrowd_counts']}`",
        f"- Exact duplicate annotations: `{len(coco['schema_validation']['exact_duplicate_annotations'])}`",
        "",
        "## COCO Shape",
        "",
        f"- Orientation counts: `{coco['orientation_counts']}`",
        f"- File extensions: `{coco['file_extension_counts']}`",
        f"- Codecs: `{coco['codec_counts']}`",
        f"- Empty category names: `{coco['schema_validation']['empty_category_names']}`",
        f"- Suspicious category names: `{coco['schema_validation']['suspicious_category_names']}`",
        f"- Annotations/image: `{coco['distribution']['annotations_per_image']}`",
        f"- Distinct categories/image: `{coco['distribution']['distinct_categories_per_image']}`",
        f"- Distinct images/category: `{coco['distribution']['distinct_images_per_category']}`",
        f"- Image class entropy: `{coco['distribution']['image_class_entropy']}`",
        f"- Image top-class fraction: `{coco['distribution']['image_top_class_fraction']}`",
        f"- BBox aspect ratio: `{coco['distribution']['bbox_aspect_ratio']}`",
        f"- Relative bbox width: `{coco['distribution']['bbox_relative_width']}`",
        f"- Relative bbox height: `{coco['distribution']['bbox_relative_height']}`",
        f"- BBox area fraction of image: `{coco['distribution']['bbox_area_fraction_of_image']}`",
        f"- Per-image labeled area fraction: `{coco['distribution']['per_image_labeled_area_fraction']}`",
        f"- Long tail counts: `{coco['distribution']['annotation_frequency_buckets']}`",
        f"- Long tail annotation mass: `{coco['distribution']['annotation_mass_in_frequency_buckets']}`",
        f"- Annotation concentration: `{coco['distribution']['annotation_concentration']}`",
        f"- Edge-touch summary: zero-edge `{coco['spatial']['edge_touch_summary']['edge_touch_zero_count']}`, within-1pct `{coco['spatial']['edge_touch_summary']['edge_touch_1pct_count']}` / `{coco['counts']['annotations']}` = `{coco['spatial']['edge_touch_summary']['edge_touch_1pct_fraction']}`",
        f"- Overlap summary: `{coco['overlap']['pair_count_with_iou_gt_0']}` overlapping pairs out of `{coco['overlap']['total_box_pair_count']}` total; IoU>=0.5 pairs `{coco['overlap']['pair_counts_at_thresholds']['0.5']}`, cross-category `{coco['overlap']['cross_category_pair_counts_at_thresholds']['0.5']}`",
        f"- Center heatmap 5x5: `{coco['spatial']['center_heatmap_5x5']}`",
        "",
        "Top categories by annotation count:",
    ]
    for row in coco["distribution"]["top_categories_by_annotation_count"]:
        lines.append(f"- `{row['category_id']}` {row['name']} ({row['count']})")

    lines.extend(["", "Bottom categories by annotation count:"])
    for row in coco["distribution"]["bottom_categories_by_annotation_count"]:
        lines.append(f"- `{row['category_id']}` {row['name']} ({row['count']})")

    lines.extend(["", "Most diverse images by distinct categories:"])
    for row in coco["distribution"]["most_diverse_images_by_distinct_categories"][:10]:
        lines.append(
            f"- image `{row['image_id']}` {row['file_name']} ({row['distinct_category_count']} classes, {row['annotation_count']} anns, entropy `{row['class_entropy']}`)"
        )

    lines.extend(["", "Highest-IoU cross-category pairs (potential label conflicts):"])
    for row in coco["overlap"]["high_iou_cross_category_pairs_iou_ge_0_5"][:10]:
        lines.append(
            f"- image `{row['image_id']}` IoU `{row['iou']}`: {row['left_name']} || {row['right_name']}"
        )

    lines.extend(["", "## Packshot Validation", ""])
    lines.extend(
        [
            f"- No packshot decode failures: `{not packshots['integrity']['decode_errors']}`",
            f"- No metadata-vs-disk image-type mismatches: `{not packshots['integrity']['image_type_mismatches']}`",
            f"- Metadata-only codes (missing dirs): `{packshots['integrity']['metadata_only_product_codes']}`",
            f"- Disk-only dirs: `{packshots['integrity']['disk_only_product_dirs']}`",
            f"- Top missing-type patterns: `{packshots['distribution']['missing_type_patterns_top20'][:8]}`",
            f"- Barcode validity in metadata: `{packshots['distribution']['metadata_barcode_validity']}`",
            f"- Invalid metadata barcode rows: `{packshots['distribution']['metadata_invalid_barcode_rows']}`",
            f"- Metadata annotation_count sum: `{packshots['metadata_annotation_count_sum']}`",
            f"- Metadata corrected_count sum: `{packshots['metadata_corrected_count_sum']}`",
            f"- Product-image duplicates by exact bytes: `{len(packshots['duplicates']['exact_duplicate_binary_groups'])}` groups",
            f"- Per-product duplicate groups: `{len(packshots['duplicates']['per_product_duplicate_groups'])}`",
            f"- Cross-product exact duplicate groups: `{len(packshots['duplicates']['cross_product_duplicate_binary_groups'])}`",
            f"- Normalized-name collisions in metadata: `{packshots['distribution']['normalized_name_collisions']}`",
            f"- Normal representative aspect ratio: `{packshots['distribution']['normal_representative_aspect_ratio']}`",
            f"- CUSTOM representative aspect ratio: `{packshots['distribution']['custom_representative_aspect_ratio']}`",
            f"- Normal nearest-neighbor aHash distance: `{packshots['distribution']['normal_nearest_neighbor_distance']}`",
            f"- CUSTOM->normal nearest-neighbor aHash distance: `{packshots['distribution']['custom_to_normal_nearest_neighbor_distance']}`",
        ]
    )

    lines.extend(["", "Closest CUSTOM dirs to normal representatives:"])
    for row in packshots["distribution"]["custom_to_normal_nearest_neighbors"][:10]:
        lines.append(
            f"- `{row['custom_dir']}` -> `{row['nearest_product_code']}` at distance `{row['distance']}`"
        )

    lines.extend(["", "## Cross-Dataset Alignment", ""])
    lines.extend(
        [
            f"- Matched categories by normalized product name: `{alignment['matched_categories']}` / `{coco['counts']['categories']}`",
            f"- Annotation mass by match status: `{alignment['annotation_mass_by_match_status']}`",
            f"- Annotation mass by packshot view count: `{alignment['annotation_mass_by_packshot_view_count']}`",
            f"- Theme packshot readiness: `{alignment['theme_packshot_readiness']}`",
            f"- Exact-match annotation mass by theme: `{alignment['exact_match_annotation_mass_by_theme']}`",
            f"- Close unmatched annotation mass by theme: `{alignment['close_unmatched_annotation_mass_by_theme']}`",
            f"- Hard unmatched annotation mass by theme: `{alignment['hard_unmatched_annotation_mass_by_theme']}`",
            f"- Close unmatched annotation mass: `{alignment['close_unmatched_annotation_mass']}`",
            f"- Hard unmatched annotation mass: `{alignment['hard_unmatched_annotation_mass']}`",
            f"- Ambiguous normalized-name matches: `{alignment['ambiguous_name_matches']}`",
            f"- Count alignment summary: `{alignment['count_alignment']}`",
            f"- Close unmatched categories (`ratio >= 0.75`): `{len(alignment['close_unmatched_categories'])}`",
            f"- Hard unmatched categories (`ratio < 0.75`): `{len(alignment['hard_unmatched_categories'])}`",
            f"- Unmatched products: `{alignment['unmatched_products']}`",
        ]
    )

    lines.extend(["", "Close unmatched categories sample:"])
    for row in alignment["close_unmatched_categories"][:15]:
        lines.append(
            f"- `{row['category_id']}` {row['category_name']} ({row['annotation_count']} anns, best `{row['best_match_product_name']}`, ratio `{row['best_ratio']}`)"
        )

    lines.extend(["", "Hard unmatched categories sample:"])
    for row in alignment["hard_unmatched_categories"][:20]:
        lines.append(
            f"- `{row['category_id']}` {row['category_name']} ({row['annotation_count']} anns, best `{row['best_match_product_name']}`, ratio `{row['best_ratio']}`)"
        )

    lines.extend(["", "Heuristic unresolved join triage:"])
    for row in alignment["unresolved_join_triage_top40"][:20]:
        lines.append(
            f"- `{row['category_id']}` {row['category_name']} ({row['annotation_count']} anns, triage `{row['triage']}`, best `{row['best_match_product_name']}`, shared `{row['shared_tokens']}`, ratio `{row['best_ratio']}`)"
        )

    lines.extend(["", "## Inferred Shelf Structure", ""])
    lines.extend(
        [
            "- Themes below are inferred from category-name keywords, not explicit fields in the payload.",
            f"- Dominant-theme image counts: `{structure['dominant_theme_image_counts']}`",
            f"- Annotation-theme totals: `{structure['annotation_theme_totals']}`",
            f"- Best contiguous 4-section segmentation: `{structure['best_four_section_segmentation']}`",
            f"- Longest contiguous theme runs: `{structure['longest_contiguous_theme_runs'][:12]}`",
            f"- `unknown_product` image/theme footprint: `{structure['unknown_product']}`",
        ]
    )

    lines.extend(["", "Top category co-occurrence pairs:"])
    for row in structure["top_category_cooccurrence_pairs"][:15]:
        lines.append(
            f"- `{row['image_count']}` images: {row['left_name']} || {row['right_name']}"
        )

    lines.extend(["", "## Duplication / Leakage Risk", ""])
    lines.extend(
        [
            f"- Exact duplicate shelf-image groups: `{len(duplicates['exact_duplicate_file_groups'])}`",
            f"- Perceptual near-duplicate shelf-image pairs (aHash distance <= 5): `{len(duplicates['perceptual_near_duplicate_pairs_distance_le_5'])}`",
            f"- Exact duplicate packshot groups: `{len(packshots['duplicates']['exact_duplicate_binary_groups'])}`",
            f"- First exact duplicate packshot groups: `{packshots['duplicates']['exact_duplicate_binary_groups'][:15]}`",
        ]
    )

    lines.extend(["", "## Main Takeaways", ""])
    lines.extend(
        [
            "- The archives are intact; the drift is in documentation/metadata semantics, not download corruption.",
            "- COCO itself is internally clean: file presence, dimensions, ids, bbox geometry, and `area` all validate.",
            "- COCO is dense and diverse at image level, but still highly imbalanced at class level: the effective class count is far below the raw class count.",
            "- Only a tiny number of box pairs have IoU >= 0.5, but the few cross-category overlaps are informative and expose at least one strong alias/mislabelling candidate (`Leksands Rutbit`).",
            "- Edge-truncated boxes are non-trivial, so crop/context policy matters for both training and error analysis.",
            "- The biggest documentation drift is category count/range plus the missing `product_code/product_name/corrected` fields in `annotations.json`.",
            "- Packshot coverage is strong by annotation mass, not perfect by class count: most shelf boxes have a name-matchable reference, but some long-tail egg/coffee/other classes do not.",
            "- Egg is the weakest theme for reference-based classification: lower exact coverage and much heavier dependence on 1-2-view packshots.",
            "- `metadata.json` cannot be treated as a direct reflection of current COCO box counts.",
            "- The `CUSTOM_*` dirs are real extra assets in the zip and need an explicit policy if we use them.",
        ]
    )

    return "\n".join(lines) + "\n"


def main():
    report = build_report()
    REPORT_JSON.write_text(json.dumps(report, indent=2, ensure_ascii=False) + "\n")
    REPORT_MD.write_text(render_markdown(report))
    print(f"Wrote {REPORT_JSON}")
    print(f"Wrote {REPORT_MD}")


if __name__ == "__main__":
    main()
