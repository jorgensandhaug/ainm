#!/usr/bin/env bash
# Resume V2 pipeline from stage 2 (stage 1 already done)
set -euo pipefail
cd "$(dirname "$0")/.."

IMGSZ=960
BATCH=4
DEVICE="2"
export PATH="$HOME/.local/bin:$PATH"
export LD_LIBRARY_PATH=/nix/store/hh698a2nnpqr47lh52n26wi8fiah3hid-gcc-13.3.0-lib/lib:${LD_LIBRARY_PATH:-}

STAGE1="runs/v2_sweep_e35_img960_b4_lr0.004_mix0.05_cp0.05_seed137/weights/best.pt"
echo "Stage 1 best: $STAGE1"

echo "=== Stage 2/6: hardopt_v2 (80 epochs) ==="
uv run python yolo/train.py \
  --weights "$STAGE1" \
  --data data/yolo/data.yaml \
  --imgsz $IMGSZ --epochs 80 --batch $BATCH \
  --lr0 0.0025 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 35 --close-mosaic 20 \
  --mixup 0.12 --copy-paste 0.12 --scale 0.45 --translate 0.1 --fliplr 0.5 \
  --seed 223 --run-tag v2_hardopt --device $DEVICE

STAGE2=$(find runs -maxdepth 3 -path "*/v2_hardopt_*/weights/best.pt" | sort | tail -1)
echo "Stage 2 best: $STAGE2"

echo "=== Stage 3/6: rebalanceft_v2 (30 epochs, balanced data) ==="
uv run python yolo/train.py \
  --weights "$STAGE2" \
  --data data/yolo_balanced/data.yaml \
  --imgsz $IMGSZ --epochs 30 --batch $BATCH \
  --lr0 0.001 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 15 --close-mosaic 10 \
  --mixup 0.08 --copy-paste 0.08 --scale 0.45 --translate 0.1 --fliplr 0.5 \
  --seed 307 --run-tag v2_rebalanceft --device $DEVICE

STAGE3=$(find runs -maxdepth 3 -path "*/v2_rebalanceft_*/weights/best.pt" | sort | tail -1)
echo "Stage 3 best: $STAGE3"

echo "=== Stage 4/6: finalfull_v2 (25 epochs, full train data) ==="
uv run python yolo/train.py \
  --weights "$STAGE3" \
  --data data/yolo_fulltrain/data.yaml \
  --imgsz $IMGSZ --epochs 25 --batch $BATCH \
  --lr0 0.0008 --lrf 0.008 --weight-decay 0.0005 --warmup-epochs 3.0 \
  --optimizer AdamW --patience 10 --close-mosaic 8 \
  --mixup 0.05 --copy-paste 0.08 --scale 0.45 --translate 0.1 --fliplr 0.5 \
  --seed 401 --run-tag v2_finalfull --device $DEVICE

STAGE4=$(find runs -maxdepth 3 -path "*/v2_finalfull_*/weights/best.pt" | sort | tail -1)
echo "Stage 4 best: $STAGE4"

echo "=== Stage 5/6: confcurr_s1_v2 (15 epochs, confusion curriculum) ==="
uv run python yolo/train.py \
  --weights "$STAGE4" \
  --data data/yolo_confusion_curriculum/data.yaml \
  --imgsz $IMGSZ --epochs 15 --batch $BATCH \
  --lr0 0.0003 --lrf 0.05 --weight-decay 0.0004 --warmup-epochs 1.0 \
  --optimizer AdamW --patience 20 --close-mosaic 10 \
  --mixup 0.03 --copy-paste 0.05 --scale 0.3 --translate 0.06 --fliplr 0.5 \
  --seed 503 --run-tag v2_confcurr1 --device $DEVICE

STAGE5=$(find runs -maxdepth 3 -path "*/v2_confcurr1_*/weights/best.pt" | sort | tail -1)
echo "Stage 5 best: $STAGE5"

echo "=== Stage 6/6: confcurr_s2_v2 (20 epochs, original data) ==="
uv run python yolo/train.py \
  --weights "$STAGE5" \
  --data data/yolo/data.yaml \
  --imgsz $IMGSZ --epochs 20 --batch $BATCH \
  --lr0 0.0001 --lrf 0.03 --weight-decay 0.00035 --warmup-epochs 1.0 \
  --optimizer AdamW --patience 25 --close-mosaic 15 \
  --mixup 0.0 --copy-paste 0.0 --scale 0.2 --translate 0.05 --fliplr 0.5 \
  --seed 601 --run-tag v2_confcurr2 --device $DEVICE

STAGE6=$(find runs -maxdepth 3 -path "*/v2_confcurr2_*/weights/best.pt" | sort | tail -1)
echo "Stage 6 best: $STAGE6"

echo ""
echo "=== V2 pipeline complete ==="
echo "Final model: $STAGE6"
