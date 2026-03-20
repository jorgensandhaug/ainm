#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from collections import OrderedDict
from pathlib import Path
from typing import Any

from norgesgruppen_crop_benchmark_common import normalize_relative_path
from norgesgruppen_crop_classifier_common import (
    attach_local_classifier_labels,
    bbox_xyxy_to_crop_box,
    build_label_maps,
    build_label_rows_with_counts,
    load_classifier_manifest,
)
from norgesgruppen_prep_common import CROP_CLASSIFIER_TRAIN_JSONL, CROP_CLASSIFIER_VAL_JSONL, ROOT, write_json
from train_norgesgruppen_crop_classifier import load_pe_core, resolve_device, seed_everything


class LRUImageCache:
    def __init__(self, max_items: int = 8):
        self.max_items = max_items
        self._items: OrderedDict[Path, Any] = OrderedDict()

    def get(self, path: Path):
        if path in self._items:
            image = self._items.pop(path)
            self._items[path] = image
            return image
        return None

    def put(self, path: Path, image) -> None:
        self._items[path] = image
        if len(self._items) > self.max_items:
            self._items.popitem(last=False)


class ExactCropDataset:
    def __init__(self, rows: list[dict[str, Any]], preprocess):
        self.rows = rows
        self.preprocess = preprocess
        self._image_cache = LRUImageCache(max_items=6)

    def __len__(self) -> int:
        return len(self.rows)

    def _load_image(self, row: dict[str, Any]):
        from PIL import Image

        source_path = (ROOT / row["image_file"]).resolve()
        cached = self._image_cache.get(source_path)
        if cached is not None:
            return cached
        with Image.open(source_path) as opened:
            image = opened.convert("RGB")
        self._image_cache.put(source_path, image)
        return image

    def __getitem__(self, index: int) -> dict[str, Any]:
        row = self.rows[index]
        image = self._load_image(row)
        crop = image.crop(
            bbox_xyxy_to_crop_box(
                bbox_xyxy=row["bbox_xyxy"],
                image_width=int(row["image_width"]),
                image_height=int(row["image_height"]),
            )
        )
        return {
            "annotation_id": int(row["annotation_id"]),
            "category_id": int(row["category_id"]),
            "local_classifier_label": int(row["local_classifier_label"]),
            "pixel_values": self.preprocess(crop),
        }


def collate_batch(batch: list[dict[str, Any]]) -> dict[str, Any]:
    import torch

    return {
        "annotation_ids": torch.tensor([row["annotation_id"] for row in batch], dtype=torch.long),
        "category_ids": torch.tensor([row["category_id"] for row in batch], dtype=torch.long),
        "local_classifier_labels": torch.tensor([row["local_classifier_label"] for row in batch], dtype=torch.long),
        "pixel_values": torch.stack([row["pixel_values"] for row in batch]),
    }


def worker_init_fn(worker_id: int) -> None:
    import numpy
    import random
    import torch

    worker_seed = (torch.initial_seed() + worker_id) % (2 ** 32)
    random.seed(worker_seed)
    numpy.random.seed(worker_seed)


def embed_rows(
    *,
    rows: list[dict[str, Any]],
    preprocess,
    model,
    device: str,
    batch_size: int,
    num_workers: int,
) -> dict[str, Any]:
    import torch

    dataset = ExactCropDataset(rows=rows, preprocess=preprocess)
    data_loader = torch.utils.data.DataLoader(
        dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=device == "cuda",
        worker_init_fn=worker_init_fn if num_workers > 0 else None,
        collate_fn=collate_batch,
    )

    annotation_ids = []
    category_ids = []
    local_classifier_labels = []
    embeddings = []

    total_batches = len(data_loader)
    for batch_index, batch in enumerate(data_loader, start=1):
        with torch.no_grad():
            batch_embeddings = model.encode_image(batch["pixel_values"].to(device), normalize=True).detach().cpu().float()
        embeddings.append(batch_embeddings)
        annotation_ids.append(batch["annotation_ids"].cpu())
        category_ids.append(batch["category_ids"].cpu())
        local_classifier_labels.append(batch["local_classifier_labels"].cpu())
        print(json.dumps({"stage": "embed", "batch": batch_index, "total_batches": total_batches}, ensure_ascii=False))

    return {
        "annotation_ids": torch.cat(annotation_ids, dim=0),
        "category_ids": torch.cat(category_ids, dim=0),
        "local_classifier_labels": torch.cat(local_classifier_labels, dim=0),
        "embeddings": torch.cat(embeddings, dim=0),
    }


def build_cache_payload(
    *,
    split_name: str,
    rows: list[dict[str, Any]],
    manifest_path: Path,
    model_id: str,
    device: str,
    label_rows: list[dict[str, Any]],
    embeddings_payload: dict[str, Any],
) -> dict[str, Any]:
    return {
        "split_name": split_name,
        "manifest_path": normalize_relative_path(manifest_path),
        "model_id": model_id,
        "resolved_device": device,
        "num_rows": len(rows),
        "embedding_dim": int(embeddings_payload["embeddings"].shape[-1]),
        "label_rows": label_rows,
        "annotation_ids": embeddings_payload["annotation_ids"],
        "category_ids": embeddings_payload["category_ids"],
        "local_classifier_labels": embeddings_payload["local_classifier_labels"],
        "embeddings": embeddings_payload["embeddings"],
    }


def atomic_torch_save(path: Path, payload: dict[str, Any]) -> None:
    import os
    import torch

    tmp_path = path.with_suffix(path.suffix + ".tmp")
    torch.save(payload, tmp_path)
    os.replace(tmp_path, path)


def load_existing_cache_if_valid(
    *,
    cache_path: Path,
    split_name: str,
    manifest_path: Path,
    model_id: str,
    resolved_device: str,
    expected_num_classes: int,
) -> dict[str, Any] | None:
    import torch

    if not cache_path.exists():
        return None
    payload = torch.load(cache_path, map_location="cpu")
    if payload.get("split_name") != split_name:
        return None
    if payload.get("manifest_path") != normalize_relative_path(manifest_path):
        return None
    if payload.get("model_id") != model_id:
        return None
    if payload.get("resolved_device") != resolved_device:
        return None
    if len(payload.get("label_rows", [])) != expected_num_classes:
        return None
    if int(payload.get("num_rows", -1)) != int(payload["embeddings"].shape[0]):
        return None
    return payload


def main() -> None:
    parser = argparse.ArgumentParser(description="Cache exact-crop PE-Core embeddings for NorgesGruppen classifier training.")
    parser.add_argument("--train-manifest", type=Path, default=CROP_CLASSIFIER_TRAIN_JSONL)
    parser.add_argument("--val-manifest", type=Path, default=CROP_CLASSIFIER_VAL_JSONL)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--model-id", default="hf-hub:timm/PE-Core-B-16")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--seed", type=int, default=11)
    parser.add_argument("--experiment-id")
    parser.add_argument("--label", default="pe_core_exact_crop_cache")
    parser.add_argument("--cache-split", choices=("both", "train", "val"), default="both")
    parser.add_argument("--reuse-existing", action="store_true")
    args = parser.parse_args()

    output_dir = args.output_dir
    artifacts_dir = output_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    seed_everything(args.seed)
    resolved_device = resolve_device(args.device)

    raw_train_rows = [row for row in load_classifier_manifest(args.train_manifest) if row.get("classifier_trainable")]
    label_maps = build_label_maps(raw_train_rows)
    train_rows = attach_local_classifier_labels(rows=raw_train_rows, label_maps=label_maps)
    val_rows = attach_local_classifier_labels(rows=load_classifier_manifest(args.val_manifest), label_maps=label_maps)

    model, preprocess = load_pe_core(model_id=args.model_id, device=resolved_device)
    label_rows = build_label_rows_with_counts(train_rows)

    train_cache_path = artifacts_dir / "train-embeddings.pt"
    val_cache_path = artifacts_dir / "val-embeddings.pt"
    split_status: dict[str, str] = {}

    train_cache = None
    if args.cache_split in {"both", "train"}:
        if args.reuse_existing:
            train_cache = load_existing_cache_if_valid(
                cache_path=train_cache_path,
                split_name="train",
                manifest_path=args.train_manifest,
                model_id=args.model_id,
                resolved_device=resolved_device,
                expected_num_classes=len(label_rows),
            )
        if train_cache is None:
            train_embeddings = embed_rows(
                rows=train_rows,
                preprocess=preprocess,
                model=model,
                device=resolved_device,
                batch_size=args.batch_size,
                num_workers=args.num_workers,
            )
            train_cache = build_cache_payload(
                split_name="train",
                rows=train_rows,
                manifest_path=args.train_manifest,
                model_id=args.model_id,
                device=resolved_device,
                label_rows=label_rows,
                embeddings_payload=train_embeddings,
            )
            atomic_torch_save(train_cache_path, train_cache)
            split_status["train"] = "extracted"
        else:
            split_status["train"] = "reused"

    val_cache = None
    if args.cache_split in {"both", "val"}:
        if args.reuse_existing:
            val_cache = load_existing_cache_if_valid(
                cache_path=val_cache_path,
                split_name="val",
                manifest_path=args.val_manifest,
                model_id=args.model_id,
                resolved_device=resolved_device,
                expected_num_classes=len(label_rows),
            )
        if val_cache is None:
            val_embeddings = embed_rows(
                rows=val_rows,
                preprocess=preprocess,
                model=model,
                device=resolved_device,
                batch_size=args.batch_size,
                num_workers=args.num_workers,
            )
            val_cache = build_cache_payload(
                split_name="val",
                rows=val_rows,
                manifest_path=args.val_manifest,
                model_id=args.model_id,
                device=resolved_device,
                label_rows=label_rows,
                embeddings_payload=val_embeddings,
            )
            atomic_torch_save(val_cache_path, val_cache)
            split_status["val"] = "extracted"
        else:
            split_status["val"] = "reused"

    summary = {
        "experiment_id": args.experiment_id,
        "label": args.label,
        "model_id": args.model_id,
        "resolved_device": resolved_device,
        "seed": args.seed,
        "cache_split": args.cache_split,
        "reuse_existing": bool(args.reuse_existing),
        "train_manifest_path": normalize_relative_path(args.train_manifest),
        "val_manifest_path": normalize_relative_path(args.val_manifest),
        "train_row_count": len(train_rows),
        "val_row_count": len(val_rows),
        "val_train_seen_row_count": sum(int(row["local_classifier_label"] >= 0) for row in val_rows),
        "val_zero_train_support_row_count": sum(int(row["local_classifier_label"] < 0) for row in val_rows),
        "num_classes": label_maps["num_classes"],
        "embedding_dim": (train_cache or val_cache)["embedding_dim"],
        "split_status": split_status,
        "artifacts": {
            "train_embeddings_pt": normalize_relative_path(train_cache_path) if train_cache_path.exists() else None,
            "val_embeddings_pt": normalize_relative_path(val_cache_path) if val_cache_path.exists() else None,
        },
    }
    write_json(artifacts_dir / "summary.json", summary)
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
