#!/usr/bin/env bash
# V6 pipeline: simplified 4-stage with longer hardopt (no confusion curriculum)
set -euo pipefail
cd "$(dirname "$0")/.."

IMGSZ=960
BATCH=4
DEVICE="2"
export PATH="$HOME/.local/bin:$PATH"
export LD_LIBRARY_PATH=/nix/store/hh698a2nnpqr47lh52n26wi8fiah3hid-gcc-13.3.0-lib/lib:${LD_LIBRARY_PATH:-}

echo "=== Stage 1/4: Initial sweep (40 epochs) ==="
uv run python yolo/train.py \
  --weights yolo26x.pt \
  --data data/yolo/data.yaml \
  --imgsz $IMGSZ --epochs 40 --batch $BATCH \
  --lr0 0.004 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 4.0 \
  --optimizer AdamW --patience 25 --close-mosaic 15 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.35 --translate 0.05 --fliplr 0.5 \
  --seed 1337 --run-tag v6_init --device $DEVICE

STAGE1=$(find runs -maxdepth 3 -path "*/v6_init_*/weights/best.pt" | sort | tail -1)
echo "Stage 1 best: $STAGE1"

echo "=== Stage 2/4: Extended hardopt (150 epochs, main training) ==="
uv run python yolo/train.py \
  --weights "$STAGE1" \
  --data data/yolo/data.yaml \
  --imgsz $IMGSZ --epochs 150 --batch $BATCH \
  --lr0 0.002 --lrf 0.005 --weight-decay 0.0005 --warmup-epochs 5.0 \
  --optimizer AdamW --patience 50 --close-mosaic 30 \
  --mixup 0.15 --copy-paste 0.15 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --seed 1447 --run-tag v6_hardopt --device $DEVICE \
  --cos-lr

STAGE2=$(find runs -maxdepth 3 -path "*/v6_hardopt_*/weights/best.pt" | sort | tail -1)
echo "Stage 2 best: $STAGE2"

echo "=== Stage 3/4: Balanced fine-tune (30 epochs) ==="
uv run python yolo/train.py \
  --weights "$STAGE2" \
  --data data/yolo_balanced/data.yaml \
  --imgsz $IMGSZ --epochs 30 --batch $BATCH \
  --lr0 0.0008 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 15 --close-mosaic 10 \
  --mixup 0.05 --copy-paste 0.1 --scale 0.4 --translate 0.08 --fliplr 0.5 \
  --seed 1553 --run-tag v6_balanced --device $DEVICE

STAGE3=$(find runs -maxdepth 3 -path "*/v6_balanced_*/weights/best.pt" | sort | tail -1)
echo "Stage 3 best: $STAGE3"

echo "=== Stage 4/4: Full-train fine-tune (25 epochs) ==="
uv run python yolo/train.py \
  --weights "$STAGE3" \
  --data data/yolo_fulltrain/data.yaml \
  --imgsz $IMGSZ --epochs 25 --batch $BATCH \
  --lr0 0.0005 --lrf 0.008 --weight-decay 0.0004 --warmup-epochs 2.0 \
  --optimizer AdamW --patience 10 --close-mosaic 8 \
  --mixup 0.03 --copy-paste 0.05 --scale 0.35 --translate 0.06 --fliplr 0.5 \
  --seed 1667 --run-tag v6_fulltrain --device $DEVICE

STAGE4=$(find runs -maxdepth 3 -path "*/v6_fulltrain_*/weights/best.pt" | sort | tail -1)
echo "Stage 4 best: $STAGE4"

# Final low-LR polish on original data
echo "=== Stage 5/5: Low-LR polish (20 epochs, original data) ==="
uv run python yolo/train.py \
  --weights "$STAGE4" \
  --data data/yolo/data.yaml \
  --imgsz $IMGSZ --epochs 20 --batch $BATCH \
  --lr0 6e-05 --lrf 0.02 --weight-decay 0.0003 --warmup-epochs 1.0 \
  --optimizer AdamW --patience 25 --close-mosaic 12 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.15 --translate 0.04 --fliplr 0.5 \
  --seed 1777 --run-tag v6_polish --device $DEVICE

STAGE5=$(find runs -maxdepth 3 -path "*/v6_polish_*/weights/best.pt" | sort | tail -1)
echo "Stage 5 best: $STAGE5"

echo ""
echo "=== V6 pipeline complete ==="
echo "Final model: $STAGE5"
