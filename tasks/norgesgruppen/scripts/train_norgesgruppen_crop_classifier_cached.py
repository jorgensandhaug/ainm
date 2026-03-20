#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from collections import Counter
from pathlib import Path
from typing import Any

from eval_norgesgruppen_crop_classifier import evaluate_classifier_rankings
from norgesgruppen_crop_benchmark_common import normalize_relative_path
from norgesgruppen_crop_classifier_common import attach_loss_labels
from norgesgruppen_prep_common import ROOT, write_json
from train_norgesgruppen_crop_classifier import seed_everything


class EmbeddingDataset:
    def __init__(self, embeddings, category_ids, local_labels, annotation_ids, loss_labels):
        self.embeddings = embeddings
        self.category_ids = category_ids
        self.local_labels = local_labels
        self.annotation_ids = annotation_ids
        self.loss_labels = loss_labels

    def __len__(self) -> int:
        return int(self.embeddings.shape[0])

    def __getitem__(self, index: int) -> dict[str, Any]:
        return {
            "embedding": self.embeddings[index],
            "category_id": int(self.category_ids[index].item()),
            "local_classifier_label": int(self.local_labels[index].item()),
            "annotation_id": int(self.annotation_ids[index].item()),
            "loss_label": int(self.loss_labels[index].item()),
        }


def collate_batch(batch: list[dict[str, Any]]) -> dict[str, Any]:
    import torch

    return {
        "embeddings": torch.stack([row["embedding"] for row in batch]),
        "category_ids": torch.tensor([row["category_id"] for row in batch], dtype=torch.long),
        "local_classifier_labels": torch.tensor([row["local_classifier_label"] for row in batch], dtype=torch.long),
        "annotation_ids": torch.tensor([row["annotation_id"] for row in batch], dtype=torch.long),
        "loss_labels": torch.tensor([row["loss_label"] for row in batch], dtype=torch.long),
    }


def build_weighted_sampler(local_labels, seed: int):
    import torch

    label_list = [int(value.item()) for value in local_labels]
    counts_by_label = Counter(label_list)
    max_count = max(counts_by_label.values())
    weights = []
    for label in label_list:
        weight = min(4.0, (max_count / counts_by_label[label]) ** 0.5)
        weights.append(weight)
    generator = torch.Generator()
    generator.manual_seed(seed)
    return torch.utils.data.WeightedRandomSampler(
        weights=torch.tensor(weights, dtype=torch.double),
        num_samples=len(label_list),
        replacement=True,
        generator=generator,
    )


def create_head(embedding_dim: int, num_classes: int):
    import torch

    return torch.nn.Sequential(
        torch.nn.LayerNorm(embedding_dim),
        torch.nn.Linear(embedding_dim, num_classes),
    )


def evaluate_seen_split(head, data_loader, device: str) -> dict[str, float]:
    import torch
    import torch.nn.functional as F

    head.eval()
    total = 0
    total_loss = 0.0
    top1_hits = 0
    top5_hits = 0
    for batch in data_loader:
        labels = batch["loss_labels"].to(device)
        logits = head(batch["embeddings"].to(device))
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


def export_val_rankings(head, data_loader, label_rows: list[dict[str, Any]], device: str, max_rank: int) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    import torch

    label_to_category_id = [int(row["category_id"]) for row in label_rows]
    ranking_rows = []
    annotation_ids = []
    category_ids = []
    logits_chunks = []

    head.eval()
    for batch in data_loader:
        logits = head(batch["embeddings"].to(device)).detach().cpu()
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

    return ranking_rows, {
        "annotation_ids": annotation_ids,
        "category_ids": category_ids,
        "eligible_category_ids": [int(row["category_id"]) for row in label_rows],
        "logits": torch.cat(logits_chunks, dim=0),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Train NorgesGruppen crop classifier from cached exact-crop embeddings.")
    parser.add_argument("--train-cache", required=True, type=Path)
    parser.add_argument("--val-cache", required=True, type=Path)
    parser.add_argument("--output-dir", required=True, type=Path)
    parser.add_argument("--device", default="cpu")
    parser.add_argument("--batch-size", type=int, default=512)
    parser.add_argument("--epochs", type=int, default=40)
    parser.add_argument("--learning-rate", type=float, default=5e-3)
    parser.add_argument("--weight-decay", type=float, default=1e-4)
    parser.add_argument("--seed", type=int, default=11)
    parser.add_argument("--label", default="pe_core_linear_probe_cached")
    parser.add_argument("--experiment-id")
    parser.add_argument("--max-rank", type=int, default=20)
    parser.add_argument("--shuffle-labels", action="store_true")
    args = parser.parse_args()

    import torch

    output_dir = args.output_dir
    artifacts_dir = output_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)

    seed_everything(args.seed)

    train_cache = torch.load(args.train_cache, map_location="cpu")
    val_cache = torch.load(args.val_cache, map_location="cpu")

    train_rows = [
        {
            "annotation_id": int(annotation_id),
            "category_id": int(category_id),
            "classifier_trainable": True,
            "local_classifier_label": int(local_label),
        }
        for annotation_id, category_id, local_label in zip(
            train_cache["annotation_ids"].tolist(),
            train_cache["category_ids"].tolist(),
            train_cache["local_classifier_labels"].tolist(),
            strict=True,
        )
    ]
    train_rows, shuffle_manifest = attach_loss_labels(train_rows=train_rows, seed=args.seed, shuffle_labels=args.shuffle_labels)

    train_loss_labels = torch.tensor([int(row["loss_label"]) for row in train_rows], dtype=torch.long)
    train_dataset = EmbeddingDataset(
        embeddings=train_cache["embeddings"].float(),
        category_ids=train_cache["category_ids"].long(),
        local_labels=train_cache["local_classifier_labels"].long(),
        annotation_ids=train_cache["annotation_ids"].long(),
        loss_labels=train_loss_labels,
    )

    val_seen_mask = val_cache["local_classifier_labels"] >= 0
    val_seen_dataset = EmbeddingDataset(
        embeddings=val_cache["embeddings"][val_seen_mask].float(),
        category_ids=val_cache["category_ids"][val_seen_mask].long(),
        local_labels=val_cache["local_classifier_labels"][val_seen_mask].long(),
        annotation_ids=val_cache["annotation_ids"][val_seen_mask].long(),
        loss_labels=val_cache["local_classifier_labels"][val_seen_mask].long(),
    )
    val_all_loss_labels = torch.where(
        val_cache["local_classifier_labels"] >= 0,
        val_cache["local_classifier_labels"],
        torch.full_like(val_cache["local_classifier_labels"], -1),
    )
    val_all_dataset = EmbeddingDataset(
        embeddings=val_cache["embeddings"].float(),
        category_ids=val_cache["category_ids"].long(),
        local_labels=val_cache["local_classifier_labels"].long(),
        annotation_ids=val_cache["annotation_ids"].long(),
        loss_labels=val_all_loss_labels.long(),
    )

    train_loader = torch.utils.data.DataLoader(
        train_dataset,
        batch_size=args.batch_size,
        sampler=build_weighted_sampler(train_dataset.local_labels, seed=args.seed),
        collate_fn=collate_batch,
    )
    val_seen_loader = torch.utils.data.DataLoader(
        val_seen_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        collate_fn=collate_batch,
    )
    val_all_loader = torch.utils.data.DataLoader(
        val_all_dataset,
        batch_size=args.batch_size,
        shuffle=False,
        collate_fn=collate_batch,
    )

    embedding_dim = int(train_cache["embeddings"].shape[-1])
    num_classes = len(train_cache["label_rows"])
    device = args.device
    head = create_head(embedding_dim=embedding_dim, num_classes=num_classes).to(device)
    optimizer = torch.optim.AdamW(head.parameters(), lr=args.learning_rate, weight_decay=args.weight_decay)

    history = []
    best_state = None
    best_epoch = None
    best_val_top1 = -1.0

    for epoch_index in range(1, args.epochs + 1):
        head.train()
        epoch_loss = 0.0
        epoch_samples = 0
        for batch in train_loader:
            optimizer.zero_grad(set_to_none=True)
            logits = head(batch["embeddings"].to(device))
            loss = torch.nn.functional.cross_entropy(logits, batch["loss_labels"].to(device))
            loss.backward()
            optimizer.step()
            batch_count = batch["loss_labels"].shape[0]
            epoch_loss += float(loss.item()) * batch_count
            epoch_samples += batch_count
        val_metrics = evaluate_seen_split(head=head, data_loader=val_seen_loader, device=device)
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
                "val_seen_metrics": val_metrics,
            }

    if best_state is None:
        raise RuntimeError("Training produced no best state.")

    head.load_state_dict(best_state["head_state_dict"])
    torch.save(
        {
            "experiment_id": args.experiment_id,
            "label": args.label,
            "seed": args.seed,
            "num_classes": num_classes,
            "label_rows": train_cache["label_rows"],
            "head_state_dict": head.state_dict(),
            "best_epoch": best_epoch,
            "best_val_seen_metrics": best_state["val_seen_metrics"],
            "train_cache_path": normalize_relative_path(args.train_cache),
            "val_cache_path": normalize_relative_path(args.val_cache),
            "shuffle_labels": shuffle_manifest,
        },
        artifacts_dir / "checkpoint-best.pt",
    )

    ranking_rows, logits_payload = export_val_rankings(
        head=head,
        data_loader=val_all_loader,
        label_rows=train_cache["label_rows"],
        device=device,
        max_rank=args.max_rank,
    )
    torch.save(logits_payload, artifacts_dir / "val-logits.pt")
    rankings_path = artifacts_dir / "val-rankings.json"
    write_json(
        rankings_path,
        {
            "experiment_id": args.experiment_id,
            "label": args.label,
            "model_name": train_cache["model_id"],
            "backend": "pe_core_openclip_linear_probe_cached",
            "train_manifest_path": train_cache["manifest_path"],
            "val_manifest_path": val_cache["manifest_path"],
            "train_cache_path": normalize_relative_path(args.train_cache),
            "val_cache_path": normalize_relative_path(args.val_cache),
            "resolved_device": device,
            "seed": args.seed,
            "num_classes": num_classes,
            "best_epoch": best_epoch,
            "best_val_seen_metrics": best_state["val_seen_metrics"],
            "label_rows": train_cache["label_rows"],
            "rankings": ranking_rows,
        },
    )

    summary = {
        "experiment_id": args.experiment_id,
        "label": args.label,
        "model_name": train_cache["model_id"],
        "backend": "pe_core_openclip_linear_probe_cached",
        "resolved_device": device,
        "seed": args.seed,
        "train_cache_path": normalize_relative_path(args.train_cache),
        "val_cache_path": normalize_relative_path(args.val_cache),
        "train_manifest_path": train_cache["manifest_path"],
        "val_manifest_path": val_cache["manifest_path"],
        "train_row_count": train_cache["num_rows"],
        "val_row_count": val_cache["num_rows"],
        "val_train_seen_row_count": int((val_cache["local_classifier_labels"] >= 0).sum().item()),
        "val_zero_train_support_row_count": int((val_cache["local_classifier_labels"] < 0).sum().item()),
        "num_classes": num_classes,
        "embedding_dim": embedding_dim,
        "epochs": args.epochs,
        "batch_size": args.batch_size,
        "learning_rate": args.learning_rate,
        "weight_decay": args.weight_decay,
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
        train_manifest_path=Path(ROOT / train_cache["manifest_path"]),
        val_manifest_path=Path(ROOT / val_cache["manifest_path"]),
        label=args.label,
        experiment_id=args.experiment_id,
        model_name=train_cache["model_id"],
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
