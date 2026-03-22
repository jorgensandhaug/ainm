#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.local/bin:$PATH"
export LD_LIBRARY_PATH="/home/jorge/.local/lib/nvidia:${LD_LIBRARY_PATH:-}"

IMGSZ=960
BATCH=4
DEVICE="1"

# Moderate cls boost (0.8 vs default 0.5) + longer training + seed diversity
echo "=== Stage 1/4: init (50 epochs, cls=0.8, seed=55) ==="
uv run python yolo/train.py \
  --weights yolo26x.pt \
  --data data/yolo/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 50 --batch $BATCH \
  --lr0 0.003 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 25 --close-mosaic 15 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.4 --translate 0.08 --fliplr 0.5 \
  --cls-weight 0.8 \
  --seed 55 --run-tag cb_init

STAGE1=$(ls -d runs/cb_init_*/weights/best.pt | tail -1)
echo "Stage 1 best: $STAGE1"

echo "=== Stage 2/4: hardopt (80 epochs, cls=0.8) ==="
uv run python yolo/train.py \
  --weights "$STAGE1" \
  --data data/yolo/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 80 --batch $BATCH \
  --lr0 0.002 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 35 --close-mosaic 20 \
  --mixup 0.15 --copy-paste 0.15 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --cls-weight 0.8 \
  --seed 55 --run-tag cb_hardopt

STAGE2=$(ls -d runs/cb_hardopt_*/weights/best.pt | tail -1)
echo "Stage 2 best: $STAGE2"

echo "=== Stage 3/4: finalfull (25 epochs) ==="
uv run python yolo/train.py \
  --weights "$STAGE2" \
  --data data/yolo_fulltrain/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 25 --batch $BATCH \
  --lr0 0.0005 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 2.0 \
  --optimizer AdamW --patience 10 --close-mosaic 8 \
  --mixup 0.05 --copy-paste 0.1 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --cls-weight 0.7 \
  --seed 55 --run-tag cb_finalfull

STAGE3=$(ls -d runs/cb_finalfull_*/weights/best.pt | tail -1)
echo "Stage 3 best: $STAGE3"

echo "=== Stage 4/4: fine-tune (20 epochs) ==="
uv run python yolo/train.py \
  --weights "$STAGE3" \
  --data data/yolo/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 20 --batch $BATCH \
  --lr0 6e-05 --lrf 0.03 --weight-decay 0.00035 --warmup-epochs 1.0 \
  --optimizer AdamW --patience 25 --close-mosaic 15 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.18 --translate 0.04 --fliplr 0.5 \
  --cls-weight 0.6 \
  --seed 55 --run-tag cb_finetune

STAGE4=$(ls -d runs/cb_finetune_*/weights/best.pt | tail -1)
echo "Stage 4 best: $STAGE4"

echo ""
echo "=== Cls-boost pipeline complete ==="
echo "Final model: $STAGE4"
