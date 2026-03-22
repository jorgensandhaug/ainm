#!/usr/bin/env python3
"""Validate ONNX pipeline matches ultralytics predictions on full val set."""
import json
import numpy as np
from pathlib import Path
from PIL import Image
import onnxruntime as ort
import torch
from torchvision.ops import batched_nms


def letterbox_pil(src: Image.Image, target: int = 960):
    """Letterbox resize matching ultralytics behavior."""
    src_w, src_h = src.size
    scale = min(target / src_w, target / src_h)
    new_w, new_h = int(src_w * scale), int(src_h * scale)
    pad_w = (target - new_w) // 2
    pad_h = (target - new_h) // 2
    resized = src.resize((new_w, new_h), Image.BILINEAR)
    canvas = Image.new("RGB", (target, target), (114, 114, 114))
    canvas.paste(resized, (pad_w, pad_h))
    arr = np.array(canvas).astype(np.float32) / 255.0
    arr = np.transpose(arr, (2, 0, 1))[np.newaxis, ...]
    return arr, scale, pad_w, pad_h


def decode_raw_logits(output, conf_thres=0.0001, iou_thres=0.55, max_det=600):
    """Decode raw logit output [1, 4+nc, num_anchors] into detections."""
    pred = output[0]  # [4+nc, num_anchors]
    if pred.shape[0] < pred.shape[1]:
        pred = pred.T  # -> [num_anchors, 4+nc]

    boxes_xywh = pred[:, :4].astype(np.float32)
    class_scores = pred[:, 4:].astype(np.float32)

    # Confidence = max class score (no explicit objectness in YOLO26)
    conf = np.max(class_scores, axis=1)
    class_ids = np.argmax(class_scores, axis=1)

    # Filter by confidence
    mask = conf >= conf_thres
    boxes_xywh = boxes_xywh[mask]
    conf = conf[mask]
    class_ids = class_ids[mask]

    if len(conf) == 0:
        return np.empty((0, 4)), np.empty(0), np.empty(0, dtype=int)

    # xywh -> xyxy
    boxes_xyxy = np.empty_like(boxes_xywh)
    boxes_xyxy[:, 0] = boxes_xywh[:, 0] - boxes_xywh[:, 2] / 2
    boxes_xyxy[:, 1] = boxes_xywh[:, 1] - boxes_xywh[:, 3] / 2
    boxes_xyxy[:, 2] = boxes_xywh[:, 0] + boxes_xywh[:, 2] / 2
    boxes_xyxy[:, 3] = boxes_xywh[:, 1] + boxes_xywh[:, 3] / 2

    # Per-class NMS
    keep = batched_nms(
        torch.from_numpy(boxes_xyxy).float(),
        torch.from_numpy(conf).float(),
        torch.from_numpy(class_ids).long(),
        iou_threshold=iou_thres,
    )
    if len(keep) > max_det:
        keep = keep[:max_det]
    keep = keep.numpy()

    return boxes_xyxy[keep], conf[keep], class_ids[keep]


def unletterbox(boxes_xyxy, scale, pad_w, pad_h, src_w, src_h):
    """Convert boxes from letterbox space to original image coords."""
    boxes = boxes_xyxy.copy()
    boxes[:, 0] = (boxes[:, 0] - pad_w) / scale
    boxes[:, 1] = (boxes[:, 1] - pad_h) / scale
    boxes[:, 2] = (boxes[:, 2] - pad_w) / scale
    boxes[:, 3] = (boxes[:, 3] - pad_h) / scale
    boxes[:, 0] = np.clip(boxes[:, 0], 0, src_w)
    boxes[:, 1] = np.clip(boxes[:, 1], 0, src_h)
    boxes[:, 2] = np.clip(boxes[:, 2], 0, src_w)
    boxes[:, 3] = np.clip(boxes[:, 3], 0, src_h)
    return boxes


def main():
    import sys
    root = Path(__file__).resolve().parent
    sys.path.insert(0, str(root))
    from compare_predictions import load_ground_truth, evaluate_hybrid

    onnx_path = root / "runs/960_confcurr_s2_final_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.onnx"
    val_dir = root / "data/yolo/val"
    gt_by_image = load_ground_truth(val_dir)

    print(f"Loading ONNX: {onnx_path}")
    session = ort.InferenceSession(
        str(onnx_path),
        providers=["CUDAExecutionProvider", "CPUExecutionProvider"],
    )
    print(f"Providers: {session.get_providers()}")

    image_paths = sorted(
        list((val_dir / "images").glob("*.jpg"))
        + list((val_dir / "images").glob("*.jpeg"))
        + list((val_dir / "images").glob("*.png"))
    )
    print(f"Val images: {len(image_paths)}")

    predictions = []
    for img_path in image_paths:
        image_id = int(img_path.stem.split("_")[-1])
        src = Image.open(img_path).convert("RGB")
        src_w, src_h = src.size

        arr, scale, pad_w, pad_h = letterbox_pil(src, target=960)
        output = session.run(None, {"images": arr})[0]
        boxes, scores, class_ids = decode_raw_logits(output, conf_thres=0.0001, iou_thres=0.55, max_det=600)
        boxes = unletterbox(boxes, scale, pad_w, pad_h, src_w, src_h)

        for i in range(len(boxes)):
            x1, y1, x2, y2 = boxes[i]
            if x2 <= x1 or y2 <= y1:
                continue
            predictions.append({
                "image_id": image_id,
                "category_id": int(class_ids[i]),
                "bbox": [float(x1), float(y1), float(x2 - x1), float(y2 - y1)],
                "score": float(scores[i]),
            })

    print(f"\nTotal predictions: {len(predictions)}")

    # Evaluate
    pred_by_image = {}
    for p in predictions:
        pred_by_image.setdefault(p["image_id"], []).append({
            "category_id": p["category_id"],
            "score": p["score"],
            "bbox_xyxy": (p["bbox"][0], p["bbox"][1],
                          p["bbox"][0] + p["bbox"][2], p["bbox"][1] + p["bbox"][3]),
        })
    for img_id in pred_by_image:
        pred_by_image[img_id].sort(key=lambda x: x["score"], reverse=True)

    metrics = evaluate_hybrid(gt_by_image, pred_by_image, iou_threshold=0.5, num_classes=356)

    print(f"\n=== ONNX + Letterbox + Per-class NMS ===")
    print(f"det_AP50:      {metrics['detection_ap50']:.4f}")
    print(f"cls_present:   {metrics['classification_map50_present_classes']:.4f}")
    print(f"cls_all:       {metrics['classification_map50_all_classes']:.4f}")
    print(f"hybrid_present: {metrics['hybrid_score_present_classes']:.4f}")
    print(f"hybrid_all:    {metrics['hybrid_score_all_classes']:.4f}")
    print(f"\nExpected (ultralytics): det=0.9328 cls_all=0.6259 hybrid_all=0.8407")


if __name__ == "__main__":
    main()
