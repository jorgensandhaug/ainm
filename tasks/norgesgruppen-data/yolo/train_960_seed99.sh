#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.local/bin:$PATH"
export LD_LIBRARY_PATH="/home/jorge/.local/lib/nvidia:${LD_LIBRARY_PATH:-}"

IMGSZ=960
BATCH=4
DEVICE="1"

echo "=== Stage 1/4: sweep_precision (30 epochs, seed=99) ==="
uv run python yolo/train.py \
  --weights yolo26x.pt \
  --data data/yolo/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 30 --batch $BATCH \
  --lr0 0.004 --lrf 0.01 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 20 --close-mosaic 12 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.4 --translate 0.08 --fliplr 0.5 \
  --seed 99 --run-tag s99_sweep

STAGE1=$(ls -d runs/s99_sweep_*/weights/best.pt | tail -1)
echo "Stage 1 best: $STAGE1"

echo "=== Stage 2/4: hardopt (80 epochs, seed=99) ==="
uv run python yolo/train.py \
  --weights "$STAGE1" \
  --data data/yolo/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 80 --batch $BATCH \
  --lr0 0.0025 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 35 --close-mosaic 25 \
  --mixup 0.2 --copy-paste 0.2 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --seed 99 --run-tag s99_hardopt

STAGE2=$(ls -d runs/s99_hardopt_*/weights/best.pt | tail -1)
echo "Stage 2 best: $STAGE2"

echo "=== Stage 3/4: finalfull (25 epochs, seed=99) ==="
uv run python yolo/train.py \
  --weights "$STAGE2" \
  --data data/yolo_fulltrain/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 25 --batch $BATCH \
  --lr0 0.0005 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 2.0 \
  --optimizer AdamW --patience 10 --close-mosaic 8 \
  --mixup 0.05 --copy-paste 0.1 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --seed 99 --run-tag s99_finalfull

STAGE3=$(ls -d runs/s99_finalfull_*/weights/best.pt | tail -1)
echo "Stage 3 best: $STAGE3"

echo "=== Stage 4/4: confcurr_s2 (20 epochs, seed=99) ==="
uv run python yolo/train.py \
  --weights "$STAGE3" \
  --data data/yolo/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 20 --batch $BATCH \
  --lr0 6e-05 --lrf 0.03 --weight-decay 0.00035 --warmup-epochs 1.0 \
  --optimizer AdamW --patience 25 --close-mosaic 15 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.18 --translate 0.04 --fliplr 0.5 \
  --seed 99 --run-tag s99_confcurr_s2

STAGE4=$(ls -d runs/s99_confcurr_s2_*/weights/best.pt | tail -1)
echo "Stage 4 best: $STAGE4"

echo ""
echo "=== Seed-99 pipeline complete ==="
echo "Final model: $STAGE4"
