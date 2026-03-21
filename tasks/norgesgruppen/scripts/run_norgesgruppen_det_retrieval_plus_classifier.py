#!/usr/bin/env python3

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Any

from eval_norgesgruppen_predictions import build_context, evaluate_predictions, xywh_to_xyxy
from norgesgruppen_crop_benchmark_common import load_crop_eval_context, normalize_relative_path
from norgesgruppen_prep_common import COCO_IMAGES, write_json, write_jsonl
from norgesgruppen_retrieval_backends import build_backend, compute_crop_box_from_bbox_xyxy
from run_norgesgruppen_crop_retrieval import build_gallery_specs, load_or_compute_embeddings, slug_fragment
from run_norgesgruppen_det_plus_retrieval import require, require_close
from sweep_norgesgruppen_detection_postprocess import filter_predictions_for_config, load_predictions
from train_norgesgruppen_crop_classifier_cached import create_head


WEAK_BUCKETS = {
    "ambiguous_reference",
    "missing_reference",
    "needs_manual_review",
    "provisional_alias_reference",
    "sibling_variant_trap",
    "unknown_sentinel",
}


def softmax_dict(values: dict[int, float], temperature: float) -> dict[int, float]:
    import math

    if not values:
        return {}
    adjusted_temperature = max(float(temperature), 1e-6)
    max_value = max(values.values())
    exp_values = {
        key: math.exp((value - max_value) / adjusted_temperature)
        for key, value in values.items()
    }
    denom = sum(exp_values.values())
    if denom <= 0.0:
        return {key: 0.0 for key in values}
    return {
        key: exp_value / denom
        for key, exp_value in exp_values.items()
    }


def build_prediction_query_specs(
    predictions: list[dict[str, Any]],
    images_by_id: dict[int, dict[str, Any]],
    padding_px: int,
    padding_frac: float,
) -> list[dict[str, Any]]:
    specs = []
    for prediction in predictions:
        image = images_by_id[prediction["image_id"]]
        crop_box = compute_crop_box_from_bbox_xyxy(
            bbox_xyxy=xywh_to_xyxy(prediction["bbox"]),
            image_width=image["width"],
            image_height=image["height"],
            padding_px=padding_px,
            padding_frac=padding_frac,
        )
        specs.append(
            {
                "spec_id": f"prediction::{prediction['prediction_index']}",
                "source_path": COCO_IMAGES / image["file_name"],
                "crop_box": crop_box,
                "prediction_index": prediction["prediction_index"],
                "image_id": prediction["image_id"],
            }
        )
    return specs


def load_classifier_checkpoint(path: Path) -> dict[str, Any]:
    import torch

    payload = torch.load(path, map_location="cpu")
    required_keys = {"head_state_dict", "label_rows", "num_classes"}
    missing = sorted(required_keys - set(payload))
    if missing:
        raise ValueError(f"Classifier checkpoint missing keys: {missing}")
    return payload


def classifier_candidates_from_embedding(
    query_embedding,
    checkpoint: dict[str, Any],
    classifier_temperature: float,
    top_k: int,
) -> list[dict[str, Any]]:
    import torch

    label_rows = checkpoint["label_rows"]
    head = create_head(
        embedding_dim=int(query_embedding.shape[-1]),
        num_classes=int(checkpoint["num_classes"]),
    )
    head.load_state_dict(checkpoint["head_state_dict"])
    head.eval()
    with torch.inference_mode():
        logits = head(query_embedding.unsqueeze(0).float()).squeeze(0).cpu()
        probs = torch.softmax(logits / max(float(classifier_temperature), 1e-6), dim=-1)
        sorted_indices = torch.argsort(probs, descending=True)
    candidates = []
    for local_label in sorted_indices[:top_k].tolist():
        label_row = label_rows[int(local_label)]
        candidates.append(
            {
                "category_id": int(label_row["category_id"]),
                "score": float(probs[int(local_label)].item()),
                "local_classifier_label": int(local_label),
                "theme": label_row["theme"],
                "classification_readiness_bucket": label_row["classification_readiness_bucket"],
                "category_role": label_row["category_role"],
            }
        )
    return candidates


def select_variant_prediction(
    *,
    variant_id: str,
    detector_score: float,
    retrieval_candidates: list[dict[str, Any]],
    classifier_candidates: list[dict[str, Any]],
    retrieval_support_set: set[int],
    classifier_support_set: set[int],
    category_strategy_by_id: dict[int, dict[str, Any]],
    margin_threshold: float,
    weak_bucket_classifier_boost: float,
    retrieval_temperature: float,
) -> tuple[int, float, dict[str, Any]]:
    retrieval_top1 = retrieval_candidates[0]
    retrieval_top2_score = retrieval_candidates[1]["score"] if len(retrieval_candidates) > 1 else None
    retrieval_margin = (
        float(retrieval_top1["score"] - retrieval_top2_score)
        if retrieval_top2_score is not None
        else 1.0
    )
    classifier_top1 = classifier_candidates[0]

    retrieval_probs = softmax_dict(
        {int(row["category_id"]): float(row["score"]) for row in retrieval_candidates},
        temperature=retrieval_temperature,
    )
    classifier_probs = {
        int(row["category_id"]): float(row["score"])
        for row in classifier_candidates
    }

    if variant_id == "retrieval_score_fused":
        return (
            int(retrieval_top1["category_id"]),
            round(detector_score * float(retrieval_top1["score"]), 6),
            {
                "source": "retrieval",
                "retrieval_margin": round(retrieval_margin, 6),
                "retrieval_top1_score": round(float(retrieval_top1["score"]), 6),
            },
        )

    if variant_id == "classifier_only":
        return (
            int(classifier_top1["category_id"]),
            round(detector_score * float(classifier_top1["score"]), 6),
            {
                "source": "classifier",
                "classifier_top1_score": round(float(classifier_top1["score"]), 6),
                "retrieval_margin": round(retrieval_margin, 6),
            },
        )

    if variant_id == "margin_fallback":
        use_classifier = retrieval_margin < margin_threshold
        chosen = classifier_top1 if use_classifier else retrieval_top1
        chosen_score = float(chosen["score"])
        return (
            int(chosen["category_id"]),
            round(detector_score * chosen_score, 6),
            {
                "source": "classifier" if use_classifier else "retrieval",
                "retrieval_margin": round(retrieval_margin, 6),
                "classifier_top1_score": round(float(classifier_top1["score"]), 6),
                "retrieval_top1_score": round(float(retrieval_top1["score"]), 6),
            },
        )

    candidate_ids = set(retrieval_probs) | set(classifier_probs)
    blended_scores: dict[int, float] = {}
    for category_id in candidate_ids:
        retrieval_weight = 0.5 if category_id in retrieval_support_set else 0.0
        classifier_weight = 0.5 if category_id in classifier_support_set else 0.0

        if variant_id == "margin_blend":
            if retrieval_margin < margin_threshold:
                retrieval_weight = 0.3 if category_id in retrieval_support_set else 0.0
                classifier_weight = 0.7 if category_id in classifier_support_set else 0.0
            else:
                retrieval_weight = 0.7 if category_id in retrieval_support_set else 0.0
                classifier_weight = 0.3 if category_id in classifier_support_set else 0.0

        if variant_id == "routing_blend":
            readiness_bucket = category_strategy_by_id.get(category_id, {}).get("classification_readiness_bucket")
            if category_id not in classifier_support_set:
                retrieval_weight = 1.0 if category_id in retrieval_support_set else 0.0
                classifier_weight = 0.0
            elif category_id not in retrieval_support_set:
                retrieval_weight = 0.0
                classifier_weight = 1.0
            elif readiness_bucket in WEAK_BUCKETS:
                retrieval_weight = 0.25
                classifier_weight = weak_bucket_classifier_boost
            elif retrieval_margin < margin_threshold:
                retrieval_weight = 0.35
                classifier_weight = 0.65
            else:
                retrieval_weight = 0.65
                classifier_weight = 0.35

        score = (
            retrieval_weight * retrieval_probs.get(category_id, 0.0)
            + classifier_weight * classifier_probs.get(category_id, 0.0)
        )
        blended_scores[int(category_id)] = score

    best_category_id, best_score = max(
        blended_scores.items(),
        key=lambda item: (item[1], -item[0]),
    )
    return (
        int(best_category_id),
        round(detector_score * float(best_score), 6),
        {
            "source": variant_id,
            "retrieval_margin": round(retrieval_margin, 6),
            "retrieval_top1_score": round(float(retrieval_top1["score"]), 6),
            "classifier_top1_score": round(float(classifier_top1["score"]), 6),
            "blended_score": round(float(best_score), 6),
        },
    )


def run_pipeline(
    *,
    detector_predictions_path: Path,
    classifier_checkpoint_path: Path,
    output_dir: Path,
    model_id: str | None,
    gallery_mode: str,
    device: str,
    batch_size: int,
    min_score: float,
    max_det_per_image: int | None,
    padding_px: int,
    padding_frac: float,
    ranking_top_k: int,
    count_score_threshold: float,
    experiment_id: str | None,
    label: str | None,
    margin_threshold: float,
    retrieval_temperature: float,
    classifier_temperature: float,
    weak_bucket_classifier_boost: float,
) -> dict[str, Any]:
    import torch

    output_dir.mkdir(parents=True, exist_ok=True)
    artifacts_dir = output_dir / "artifacts"
    artifacts_dir.mkdir(parents=True, exist_ok=True)
    cache_dir = artifacts_dir / "cache"
    cache_dir.mkdir(parents=True, exist_ok=True)

    eval_context = build_context()
    crop_eval_context = load_crop_eval_context(gallery_mode=gallery_mode)
    full_gallery_entries = crop_eval_context["slice_defs"]["full"]["gallery_entries"]
    require(full_gallery_entries, "Full gallery is empty.")

    classifier_checkpoint = load_classifier_checkpoint(classifier_checkpoint_path)
    require(
        (model_id or "hf-hub:timm/PE-Core-B-16") == classifier_checkpoint.get("model_name", model_id or "hf-hub:timm/PE-Core-B-16"),
        "Classifier checkpoint model_id does not match requested retrieval model_id.",
    )

    backend = build_backend(
        backend_name="pe_core_openclip",
        model_id=model_id,
        device=device,
        batch_size=batch_size,
    )

    raw_predictions, input_meta = load_predictions(
        predictions_path=detector_predictions_path,
        val_image_ids=eval_context["val_image_ids"],
    )
    filtered_predictions = filter_predictions_for_config(
        predictions=raw_predictions,
        min_score=min_score,
        max_det_per_image=max_det_per_image,
    )
    require(filtered_predictions, "No predictions remain after detector filtering.")

    gallery_specs = build_gallery_specs(full_gallery_entries)
    query_specs = []
    for prediction in filtered_predictions:
        image = eval_context["images_by_id"][prediction["image_id"]]
        crop_box = compute_crop_box_from_bbox_xyxy(
            bbox_xyxy=xywh_to_xyxy(prediction["bbox"]),
            image_width=image["width"],
            image_height=image["height"],
            padding_px=padding_px,
            padding_frac=padding_frac,
        )
        query_specs.append(
            {
                "spec_id": f"prediction::{prediction['prediction_index']}",
                "source_path": COCO_IMAGES / image["file_name"],
                "crop_box": crop_box,
            }
        )

    model_fragment = slug_fragment(backend.model_id or "none")
    filter_fragment = f"ms{min_score}-md{max_det_per_image if max_det_per_image is not None else 'all'}"
    crop_fragment = f"padpx{padding_px}-padfrac{padding_frac}"
    gallery_cache_path = cache_dir / f"gallery-pe_core_openclip-{model_fragment}-{gallery_mode}.cache"
    query_cache_path = cache_dir / f"predictions-pe_core_openclip-{model_fragment}-{gallery_mode}-{filter_fragment}-{crop_fragment}.cache"

    print(f"[exp0014] backend=pe_core_openclip model_id={backend.model_id} device={backend.resolved_device()}")
    print(f"[exp0014] raw_predictions={len(raw_predictions)} filtered_predictions={len(filtered_predictions)} gallery_entries={len(full_gallery_entries)}")
    gallery_embeddings = load_or_compute_embeddings(
        backend=backend,
        specs=gallery_specs,
        cache_path=gallery_cache_path,
        label="gallery",
    )
    query_embeddings = load_or_compute_embeddings(
        backend=backend,
        specs=query_specs,
        cache_path=query_cache_path,
        label="predicted-query",
    )

    gallery_entries_with_spec_ids = [
        {
            **entry,
            "spec_id": f"gallery::{normalize_relative_path(entry['path'])}",
        }
        for entry in full_gallery_entries
    ]
    retrieval_support_set = {int(entry["category_id"]) for entry in full_gallery_entries}
    classifier_support_set = {
        int(row["category_id"])
        for row in classifier_checkpoint["label_rows"]
    }
    category_name_by_id = {
        int(row["id"]): row["name"]
        for row in eval_context["val_coco"]["categories"]
    }

    variant_ids = [
        "retrieval_score_fused",
        "classifier_only",
        "margin_fallback",
        "margin_blend",
        "routing_blend",
    ]
    variant_predictions: dict[str, list[dict[str, Any]]] = {
        variant_id: []
        for variant_id in variant_ids
    }
    assignment_rows = []

    for index, prediction in enumerate(filtered_predictions, start=1):
        query_spec_id = f"prediction::{prediction['prediction_index']}"
        query_embedding = query_embeddings[query_spec_id].cpu().float()
        retrieval_candidates = backend.rank_category_scores(
            query_embedding=query_embedding,
            gallery_embeddings=gallery_embeddings,
            gallery_entries=gallery_entries_with_spec_ids,
        )[:ranking_top_k]
        classifier_candidates = classifier_candidates_from_embedding(
            query_embedding=query_embedding,
            checkpoint=classifier_checkpoint,
            classifier_temperature=classifier_temperature,
            top_k=ranking_top_k,
        )

        assignment_row = {
            "prediction_index": prediction["prediction_index"],
            "image_id": prediction["image_id"],
            "bbox": prediction["bbox"],
            "detector_score": prediction["score"],
            "retrieval_candidates": [
                {
                    "category_id": int(row["category_id"]),
                    "category_name": category_name_by_id[int(row["category_id"])],
                    "score": round(float(row["score"]), 6),
                    "source": row["source"],
                }
                for row in retrieval_candidates
            ],
            "classifier_candidates": [
                {
                    "category_id": int(row["category_id"]),
                    "category_name": category_name_by_id[int(row["category_id"])],
                    "score": round(float(row["score"]), 6),
                    "classification_readiness_bucket": row["classification_readiness_bucket"],
                    "category_role": row["category_role"],
                }
                for row in classifier_candidates
            ],
            "variant_choices": {},
        }

        for variant_id in variant_ids:
            chosen_category_id, chosen_score, details = select_variant_prediction(
                variant_id=variant_id,
                detector_score=float(prediction["score"]),
                retrieval_candidates=retrieval_candidates,
                classifier_candidates=classifier_candidates,
                retrieval_support_set=retrieval_support_set,
                classifier_support_set=classifier_support_set,
                category_strategy_by_id=eval_context["category_strategy_by_id"],
                margin_threshold=margin_threshold,
                weak_bucket_classifier_boost=weak_bucket_classifier_boost,
                retrieval_temperature=retrieval_temperature,
            )
            variant_predictions[variant_id].append(
                {
                    "image_id": prediction["image_id"],
                    "category_id": chosen_category_id,
                    "bbox": prediction["bbox"],
                    "score": chosen_score,
                }
            )
            assignment_row["variant_choices"][variant_id] = {
                "category_id": chosen_category_id,
                "category_name": category_name_by_id[chosen_category_id],
                "score": chosen_score,
                **details,
            }

        assignment_rows.append(assignment_row)
        if index % 250 == 0 or index == len(filtered_predictions):
            print(f"[exp0014] assigned {index}/{len(filtered_predictions)} predictions")

    assignments_jsonl = artifacts_dir / "fusion-assignments.jsonl"
    write_jsonl(assignments_jsonl, assignment_rows)

    variant_metrics = []
    for variant_id in variant_ids:
        predictions_path = artifacts_dir / f"predictions-{variant_id}.json"
        write_json(predictions_path, variant_predictions[variant_id])
        metrics = evaluate_predictions(
            predictions_path=predictions_path,
            output_dir=output_dir / f"eval-{variant_id}",
            count_score_threshold=count_score_threshold,
        )["metrics"]["global"]
        variant_metrics.append(
            {
                "variant_id": variant_id,
                "predictions_path": normalize_relative_path(predictions_path),
                "detection_ap50_ignore_class": metrics["detection_ap50_ignore_class"],
                "classification_map50": metrics["classification_map50"],
                "hybrid_proxy": metrics["hybrid_proxy"],
            }
        )

    best_variant = max(variant_metrics, key=lambda row: row["hybrid_proxy"])
    summary = {
        "experiment_id": experiment_id,
        "label": label or "exp0014",
        "backend": "pe_core_openclip",
        "model_id": backend.model_id,
        "gallery_mode": gallery_mode,
        "detector_predictions_path": normalize_relative_path(detector_predictions_path),
        "classifier_checkpoint_path": normalize_relative_path(classifier_checkpoint_path),
        "detector_filter": {
            "min_score": min_score,
            "max_det_per_image": max_det_per_image,
        },
        "query_crop": {
            "padding_px": padding_px,
            "padding_frac": padding_frac,
        },
        "ranking_top_k": ranking_top_k,
        "count_score_threshold": count_score_threshold,
        "input_prediction_meta": input_meta,
        "gallery_cache_path": normalize_relative_path(gallery_cache_path),
        "query_cache_path": normalize_relative_path(query_cache_path),
        "filtered_prediction_count": len(filtered_predictions),
        "retrieval_support_category_count": len(retrieval_support_set),
        "classifier_support_category_count": len(classifier_support_set),
        "variant_count": len(variant_metrics),
        "best_variant": best_variant,
        "variants": variant_metrics,
        "artifacts": {
            "fusion_assignments_jsonl": normalize_relative_path(assignments_jsonl),
        },
    }
    write_json(output_dir / "summary.json", summary)
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Run the missing EXP-0014 detector + retrieval + classifier pipeline on saved detector predictions.")
    parser.add_argument("--detector-predictions", type=Path, required=True)
    parser.add_argument("--classifier-checkpoint", type=Path, required=True)
    parser.add_argument("--output-dir", type=Path, required=True)
    parser.add_argument("--model-id", default="hf-hub:timm/PE-Core-B-16")
    parser.add_argument("--gallery-mode", choices=["representative", "all"], default="representative")
    parser.add_argument("--device", default="auto")
    parser.add_argument("--batch-size", type=int, default=32)
    parser.add_argument("--min-score", type=float, default=0.4)
    parser.add_argument("--max-det-per-image", type=int, default=None)
    parser.add_argument("--padding-px", type=int, default=0)
    parser.add_argument("--padding-frac", type=float, default=0.0)
    parser.add_argument("--ranking-top-k", type=int, default=5)
    parser.add_argument("--count-score-threshold", type=float, default=0.05)
    parser.add_argument("--margin-threshold", type=float, default=0.05)
    parser.add_argument("--retrieval-temperature", type=float, default=0.05)
    parser.add_argument("--classifier-temperature", type=float, default=1.0)
    parser.add_argument("--weak-bucket-classifier-boost", type=float, default=0.75)
    parser.add_argument("--experiment-id", default=None)
    parser.add_argument("--label", default=None)
    args = parser.parse_args()

    summary = run_pipeline(
        detector_predictions_path=args.detector_predictions,
        classifier_checkpoint_path=args.classifier_checkpoint,
        output_dir=args.output_dir,
        model_id=args.model_id,
        gallery_mode=args.gallery_mode,
        device=args.device,
        batch_size=args.batch_size,
        min_score=args.min_score,
        max_det_per_image=args.max_det_per_image,
        padding_px=args.padding_px,
        padding_frac=args.padding_frac,
        ranking_top_k=args.ranking_top_k,
        count_score_threshold=args.count_score_threshold,
        experiment_id=args.experiment_id,
        label=args.label,
        margin_threshold=args.margin_threshold,
        retrieval_temperature=args.retrieval_temperature,
        classifier_temperature=args.classifier_temperature,
        weak_bucket_classifier_boost=args.weak_bucket_classifier_boost,
    )
    print(json.dumps(summary, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
