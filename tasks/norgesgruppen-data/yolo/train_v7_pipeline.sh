#!/usr/bin/env bash
# V7 pipeline: 250-epoch extended hardopt with label smoothing
set -euo pipefail
cd "$(dirname "$0")/.."

IMGSZ=960
BATCH=4
DEVICE="2"
export PATH="$HOME/.local/bin:$PATH"
export LD_LIBRARY_PATH=/nix/store/hh698a2nnpqr47lh52n26wi8fiah3hid-gcc-13.3.0-lib/lib:${LD_LIBRARY_PATH:-}

echo "=== Stage 1/5: Init (45 epochs) ==="
uv run python yolo/train.py \
  --weights yolo26x.pt \
  --data data/yolo/data.yaml \
  --imgsz $IMGSZ --epochs 45 --batch $BATCH \
  --lr0 0.0035 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 4.0 \
  --optimizer AdamW --patience 25 --close-mosaic 15 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.35 --translate 0.05 --fliplr 0.5 \
  --seed 2001 --run-tag v7_init --device $DEVICE

STAGE1=$(find runs -maxdepth 3 -path "*/v7_init_*/weights/best.pt" | sort | tail -1)
echo "Stage 1 best: $STAGE1"

echo "=== Stage 2/5: Extended hardopt (250 epochs, cosine LR, label smoothing) ==="
uv run python yolo/train.py \
  --weights "$STAGE1" \
  --data data/yolo/data.yaml \
  --imgsz $IMGSZ --epochs 250 --batch $BATCH \
  --lr0 0.002 --lrf 0.003 --weight-decay 0.0005 --warmup-epochs 5.0 \
  --optimizer AdamW --patience 80 --close-mosaic 40 \
  --mixup 0.15 --copy-paste 0.15 --scale 0.5 --translate 0.1 --fliplr 0.5 \
  --seed 2111 --run-tag v7_hardopt --device $DEVICE \
  --cos-lr --label-smoothing 0.05

STAGE2=$(find runs -maxdepth 3 -path "*/v7_hardopt_*/weights/best.pt" | sort | tail -1)
echo "Stage 2 best: $STAGE2"

echo "=== Stage 3/5: Balanced fine-tune (35 epochs) ==="
uv run python yolo/train.py \
  --weights "$STAGE2" \
  --data data/yolo_balanced/data.yaml \
  --imgsz $IMGSZ --epochs 35 --batch $BATCH \
  --lr0 0.0008 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 15 --close-mosaic 12 \
  --mixup 0.05 --copy-paste 0.1 --scale 0.4 --translate 0.08 --fliplr 0.5 \
  --seed 2221 --run-tag v7_balanced --device $DEVICE

STAGE3=$(find runs -maxdepth 3 -path "*/v7_balanced_*/weights/best.pt" | sort | tail -1)
echo "Stage 3 best: $STAGE3"

echo "=== Stage 4/5: Full-train (25 epochs) ==="
uv run python yolo/train.py \
  --weights "$STAGE3" \
  --data data/yolo_fulltrain/data.yaml \
  --imgsz $IMGSZ --epochs 25 --batch $BATCH \
  --lr0 0.0005 --lrf 0.008 --weight-decay 0.0004 --warmup-epochs 2.0 \
  --optimizer AdamW --patience 10 --close-mosaic 8 \
  --mixup 0.03 --copy-paste 0.05 --scale 0.35 --translate 0.06 --fliplr 0.5 \
  --seed 2331 --run-tag v7_fulltrain --device $DEVICE

STAGE4=$(find runs -maxdepth 3 -path "*/v7_fulltrain_*/weights/best.pt" | sort | tail -1)
echo "Stage 4 best: $STAGE4"

echo "=== Stage 5/5: Polish (25 epochs, original data) ==="
uv run python yolo/train.py \
  --weights "$STAGE4" \
  --data data/yolo/data.yaml \
  --imgsz $IMGSZ --epochs 25 --batch $BATCH \
  --lr0 5e-05 --lrf 0.02 --weight-decay 0.0003 --warmup-epochs 1.0 \
  --optimizer AdamW --patience 25 --close-mosaic 15 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.15 --translate 0.04 --fliplr 0.5 \
  --seed 2441 --run-tag v7_polish --device $DEVICE

STAGE5=$(find runs -maxdepth 3 -path "*/v7_polish_*/weights/best.pt" | sort | tail -1)
echo "Stage 5 best: $STAGE5"

echo ""
echo "=== V7 pipeline complete ==="
echo "Final model: $STAGE5"
