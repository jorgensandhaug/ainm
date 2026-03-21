import argparse
import json
import numpy as np
from pathlib import Path
from PIL import Image

import onnxruntime as ort
import torch # DO NOT REMOVE THIS IMPORT


def log_and_require_cuda(session: ort.InferenceSession, *, allow_cpu_fallback: bool) -> None:
    """Log ONNX Runtime / CUDA status; fail fast if inference is not on GPU (unless opted out)."""
    available = list(ort.get_available_providers())
    active = list(session.get_providers())
    torch_cuda = bool(torch.cuda.is_available())
    torch_name = ""
    if torch_cuda:
        try:
            torch_name = str(torch.cuda.get_device_name(0))
        except Exception:
            torch_name = "unknown"

    info = {
        "onnxruntime_version": getattr(ort, "__version__", "unknown"),
        "onnxruntime_available_providers": available,
        "session_active_providers": active,
        "torch_cuda_available": torch_cuda,
        "torch_cuda_device_name": torch_name,
        "inference_on_cuda": "CUDAExecutionProvider" in active,
        "primary_provider": active[0] if active else None,
    }
    print(json.dumps({"device_info": info}))

    if allow_cpu_fallback:
        return
    if "CUDAExecutionProvider" not in active:
        raise RuntimeError(
            "ONNX Runtime is not using CUDA. Active providers: "
            f"{active}. Available: {available}. "
            "Install onnxruntime-gpu and ensure CUDA drivers/libs are visible, "
            "or pass --allow-cpu-fallback for local CPU-only debugging."
        )
    if active[0] != "CUDAExecutionProvider":
        raise RuntimeError(
            f"Expected CUDAExecutionProvider as primary session provider, got: {active}. "
            "Inference may not be running on GPU."
        )


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


def load_context_prior(path: Path | None) -> np.ndarray | None:
    if path is None or not path.exists():
        return None
    data = json.loads(path.read_text())
    matrix = np.asarray(data.get("cooccurrence", []), dtype=np.float32)
    if matrix.ndim != 2 or matrix.shape[0] != matrix.shape[1]:
        return None
    row_sums = matrix.sum(axis=1, keepdims=True)
    row_sums = np.where(row_sums > 0.0, row_sums, 1.0)
    return matrix / row_sums


def apply_context_reranking(
    class_scores: np.ndarray,
    obj_scores: np.ndarray,
    prior: np.ndarray,
    alpha: float,
    topk_context: int,
) -> tuple[np.ndarray, np.ndarray]:
    if class_scores.size == 0:
        return np.empty((0,), dtype=np.int64), np.empty((0,), dtype=np.float32)
    if alpha <= 0.0:
        class_ids = np.argmax(class_scores, axis=1).astype(np.int64)
        best_scores = class_scores[np.arange(class_scores.shape[0]), class_ids]
        return class_ids, (obj_scores * best_scores).astype(np.float32)

    initial_ids = np.argmax(class_scores, axis=1).astype(np.int64)
    initial_best = class_scores[np.arange(class_scores.shape[0]), initial_ids]
    initial_conf = obj_scores * initial_best
    if initial_conf.size == 0:
        return initial_ids, initial_conf.astype(np.float32)

    order = np.argsort(initial_conf)[::-1]
    if topk_context > 0:
        order = order[:topk_context]
    context_ids = initial_ids[order]
    context_weights = initial_conf[order].astype(np.float32)
    w_sum = float(context_weights.sum())
    if w_sum <= 0.0:
        class_ids = np.argmax(class_scores, axis=1).astype(np.int64)
        best_scores = class_scores[np.arange(class_scores.shape[0]), class_ids]
        return class_ids, (obj_scores * best_scores).astype(np.float32)

    context_weights = context_weights / w_sum
    context_vec = np.zeros((prior.shape[0],), dtype=np.float32)
    for cid, w in zip(context_ids.tolist(), context_weights.tolist(), strict=False):
        if 0 <= cid < prior.shape[0]:
            context_vec += prior[cid] * float(w)

    # Soft context boost: keeps detector signal dominant.
    boosted = class_scores * (1.0 + alpha * context_vec[None, :])
    class_ids = np.argmax(boosted, axis=1).astype(np.int64)
    best_scores = boosted[np.arange(boosted.shape[0]), class_ids]
    final_scores = obj_scores * best_scores
    return class_ids, final_scores.astype(np.float32)


def apply_neighbor_reranking(
    boxes_xyxy: np.ndarray,
    class_scores: np.ndarray,
    obj_scores: np.ndarray,
    prior: np.ndarray,
    alpha: float,
    neighbors_k: int,
    self_weight: float,
) -> tuple[np.ndarray, np.ndarray]:
    if class_scores.size == 0:
        return np.empty((0,), dtype=np.int64), np.empty((0,), dtype=np.float32)
    if alpha <= 0.0 or neighbors_k <= 0:
        class_ids = np.argmax(class_scores, axis=1).astype(np.int64)
        best_scores = class_scores[np.arange(class_scores.shape[0]), class_ids]
        return class_ids, (obj_scores * best_scores).astype(np.float32)

    n = class_scores.shape[0]
    centers = np.empty((n, 2), dtype=np.float32)
    centers[:, 0] = (boxes_xyxy[:, 0] + boxes_xyxy[:, 2]) * 0.5
    centers[:, 1] = (boxes_xyxy[:, 1] + boxes_xyxy[:, 3]) * 0.5
    pred_ids = np.argmax(class_scores, axis=1).astype(np.int64)
    pred_probs = class_scores[np.arange(n), pred_ids]
    base_conf = obj_scores * pred_probs

    diff = centers[:, None, :] - centers[None, :, :]
    dist2 = (diff[:, :, 0] ** 2 + diff[:, :, 1] ** 2).astype(np.float32)
    np.fill_diagonal(dist2, np.inf)
    k = min(neighbors_k, max(0, n - 1))
    neighbor_idx = np.argsort(dist2, axis=1)[:, :k] if k > 0 else np.empty((n, 0), dtype=np.int64)

    boosted = class_scores.copy()
    for i in range(n):
        ctx = np.zeros((prior.shape[0],), dtype=np.float32)
        if k > 0:
            nb = neighbor_idx[i]
            w = base_conf[nb].clip(min=0.0)
            if w.size > 0 and float(w.sum()) > 0.0:
                w = w / float(w.sum())
                for j, ww in zip(nb.tolist(), w.tolist(), strict=False):
                    cid = int(pred_ids[j])
                    if 0 <= cid < prior.shape[0]:
                        ctx += prior[cid] * float(ww)
        cid_self = int(pred_ids[i])
        if 0 <= cid_self < prior.shape[0]:
            ctx += prior[cid_self] * float(self_weight)
        boosted[i] *= (1.0 + alpha * ctx)

    class_ids = np.argmax(boosted, axis=1).astype(np.int64)
    best_scores = boosted[np.arange(n), class_ids]
    final_scores = obj_scores * best_scores
    return class_ids, final_scores.astype(np.float32)


def decode_detections(
    output: np.ndarray,
    conf_thres: float = 0.25,
    nms_iou: float = 0.45,
    topk_pre_nms: int = 0,
    max_det: int = 0,
    context_prior: np.ndarray | None = None,
    context_alpha: float = 0.0,
    context_topk: int = 60,
    enable_context_rule: bool = True,
    enable_neighbor_rule: bool = False,
    neighbor_alpha: float = 0.0,
    neighbor_k: int = 6,
    neighbor_self_weight: float = 0.5,
    rule_stats: dict[str, int] | None = None,
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    pred = output[0]
    if pred.ndim != 2:
        raise RuntimeError(f"Unsupported output shape: {output.shape}")

    if pred.shape[1] == 6:
        boxes = pred[:, :4].astype(np.float32)
        scores = pred[:, 4].astype(np.float32)
        class_ids = pred[:, 5].astype(np.int64)
    else:
        if pred.shape[0] < pred.shape[1]:
            pred = pred.T
        if pred.shape[1] <= 4:
            raise RuntimeError(f"Unsupported output shape: {output.shape}")
        boxes_xywh = pred[:, :4].astype(np.float32)
        if pred.shape[1] > 6:
            # Raw-head export can be either:
            # - xywh + class_conf... (no explicit objness), or
            # - xywh + obj_conf + class_conf...
            expected_classes = context_prior.shape[0] if context_prior is not None else None
            has_explicit_obj = False
            if expected_classes is not None:
                if pred.shape[1] == expected_classes + 5:
                    has_explicit_obj = True
                elif pred.shape[1] == expected_classes + 4:
                    has_explicit_obj = False
                else:
                    # Fallback heuristic for unusual exports.
                    has_explicit_obj = pred.shape[1] > 128
            else:
                # Without class-count hint, assume no explicit objectness.
                has_explicit_obj = False

            if has_explicit_obj:
                obj_scores = pred[:, 4].astype(np.float32)
                class_scores = pred[:, 5:].astype(np.float32)
            else:
                obj_scores = np.ones((boxes_xywh.shape[0],), dtype=np.float32)
                class_scores = pred[:, 4:].astype(np.float32)
            if class_scores.size == 0:
                class_ids = np.zeros((boxes_xywh.shape[0],), dtype=np.int64)
                scores = obj_scores
            else:
                if (
                    enable_context_rule
                    and context_prior is not None
                    and context_prior.shape[0] == class_scores.shape[1]
                ):
                    class_ids, scores = apply_context_reranking(
                        class_scores=class_scores,
                        obj_scores=obj_scores,
                        prior=context_prior,
                        alpha=context_alpha,
                        topk_context=context_topk,
                    )
                    if rule_stats is not None:
                        rule_stats["context_applied"] = rule_stats.get("context_applied", 0) + 1
                else:
                    class_ids = np.argmax(class_scores, axis=1).astype(np.int64)
                    best_class_scores = class_scores[np.arange(class_scores.shape[0]), class_ids]
                    scores = obj_scores * best_class_scores
                    if rule_stats is not None:
                        rule_stats["context_skipped"] = rule_stats.get("context_skipped", 0) + 1
        else:
            # Some exports provide xywh + class_conf... without explicit objectness.
            class_scores = pred[:, 4:].astype(np.float32)
            if class_scores.size == 0:
                class_ids = np.zeros((boxes_xywh.shape[0],), dtype=np.int64)
                scores = np.ones((boxes_xywh.shape[0],), dtype=np.float32)
            else:
                class_ids = np.argmax(class_scores, axis=1).astype(np.int64)
                scores = class_scores[np.arange(class_scores.shape[0]), class_ids]
        boxes = np.empty_like(boxes_xywh)
        boxes[:, 0] = boxes_xywh[:, 0] - boxes_xywh[:, 2] / 2.0
        boxes[:, 1] = boxes_xywh[:, 1] - boxes_xywh[:, 3] / 2.0
        boxes[:, 2] = boxes_xywh[:, 0] + boxes_xywh[:, 2] / 2.0
        boxes[:, 3] = boxes_xywh[:, 1] + boxes_xywh[:, 3] / 2.0
        if (
            enable_neighbor_rule
            and context_prior is not None
            and pred.shape[1] > 6
            and context_prior.shape[0] == class_scores.shape[1]
            and class_scores.size
        ):
            class_ids, scores = apply_neighbor_reranking(
                boxes_xyxy=boxes,
                class_scores=class_scores,
                obj_scores=obj_scores,
                prior=context_prior,
                alpha=neighbor_alpha,
                neighbors_k=neighbor_k,
                self_weight=neighbor_self_weight,
            )
            if rule_stats is not None:
                rule_stats["neighbor_applied"] = rule_stats.get("neighbor_applied", 0) + 1

    keep = scores >= conf_thres
    boxes = boxes[keep]
    scores = scores[keep]
    class_ids = class_ids[keep]
    if len(scores) == 0:
        return boxes.reshape(0, 4), scores, class_ids
    if topk_pre_nms > 0 and len(scores) > topk_pre_nms:
        topk_idx = np.argpartition(-scores, topk_pre_nms - 1)[:topk_pre_nms]
        boxes = boxes[topk_idx]
        scores = scores[topk_idx]
        class_ids = class_ids[topk_idx]
    keep_nms = nms(boxes, scores, iou_thres=nms_iou)
    if max_det > 0:
        keep_nms = keep_nms[:max_det]
    return boxes[keep_nms], scores[keep_nms], class_ids[keep_nms]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--onnx",
        default="model.onnx",
        help="Path to ONNX model (relative to this script dir if not absolute).",
    )
    parser.add_argument(
        "--allow-cpu-fallback",
        action="store_true",
        help="Do not require CUDA (for local debugging only; competition runs expect GPU).",
    )
    parser.add_argument("--input", default="data/yolo/val/images")
    parser.add_argument("--output", default="predictions.json")
    parser.add_argument("--conf-thres", type=float, default=0.01)
    parser.add_argument("--nms-iou", type=float, default=0.45)
    parser.add_argument("--topk-pre-nms", type=int, default=0)
    parser.add_argument("--max-det", type=int, default=0)
    parser.add_argument("--context-prior-json", default="data/context/class_cooccurrence.json")
    parser.add_argument("--context-alpha", type=float, default=0.15)
    parser.add_argument("--context-topk", type=int, default=60)
    parser.add_argument(
        "--disable-context-rule",
        action="store_true",
        help="Disable context-aware class reranking rule.",
    )
    parser.add_argument(
        "--log-rules",
        action="store_true",
        help="Print rule config and activation counts.",
    )
    parser.add_argument(
        "--enable-neighbor-rule",
        action="store_true",
        help="Enable local neighbor co-locality reranking rule.",
    )
    parser.add_argument("--neighbor-alpha", type=float, default=0.1)
    parser.add_argument("--neighbor-k", type=int, default=6)
    parser.add_argument("--neighbor-self-weight", type=float, default=0.5)
    args = parser.parse_args()
 
    root = Path(__file__).resolve().parent
    prior_path = Path(args.context_prior_json)
    if not prior_path.is_absolute():
        prior_path = root / prior_path
    context_prior = load_context_prior(prior_path)
    enable_context_rule = not args.disable_context_rule
    if args.log_rules:
        print(
            json.dumps(
                {
                    "rules": {
                        "context_rerank_enabled": enable_context_rule,
                        "context_prior_loaded": bool(context_prior is not None),
                        "context_alpha": args.context_alpha,
                        "context_topk": args.context_topk,
                        "neighbor_rerank_enabled": args.enable_neighbor_rule,
                        "neighbor_alpha": args.neighbor_alpha,
                        "neighbor_k": args.neighbor_k,
                        "neighbor_self_weight": args.neighbor_self_weight,
                    },
                    "postprocess": {
                        "conf_thres": args.conf_thres,
                        "nms_iou": args.nms_iou,
                        "topk_pre_nms": args.topk_pre_nms,
                        "max_det": args.max_det,
                    },
                }
            )
        )
    providers = ["CUDAExecutionProvider", "CPUExecutionProvider"]
    onnx_path = Path(args.onnx)
    if not onnx_path.is_absolute():
        onnx_path = root / onnx_path
    session = ort.InferenceSession(str(onnx_path), providers=providers)
    log_and_require_cuda(session, allow_cpu_fallback=args.allow_cpu_fallback)
    input_name = session.get_inputs()[0].name
    input_dtype = np.float16 if "float16" in session.get_inputs()[0].type else np.float32
    input_h, input_w = get_input_hw(session)

    predictions = []
    rule_stats: dict[str, int] = {}

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
        boxes, scores, class_ids = decode_detections(
            output,
            conf_thres=args.conf_thres,
            nms_iou=args.nms_iou,
            topk_pre_nms=args.topk_pre_nms,
            max_det=args.max_det,
            context_prior=context_prior,
            context_alpha=args.context_alpha,
            context_topk=args.context_topk,
            enable_context_rule=enable_context_rule,
            enable_neighbor_rule=args.enable_neighbor_rule,
            neighbor_alpha=args.neighbor_alpha,
            neighbor_k=args.neighbor_k,
            neighbor_self_weight=args.neighbor_self_weight,
            rule_stats=rule_stats,
        )
        sx = src_w / float(input_w)
        sy = src_h / float(input_h)

        valid_boxes: list[tuple[float, float, float, float]] = []
        valid_scores: list[float] = []
        valid_class_ids: list[int] = []
        for box, score, class_id in zip(boxes.tolist(), scores.tolist(), class_ids.tolist(), strict=False):
            x1 = max(0.0, min(src_w, box[0] * sx))
            y1 = max(0.0, min(src_h, box[1] * sy))
            x2 = max(0.0, min(src_w, box[2] * sx))
            y2 = max(0.0, min(src_h, box[3] * sy))
            if x2 <= x1 or y2 <= y1:
                continue
            valid_boxes.append((x1, y1, x2, y2))
            valid_scores.append(float(score))
            valid_class_ids.append(int(class_id))

        for (x1, y1, x2, y2), score, class_id in zip(valid_boxes, valid_scores, valid_class_ids, strict=False):
            predictions.append(
                {
                    "image_id": image_id,
                    "category_id": class_id,
                    "bbox": [round(x1, 1), round(y1, 1), round(x2 - x1, 1), round(y2 - y1, 1)],
                    "score": round(float(score), 6),
                }
            )
 
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(predictions, f)
    if args.log_rules:
        summary: dict = {
            "rule_stats": rule_stats,
            "num_predictions": len(predictions),
        }
        print(json.dumps(summary))
 
if __name__ == "__main__":
    import time
    start_time = time.time()
    main()
    end_time = time.time()
    print(f"Time taken: {end_time - start_time} seconds")