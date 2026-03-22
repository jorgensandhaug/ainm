#!/usr/bin/env python3
"""Validate full ensemble + TTA ONNX pipeline against ultralytics results."""
import json
import numpy as np
from pathlib import Path
from PIL import Image
import onnxruntime as ort
import torch
from torchvision.ops import batched_nms
from ensemble_boxes import weighted_boxes_fusion


def letterbox_pil(src, target=960):
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
    pred = output[0]
    if pred.shape[0] < pred.shape[1]:
        pred = pred.T
    boxes_xywh = pred[:, :4].astype(np.float32)
    class_scores = pred[:, 4:].astype(np.float32)
    conf = np.max(class_scores, axis=1)
    class_ids = np.argmax(class_scores, axis=1)
    mask = conf >= conf_thres
    boxes_xywh = boxes_xywh[mask]
    conf = conf[mask]
    class_ids = class_ids[mask]
    if len(conf) == 0:
        return np.empty((0, 4)), np.empty(0), np.empty(0, dtype=int)
    boxes_xyxy = np.empty_like(boxes_xywh)
    boxes_xyxy[:, 0] = boxes_xywh[:, 0] - boxes_xywh[:, 2] / 2
    boxes_xyxy[:, 1] = boxes_xywh[:, 1] - boxes_xywh[:, 3] / 2
    boxes_xyxy[:, 2] = boxes_xywh[:, 0] + boxes_xywh[:, 2] / 2
    boxes_xyxy[:, 3] = boxes_xywh[:, 1] + boxes_xywh[:, 3] / 2
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


def flip_boxes_h(boxes_xyxy, img_w):
    flipped = boxes_xyxy.copy()
    flipped[:, 0] = img_w - boxes_xyxy[:, 2]
    flipped[:, 2] = img_w - boxes_xyxy[:, 0]
    return flipped


def main():
    import sys
    root = Path(__file__).resolve().parent
    sys.path.insert(0, str(root))
    from compare_predictions import load_ground_truth, evaluate_hybrid

    val_dir = root / "data/yolo/val"
    gt_by_image = load_ground_truth(val_dir)

    # Load 3 ONNX models
    model_paths = [
        root / "submission/model_b8.onnx",
        root / "submission/model_1280.onnx",
        root / "submission/model_long.onnx",
    ]
    sessions = []
    for p in model_paths:
        s = ort.InferenceSession(str(p), providers=["CUDAExecutionProvider", "CPUExecutionProvider"])
        sessions.append(s)
        print(f"Loaded {p.name} on {s.get_providers()}")

    image_paths = sorted(
        list((val_dir / "images").glob("*.jpg"))
        + list((val_dir / "images").glob("*.jpeg"))
        + list((val_dir / "images").glob("*.png"))
    )
    print(f"Val images: {len(image_paths)}")

    all_predictions = []
    for img_path in image_paths:
        image_id = int(img_path.stem.split("_")[-1])
        src = Image.open(img_path).convert("RGB")
        src_w, src_h = src.size

        # Letterbox original
        arr, scale, pad_w, pad_h = letterbox_pil(src, target=960)

        # Flip image
        src_flip = src.transpose(Image.FLIP_LEFT_RIGHT)
        arr_flip, _, _, _ = letterbox_pil(src_flip, target=960)

        # Collect all detection sets for WBF
        wbf_boxes_list = []
        wbf_scores_list = []
        wbf_labels_list = []

        for session in sessions:
            for input_arr, is_flip in [(arr, False), (arr_flip, True)]:
                output = session.run(None, {"images": input_arr})[0]
                boxes, scores, class_ids = decode_raw_logits(output)
                boxes = unletterbox(boxes, scale, pad_w, pad_h, src_w, src_h)

                if is_flip:
                    boxes = flip_boxes_h(boxes, src_w)

                if len(boxes) == 0:
                    wbf_boxes_list.append(np.empty((0, 4)))
                    wbf_scores_list.append(np.empty(0))
                    wbf_labels_list.append(np.empty(0))
                    continue

                # Normalize to [0,1] for WBF
                norm_boxes = boxes.copy()
                norm_boxes[:, 0] /= src_w
                norm_boxes[:, 1] /= src_h
                norm_boxes[:, 2] /= src_w
                norm_boxes[:, 3] /= src_h
                norm_boxes = np.clip(norm_boxes, 0, 1)

                wbf_boxes_list.append(norm_boxes)
                wbf_scores_list.append(scores)
                wbf_labels_list.append(class_ids.astype(float))

        # WBF merge
        if any(len(b) > 0 for b in wbf_boxes_list):
            merged_boxes, merged_scores, merged_labels = weighted_boxes_fusion(
                wbf_boxes_list,
                wbf_scores_list,
                wbf_labels_list,
                weights=[1] * len(sessions) * 2,
                iou_thr=0.60,
                skip_box_thr=0.0001,
            )
            # Denormalize
            merged_boxes[:, 0] *= src_w
            merged_boxes[:, 1] *= src_h
            merged_boxes[:, 2] *= src_w
            merged_boxes[:, 3] *= src_h
        else:
            merged_boxes = np.empty((0, 4))
            merged_scores = np.empty(0)
            merged_labels = np.empty(0)

        for i in range(len(merged_boxes)):
            x1, y1, x2, y2 = merged_boxes[i]
            if x2 <= x1 or y2 <= y1:
                continue
            all_predictions.append({
                "image_id": image_id,
                "category_id": int(merged_labels[i]),
                "bbox": [float(x1), float(y1), float(x2 - x1), float(y2 - y1)],
                "score": float(merged_scores[i]),
            })

    print(f"\nTotal predictions: {len(all_predictions)}")

    # Evaluate
    pred_by_image = {}
    for p in all_predictions:
        pred_by_image.setdefault(p["image_id"], []).append({
            "category_id": p["category_id"],
            "score": p["score"],
            "bbox_xyxy": (p["bbox"][0], p["bbox"][1],
                          p["bbox"][0] + p["bbox"][2], p["bbox"][1] + p["bbox"][3]),
        })
    for img_id in pred_by_image:
        pred_by_image[img_id].sort(key=lambda x: x["score"], reverse=True)

    metrics = evaluate_hybrid(gt_by_image, pred_by_image, iou_threshold=0.5, num_classes=356)

    print(f"\n=== ONNX 3-Model Ensemble + Flip TTA + WBF ===")
    print(f"det_AP50:       {metrics['detection_ap50']:.4f}")
    print(f"cls_present:    {metrics['classification_map50_present_classes']:.4f}")
    print(f"cls_all:        {metrics['classification_map50_all_classes']:.4f}")
    print(f"hybrid_present: {metrics['hybrid_score_present_classes']:.4f}")
    print(f"hybrid_all:     {metrics['hybrid_score_all_classes']:.4f}")
    print(f"\nExpected (ultralytics ensemble): hybrid_all=0.8584 hybrid_present=0.9129")


if __name__ == "__main__":
    main()
