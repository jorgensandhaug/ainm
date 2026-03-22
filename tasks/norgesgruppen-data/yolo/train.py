from pathlib import Path
import argparse
import torch
from ultralytics import YOLO


def main() -> None:
    parser = argparse.ArgumentParser(description="Train a multi-class YOLO detector.")
    parser.add_argument("--weights", default="yolo26x.pt", help="Base model weights.")
    parser.add_argument("--epochs", type=int, default=120)
    parser.add_argument("--imgsz", type=int, default=960)
    parser.add_argument("--batch", type=int, default=8)
    parser.add_argument("--lr0", type=float, default=0.003)
    parser.add_argument("--lrf", type=float, default=0.01)
    parser.add_argument("--weight-decay", type=float, default=0.0005)
    parser.add_argument("--warmup-epochs", type=float, default=3.0)
    parser.add_argument("--optimizer", default="AdamW", choices=["SGD", "Adam", "AdamW", "auto"])
    parser.add_argument("--patience", type=int, default=40)
    parser.add_argument("--close-mosaic", type=int, default=20)
    parser.add_argument("--hsv-h", type=float, default=0.015)
    parser.add_argument("--hsv-s", type=float, default=0.55)
    parser.add_argument("--hsv-v", type=float, default=0.35)
    parser.add_argument("--mixup", type=float, default=0.1)
    parser.add_argument("--copy-paste", type=float, default=0.1)
    parser.add_argument("--degrees", type=float, default=0.0)
    parser.add_argument("--translate", type=float, default=0.1)
    parser.add_argument("--scale", type=float, default=0.5)
    parser.add_argument("--fliplr", type=float, default=0.5)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--workers", type=int, default=8)
    parser.add_argument("--freeze", type=int, default=0, help="Number of model layers to freeze.")
    parser.add_argument("--run-tag", default="cls", help="Extra run name prefix for traceability.")
    parser.add_argument("--data", default="data/yolo/data.yaml", help="Path to YOLO data.yaml")
    parser.add_argument("--cls-loss", type=float, default=0.5, help="Classification loss weight (ultralytics default=0.5)")
    parser.add_argument("--box-loss", type=float, default=7.5, help="Box loss weight (ultralytics default=7.5)")
    args = parser.parse_args()

    root = Path(__file__).resolve().parents[1]
    device = 3 if torch.cuda.is_available() else "mps" if torch.backends.mps.is_available() else "cpu"
    run_name = (
        f"{args.run_tag}_e{args.epochs}_img{args.imgsz}_b{args.batch}_"
        f"lr{args.lr0:g}_mix{args.mixup:g}_cp{args.copy_paste:g}_seed{args.seed}"
    )
    data_path = Path(args.data)
    if not data_path.is_absolute():
        data_path = root / data_path
    model = YOLO(args.weights)
    model.train(
        data=str(data_path),
        single_cls=False,
        project=str(root / "runs"),
        name=run_name,
        device=device,
        epochs=args.epochs,
        imgsz=args.imgsz,
        batch=args.batch,
        lr0=args.lr0,
        lrf=args.lrf,
        weight_decay=args.weight_decay,
        warmup_epochs=args.warmup_epochs,
        optimizer=args.optimizer,
        patience=args.patience,
        close_mosaic=args.close_mosaic,
        hsv_h=args.hsv_h,
        hsv_s=args.hsv_s,
        hsv_v=args.hsv_v,
        mixup=args.mixup,
        copy_paste=args.copy_paste,
        degrees=args.degrees,
        translate=args.translate,
        scale=args.scale,
        fliplr=args.fliplr,
        seed=args.seed,
        deterministic=True,
        workers=args.workers,
        freeze=args.freeze,
        cls=args.cls_loss,
        box=args.box_loss,
    )


if __name__ == "__main__":
    main()
