#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.local/bin:$PATH"
export LD_LIBRARY_PATH="/home/jorge/.local/lib/nvidia:${LD_LIBRARY_PATH:-}"

IMGSZ=960
BATCH=8
DEVICE="1"

echo "=== Stage 1/3: initial training (40 epochs, YOLO26l) ==="
uv run python yolo/train.py \
  --weights yolo26l.pt \
  --data data/yolo/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 40 --batch $BATCH \
  --lr0 0.004 --lrf 0.01 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 20 --close-mosaic 15 \
  --mixup 0.15 --copy-paste 0.15 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --seed 42 --run-tag y26l_init

STAGE1=$(ls -d runs/y26l_init_*/weights/best.pt | tail -1)
echo "Stage 1 best: $STAGE1"

echo "=== Stage 2/3: finalfull (25 epochs) ==="
uv run python yolo/train.py \
  --weights "$STAGE1" \
  --data data/yolo_fulltrain/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 25 --batch $BATCH \
  --lr0 0.0006 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 2.0 \
  --optimizer AdamW --patience 10 --close-mosaic 8 \
  --mixup 0.05 --copy-paste 0.1 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --seed 42 --run-tag y26l_finalfull

STAGE2=$(ls -d runs/y26l_finalfull_*/weights/best.pt | tail -1)
echo "Stage 2 best: $STAGE2"

echo "=== Stage 3/3: fine-tune (18 epochs) ==="
uv run python yolo/train.py \
  --weights "$STAGE2" \
  --data data/yolo/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 18 --batch $BATCH \
  --lr0 6e-05 --lrf 0.03 --weight-decay 0.00035 --warmup-epochs 1.0 \
  --optimizer AdamW --patience 25 --close-mosaic 15 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.18 --translate 0.04 --fliplr 0.5 \
  --seed 42 --run-tag y26l_finetune

STAGE3=$(ls -d runs/y26l_finetune_*/weights/best.pt | tail -1)
echo "Stage 3 best: $STAGE3"

echo ""
echo "=== YOLO26l pipeline complete ==="
echo "Final model: $STAGE3"
