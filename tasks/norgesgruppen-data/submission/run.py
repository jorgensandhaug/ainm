"""Submission: ONNX YOLO26x with letterbox + per-class NMS + flip TTA."""
from __future__ import annotations

import argparse
import json
import time
from pathlib import Path

import numpy as np
from PIL import Image

import onnxruntime as ort
import torch
from torchvision.ops import batched_nms


def decode_raw(output: np.ndarray, conf_thres: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Decode raw-logits ONNX output (1, C+4, N) -> filtered (xyxy_boxes, scores, class_ids)."""
    pred = output[0]
    if pred.shape[0] < pred.shape[1]:
        pred = pred.T  # (N, C+4)
    boxes_xywh = pred[:, :4].astype(np.float32)
    class_scores = pred[:, 4:].astype(np.float32)
    class_ids = np.argmax(class_scores, axis=1).astype(np.int64)
    scores = class_scores[np.arange(class_scores.shape[0]), class_ids]
    keep = scores >= conf_thres
    boxes_xywh = boxes_xywh[keep]
    scores = scores[keep]
    class_ids = class_ids[keep]
    # xywh -> xyxy
    boxes = np.empty_like(boxes_xywh)
    boxes[:, 0] = boxes_xywh[:, 0] - boxes_xywh[:, 2] / 2.0
    boxes[:, 1] = boxes_xywh[:, 1] - boxes_xywh[:, 3] / 2.0
    boxes[:, 2] = boxes_xywh[:, 0] + boxes_xywh[:, 2] / 2.0
    boxes[:, 3] = boxes_xywh[:, 1] + boxes_xywh[:, 3] / 2.0
    return boxes, scores, class_ids


def letterbox(img: Image.Image, target_h: int, target_w: int) -> tuple[np.ndarray, float, tuple[int, int]]:
    """Resize preserving aspect ratio + gray padding. Returns (CHW tensor, scale, (pad_w, pad_h))."""
    src_w, src_h = img.size
    scale = min(target_w / src_w, target_h / src_h)
    new_w = int(round(src_w * scale))
    new_h = int(round(src_h * scale))
    resized = img.resize((new_w, new_h))
    canvas = np.full((target_h, target_w, 3), 114, dtype=np.uint8)
    pad_w = (target_w - new_w) // 2
    pad_h = (target_h - new_h) // 2
    canvas[pad_h:pad_h + new_h, pad_w:pad_w + new_w] = np.array(resized)
    arr = canvas.astype(np.float32) / 255.0
    return np.transpose(arr, (2, 0, 1))[np.newaxis, ...], scale, (pad_w, pad_h)


def per_class_nms(boxes: np.ndarray, scores: np.ndarray, class_ids: np.ndarray,
                  iou_thres: float) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Per-class NMS using torchvision.ops.batched_nms."""
    if len(boxes) == 0:
        return boxes, scores, class_ids
    t_boxes = torch.from_numpy(boxes).float()
    t_scores = torch.from_numpy(scores).float()
    t_ids = torch.from_numpy(class_ids).long()
    keep = batched_nms(t_boxes, t_scores, t_ids, iou_thres)
    keep = keep.numpy()
    return boxes[keep], scores[keep], class_ids[keep]


def unletterbox(boxes: np.ndarray, scale: float, pad_w: int, pad_h: int,
                src_w: int, src_h: int) -> np.ndarray:
    """Convert boxes from letterbox space to original image coordinates."""
    out = np.empty_like(boxes)
    out[:, 0] = np.clip((boxes[:, 0] - pad_w) / scale, 0, src_w)
    out[:, 1] = np.clip((boxes[:, 1] - pad_h) / scale, 0, src_h)
    out[:, 2] = np.clip((boxes[:, 2] - pad_w) / scale, 0, src_w)
    out[:, 3] = np.clip((boxes[:, 3] - pad_h) / scale, 0, src_h)
    return out


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--onnx", default=None)
    parser.add_argument("--conf-thres", type=float, default=0.0003)
    parser.add_argument("--nms-iou", type=float, default=0.55)
    parser.add_argument("--flip-tta", action="store_true", default=True)
    parser.add_argument("--no-flip-tta", dest="flip_tta", action="store_false")
    args = parser.parse_args()

    t0 = time.time()
    script_dir = Path(__file__).resolve().parent
    onnx_path = Path(args.onnx) if args.onnx else script_dir / "model.onnx"
    if not onnx_path.is_absolute():
        onnx_path = script_dir / onnx_path

    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    session = ort.InferenceSession(str(onnx_path), providers=providers)
    input_name = session.get_inputs()[0].name
    shape = session.get_inputs()[0].shape
    input_h = int(shape[2]) if isinstance(shape[2], int) else 960
    input_w = int(shape[3]) if isinstance(shape[3], int) else 960

    predictions = []
    input_dir = Path(args.input)
    image_paths = sorted(
        p for p in input_dir.iterdir()
        if p.suffix.lower() in (".jpg", ".jpeg", ".png")
    )

    for img_path in image_paths:
        image_id = int(img_path.stem.split("_")[-1])
        src = Image.open(img_path).convert("RGB")
        src_w, src_h = src.size

        # Letterbox + inference
        tensor, scale, (pad_w, pad_h) = letterbox(src, input_h, input_w)
        output = np.asarray(session.run(None, {input_name: tensor})[0], dtype=np.float32)
        boxes, scores, class_ids = decode_raw(output, args.conf_thres)

        if args.flip_tta:
            flipped = src.transpose(Image.FLIP_LEFT_RIGHT)
            tensor_f, _, _ = letterbox(flipped, input_h, input_w)
            output_f = np.asarray(session.run(None, {input_name: tensor_f})[0], dtype=np.float32)
            boxes_f, scores_f, cls_f = decode_raw(output_f, args.conf_thres)

            # Flip boxes back in letterbox space
            if len(boxes_f) > 0:
                new_x1 = input_w - boxes_f[:, 2]
                new_x2 = input_w - boxes_f[:, 0]
                boxes_f[:, 0] = new_x1
                boxes_f[:, 2] = new_x2

            # Merge
            parts_b = [b for b in [boxes, boxes_f] if len(b) > 0]
            parts_s = [s for s in [scores, scores_f] if len(s) > 0]
            parts_c = [c for c in [class_ids, cls_f] if len(c) > 0]
            if parts_b:
                boxes = np.concatenate(parts_b)
                scores = np.concatenate(parts_s)
                class_ids = np.concatenate(parts_c)

        # Per-class NMS
        boxes, scores, class_ids = per_class_nms(boxes, scores, class_ids, args.nms_iou)

        # Unletterbox to original image coordinates
        if len(boxes) > 0:
            boxes = unletterbox(boxes, scale, pad_w, pad_h, src_w, src_h)

        for i in range(len(boxes)):
            x1, y1, x2, y2 = boxes[i]
            if x2 <= x1 or y2 <= y1:
                continue
            predictions.append({
                "image_id": image_id,
                "category_id": int(class_ids[i]),
                "bbox": [round(float(x1), 1), round(float(y1), 1),
                         round(float(x2 - x1), 1), round(float(y2 - y1), 1)],
                "score": round(float(scores[i]), 6),
            })

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with open(str(out_path), "w") as f:
        json.dump(predictions, f)

    elapsed = time.time() - t0
    print(f"Predictions: {len(predictions)}, Time: {elapsed:.1f}s")


if __name__ == "__main__":
    main()
