"""Train a lightweight crop classifier for YOLO reclassification."""
from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from torch.utils.data import DataLoader, Dataset, WeightedRandomSampler
from torchvision import transforms
from PIL import Image
import timm


class CropDataset(Dataset):
    def __init__(self, root: Path, transform=None):
        self.samples: list[tuple[Path, int]] = []
        self.transform = transform
        for cls_dir in sorted(root.iterdir()):
            if not cls_dir.is_dir():
                continue
            cls_id = int(cls_dir.name)
            for img_path in sorted(cls_dir.glob("*.jpg")):
                self.samples.append((img_path, cls_id))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        if self.transform:
            img = self.transform(img)
        return img, label


def get_class_weights(dataset: CropDataset, num_classes: int) -> torch.Tensor:
    counts = torch.zeros(num_classes)
    for _, label in dataset.samples:
        counts[label] += 1
    # Inverse frequency weighting with smoothing
    weights = 1.0 / (counts + 1.0)
    weights = weights / weights.sum() * num_classes
    return weights


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--data-root", type=Path, default=Path("data/classifier"))
    parser.add_argument("--num-classes", type=int, default=356)
    parser.add_argument("--model-name", default="mobilenetv3_large_100")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=128)
    parser.add_argument("--lr", type=float, default=3e-4)
    parser.add_argument("--img-size", type=int, default=224)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--device", type=int, default=3)
    parser.add_argument("--output-dir", type=Path, default=Path("runs/classifier"))
    parser.add_argument("--label-smoothing", type=float, default=0.1)
    args = parser.parse_args()

    random.seed(args.seed)
    np.random.seed(args.seed)
    torch.manual_seed(args.seed)
    torch.cuda.manual_seed_all(args.seed)

    device = torch.device(f"cuda:{args.device}" if torch.cuda.is_available() else "cpu")

    # Transforms
    train_transform = transforms.Compose([
        transforms.RandomResizedCrop(args.img_size, scale=(0.7, 1.0)),
        transforms.RandomHorizontalFlip(0.5),
        transforms.ColorJitter(brightness=0.3, contrast=0.3, saturation=0.2, hue=0.05),
        transforms.RandomRotation(10),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    val_transform = transforms.Compose([
        transforms.Resize((args.img_size, args.img_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    train_dataset = CropDataset(args.data_root / "train", train_transform)
    val_dataset = CropDataset(args.data_root / "val", val_transform)
    print(f"Train: {len(train_dataset)}, Val: {len(val_dataset)}")

    # Class-balanced sampling
    sample_weights = []
    class_counts = torch.zeros(args.num_classes)
    for _, label in train_dataset.samples:
        class_counts[label] += 1
    for _, label in train_dataset.samples:
        w = 1.0 / max(1.0, class_counts[label].item())
        sample_weights.append(w)
    sampler = WeightedRandomSampler(sample_weights, len(sample_weights), replacement=True)

    train_loader = DataLoader(
        train_dataset, batch_size=args.batch_size, sampler=sampler,
        num_workers=args.workers, pin_memory=True, drop_last=True,
    )
    val_loader = DataLoader(
        val_dataset, batch_size=args.batch_size, shuffle=False,
        num_workers=args.workers, pin_memory=True,
    )

    # Model
    model = timm.create_model(args.model_name, pretrained=True, num_classes=args.num_classes)
    model = model.to(device)

    # Loss with class weights and label smoothing
    class_weights = get_class_weights(train_dataset, args.num_classes).to(device)
    criterion = nn.CrossEntropyLoss(weight=class_weights, label_smoothing=args.label_smoothing)

    # Optimizer
    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=0.01)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs, eta_min=1e-6)

    args.output_dir.mkdir(parents=True, exist_ok=True)
    best_acc = 0.0
    best_epoch = 0

    for epoch in range(1, args.epochs + 1):
        # Train
        model.train()
        train_loss = 0.0
        train_correct = 0
        train_total = 0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            logits = model(images)
            loss = criterion(logits, labels)
            optimizer.zero_grad()
            loss.backward()
            optimizer.step()
            train_loss += loss.item() * images.size(0)
            train_correct += (logits.argmax(1) == labels).sum().item()
            train_total += images.size(0)
        scheduler.step()

        # Validate
        model.eval()
        val_correct = 0
        val_total = 0
        val_loss = 0.0
        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(device), labels.to(device)
                logits = model(images)
                loss = criterion(logits, labels)
                val_loss += loss.item() * images.size(0)
                val_correct += (logits.argmax(1) == labels).sum().item()
                val_total += images.size(0)

        train_acc = train_correct / max(1, train_total)
        val_acc = val_correct / max(1, val_total)
        lr = optimizer.param_groups[0]["lr"]
        print(
            f"Epoch {epoch}/{args.epochs} | "
            f"train_loss={train_loss/max(1,train_total):.4f} train_acc={train_acc:.4f} | "
            f"val_loss={val_loss/max(1,val_total):.4f} val_acc={val_acc:.4f} | lr={lr:.6f}"
        )

        if val_acc > best_acc:
            best_acc = val_acc
            best_epoch = epoch
            torch.save(model.state_dict(), args.output_dir / "best.pth")
            print(f"  -> New best val_acc={val_acc:.4f} at epoch {epoch}")

    torch.save(model.state_dict(), args.output_dir / "last.pth")

    summary = {
        "model_name": args.model_name,
        "num_classes": args.num_classes,
        "img_size": args.img_size,
        "best_val_acc": best_acc,
        "best_epoch": best_epoch,
        "epochs": args.epochs,
        "lr": args.lr,
        "batch_size": args.batch_size,
        "train_samples": len(train_dataset),
        "val_samples": len(val_dataset),
    }
    (args.output_dir / "summary.json").write_text(json.dumps(summary, indent=2))
    print(f"\nBest val_acc={best_acc:.4f} at epoch {best_epoch}")
    print(f"Saved to {args.output_dir}")


if __name__ == "__main__":
    main()
