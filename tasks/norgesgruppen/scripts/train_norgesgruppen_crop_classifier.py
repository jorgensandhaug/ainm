#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
import random
from collections import Counter, OrderedDict
from pathlib import Path
from typing import Any

from eval_norgesgruppen_crop_classifier import evaluate_classifier_rankings
from norgesgruppen_crop_benchmark_common import normalize_relative_path
from norgesgruppen_crop_classifier_common import (
    attach_local_classifier_labels,
    attach_loss_labels,
    bbox_xyxy_to_crop_box,
    build_label_maps,
    build_label_rows_with_counts,
    deterministic_row_rng,
    jittered_bbox_xyxy,
    load_classifier_manifest,
)
from norgesgruppen_prep_common import CROP_CLASSIFIER_TRAIN_JSONL, CROP_CLASSIFIER_VAL_JSONL, ROOT, write_json


def seed_everything(seed: int) -> None:
    random.seed(seed)
    try:
        import numpy
    except ModuleNotFoundError:
        numpy = None
    if numpy is not None:
        numpy.random.seed(seed)
    import torch
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)


def worker_init_fn(worker_id: int) -> None:
    import numpy
    import torch

    worker_seed = (torch.initial_seed() + worker_id) % (2 ** 32)
    random.seed(worker_seed)
    numpy.random.seed(worker_seed)


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


class CropClassifierDataset:
    def __init__(
        self,
        rows: list[dict[str, Any]],
        preprocess,
        training: bool,
        seed: int,
        shift_frac: float,
        scale_min: float,
        scale_max: float,
        context_frac_max: float,
        apply_appearance_aug: bool,
    ):
        self.rows = rows
        self.preprocess = preprocess
        self.training = training
        self.seed = seed
        self.shift_frac = shift_frac
        self.scale_min = scale_min
        self.scale_max = scale_max
        self.context_frac_max = context_frac_max
        self.apply_appearance_aug = apply_appearance_aug
        self.epoch = 0
        self._image_cache = LRUImageCache(max_items=6)
        self._appearance_aug = None

    def set_epoch(self, epoch: int) -> None:
        self.epoch = epoch

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

    def _get_appearance_aug(self):
        if self._appearance_aug is not None:
            return self._appearance_aug
        try:
            from torchvision import transforms
        except ModuleNotFoundError as exc:
            raise RuntimeError("Missing torchvision. Set up the crop env first.") from exc
        self._appearance_aug = transforms.Compose(
            [
                transforms.ColorJitter(brightness=0.08, contrast=0.08, saturation=0.08, hue=0.02),
                transforms.RandomApply([transforms.GaussianBlur(kernel_size=3, sigma=(0.1, 0.75))], p=0.1),
            ]
        )
        return self._appearance_aug

    def _crop_box(self, row: dict[str, Any]) -> tuple[int, int, int, int]:
        if not self.training:
            return bbox_xyxy_to_crop_box(
                bbox_xyxy=row["bbox_xyxy"],
                image_width=int(row["image_width"]),
                image_height=int(row["image_height"]),
            )
        rng = deterministic_row_rng(seed=self.seed, epoch=self.epoch, row=row)
        return jittered_bbox_xyxy(
            bbox_xyxy=row["bbox_xyxy"],
            image_width=int(row["image_width"]),
            image_height=int(row["image_height"]),
            rng=rng,
            shift_frac=self.shift_frac,
            scale_min=self.scale_min,
            scale_max=self.scale_max,
            context_frac_max=self.context_frac_max,
        )

    def __getitem__(self, index: int) -> dict[str, Any]:
        row = self.rows[index]
        image = self._load_image(row)
        crop = image.crop(self._crop_box(row))
        if self.training and self.apply_appearance_aug:
            crop = self._get_appearance_aug()(crop)
        pixel_values = self.preprocess(crop)
        return {
            "annotation_id": int(row["annotation_id"]),
            "category_id": int(row["category_id"]),
            "classifier_label": int(row["local_classifier_label"]) if row.get("classifier_trainable") else -1,
            "loss_label": int(row.get("loss_label", row["local_classifier_label"])) if row.get("classifier_trainable") else -1,
            "pixel_values": pixel_values,
        }


def collate_batch(batch: list[dict[str, Any]]) -> dict[str, Any]:
    import torch

    return {
        "annotation_ids": torch.tensor([row["annotation_id"] for row in batch], dtype=torch.long),
        "category_ids": torch.tensor([row["category_id"] for row in batch], dtype=torch.long),
        "labels": torch.tensor([row["loss_label"] for row in batch], dtype=torch.long),
        "pixel_values": torch.stack([row["pixel_values"] for row in batch]),
    }


def build_weighted_sampler(train_rows: list[dict[str, Any]], seed: int):
    import torch

    counts_by_label = Counter(int(row["local_classifier_label"]) for row in train_rows if row.get("classifier_trainable"))
    max_count = max(counts_by_label.values())
    weights = []
    for row in train_rows:
        label = int(row["local_classifier_label"])
        weight = min(4.0, (max_count / counts_by_label[label]) ** 0.5)
        weights.append(weight)
    generator = torch.Generator()
    generator.manual_seed(seed)
    return torch.utils.data.WeightedRandomSampler(
        weights=torch.tensor(weights, dtype=torch.double),
        num_samples=len(train_rows),
        replacement=True,
        generator=generator,
    )


def resolve_device(requested_device: str) -> str:
    import torch

    if requested_device != "auto":
        return requested_device
    return "cuda" if torch.cuda.is_available() else "cpu"


def load_pe_core(model_id: str, device: str):
    try:
        import open_clip
    except ModuleNotFoundError as exc:
        raise RuntimeError("Missing open_clip_torch. Run scripts/setup_norgesgruppen_crop_env.sh first.") from exc

    model, _unused, preprocess = open_clip.create_model_and_transforms(model_id)
    model = model.to(device).eval()
    for parameter in model.parameters():
        parameter.requires_grad_(False)
    return model, preprocess


def infer_embedding_dim(model, preprocess, train_rows: list[dict[str, Any]], seed: int) -> int:
    import torch
    dataset = CropClassifierDataset(
        rows=train_rows[:1],
        preprocess=preprocess,
        training=False,
        seed=seed,
        shift_frac=0.0,
        scale_min=1.0,
        scale_max=1.0,
        context_frac_max=0.0,
        apply_appearance_aug=False,
    )
    sample = dataset[0]["pixel_values"].unsqueeze(0)
    device = next(model.parameters()).device
    with torch.inference_mode():
        embedding = model.encode_image(sample.to(device), normalize=True)
    return int(embedding.shape[-1])


def create_head(embedding_dim: int, num_classes: int):
    import torch

    return torch.nn.Sequential(
        torch.nn.LayerNorm(embedding_dim),
        torch.nn.Linear(embedding_dim, num_classes),
    )


def forward_frozen_encoder(model, pixel_values, device: str):
    import torch

    with torch.no_grad():
        embeddings = model.encode_image(pixel_values.to(device), normalize=True)
    return embeddings.detach().float()


def evaluate_seen_split(model, head, data_loader, device: str) -> dict[str, float]:
    import torch
    import torch.nn.functional as F

    head.eval()
    total = 0
    total_loss = 0.0
    top1_hits = 0
    top5_hits = 0
    for batch in data_loader:
        labels = batch["labels"].to(device)
        embeddings = forward_frozen_encoder(model=model, pixel_values=batch["pixel_values"], device=device)
        logits = head(embeddings.to(device))
        loss = F.cross_entropy(logits, labels)
        probs = torch.softmax(logits, dim=-1)
        top1 = probs.argmax(dim=-1)
        top5 = probs.topk(k=min(5, probs.shape[-1]), dim=-1).indices
        total += labels.shape[0]
        total_loss += float(loss.item()) * labels.shape[0]
        top1_hits += int((top1 == labels).sum().item())
        top5_hits += int((top5 == labels.unsqueeze(1)).any(dim=1).sum().item())
    return {
        "loss": round(total_loss / total, 6) if total else 0.0,
        "top1": round(top1_hits / total, 6) if total else 0.0,
        "top5": round(top5_hits / total, 6) if total else 0.0,
    }


def export_val_rankings(
    model,
    head,
    data_loader,
    label_maps: dict[str, Any],
    device: str,
    max_rank: int,
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    import torch

    head.eval()
    label_to_category_id = label_maps["label_to_category_id"]
    ranking_rows = []
    annotation_ids = []
    category_ids = []
    logits_chunks = []
    for batch in data_loader:
        embeddings = forward_frozen_encoder(model=model, pixel_values=batch["pixel_values"], device=device)
        logits = head(embeddings.to(device)).detach().cpu()
        logits_chunks.append(logits)
        annotation_ids.extend(int(value) for value in batch["annotation_ids"].tolist())
        category_ids.extend(int(value) for value in batch["category_ids"].tolist())
        sorted_label_indices = torch.argsort(logits, dim=-1, descending=True)
        sorted_logits = torch.gather(logits, 1, sorted_label_indices)
        for row_index in range(logits.shape[0]):
            ranked_category_ids = [label_to_category_id[int(label)] for label in sorted_label_indices[row_index].tolist()]
            top_scores = sorted_logits[row_index][:max_rank].tolist()
            top_labels = sorted_label_indices[row_index][:max_rank].tolist()
            candidates = [
                {
                    "category_id": label_to_category_id[int(label)],
                    "score": round(float(score), 6),
                }
                for label, score in zip(top_labels, top_scores, strict=True)
            ]
            ranking_rows.append(
                {
                    "annotation_id": int(batch["annotation_ids"][row_index].item()),
                    "ranked_category_ids": ranked_category_ids,
                    "candidates": candidates,
                    "top1_category_id": ranked_category_ids[0],
                    "top1_score": round(float(top_scores[0]), 6),
                    "top1_margin": round(float(top_scores[0] - top_scores[1]), 6) if len(top_scores) > 1 else 0.0,
                }
            )
    logits_payload = {
        "annotation_ids": annotation_ids,
        "category_ids": category_ids,
        "eligible_category_ids": label_to_category_id,
        "logits": torch.cat(logits_chunks, dim=0),
    }
    return ranking_rows, logits_payload


def train_classifier(
    train_manifest_path: Path,
    val_manifest_path: Path,
    output_dir: Path,
    model_id: str,
    device: str,
    batch_size: int,
    num_workers: int,
    epochs: int,
    learning_rate: float,
    weight_decay: float,
    seed: int,
    label: str,
    experiment_id: str | None,
    max_rank: int,
    shift_frac: float,
    scale_min: float,
    scale_max: float,
    context_frac_max: float,
    shuffle_labels: bool,
) -> dict[str, Any]:
    import torch

    output_dir.mkdir(parents=True, exist_ok=True)
    artifacts_dir = output_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    seed_everything(seed)
    resolved_device = resolve_device(device)
    raw_train_rows = [row for row in load_classifier_manifest(train_manifest_path) if row.get("classifier_trainable")]
    label_maps = build_label_maps(raw_train_rows)
    base_train_rows = attach_local_classifier_labels(rows=raw_train_rows, label_maps=label_maps)
    val_rows = attach_local_classifier_labels(
        rows=load_classifier_manifest(val_manifest_path),
        label_maps=label_maps,
    )
    val_seen_rows = [row for row in val_rows if row.get("classifier_trainable") and int(row["local_classifier_label"]) >= 0]
    train_rows, shuffle_manifest = attach_loss_labels(
        train_rows=base_train_rows,
        seed=seed,
        shuffle_labels=shuffle_labels,
    )

    model, preprocess = load_pe_core(model_id=model_id, device=resolved_device)
    embedding_dim = infer_embedding_dim(model=model, preprocess=preprocess, train_rows=train_rows, seed=seed)
    head = create_head(embedding_dim=embedding_dim, num_classes=label_maps["num_classes"]).to(resolved_device)
    optimizer = torch.optim.AdamW(head.parameters(), lr=learning_rate, weight_decay=weight_decay)

    train_dataset = CropClassifierDataset(
        rows=train_rows,
        preprocess=preprocess,
        training=True,
        seed=seed,
        shift_frac=shift_frac,
        scale_min=scale_min,
        scale_max=scale_max,
        context_frac_max=context_frac_max,
        apply_appearance_aug=True,
    )
    val_seen_dataset = CropClassifierDataset(
        rows=val_seen_rows,
        preprocess=preprocess,
        training=False,
        seed=seed,
        shift_frac=0.0,
        scale_min=1.0,
        scale_max=1.0,
        context_frac_max=0.0,
        apply_appearance_aug=False,
    )
    val_all_dataset = CropClassifierDataset(
        rows=val_rows,
        preprocess=preprocess,
        training=False,
        seed=seed,
        shift_frac=0.0,
        scale_min=1.0,
        scale_max=1.0,
        context_frac_max=0.0,
        apply_appearance_aug=False,
    )

    train_loader = torch.utils.data.DataLoader(
        train_dataset,
        batch_size=batch_size,
        sampler=build_weighted_sampler(train_rows=train_rows, seed=seed),
        num_workers=num_workers,
        pin_memory=resolved_device == "cuda",
        worker_init_fn=worker_init_fn if num_workers > 0 else None,
        collate_fn=collate_batch,
    )
    val_seen_loader = torch.utils.data.DataLoader(
        val_seen_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=resolved_device == "cuda",
        worker_init_fn=worker_init_fn if num_workers > 0 else None,
        collate_fn=collate_batch,
    )
    val_all_loader = torch.utils.data.DataLoader(
        val_all_dataset,
        batch_size=batch_size,
        shuffle=False,
        num_workers=num_workers,
        pin_memory=resolved_device == "cuda",
        worker_init_fn=worker_init_fn if num_workers > 0 else None,
        collate_fn=collate_batch,
    )

    history = []
    best_state = None
    best_epoch = None
    best_val_top1 = -1.0

    for epoch_index in range(1, epochs + 1):
        train_dataset.set_epoch(epoch_index)
        head.train()
        epoch_loss = 0.0
        epoch_samples = 0
        for batch in train_loader:
            optimizer.zero_grad(set_to_none=True)
            labels = batch["labels"].to(resolved_device)
            embeddings = forward_frozen_encoder(model=model, pixel_values=batch["pixel_values"], device=resolved_device)
            logits = head(embeddings.to(resolved_device))
            loss = torch.nn.functional.cross_entropy(logits, labels)
            loss.backward()
            optimizer.step()
            batch_count = labels.shape[0]
            epoch_loss += float(loss.item()) * batch_count
            epoch_samples += batch_count
        val_metrics = evaluate_seen_split(
            model=model,
            head=head,
            data_loader=val_seen_loader,
            device=resolved_device,
        )
        epoch_summary = {
            "epoch": epoch_index,
            "train_loss": round(epoch_loss / epoch_samples, 6) if epoch_samples else 0.0,
            "val_seen_loss": val_metrics["loss"],
            "val_seen_top1": val_metrics["top1"],
            "val_seen_top5": val_metrics["top5"],
        }
        history.append(epoch_summary)
        print(json.dumps(epoch_summary, ensure_ascii=False))
        if val_metrics["top1"] > best_val_top1:
            best_val_top1 = val_metrics["top1"]
            best_epoch = epoch_index
            best_state = {
                "head_state_dict": head.state_dict(),
                "epoch": epoch_index,
                "val_seen_metrics": val_metrics,
            }

    if best_state is None:
        raise RuntimeError("Training produced no best state.")

    head.load_state_dict(best_state["head_state_dict"])
    checkpoint_payload = {
        "experiment_id": experiment_id,
        "label": label,
        "model_id": model_id,
        "resolved_device": resolved_device,
        "seed": seed,
        "num_classes": label_maps["num_classes"],
        "label_rows": build_label_rows_with_counts(base_train_rows),
        "head_state_dict": head.state_dict(),
        "best_epoch": best_epoch,
        "best_val_seen_metrics": best_state["val_seen_metrics"],
        "shuffle_labels": shuffle_manifest,
    }
    torch.save(checkpoint_payload, artifacts_dir / "checkpoint-best.pt")

    ranking_rows, logits_payload = export_val_rankings(
        model=model,
        head=head,
        data_loader=val_all_loader,
        label_maps=label_maps,
        device=resolved_device,
        max_rank=max_rank,
    )
    torch.save(logits_payload, artifacts_dir / "val-logits.pt")

    rankings_payload = {
        "experiment_id": experiment_id,
        "label": label,
        "model_name": model_id,
        "backend": "pe_core_openclip_linear_probe",
        "train_manifest_path": normalize_relative_path(train_manifest_path),
        "val_manifest_path": normalize_relative_path(val_manifest_path),
        "resolved_device": resolved_device,
        "seed": seed,
        "num_classes": label_maps["num_classes"],
        "best_epoch": best_epoch,
        "best_val_seen_metrics": best_state["val_seen_metrics"],
        "label_rows": build_label_rows_with_counts(base_train_rows),
        "rankings": ranking_rows,
    }
    rankings_path = artifacts_dir / "val-rankings.json"
    write_json(rankings_path, rankings_payload)

    summary = {
        "experiment_id": experiment_id,
        "label": label,
        "model_name": model_id,
        "backend": "pe_core_openclip_linear_probe",
        "resolved_device": resolved_device,
        "seed": seed,
        "train_manifest_path": normalize_relative_path(train_manifest_path),
        "val_manifest_path": normalize_relative_path(val_manifest_path),
        "train_row_count": len(train_rows),
        "val_row_count": len(val_rows),
        "val_train_seen_row_count": len(val_seen_rows),
        "val_zero_train_support_row_count": len(val_rows) - len(val_seen_rows),
        "num_classes": label_maps["num_classes"],
        "epochs": epochs,
        "batch_size": batch_size,
        "num_workers": num_workers,
        "learning_rate": learning_rate,
        "weight_decay": weight_decay,
        "shift_frac": shift_frac,
        "scale_min": scale_min,
        "scale_max": scale_max,
        "context_frac_max": context_frac_max,
        "shuffle_labels": shuffle_manifest,
        "best_epoch": best_epoch,
        "best_val_seen_metrics": best_state["val_seen_metrics"],
        "history": history,
        "artifacts": {
            "checkpoint_best_pt": normalize_relative_path(artifacts_dir / "checkpoint-best.pt"),
            "val_rankings_json": normalize_relative_path(rankings_path),
            "val_logits_pt": normalize_relative_path(artifacts_dir / "val-logits.pt"),
        },
    }
    write_json(artifacts_dir / "summary.json", summary)
    write_json(artifacts_dir / "train-history.json", history)

    evaluate_classifier_rankings(
        rankings_path=rankings_path,
        output_dir=output_dir,
        train_manifest_path=train_manifest_path,
        val_manifest_path=val_manifest_path,
        label=label,
        experiment_id=experiment_id,
        model_name=model_id,
    )
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Train the first frozen-PE-Core NorgesGruppen shelf-crop classifier.")
    parser.add_argument("--train-manifest", type=Path, default=CROP_CLASSIFIER_TRAIN_JSONL)
    parser.add_argument("--val-manifest", type=Path, default=CROP_CLASSIFIER_VAL_JSONL)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--model-id", default="hf-hub:timm/PE-Core-B-16")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--num-workers", type=int, default=0)
    parser.add_argument("--epochs", type=int, default=15)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--seed", type=int, default=11)
    parser.add_argument("--label", default="pe_core_linear_probe")
    parser.add_argument("--experiment-id")
    parser.add_argument("--max-rank", type=int, default=20)
    parser.add_argument("--shift-frac", type=float, default=0.05)
    parser.add_argument("--scale-min", type=float, default=0.9)
    parser.add_argument("--scale-max", type=float, default=1.1)
    parser.add_argument("--context-frac-max", type=float, default=0.08)
    parser.add_argument("--shuffle-labels", action="store_true")
    args = parser.parse_args()

    summary = train_classifier(
        train_manifest_path=args.train_manifest,
        val_manifest_path=args.val_manifest,
        output_dir=args.output_dir,
        model_id=args.model_id,
        device=args.device,
        batch_size=args.batch_size,
        num_workers=args.num_workers,
        epochs=args.epochs,
        learning_rate=args.learning_rate,
        weight_decay=args.weight_decay,
        seed=args.seed,
        label=args.label,
        experiment_id=args.experiment_id,
        max_rank=args.max_rank,
        shift_frac=args.shift_frac,
        scale_min=args.scale_min,
        scale_max=args.scale_max,
        context_frac_max=args.context_frac_max,
        shuffle_labels=args.shuffle_labels,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
