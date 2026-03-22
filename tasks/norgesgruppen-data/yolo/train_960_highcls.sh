#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.local/bin:$PATH"
export LD_LIBRARY_PATH="/home/jorge/.local/lib/nvidia:${LD_LIBRARY_PATH:-}"

IMGSZ=960
BATCH=4
DEVICE="1"

echo "=== Stage 1/3: init (40 epochs, cls=1.5) ==="
uv run python yolo/train.py \
  --weights yolo26x.pt \
  --data data/yolo/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 40 --batch $BATCH \
  --lr0 0.004 --lrf 0.01 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 20 --close-mosaic 15 \
  --mixup 0.1 --copy-paste 0.1 --scale 0.45 --translate 0.1 --fliplr 0.5 \
  --cls-weight 1.5 --multi-scale 0.5 \
  --seed 77 --run-tag hcls_init

STAGE1=$(ls -d runs/hcls_init_*/weights/best.pt | tail -1)
echo "Stage 1 best: $STAGE1"

echo "=== Stage 2/3: finalfull (25 epochs, cls=1.5) ==="
uv run python yolo/train.py \
  --weights "$STAGE1" \
  --data data/yolo_fulltrain/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 25 --batch $BATCH \
  --lr0 0.0005 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 2.0 \
  --optimizer AdamW --patience 10 --close-mosaic 8 \
  --mixup 0.05 --copy-paste 0.1 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --cls-weight 1.5 --multi-scale 0.5 \
  --seed 77 --run-tag hcls_finalfull

STAGE2=$(ls -d runs/hcls_finalfull_*/weights/best.pt | tail -1)
echo "Stage 2 best: $STAGE2"

echo "=== Stage 3/3: fine-tune (18 epochs, cls=1.0) ==="
uv run python yolo/train.py \
  --weights "$STAGE2" \
  --data data/yolo/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 18 --batch $BATCH \
  --lr0 6e-05 --lrf 0.03 --weight-decay 0.00035 --warmup-epochs 1.0 \
  --optimizer AdamW --patience 25 --close-mosaic 15 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.18 --translate 0.04 --fliplr 0.5 \
  --cls-weight 1.0 \
  --seed 77 --run-tag hcls_finetune

STAGE3=$(ls -d runs/hcls_finetune_*/weights/best.pt | tail -1)
echo "Stage 3 best: $STAGE3"

echo ""
echo "=== High-cls pipeline complete ==="
echo "Final model: $STAGE3"
