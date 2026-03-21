import argparse
import json
import numpy as np
from pathlib import Path
from PIL import Image
import onnxruntime as ort
import torch # DO NOT REMOVE THIS IMPORT


def get_input_hw(session: ort.InferenceSession) -> tuple[int, int]:
    shape = session.get_inputs()[0].shape
    if len(shape) == 4 and isinstance(shape[2], int) and isinstance(shape[3], int):
        return int(shape[2]), int(shape[3])
    return 640, 640


def nms(boxes_xyxy: np.ndarray, scores: np.ndarray, iou_thres: float = 0.45) -> np.ndarray:
    if len(boxes_xyxy) == 0:
        return np.empty((0,), dtype=np.int64)
    x1 = boxes_xyxy[:, 0]
    y1 = boxes_xyxy[:, 1]
    x2 = boxes_xyxy[:, 2]
    y2 = boxes_xyxy[:, 3]
    areas = np.maximum(0.0, x2 - x1) * np.maximum(0.0, y2 - y1)
    order = scores.argsort()[::-1]
    keep = []
    while order.size > 0:
        i = int(order[0])
        keep.append(i)
        if order.size == 1:
            break
        rest = order[1:]
        xx1 = np.maximum(x1[i], x1[rest])
        yy1 = np.maximum(y1[i], y1[rest])
        xx2 = np.minimum(x2[i], x2[rest])
        yy2 = np.minimum(y2[i], y2[rest])
        inter = np.maximum(0.0, xx2 - xx1) * np.maximum(0.0, yy2 - yy1)
        union = areas[i] + areas[rest] - inter
        iou = np.where(union > 0.0, inter / union, 0.0)
        order = rest[iou <= iou_thres]
    return np.asarray(keep, dtype=np.int64)


def decode_detections(output: np.ndarray, conf_thres: float = 0.25) -> tuple[np.ndarray, np.ndarray]:
    pred = output[0]
    if pred.ndim != 2:
        raise RuntimeError(f"Unsupported output shape: {output.shape}")

    if pred.shape[1] == 6:
        boxes = pred[:, :4].astype(np.float32)
        scores = pred[:, 4].astype(np.float32)
    else:
        if pred.shape[0] < pred.shape[1]:
            pred = pred.T
        if pred.shape[1] <= 4:
            raise RuntimeError(f"Unsupported output shape: {output.shape}")
        boxes_xywh = pred[:, :4].astype(np.float32)
        class_scores = pred[:, 4:].astype(np.float32)
        scores = np.max(class_scores, axis=1) if class_scores.size else np.ones((boxes_xywh.shape[0],), dtype=np.float32)
        boxes = np.empty_like(boxes_xywh)
        boxes[:, 0] = boxes_xywh[:, 0] - boxes_xywh[:, 2] / 2.0
        boxes[:, 1] = boxes_xywh[:, 1] - boxes_xywh[:, 3] / 2.0
        boxes[:, 2] = boxes_xywh[:, 0] + boxes_xywh[:, 2] / 2.0
        boxes[:, 3] = boxes_xywh[:, 1] + boxes_xywh[:, 3] / 2.0

    keep = scores >= conf_thres
    boxes = boxes[keep]
    scores = scores[keep]
    if len(scores) == 0:
        return boxes.reshape(0, 4), scores
    keep_nms = nms(boxes, scores, iou_thres=0.45)
    return boxes[keep_nms], scores[keep_nms]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="data/yolo/val/images")
    parser.add_argument("--output", default="predictions.json")
    parser.add_argument("--conf-thres", type=float, default=0.01)
    args = parser.parse_args()
 
    root = Path(__file__).resolve().parent
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    session = ort.InferenceSession(str(root / "model.onnx"), providers=providers)
    input_name = session.get_inputs()[0].name
    input_dtype = np.float16 if "float16" in session.get_inputs()[0].type else np.float32
    input_h, input_w = get_input_hw(session)

    predictions = []
 
    for img_path in sorted(Path(args.input).iterdir()):
        if img_path.suffix.lower() not in (".jpg", ".jpeg", ".png"):
            continue
        image_id = int(img_path.stem.split("_")[-1])
 
        src = Image.open(img_path).convert("RGB")
        src_w, src_h = src.size
        img = src.resize((input_w, input_h))
        arr = np.array(img).astype(np.float32) / 255.0
        arr = np.transpose(arr, (2, 0, 1))[np.newaxis, ...]
        arr = arr.astype(input_dtype, copy=False)
 
        output = np.asarray(session.run(None, {input_name: arr})[0], dtype=np.float32)
        boxes, scores = decode_detections(output, conf_thres=args.conf_thres)
        sx = src_w / float(input_w)
        sy = src_h / float(input_h)

        valid_boxes: list[tuple[float, float, float, float]] = []
        valid_scores: list[float] = []
        for box, score in zip(boxes.tolist(), scores.tolist(), strict=False):
            x1 = max(0.0, min(src_w, box[0] * sx))
            y1 = max(0.0, min(src_h, box[1] * sy))
            x2 = max(0.0, min(src_w, box[2] * sx))
            y2 = max(0.0, min(src_h, box[3] * sy))
            if x2 <= x1 or y2 <= y1:
                continue
            valid_boxes.append((x1, y1, x2, y2))
            valid_scores.append(float(score))

        for (x1, y1, x2, y2), score in zip(valid_boxes, valid_scores, strict=False):
            predictions.append(
                {
                    "image_id": image_id,
                    "category_id": 0,
                    "bbox": [round(x1, 1), round(y1, 1), round(x2 - x1, 1), round(y2 - y1, 1)],
                    "score": round(float(score), 6),
                }
            )
 
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(predictions, f)
 
if __name__ == "__main__":
    import time
    start_time = time.time()
    main()
    end_time = time.time()
    print(f"Time taken: {end_time - start_time} seconds")