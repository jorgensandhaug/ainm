#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import subprocess
from pathlib import Path

from norgesgruppen_prep_common import DERIVED_ROOT, GT_CROP_MANIFEST_JSONL, ROOT, display_path, iter_jsonl


def clamp(value: int, lower: int, upper: int) -> int:
    return max(lower, min(upper, value))


def compute_crop_box(row: dict, padding_px: int, padding_frac: float) -> tuple[int, int, int, int]:
    x1, y1, x2, y2 = row["bbox_xyxy"]
    width = x2 - x1
    height = y2 - y1
    pad_x = padding_px + round(width * padding_frac)
    pad_y = padding_px + round(height * padding_frac)
    crop_x1 = clamp(int(x1 - pad_x), 0, row["image_width"])
    crop_y1 = clamp(int(y1 - pad_y), 0, row["image_height"])
    crop_x2 = clamp(int(x2 + pad_x), 0, row["image_width"])
    crop_y2 = clamp(int(y2 + pad_y), 0, row["image_height"])
    return crop_x1, crop_y1, crop_x2, crop_y2


def extract_crops(
    manifest_path: Path,
    output_root: Path,
    split: str,
    limit: int | None,
    padding_px: int,
    padding_frac: float,
    overwrite: bool,
) -> dict:
    output_root = output_root.resolve()
    output_root.mkdir(parents=True, exist_ok=True)

    written = 0
    skipped_existing = 0
    processed = 0

    for row in iter_jsonl(manifest_path):
        if split != "all" and row["split"] != split:
            continue
        processed += 1
        if limit is not None and processed > limit:
            break

        source_image_path = ROOT / row["image_file"]
        target_path = output_root / Path(row["crop_rel_path"])
        if target_path.exists() and not overwrite:
            skipped_existing += 1
            continue

        crop_x1, crop_y1, crop_x2, crop_y2 = compute_crop_box(
            row,
            padding_px=padding_px,
            padding_frac=padding_frac,
        )
        crop_width = crop_x2 - crop_x1
        crop_height = crop_y2 - crop_y1
        target_path.parent.mkdir(parents=True, exist_ok=True)
        subprocess.run(
            [
                "ffmpeg",
                "-v",
                "error",
                "-y",
                "-i",
                str(source_image_path),
                "-vf",
                f"crop={crop_width}:{crop_height}:{crop_x1}:{crop_y1}",
                "-frames:v",
                "1",
                str(target_path),
            ],
            check=True,
        )
        written += 1

    return {
        "manifest_path": display_path(manifest_path),
        "output_root": display_path(output_root),
        "split": split,
        "limit": limit,
        "padding_px": padding_px,
        "padding_frac": padding_frac,
        "overwrite": overwrite,
        "processed_rows": processed if limit is None else min(processed, limit),
        "written_files": written,
        "skipped_existing": skipped_existing,
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Extract GT crops from the prepared NorgesGruppen crop manifest.")
    parser.add_argument("--manifest", type=Path, default=GT_CROP_MANIFEST_JSONL)
    parser.add_argument("--output-root", type=Path, default=DERIVED_ROOT)
    parser.add_argument("--split", choices=["all", "train", "val"], default="all")
    parser.add_argument("--limit", type=int, default=None)
    parser.add_argument("--padding-px", type=int, default=0)
    parser.add_argument("--padding-frac", type=float, default=0.0)
    parser.add_argument("--overwrite", action="store_true")
    args = parser.parse_args()

    summary = extract_crops(
        manifest_path=args.manifest,
        output_root=args.output_root,
        split=args.split,
        limit=args.limit,
        padding_px=args.padding_px,
        padding_frac=args.padding_frac,
        overwrite=args.overwrite,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
