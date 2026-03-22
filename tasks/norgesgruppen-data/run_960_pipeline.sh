#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"

export CUDA_VISIBLE_DEVICES=0
PYTHON=.venv/bin/python
IMGSZ=960
BATCH=4

echo "=== Stage 1/6: sweep_precision (30 epochs, from yolo26x.pt) ==="
$PYTHON yolo/train.py \
  --weights yolo26x.pt \
  --data data/yolo/data.yaml \
  --imgsz $IMGSZ --epochs 30 --batch $BATCH \
  --lr0 0.0035 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 20 --close-mosaic 12 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.35 --translate 0.05 --fliplr 0.5 \
  --seed 62 --run-tag 960_sweep_precision --device 0

STAGE1=$(ls -d runs/960_sweep_precision_*/weights/best.pt | tail -1)
echo "Stage 1 best: $STAGE1"

echo "=== Stage 2/6: hardopt (70 epochs) ==="
$PYTHON yolo/train.py \
  --weights "$STAGE1" \
  --data data/yolo/data.yaml \
  --imgsz $IMGSZ --epochs 70 --batch $BATCH \
  --lr0 0.002 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 30 --close-mosaic 20 \
  --mixup 0.15 --copy-paste 0.15 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --seed 77 --run-tag 960_hardopt --device 0

STAGE2=$(ls -d runs/960_hardopt_*/weights/best.pt | tail -1)
echo "Stage 2 best: $STAGE2"

echo "=== Stage 3/6: rebalanceft (25 epochs, balanced data) ==="
$PYTHON yolo/train.py \
  --weights "$STAGE2" \
  --data data/yolo_balanced/data.yaml \
  --imgsz $IMGSZ --epochs 25 --batch $BATCH \
  --lr0 0.0008 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 12 --close-mosaic 8 \
  --mixup 0.05 --copy-paste 0.1 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --seed 91 --run-tag 960_rebalanceft --device 0

STAGE3=$(ls -d runs/960_rebalanceft_*/weights/best.pt | tail -1)
echo "Stage 3 best: $STAGE3"

echo "=== Stage 4/6: finalfull (20 epochs, full train data) ==="
$PYTHON yolo/train.py \
  --weights "$STAGE3" \
  --data data/yolo_fulltrain/data.yaml \
  --imgsz $IMGSZ --epochs 20 --batch $BATCH \
  --lr0 0.0006 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 8 --close-mosaic 6 \
  --mixup 0.05 --copy-paste 0.1 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --seed 123 --run-tag 960_finalfull --device 0

STAGE4=$(ls -d runs/960_finalfull_*/weights/best.pt | tail -1)
echo "Stage 4 best: $STAGE4"

echo "=== Stage 5/6: confcurr_s1 (12 epochs, confusion curriculum) ==="
$PYTHON yolo/train.py \
  --weights "$STAGE4" \
  --data data/yolo_confusion_curriculum/data.yaml \
  --imgsz $IMGSZ --epochs 12 --batch $BATCH \
  --lr0 0.0002 --lrf 0.05 --weight-decay 0.0004 --warmup-epochs 1.0 \
  --optimizer AdamW --patience 20 --close-mosaic 10 \
  --mixup 0.02 --copy-paste 0.03 --scale 0.25 --translate 0.06 --fliplr 0.5 \
  --seed 123 --run-tag 960_confcurr_s1 --device 0

STAGE5=$(ls -d runs/960_confcurr_s1_*/weights/best.pt | tail -1)
echo "Stage 5 best: $STAGE5"

echo "=== Stage 6/6: confcurr_s2 (18 epochs, original data) ==="
$PYTHON yolo/train.py \
  --weights "$STAGE5" \
  --data data/yolo/data.yaml \
  --imgsz $IMGSZ --epochs 18 --batch $BATCH \
  --lr0 8e-05 --lrf 0.03 --weight-decay 0.00035 --warmup-epochs 1.0 \
  --optimizer AdamW --patience 25 --close-mosaic 15 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.18 --translate 0.04 --fliplr 0.5 \
  --seed 123 --run-tag 960_confcurr_s2 --device 0

STAGE6=$(ls -d runs/960_confcurr_s2_*/weights/best.pt | tail -1)
echo "Stage 6 best: $STAGE6"

echo ""
echo "=== Full 960 pipeline complete ==="
echo "Final model: $STAGE6"
