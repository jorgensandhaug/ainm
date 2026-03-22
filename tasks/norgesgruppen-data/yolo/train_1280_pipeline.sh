#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."

export PATH="$HOME/.local/bin:$PATH"
export LD_LIBRARY_PATH="/home/jorge/.local/lib/nvidia:${LD_LIBRARY_PATH:-}"

IMGSZ=1280
BATCH=2
DEVICE="1"

echo "=== Stage 1/6: sweep_precision (30 epochs, from yolo26x.pt) ==="
uv run python yolo/train.py \
  --weights yolo26x.pt \
  --data data/yolo/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 30 --batch $BATCH \
  --lr0 0.0035 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 20 --close-mosaic 12 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.35 --translate 0.05 --fliplr 0.5 \
  --seed 62 --run-tag 1280_sweep_precision

STAGE1=$(ls -d runs/1280_sweep_precision_*/weights/best.pt | tail -1)
echo "Stage 1 best: $STAGE1"

echo "=== Stage 2/6: hardopt (70 epochs) ==="
uv run python yolo/train.py \
  --weights "$STAGE1" \
  --data data/yolo/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 70 --batch $BATCH \
  --lr0 0.002 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 30 --close-mosaic 20 \
  --mixup 0.15 --copy-paste 0.15 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --seed 77 --run-tag 1280_hardopt

STAGE2=$(ls -d runs/1280_hardopt_*/weights/best.pt | tail -1)
echo "Stage 2 best: $STAGE2"

echo "=== Stage 3/6: rebalanceft (25 epochs, balanced data) ==="
uv run python yolo/train.py \
  --weights "$STAGE2" \
  --data data/yolo_balanced/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 25 --batch $BATCH \
  --lr0 0.0008 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 12 --close-mosaic 8 \
  --mixup 0.05 --copy-paste 0.1 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --seed 91 --run-tag 1280_rebalanceft

STAGE3=$(ls -d runs/1280_rebalanceft_*/weights/best.pt | tail -1)
echo "Stage 3 best: $STAGE3"

echo "=== Stage 4/6: finalfull (20 epochs, full train data) ==="
uv run python yolo/train.py \
  --weights "$STAGE3" \
  --data data/yolo_fulltrain/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 20 --batch $BATCH \
  --lr0 0.0006 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 8 --close-mosaic 6 \
  --mixup 0.05 --copy-paste 0.1 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --seed 123 --run-tag 1280_finalfull

STAGE4=$(ls -d runs/1280_finalfull_*/weights/best.pt | tail -1)
echo "Stage 4 best: $STAGE4"

echo "=== Stage 5/6: confcurr_s1 (12 epochs, confusion curriculum) ==="
uv run python yolo/train.py \
  --weights "$STAGE4" \
  --data data/yolo_confusion_curriculum/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 12 --batch $BATCH \
  --lr0 0.0002 --lrf 0.05 --weight-decay 0.0004 --warmup-epochs 1.0 \
  --optimizer AdamW --patience 20 --close-mosaic 10 \
  --mixup 0.02 --copy-paste 0.03 --scale 0.25 --translate 0.06 --fliplr 0.5 \
  --seed 123 --run-tag 1280_confcurr_s1

STAGE5=$(ls -d runs/1280_confcurr_s1_*/weights/best.pt | tail -1)
echo "Stage 5 best: $STAGE5"

echo "=== Stage 6/6: confcurr_s2 (18 epochs, original data) ==="
uv run python yolo/train.py \
  --weights "$STAGE5" \
  --data data/yolo/data.yaml \
  --device $DEVICE \
  --imgsz $IMGSZ --epochs 18 --batch $BATCH \
  --lr0 8e-05 --lrf 0.03 --weight-decay 0.00035 --warmup-epochs 1.0 \
  --optimizer AdamW --patience 25 --close-mosaic 15 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.18 --translate 0.04 --fliplr 0.5 \
  --seed 123 --run-tag 1280_confcurr_s2

STAGE6=$(ls -d runs/1280_confcurr_s2_*/weights/best.pt | tail -1)
echo "Stage 6 best: $STAGE6"

echo ""
echo "=== Full 1280 pipeline complete ==="
echo "Final model: $STAGE6"
