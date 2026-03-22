#!/usr/bin/env python3
"""Ensemble multiple YOLO models with WBF merge."""
import json
import sys
from pathlib import Path
from itertools import product as iterproduct

from ultralytics import YOLO
from PIL import Image


def compute_iou(a, b):
    x1 = max(a[0], b[0]); y1 = max(a[1], b[1])
    x2 = min(a[2], b[2]); y2 = min(a[3], b[3])
    inter = max(0, x2 - x1) * max(0, y2 - y1)
    area_a = max(0, a[2] - a[0]) * max(0, a[3] - a[1])
    area_b = max(0, b[2] - b[0]) * max(0, b[3] - b[1])
    union = area_a + area_b - inter
    return inter / union if union > 0 else 0


def predict_single(model, img_path, imgsz, conf, iou, device=0):
    results = model.predict(
        source=str(img_path), imgsz=imgsz, conf=conf, iou=iou,
        device=device, verbose=False, max_det=600,
    )
    dets = []
    for r in results:
        boxes = r.boxes
        for i in range(len(boxes)):
            xyxy = boxes.xyxy[i].cpu().numpy()
            cls_id = int(boxes.cls[i].cpu().item())
            score = float(boxes.conf[i].cpu().item())
            dets.append((float(xyxy[0]), float(xyxy[1]), float(xyxy[2]), float(xyxy[3]), cls_id, score))
    return dets


def flip_dets_h(dets, img_w):
    return [(img_w - x2, y1, img_w - x1, y2, c, s) for x1, y1, x2, y2, c, s in dets]


def wbf_merge(det_sets, iou_threshold=0.55, n_models=1):
    by_class = {}
    for dets in det_sets:
        for x1, y1, x2, y2, cls_id, score in dets:
            by_class.setdefault(cls_id, []).append((x1, y1, x2, y2, score))

    merged = []
    for cls_id, boxes in by_class.items():
        boxes.sort(key=lambda b: b[4], reverse=True)
        clusters = []
        used = [False] * len(boxes)
        for i in range(len(boxes)):
            if used[i]:
                continue
            cluster = [boxes[i]]
            used[i] = True
            for j in range(i + 1, len(boxes)):
                if used[j]:
                    continue
                if compute_iou(boxes[i][:4], boxes[j][:4]) >= iou_threshold:
                    cluster.append(boxes[j])
                    used[j] = True
            total_w = sum(c[4] for c in cluster)
            if total_w <= 0:
                continue
            avg = [sum(c[k] * c[4] for c in cluster) / total_w for k in range(4)]
            avg_score = total_w / n_models
            merged.append((*avg, cls_id, min(avg_score, 1.0)))
    return merged


def run_ensemble(models_configs, val_dir, gt_by_image, do_flip=False, n_models=1):
    """Run ensemble: each config is (model, imgsz)."""
    val_images = val_dir / "images"
    image_paths = sorted(
        list(val_images.glob("*.jpg")) +
        list(val_images.glob("*.jpeg")) +
        list(val_images.glob("*.png"))
    )

    all_predictions = []
    for img_path in image_paths:
        token = img_path.stem.split("_")[-1]
        image_id = int(token)
        with Image.open(img_path) as im:
            img_w, img_h = im.size

        det_sets = []
        for model, imgsz in models_configs:
            dets = predict_single(model, img_path, imgsz, conf=0.0001, iou=0.55)
            det_sets.append(dets)
            if do_flip:
                flipped = Image.open(img_path).transpose(Image.FLIP_LEFT_RIGHT)
                tmp = val_dir.parent / "_tmp_flip.jpg"
                flipped.save(str(tmp)); flipped.close()
                flip_dets = predict_single(model, tmp, imgsz, conf=0.0001, iou=0.55)
                det_sets.append(flip_dets_h(flip_dets, img_w))

        merged = wbf_merge(det_sets, iou_threshold=0.55, n_models=n_models)
        for x1, y1, x2, y2, cls_id, score in merged:
            all_predictions.append({
                "image_id": image_id,
                "category_id": int(cls_id),
                "bbox": [x1, y1, x2 - x1, y2 - y1],
                "score": score,
            })
    return all_predictions


def evaluate(predictions, gt_by_image):
    from compare_predictions import evaluate_hybrid
    pred_by_image = {}
    for p in predictions:
        pred_by_image.setdefault(p["image_id"], []).append({
            "category_id": p["category_id"],
            "score": p["score"],
            "bbox_xyxy": (p["bbox"][0], p["bbox"][1],
                          p["bbox"][0]+p["bbox"][2], p["bbox"][1]+p["bbox"][3]),
        })
    for img_id in pred_by_image:
        pred_by_image[img_id].sort(key=lambda x: x["score"], reverse=True)
    return evaluate_hybrid(gt_by_image, pred_by_image, iou_threshold=0.5, num_classes=356)


def main():
    root = Path(__file__).resolve().parent
    sys.path.insert(0, str(root))
    from compare_predictions import load_ground_truth

    val_dir = root / "data/yolo/val"
    gt_by_image = load_ground_truth(val_dir)

    # Models
    m_b4 = YOLO(str(root / "runs/960_confcurr_s2_final_e18_img960_b4_lr8e-05_mix0_cp0_seed123/weights/best.pt"))
    m_b8 = YOLO(str(root / "runs/960b8_confcurr_s2_e18_img960_b8_lr8e-05_mix0_cp0_seed123/weights/best.pt"))

    configs = [
        ("b4_only", [(m_b4, 960)], False, 1),
        ("b8_only", [(m_b8, 960)], False, 1),
        ("b4+b8_ensemble", [(m_b4, 960), (m_b8, 960)], False, 2),
        ("b4+b8_flip", [(m_b4, 960), (m_b8, 960)], True, 2),
        ("b4_960+b4_1280", [(m_b4, 960), (m_b4, 1280)], False, 1),
        ("b4+b8_multiscale", [(m_b4, 960), (m_b8, 960), (m_b4, 1280)], False, 2),
        ("b4+b8_ms_flip", [(m_b4, 960), (m_b8, 960), (m_b4, 1280)], True, 2),
    ]

    for name, mc, flip, nm in configs:
        print(f"\n=== {name} (flip={flip}) ===")
        preds = run_ensemble(mc, val_dir, gt_by_image, do_flip=flip, n_models=nm)
        metrics = evaluate(preds, gt_by_image)
        print(f"  det_AP50    = {metrics['detection_ap50']:.4f}")
        print(f"  cls_present = {metrics['classification_map50_present_classes']:.4f}")
        print(f"  cls_all     = {metrics['classification_map50_all_classes']:.4f}")
        print(f"  hybrid_pres = {metrics['hybrid_score_present_classes']:.4f}")
        print(f"  hybrid_all  = {metrics['hybrid_score_all_classes']:.4f}")
        print(f"  preds       = {len(preds)}")

    # Cleanup
    tmp = val_dir.parent / "_tmp_flip.jpg"
    if tmp.exists():
        tmp.unlink()


if __name__ == "__main__":
    main()
