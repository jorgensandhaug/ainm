"""Train a crop classifier using timm for reranking YOLO predictions."""
from __future__ import annotations
import argparse
import json
import torch
import torch.nn as nn
from torch.utils.data import DataLoader, Dataset
from torchvision import transforms
from pathlib import Path
from PIL import Image
import timm


class CropDataset(Dataset):
    def __init__(self, root: Path, transform, num_classes: int):
        self.samples = []
        self.transform = transform
        for class_dir in sorted(root.iterdir()):
            if not class_dir.is_dir():
                continue
            class_id = int(class_dir.name)
            if class_id >= num_classes:
                continue
            for img_path in class_dir.glob("*.jpg"):
                self.samples.append((img_path, class_id))

    def __len__(self):
        return len(self.samples)

    def __getitem__(self, idx):
        path, label = self.samples[idx]
        img = Image.open(path).convert("RGB")
        img = self.transform(img)
        return img, label


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--train-crops", type=Path, default=Path("data/classifier_crops_train"))
    parser.add_argument("--val-crops", type=Path, default=Path("data/classifier_crops_val"))
    parser.add_argument("--num-classes", type=int, default=356)
    parser.add_argument("--model-name", default="efficientnet_b0", help="timm model name")
    parser.add_argument("--epochs", type=int, default=30)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--lr", type=float, default=1e-3)
    parser.add_argument("--img-size", type=int, default=224)
    parser.add_argument("--device", type=int, default=2)
    parser.add_argument("--output", type=Path, default=Path("runs/classifier"))
    args = parser.parse_args()

    device = torch.device(f"cuda:{args.device}")

    train_transform = transforms.Compose([
        transforms.RandomResizedCrop(args.img_size, scale=(0.7, 1.0)),
        transforms.RandomHorizontalFlip(),
        transforms.ColorJitter(brightness=0.2, contrast=0.2, saturation=0.2, hue=0.05),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])
    val_transform = transforms.Compose([
        transforms.Resize((args.img_size, args.img_size)),
        transforms.ToTensor(),
        transforms.Normalize(mean=[0.485, 0.456, 0.406], std=[0.229, 0.224, 0.225]),
    ])

    train_ds = CropDataset(args.train_crops, train_transform, args.num_classes)
    val_ds = CropDataset(args.val_crops, val_transform, args.num_classes)
    print(f"Train: {len(train_ds)} samples, Val: {len(val_ds)} samples")

    train_loader = DataLoader(train_ds, batch_size=args.batch_size, shuffle=True,
                              num_workers=4, pin_memory=True)
    val_loader = DataLoader(val_ds, batch_size=args.batch_size, shuffle=False,
                            num_workers=4, pin_memory=True)

    model = timm.create_model(args.model_name, pretrained=True, num_classes=args.num_classes)
    model = model.to(device)

    optimizer = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    scheduler = torch.optim.lr_scheduler.CosineAnnealingLR(optimizer, T_max=args.epochs)
    criterion = nn.CrossEntropyLoss(label_smoothing=0.1)

    args.output.mkdir(parents=True, exist_ok=True)
    best_acc = 0.0

    for epoch in range(args.epochs):
        model.train()
        total_loss = 0.0
        correct = 0
        total = 0
        for images, labels in train_loader:
            images, labels = images.to(device), labels.to(device)
            optimizer.zero_grad()
            outputs = model(images)
            loss = criterion(outputs, labels)
            loss.backward()
            optimizer.step()
            total_loss += loss.item() * labels.size(0)
            _, predicted = outputs.max(1)
            correct += predicted.eq(labels).sum().item()
            total += labels.size(0)

        train_loss = total_loss / total
        train_acc = correct / total

        model.eval()
        val_correct = 0
        val_total = 0
        with torch.no_grad():
            for images, labels in val_loader:
                images, labels = images.to(device), labels.to(device)
                outputs = model(images)
                _, predicted = outputs.max(1)
                val_correct += predicted.eq(labels).sum().item()
                val_total += labels.size(0)

        val_acc = val_correct / val_total
        scheduler.step()

        print(f"Epoch {epoch+1}/{args.epochs} | train_loss={train_loss:.4f} "
              f"train_acc={train_acc:.4f} val_acc={val_acc:.4f}")

        if val_acc > best_acc:
            best_acc = val_acc
            torch.save({
                "model_state_dict": model.state_dict(),
                "model_name": args.model_name,
                "num_classes": args.num_classes,
                "img_size": args.img_size,
                "best_acc": best_acc,
                "epoch": epoch,
            }, args.output / "best_classifier.pt")
            print(f"  -> New best val_acc: {best_acc:.4f}")

    print(f"\nBest val accuracy: {best_acc:.4f}")
    print(f"Saved to {args.output / 'best_classifier.pt'}")


if __name__ == "__main__":
    main()
