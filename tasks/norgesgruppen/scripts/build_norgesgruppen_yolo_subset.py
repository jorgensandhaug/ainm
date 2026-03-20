#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from norgesgruppen_prep_common import display_path, ensure_hardlink_or_copy, write_json


def parse_id_csv(value: str) -> list[int]:
    items = []
    for fragment in value.split(","):
        fragment = fragment.strip()
        if not fragment:
            continue
        items.append(int(fragment))
    if not items:
        raise ValueError("expected at least one image id")
    return items


def parse_dataset_yaml(path: Path) -> dict[str, Any]:
    data_root = None
    nc = None
    names = {}
    in_names = False
    for raw_line in path.read_text().splitlines():
        line = raw_line.rstrip()
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        if stripped.startswith("path:"):
            data_root = Path(stripped.split(":", 1)[1].strip())
            in_names = False
            continue
        if stripped.startswith("nc:"):
            nc = int(stripped.split(":", 1)[1].strip())
            in_names = False
            continue
        if stripped.startswith("names:"):
            in_names = True
            continue
        if in_names and line.startswith("  "):
            key, value = stripped.split(":", 1)
            names[int(key)] = value.strip().strip("'").strip('"')
            continue
        in_names = False
    if data_root is None or nc is None:
        raise ValueError(f"Could not parse dataset yaml: {path}")
    return {
        "path": data_root,
        "nc": nc,
        "names": {index: names[index] for index in sorted(names)},
    }


def resolve_image_file_name(images_dir: Path, image_id: int) -> str:
    stem = f"img_{image_id:05d}"
    matches = sorted(path.name for path in images_dir.glob(f"{stem}.*") if path.is_file())
    image_matches = [
        name
        for name in matches
        if Path(name).suffix.lower() in {".jpg", ".jpeg", ".png"}
    ]
    if not image_matches:
        raise FileNotFoundError(images_dir / f"{stem}.*")
    if len(image_matches) > 1:
        raise ValueError(f"Multiple image files found for {stem} in {images_dir}: {image_matches}")
    return image_matches[0]


def write_dataset_yaml(path: Path, nc: int, names: dict[int, str]) -> None:
    lines = [
        f"path: {path.parent.resolve()}",
        "train: images/train",
        "val: images/val",
        f"nc: {nc}",
        "names:",
    ]
    for index, name in sorted(names.items()):
        lines.append(f"  {index}: '{name}'")
    path.write_text("\n".join(lines) + "\n")


def materialize_split(
    source_root: Path,
    source_split: str,
    output_root: Path,
    target_split: str,
    image_ids: list[int],
) -> dict[str, Any]:
    summary_rows = []
    source_images = source_root / "images" / source_split
    source_labels = source_root / "labels" / source_split
    target_images = output_root / "images" / target_split
    target_labels = output_root / "labels" / target_split
    target_images.mkdir(parents=True, exist_ok=True)
    target_labels.mkdir(parents=True, exist_ok=True)

    for image_id in image_ids:
        file_name = resolve_image_file_name(source_images, image_id)
        label_name = Path(file_name).with_suffix(".txt").name
        source_image_path = source_images / file_name
        source_label_path = source_labels / label_name
        if not source_image_path.exists():
            raise FileNotFoundError(source_image_path)
        if not source_label_path.exists():
            raise FileNotFoundError(source_label_path)
        target_image_path = target_images / file_name
        target_label_path = target_labels / label_name
        image_link_mode = ensure_hardlink_or_copy(source_image_path, target_image_path)
        label_link_mode = ensure_hardlink_or_copy(source_label_path, target_label_path)
        summary_rows.append(
            {
                "image_id": image_id,
                "file_name": file_name,
                "source_split": source_split,
                "target_split": target_split,
                "image_link_mode": image_link_mode,
                "label_link_mode": label_link_mode,
            }
        )
    return {
        "image_count": len(image_ids),
        "image_ids": image_ids,
        "rows": summary_rows,
    }


def build_subset(
    source_yaml_path: Path,
    output_root: Path,
    train_image_ids: list[int],
    val_image_ids: list[int],
    train_source_split: str,
    val_source_split: str,
) -> dict[str, Any]:
    source_meta = parse_dataset_yaml(source_yaml_path)
    source_root = Path(source_meta["path"])
    output_root.mkdir(parents=True, exist_ok=True)

    train_summary = materialize_split(
        source_root=source_root,
        source_split=train_source_split,
        output_root=output_root,
        target_split="train",
        image_ids=train_image_ids,
    )
    val_summary = materialize_split(
        source_root=source_root,
        source_split=val_source_split,
        output_root=output_root,
        target_split="val",
        image_ids=val_image_ids,
    )

    dataset_yaml_path = output_root / "dataset.yaml"
    write_dataset_yaml(
        path=dataset_yaml_path,
        nc=source_meta["nc"],
        names=source_meta["names"],
    )
    summary = {
        "source_dataset_yaml": display_path(source_yaml_path),
        "output_root": display_path(output_root),
        "train_source_split": train_source_split,
        "val_source_split": val_source_split,
        "train": train_summary,
        "val": val_summary,
        "dataset_yaml": display_path(dataset_yaml_path),
        "nc": source_meta["nc"],
        "names": source_meta["names"],
    }
    write_json(output_root / "subset-summary.json", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Materialize a tiny YOLO subset for fast NorgesGruppen detector debugging.")
    parser.add_argument("--source-yaml", type=Path, required=True)
    parser.add_argument("--output-root", type=Path, required=True)
    parser.add_argument("--train-image-ids", required=True, help="Comma-separated image ids")
    parser.add_argument("--val-image-ids", default="", help="Comma-separated image ids")
    parser.add_argument("--val-same-as-train", action="store_true")
    parser.add_argument("--train-source-split", default="train")
    parser.add_argument("--val-source-split", default=None)
    args = parser.parse_args()

    train_image_ids = parse_id_csv(args.train_image_ids)
    if args.val_same_as_train:
        val_image_ids = list(train_image_ids)
    elif args.val_image_ids:
        val_image_ids = parse_id_csv(args.val_image_ids)
    else:
        raise ValueError("Either --val-image-ids or --val-same-as-train is required.")
    val_source_split = args.val_source_split or args.train_source_split

    summary = build_subset(
        source_yaml_path=args.source_yaml,
        output_root=args.output_root,
        train_image_ids=train_image_ids,
        val_image_ids=val_image_ids,
        train_source_split=args.train_source_split,
        val_source_split=val_source_split,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
