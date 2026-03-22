"""3-model YOLO26x ensemble with horizontal flip TTA and WBF merge."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
import torch
from torchvision.ops import batched_nms
import onnxruntime as ort
from ensemble_boxes import weighted_boxes_fusion

# --- Configuration ---
CONF_THRES = 0.001
NMS_IOU = 0.55
WBF_IOU = 0.60
WBF_SKIP_THR = 0.0001
MAX_DET = 600
MAX_PREDICTIONS = 50000
PAD_COLOR = (114, 114, 114)
MODEL_NAMES = ["model_b8.onnx", "model_1280.onnx", "model_long.onnx"]


def get_model_imgsz(session):
    """Read input image size from ONNX model graph."""
    shape = session.get_inputs()[0].shape
    return int(shape[2])


def letterbox(src, target):
    """Resize image preserving aspect ratio, pad to square with gray."""
    src_w, src_h = src.size
    scale = min(target / src_w, target / src_h)
    new_w = int(src_w * scale)
    new_h = int(src_h * scale)
    pad_w = (target - new_w) // 2
    pad_h = (target - new_h) // 2
    resized = src.resize((new_w, new_h), Image.BILINEAR)
    canvas = Image.new("RGB", (target, target), PAD_COLOR)
    canvas.paste(resized, (pad_w, pad_h))
    arr = np.array(canvas, dtype=np.float32)
    arr /= 255.0
    arr = arr.transpose(2, 0, 1)[np.newaxis, ...]
    return arr, scale, pad_w, pad_h


def decode_raw(output, conf_thres=CONF_THRES, nms_iou=NMS_IOU, max_det=MAX_DET):
    """Decode raw YOLO logits [1, 4+nc, anchors] into (boxes_xyxy, scores, class_ids)."""
    pred = output[0]
    if pred.shape[0] < pred.shape[1]:
        pred = pred.T

    boxes_xywh = pred[:, :4]
    cls_scores = pred[:, 4:]

    conf = cls_scores.max(axis=1)
    mask = conf >= conf_thres
    boxes_xywh = boxes_xywh[mask]
    cls_scores = cls_scores[mask]
    conf = conf[mask]
    cls_ids = cls_scores.argmax(axis=1)

    if len(conf) == 0:
        return np.empty((0, 4), dtype=np.float32), np.empty(0, dtype=np.float32), np.empty(0, dtype=np.int64)

    # xywh -> xyxy
    half_w = boxes_xywh[:, 2] / 2
    half_h = boxes_xywh[:, 3] / 2
    boxes = np.column_stack([
        boxes_xywh[:, 0] - half_w,
        boxes_xywh[:, 1] - half_h,
        boxes_xywh[:, 0] + half_w,
        boxes_xywh[:, 1] + half_h,
    ])

    # Per-class NMS via torchvision
    keep = batched_nms(
        torch.from_numpy(boxes).float(),
        torch.from_numpy(conf).float(),
        torch.from_numpy(cls_ids).long(),
        iou_threshold=nms_iou,
    )
    if len(keep) > max_det:
        keep = keep[:max_det]
    keep = keep.numpy()

    return boxes[keep].astype(np.float32), conf[keep].astype(np.float32), cls_ids[keep].astype(np.int64)


def unletterbox(boxes, scale, pad_w, pad_h, src_w, src_h):
    """Convert boxes from letterbox coords to original image coords."""
    out = boxes.copy()
    out[:, 0] = (out[:, 0] - pad_w) / scale
    out[:, 1] = (out[:, 1] - pad_h) / scale
    out[:, 2] = (out[:, 2] - pad_w) / scale
    out[:, 3] = (out[:, 3] - pad_h) / scale
    out[:, 0] = np.clip(out[:, 0], 0, src_w)
    out[:, 1] = np.clip(out[:, 1], 0, src_h)
    out[:, 2] = np.clip(out[:, 2], 0, src_w)
    out[:, 3] = np.clip(out[:, 3], 0, src_h)
    return out


def flip_boxes_h(boxes, img_w):
    """Horizontally flip xyxy boxes."""
    flipped = boxes.copy()
    flipped[:, 0] = img_w - boxes[:, 2]
    flipped[:, 2] = img_w - boxes[:, 0]
    return flipped


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", required=True, help="Directory with input images")
    parser.add_argument("--output", required=True, help="Path for output predictions JSON")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    input_dir = Path(args.input)
    output_path = Path(args.output)

    # Load ONNX models and detect their input sizes
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    models = []
    for name in MODEL_NAMES:
        model_path = root / name
        session = ort.InferenceSession(str(model_path), providers=providers)
        imgsz = get_model_imgsz(session)
        models.append((session, imgsz))

    # Discover images
    image_paths = sorted([
        p for p in input_dir.iterdir()
        if p.suffix.lower() in (".jpg", ".jpeg", ".png")
    ])

    predictions = []

    for img_path in image_paths:
        image_id = int(img_path.stem.split("_")[-1])

        src = Image.open(img_path).convert("RGB")
        src_w, src_h = src.size

        # Cache letterboxed arrays per resolution
        lb_cache = {}

        # Collect detections from all models + TTA
        wbf_boxes = []
        wbf_scores = []
        wbf_labels = []

        for session, imgsz in models:
            input_name = session.get_inputs()[0].name

            # Get or compute letterboxed input for this resolution
            if imgsz not in lb_cache:
                arr, scale, pad_w, pad_h = letterbox(src, imgsz)
                arr_flip = arr[:, :, :, ::-1].copy()
                lb_cache[imgsz] = (arr, arr_flip, scale, pad_w, pad_h)
            arr_orig, arr_flip, scale, pad_w, pad_h = lb_cache[imgsz]

            for arr, is_flip in [(arr_orig, False), (arr_flip, True)]:
                output = session.run(None, {input_name: arr})[0].astype(np.float32)
                boxes, scores, cls_ids = decode_raw(output)

                if len(boxes) == 0:
                    wbf_boxes.append(np.empty((0, 4), dtype=np.float32))
                    wbf_scores.append(np.empty(0, dtype=np.float32))
                    wbf_labels.append(np.empty(0, dtype=np.float32))
                    continue

                # Unletterbox to original image coords
                boxes = unletterbox(boxes, scale, pad_w, pad_h, src_w, src_h)

                # Undo flip
                if is_flip:
                    boxes = flip_boxes_h(boxes, src_w)

                # Filter degenerate boxes
                valid = (boxes[:, 2] > boxes[:, 0]) & (boxes[:, 3] > boxes[:, 1])
                boxes = boxes[valid]
                scores = scores[valid]
                cls_ids = cls_ids[valid]

                # Normalize to [0, 1] for WBF
                norm = boxes.copy()
                norm[:, 0] /= src_w
                norm[:, 1] /= src_h
                norm[:, 2] /= src_w
                norm[:, 3] /= src_h
                norm = np.clip(norm, 0.0, 1.0)

                wbf_boxes.append(norm)
                wbf_scores.append(scores)
                wbf_labels.append(cls_ids.astype(np.float64))

        # WBF merge across all detection sets
        if any(len(b) > 0 for b in wbf_boxes):
            merged_boxes, merged_scores, merged_labels = weighted_boxes_fusion(
                wbf_boxes,
                wbf_scores,
                wbf_labels,
                weights=[1] * len(wbf_boxes),
                iou_thr=WBF_IOU,
                skip_box_thr=WBF_SKIP_THR,
            )

            # Denormalize to pixel coords
            merged_boxes[:, 0] *= src_w
            merged_boxes[:, 1] *= src_h
            merged_boxes[:, 2] *= src_w
            merged_boxes[:, 3] *= src_h

            for i in range(len(merged_boxes)):
                x1, y1, x2, y2 = merged_boxes[i]
                w = x2 - x1
                h = y2 - y1
                if w <= 0 or h <= 0:
                    continue
                predictions.append({
                    "image_id": image_id,
                    "category_id": int(merged_labels[i]),
                    "bbox": [round(float(x1), 1), round(float(y1), 1), round(float(w), 1), round(float(h), 1)],
                    "score": round(float(merged_scores[i]), 6),
                })

    # Cap to max predictions (keep highest scoring)
    if len(predictions) > MAX_PREDICTIONS:
        predictions.sort(key=lambda p: p["score"], reverse=True)
        predictions = predictions[:MAX_PREDICTIONS]

    # Write output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(str(output_path), "w") as f:
        json.dump(predictions, f)


if __name__ == "__main__":
    main()
