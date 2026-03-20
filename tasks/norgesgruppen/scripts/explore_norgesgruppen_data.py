#!/usr/bin/env python3

import json
import re
import statistics
import unicodedata
from collections import Counter
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DATA_ROOT = ROOT / "data" / "2026-03-19" / "extracted"
COCO_ROOT = DATA_ROOT / "coco" / "train"
PRODUCT_ROOT = DATA_ROOT / "product_images"
DOCS_ROOT = ROOT / "docs" / "norgesgruppen-data"
JSON_OUT = DOCS_ROOT / "exploration-summary.json"
MD_OUT = DOCS_ROOT / "exploration-summary.md"


def normalize_name(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).upper()
    value = re.sub(r"[^0-9A-ZÆØÅ]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def basic_stats(values):
    return {
        "min": min(values),
        "median": statistics.median(values),
        "mean": round(statistics.mean(values), 2),
        "max": max(values),
    }


def top_items(counter: Counter, mapping=None, limit: int = 10, reverse: bool = True):
    items = counter.items()
    if reverse:
        ordered = sorted(items, key=lambda item: (-item[1], item[0]))
    else:
        ordered = sorted(items, key=lambda item: (item[1], item[0]))
    rows = []
    for key, count in ordered[:limit]:
        row = {"key": key, "count": count}
        if mapping is not None:
            row["name"] = mapping[key]
        rows.append(row)
    return rows


def load_inputs():
    annotations = json.loads((COCO_ROOT / "annotations.json").read_text())
    metadata = json.loads((PRODUCT_ROOT / "metadata.json").read_text())
    product_dirs = sorted(path for path in PRODUCT_ROOT.iterdir() if path.is_dir())
    image_files = sorted(path for path in (COCO_ROOT / "images").iterdir() if path.is_file())
    return annotations, metadata, product_dirs, image_files


def analyze_coco(annotations, image_files):
    images = annotations["images"]
    categories = annotations["categories"]
    boxes = annotations["annotations"]

    image_by_id = {image["id"]: image for image in images}
    category_by_id = {category["id"]: category for category in categories}
    annotation_counts_by_image = Counter(box["image_id"] for box in boxes)
    annotation_counts_by_category = Counter(box["category_id"] for box in boxes)
    image_dimensions = Counter((image["width"], image["height"]) for image in images)
    extension_counts = Counter(Path(image["file_name"]).suffix.lower() for image in images)
    category_ids = sorted(category_by_id)
    image_ids = sorted(image_by_id)
    bbox_widths = [box["bbox"][2] for box in boxes]
    bbox_heights = [box["bbox"][3] for box in boxes]
    bbox_areas = [box["area"] for box in boxes]
    bbox_area_fractions = [
        round(box["area"] / (image_by_id[box["image_id"]]["width"] * image_by_id[box["image_id"]]["height"]), 6)
        for box in boxes
    ]

    top_images = []
    for image_id, count in sorted(annotation_counts_by_image.items(), key=lambda item: (-item[1], item[0]))[:10]:
        top_images.append({"image_id": image_id, "file_name": image_by_id[image_id]["file_name"], "count": count})

    bottom_images = []
    for image_id, count in sorted(annotation_counts_by_image.items(), key=lambda item: (item[1], item[0]))[:10]:
        bottom_images.append({"image_id": image_id, "file_name": image_by_id[image_id]["file_name"], "count": count})

    return {
        "counts": {
            "images": len(images),
            "image_files_on_disk": len(image_files),
            "annotations": len(boxes),
            "categories": len(categories),
        },
        "category_id_range": {"min": min(category_ids), "max": max(category_ids)},
        "missing_category_ids": sorted(set(range(min(category_ids), max(category_ids) + 1)) - set(category_ids)),
        "unused_category_ids": sorted(set(category_ids) - set(annotation_counts_by_category)),
        "empty_category_names": [
            {"id": category["id"], "name": category["name"]}
            for category in categories
            if not category["name"].strip()
        ],
        "file_extension_counts": dict(sorted(extension_counts.items())),
        "image_id_range": {"min": min(image_ids), "max": max(image_ids)},
        "missing_image_ids_sample": sorted(set(range(min(image_ids), max(image_ids) + 1)) - set(image_ids))[:50],
        "image_dimension_counts_top20": [
            {"width": width, "height": height, "count": count}
            for (width, height), count in image_dimensions.most_common(20)
        ],
        "unique_image_dimensions": len(image_dimensions),
        "annotations_per_image": basic_stats(list(annotation_counts_by_image.values())),
        "top_images_by_annotation_count": top_images,
        "bottom_images_by_annotation_count": bottom_images,
        "annotation_frequency_buckets": {
            "classes_le_5": sum(1 for count in annotation_counts_by_category.values() if count <= 5),
            "classes_le_10": sum(1 for count in annotation_counts_by_category.values() if count <= 10),
            "classes_le_25": sum(1 for count in annotation_counts_by_category.values() if count <= 25),
        },
        "top_categories_by_annotation_count": top_items(annotation_counts_by_category, {k: v["name"] for k, v in category_by_id.items()}),
        "bottom_categories_by_annotation_count": top_items(
            annotation_counts_by_category,
            {k: v["name"] for k, v in category_by_id.items()},
            reverse=False,
        ),
        "bbox_width": basic_stats(bbox_widths),
        "bbox_height": basic_stats(bbox_heights),
        "bbox_area": basic_stats(bbox_areas),
        "bbox_area_fraction_of_image": basic_stats(bbox_area_fractions),
    }


def analyze_product_images(metadata, product_dirs):
    metadata_products = metadata["products"]
    metadata_codes = {product["product_code"] for product in metadata_products}
    disk_codes = {path.name for path in product_dirs}
    image_types_on_disk = Counter()
    image_count_distribution = Counter()
    image_files_on_disk = 0

    for product_dir in product_dirs:
        files = sorted(path.name for path in product_dir.iterdir() if path.is_file())
        image_count_distribution[len(files)] += 1
        image_files_on_disk += len(files)
        for file_name in files:
            image_types_on_disk[Path(file_name).stem] += 1

    return {
        "metadata_counts": {
            "total_products": metadata["total_products"],
            "products_with_images": metadata["products_with_images"],
            "products_without_images": metadata["products_without_images"],
            "total_images": metadata["total_images"],
        },
        "disk_counts": {
            "product_dirs": len(product_dirs),
            "image_files": image_files_on_disk,
        },
        "images_per_product_distribution": dict(sorted(image_count_distribution.items())),
        "image_type_counts_on_disk": dict(sorted(image_types_on_disk.items())),
        "metadata_missing_products": metadata["missing"],
        "disk_only_product_dirs": sorted(disk_codes - metadata_codes),
        "metadata_only_product_codes": sorted(metadata_codes - disk_codes),
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
            key=lambda product: (-product["annotation_count"], product["product_code"]),
        )[:15],
        "bottom_products_by_metadata_annotation_count": sorted(
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
            key=lambda product: (product["annotation_count"], product["product_code"]),
        )[:15],
        "metadata_annotation_count_sum": sum(product["annotation_count"] for product in metadata_products),
        "metadata_corrected_count_sum": sum(product["corrected_count"] for product in metadata_products),
    }


def analyze_alignment(annotations, metadata):
    categories = annotations["categories"]
    boxes = annotations["annotations"]
    category_counts = Counter(box["category_id"] for box in boxes)

    category_rows = [
        {
            "category_id": category["id"],
            "category_name": category["name"],
            "normalized_name": normalize_name(category["name"]),
            "coco_annotation_count": category_counts[category["id"]],
        }
        for category in categories
    ]
    product_rows = [
        {
            "product_code": product["product_code"],
            "product_name": product["product_name"],
            "normalized_name": normalize_name(product["product_name"]),
            "metadata_annotation_count": product["annotation_count"],
            "corrected_count": product["corrected_count"],
            "has_images": product["has_images"],
            "image_types": product["image_types"],
        }
        for product in metadata["products"]
    ]

    products_by_norm = {}
    for product in product_rows:
        products_by_norm.setdefault(product["normalized_name"], []).append(product)

    matches = []
    unmatched_categories = []
    for category in category_rows:
        matched_products = products_by_norm.get(category["normalized_name"], [])
        if matched_products:
            matches.append({"category": category, "products": matched_products})
        else:
            unmatched_categories.append(category)

    category_norms = {row["normalized_name"] for row in category_rows}
    unmatched_products = [row for row in product_rows if row["normalized_name"] not in category_norms]

    count_comparisons = []
    for match in matches:
        category = match["category"]
        for product in match["products"]:
            count_comparisons.append(
                {
                    "category_id": category["category_id"],
                    "category_name": category["category_name"],
                    "product_code": product["product_code"],
                    "product_name": product["product_name"],
                    "coco_annotation_count": category["coco_annotation_count"],
                    "metadata_annotation_count": product["metadata_annotation_count"],
                    "corrected_count": product["corrected_count"],
                    "absolute_diff": abs(category["coco_annotation_count"] - product["metadata_annotation_count"]),
                }
            )

    exact_matches = sum(1 for row in count_comparisons if row["absolute_diff"] == 0)
    absolute_diffs = [row["absolute_diff"] for row in count_comparisons]

    return {
        "matched_categories": len(matches),
        "matched_category_product_pairs": len(count_comparisons),
        "unmatched_categories": [
            {"category_id": row["category_id"], "category_name": row["category_name"], "coco_annotation_count": row["coco_annotation_count"]}
            for row in unmatched_categories
        ],
        "unmatched_products": [
            {
                "product_code": row["product_code"],
                "product_name": row["product_name"],
                "metadata_annotation_count": row["metadata_annotation_count"],
                "corrected_count": row["corrected_count"],
            }
            for row in unmatched_products
        ],
        "duplicate_product_names_after_normalization": [
            {
                "normalized_name": normalized_name,
                "products": [
                    {"product_code": row["product_code"], "product_name": row["product_name"]}
                    for row in rows
                ],
            }
            for normalized_name, rows in sorted(products_by_norm.items())
            if len(rows) > 1
        ],
        "count_alignment": {
            "exact_matches": exact_matches,
            "median_absolute_diff": statistics.median(absolute_diffs),
            "mean_absolute_diff": round(statistics.mean(absolute_diffs), 2),
            "max_absolute_diff": max(absolute_diffs),
            "worst_mismatches_top20": sorted(count_comparisons, key=lambda row: (-row["absolute_diff"], row["category_id"]))[:20],
        },
    }


def build_summary():
    annotations, metadata, product_dirs, image_files = load_inputs()
    return {
        "paths": {
            "coco_annotations": str(COCO_ROOT / "annotations.json"),
            "coco_images": str(COCO_ROOT / "images"),
            "product_images": str(PRODUCT_ROOT),
            "product_metadata": str(PRODUCT_ROOT / "metadata.json"),
        },
        "coco": analyze_coco(annotations, image_files),
        "product_images": analyze_product_images(metadata, product_dirs),
        "alignment": analyze_alignment(annotations, metadata),
        "doc_vs_payload": {
            "docs_claimed_images": 254,
            "actual_images": len(annotations["images"]),
            "docs_claimed_categories": 357,
            "actual_categories": len(annotations["categories"]),
            "docs_claimed_category_max_id": 356,
            "actual_category_max_id": max(category["id"] for category in annotations["categories"]),
            "docs_claimed_product_images_products": 327,
            "metadata_total_products": metadata["total_products"],
            "disk_product_dirs": len(product_dirs),
            "docs_claimed_annotation_fields": ["product_code", "product_name", "corrected"],
            "actual_annotation_fields": sorted({key for row in annotations["annotations"] for key in row}),
        },
    }


def render_markdown(summary):
    coco = summary["coco"]
    products = summary["product_images"]
    alignment = summary["alignment"]
    doc_vs_payload = summary["doc_vs_payload"]

    unmatched_category_lines = [
        f"- `{row['category_id']}` {row['category_name']} ({row['coco_annotation_count']} anns)"
        for row in alignment["unmatched_categories"][:20]
    ]
    unmatched_product_lines = [
        f"- `{row['product_code']}` {row['product_name']} ({row['metadata_annotation_count']} metadata anns)"
        for row in alignment["unmatched_products"][:20]
    ]
    custom_dir_lines = [f"- `{name}`" for name in products["disk_only_product_dirs"]]

    lines = [
        "# NorgesGruppen Data Exploration",
        "",
        "Generated from extracted payload on disk.",
        "",
        "## Key Facts",
        "",
        f"- Shelf images: `{coco['counts']['images']}`",
        f"- Shelf annotations: `{coco['counts']['annotations']}`",
        f"- Categories: `{coco['counts']['categories']}` with id range `{coco['category_id_range']['min']}..{coco['category_id_range']['max']}`",
        f"- Product metadata rows: `{products['metadata_counts']['total_products']}`",
        f"- Product dirs on disk: `{products['disk_counts']['product_dirs']}`",
        f"- Product image files on disk: `{products['disk_counts']['image_files']}`",
        "",
        "## Docs vs Payload",
        "",
        f"- Docs say `254` shelf images; payload has `{doc_vs_payload['actual_images']}`.",
        f"- Docs say `357` categories / max id `356`; payload has `{doc_vs_payload['actual_categories']}` categories / max id `{doc_vs_payload['actual_category_max_id']}`.",
        f"- Docs describe annotation fields `product_code`, `product_name`, `corrected`; actual annotations only have `{', '.join(doc_vs_payload['actual_annotation_fields'])}`.",
        f"- Metadata says `{products['metadata_counts']['products_with_images']}` products with images and `{products['metadata_counts']['products_without_images']}` without; disk contains `{products['disk_counts']['product_dirs']}` product folders because `17` extra `CUSTOM_*` dirs exist.",
        "",
        "## COCO Shape",
        "",
        f"- File extensions: `{coco['file_extension_counts']}`",
        f"- Unique image dimensions: `{coco['unique_image_dimensions']}`; top dimensions: `{coco['image_dimension_counts_top20'][:6]}`",
        f"- Missing image ids within range sample: `{coco['missing_image_ids_sample']}`",
        f"- Empty category names: `{coco['empty_category_names']}`",
        f"- Annotations per image: `{coco['annotations_per_image']}`",
        f"- BBox width stats: `{coco['bbox_width']}`",
        f"- BBox height stats: `{coco['bbox_height']}`",
        f"- BBox area stats: `{coco['bbox_area']}`",
        f"- BBox image-area fraction stats: `{coco['bbox_area_fraction_of_image']}`",
        f"- Long-tail classes: `<=5` anns `{coco['annotation_frequency_buckets']['classes_le_5']}`, `<=10` anns `{coco['annotation_frequency_buckets']['classes_le_10']}`, `<=25` anns `{coco['annotation_frequency_buckets']['classes_le_25']}`",
        "",
        "Top categories by annotation count:",
    ]

    for row in coco["top_categories_by_annotation_count"]:
        lines.append(f"- `{row['key']}` {row['name']} ({row['count']})")

    lines.extend(
        [
            "",
            "Bottom categories by annotation count:",
        ]
    )
    for row in coco["bottom_categories_by_annotation_count"]:
        lines.append(f"- `{row['key']}` {row['name']} ({row['count']})")

    lines.extend(
        [
            "",
            "Most annotated images:",
        ]
    )
    for row in coco["top_images_by_annotation_count"]:
        lines.append(f"- `{row['file_name']}` id `{row['image_id']}` ({row['count']} boxes)")

    lines.extend(
        [
            "",
            "Least annotated images:",
        ]
    )
    for row in coco["bottom_images_by_annotation_count"]:
        lines.append(f"- `{row['file_name']}` id `{row['image_id']}` ({row['count']} boxes)")

    lines.extend(
        [
            "",
            "## Product Reference Shape",
            "",
            f"- Metadata counts: `{products['metadata_counts']}`",
            f"- Images per product distribution on disk: `{products['images_per_product_distribution']}`",
            f"- Image type counts on disk: `{products['image_type_counts_on_disk']}`",
            f"- Metadata-only missing products: `{products['metadata_missing_products']}`",
            f"- Metadata annotation_count sum: `{products['metadata_annotation_count_sum']}` vs COCO annotations `{coco['counts']['annotations']}`",
            "",
            "Extra packshot dirs on disk not in metadata:",
        ]
    )
    lines.extend(custom_dir_lines)

    lines.extend(
        [
            "",
            "Top products by metadata annotation count:",
        ]
    )
    for row in products["top_products_by_metadata_annotation_count"][:10]:
        lines.append(
            f"- `{row['product_code']}` {row['product_name']} (anns `{row['annotation_count']}`, corrected `{row['corrected_count']}`, images `{row['image_types']}`)"
        )

    lines.extend(
        [
            "",
            "## Alignment Between COCO Categories and Product Metadata",
            "",
            f"- Matched categories by normalized name: `{alignment['matched_categories']}` / `{coco['counts']['categories']}`",
            f"- Matched category-product pairs: `{alignment['matched_category_product_pairs']}`",
            f"- Unmatched categories: `{len(alignment['unmatched_categories'])}`",
            f"- Unmatched products: `{len(alignment['unmatched_products'])}`",
            f"- Count alignment on matched pairs: `{alignment['count_alignment']}`",
            "",
            "Unmatched categories sample:",
        ]
    )
    lines.extend(unmatched_category_lines or ["- None"])

    lines.extend(
        [
            "",
            "Unmatched products sample:",
        ]
    )
    lines.extend(unmatched_product_lines or ["- None"])

    return "\n".join(lines) + "\n"


def main():
    summary = build_summary()
    DOCS_ROOT.mkdir(parents=True, exist_ok=True)
    JSON_OUT.write_text(json.dumps(summary, indent=2, ensure_ascii=False) + "\n")
    MD_OUT.write_text(render_markdown(summary))
    print(f"Wrote {JSON_OUT}")
    print(f"Wrote {MD_OUT}")


if __name__ == "__main__":
    main()
