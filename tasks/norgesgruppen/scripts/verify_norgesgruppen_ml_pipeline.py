#!/usr/bin/env python3

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path
from typing import Any

from norgesgruppen_prep_common import (
    DATA_DATE,
    ML_PIPELINE_VERIFICATION_JSON,
    ROOT,
    read_json,
    write_json,
)
from verify_norgesgruppen_prep import verify as verify_prep


EXPERIMENTS_ROOT = ROOT / "data" / DATA_DATE / "experiments"


def require(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def require_close(actual: float, expected: float, tolerance: float, message: str) -> None:
    if abs(actual - expected) > tolerance:
        raise AssertionError(f"{message}: actual={actual} expected={expected} tolerance={tolerance}")


def read_last_csv_row(path: Path) -> dict[str, str]:
    rows = list(csv.DictReader(path.open()))
    require(rows, f"Expected at least one row in CSV: {path}")
    return rows[-1]


def add_check(
    checks: list[dict[str, Any]],
    *,
    stage: str,
    check_id: str,
    passed: bool,
    details: dict[str, Any],
) -> None:
    checks.append(
        {
            "stage": stage,
            "check_id": check_id,
            "passed": passed,
            "details": details,
        }
    )


def verify_stage_prep(checks: list[dict[str, Any]]) -> dict[str, Any]:
    summary = verify_prep()
    details = dict(summary["verified_counts"])
    if summary["optional_checks"]:
        details["optional_checks"] = summary["optional_checks"]
    add_check(
        checks,
        stage="prep",
        check_id="prep_verified",
        passed=summary["status"] == "ok",
        details=details,
    )
    return summary


def verify_stage_eval_harness(checks: list[dict[str, Any]]) -> dict[str, Any]:
    exp1_empty = read_json(EXPERIMENTS_ROOT / "EXP-0001-eval-harness" / "artifacts" / "empty-case" / "metrics.json")
    exp1_oracle = read_json(EXPERIMENTS_ROOT / "EXP-0001-eval-harness" / "artifacts" / "oracle-case" / "metrics.json")
    exp6_empty = read_json(EXPERIMENTS_ROOT / "EXP-0006-det-yolov8-class-agnostic" / "artifacts" / "eval-empty" / "metrics.json")
    exp6_oracle = read_json(EXPERIMENTS_ROOT / "EXP-0006-det-yolov8-class-agnostic" / "artifacts" / "eval-oracle" / "metrics.json")
    exp2_oracle = read_json(EXPERIMENTS_ROOT / "EXP-0002-crop-random-and-nearest-neighbor-floor" / "artifacts" / "oracle-rankings-eval" / "metrics.json")

    require_close(exp1_empty["global"]["hybrid_proxy"], 0.0, 1e-12, "EXP-0001 empty hybrid drift")
    require_close(exp1_oracle["global"]["hybrid_proxy"], 1.0, 1e-12, "EXP-0001 oracle hybrid drift")
    require_close(exp6_empty["overall"]["ap50_ignore_class"], 0.0, 1e-12, "EXP-0006 empty AP50 drift")
    require_close(exp6_empty["overall"]["map50_95_ignore_class"], 0.0, 1e-12, "EXP-0006 empty mAP drift")
    require_close(exp6_empty["overall"]["miss_rate_iou50"], 1.0, 1e-12, "EXP-0006 empty miss-rate drift")
    require_close(exp6_oracle["overall"]["ap50_ignore_class"], 1.0, 1e-12, "EXP-0006 oracle AP50 drift")
    require_close(exp6_oracle["overall"]["map50_95_ignore_class"], 1.0, 1e-12, "EXP-0006 oracle mAP drift")
    strict_oracle = exp2_oracle["slices"]["strict"]["result"]
    require_close(strict_oracle["top1_overall"], 1.0, 1e-12, "EXP-0002 oracle strict top1 drift")
    require_close(strict_oracle["map20_overall"], 1.0, 1e-12, "EXP-0002 oracle strict mAP@20 drift")

    summary = {
        "full_image_empty_hybrid": exp1_empty["global"]["hybrid_proxy"],
        "full_image_oracle_hybrid": exp1_oracle["global"]["hybrid_proxy"],
        "detection_empty_ap50": exp6_empty["overall"]["ap50_ignore_class"],
        "detection_oracle_ap50": exp6_oracle["overall"]["ap50_ignore_class"],
        "crop_oracle_strict_top1": strict_oracle["top1_overall"],
    }
    add_check(checks, stage="eval_harness", check_id="empty_oracle_controls", passed=True, details=summary)
    return summary


def verify_stage_crop_recognition(checks: list[dict[str, Any]]) -> dict[str, Any]:
    exp2 = read_json(EXPERIMENTS_ROOT / "EXP-0002-crop-random-and-nearest-neighbor-floor" / "metrics.json")
    exp3 = read_json(EXPERIMENTS_ROOT / "EXP-0003-crop-pe-core" / "metrics.json")
    exp4 = read_json(EXPERIMENTS_ROOT / "EXP-0004-crop-dinov3" / "metrics.json")

    strict_random = exp2["slices"]["strict"]["baselines"]["random"]
    strict_hash = exp2["slices"]["strict"]["baselines"]["nearest_neighbor_hash"]
    strict_pe = exp3["slices"]["strict"]["result"]
    strict_dino = exp4["slices"]["strict"]["result"]

    require(strict_random["top1_overall"] < 0.02, "Random crop baseline unexpectedly strong.")
    require(strict_hash["top1_overall"] > strict_random["top1_overall"], "Hash floor should beat random.")
    require(strict_pe["top1_overall"] > 0.60, "PE-Core strict top1 too weak.")
    require(strict_pe["map20_overall"] > 0.70, "PE-Core strict mAP@20 too weak.")
    require(strict_pe["top1_overall"] > strict_hash["top1_overall"], "PE-Core should beat hash floor.")
    require(strict_dino["top1_overall"] < strict_pe["top1_overall"], "DINOv3 unexpectedly beats PE-Core.")
    require(exp3["ranking_input_summary"]["unique_query_count"] == 4404, "PE-Core query count drift.")
    require(exp4["ranking_input_summary"]["unique_query_count"] == 4404, "DINOv3 query count drift.")
    require(exp3["ranking_input_summary"]["duplicate_query_id_count"] == 0, "PE-Core duplicate query ids detected.")
    require(exp4["ranking_input_summary"]["duplicate_query_id_count"] == 0, "DINOv3 duplicate query ids detected.")

    summary = {
        "strict_random_top1": strict_random["top1_overall"],
        "strict_hash_top1": strict_hash["top1_overall"],
        "strict_pe_core_top1": strict_pe["top1_overall"],
        "strict_pe_core_map20": strict_pe["map20_overall"],
        "strict_dinov3_top1": strict_dino["top1_overall"],
    }
    add_check(checks, stage="crop_recognition", check_id="retrieval_controls", passed=True, details=summary)
    return summary


def verify_stage_detector_learning(checks: list[dict[str, Any]]) -> dict[str, Any]:
    overfit_csv = EXPERIMENTS_ROOT / "EXP-0006-det-yolov8-class-agnostic" / "artifacts" / "yolov8n-overfit-4img2" / "results.csv"
    zero_shot = read_json(EXPERIMENTS_ROOT / "EXP-0006-det-yolov8-class-agnostic" / "artifacts" / "eval-yolov8n-coco-val-floor" / "metrics.json")
    smoke = read_json(EXPERIMENTS_ROOT / "EXP-0006-det-yolov8-class-agnostic" / "artifacts" / "eval-yolov8n-blocked-val-1ep-cpu-smoke" / "metrics.json")
    sweep = read_json(EXPERIMENTS_ROOT / "EXP-0006-det-yolov8-class-agnostic" / "artifacts" / "postprocess-sweep-yolov8n-blocked-val-1ep-cpu-smoke-small" / "sweep-summary.json")
    overfit_last = read_last_csv_row(overfit_csv)

    overfit_map50 = float(overfit_last["       metrics/mAP50(B)"])
    overfit_map50_95 = float(overfit_last["    metrics/mAP50-95(B)"])
    zero_ap50 = zero_shot["overall"]["ap50_ignore_class"]
    smoke_ap50 = smoke["overall"]["ap50_ignore_class"]
    smoke_map = smoke["overall"]["map50_95_ignore_class"]
    best_sweep_ap50 = sweep["best_by_ap50"]["overall"]["ap50_ignore_class"]

    require(overfit_map50 >= 0.75, "Detector overfit sanity too weak.")
    require(overfit_map50_95 >= 0.55, "Detector overfit mAP50-95 too weak.")
    require(zero_ap50 < 0.25, "Zero-shot detector floor drifted unexpectedly high.")
    require(smoke_ap50 > 0.65, "Fine-tuned detector smoke AP50 too weak.")
    require(smoke_ap50 > zero_ap50 + 0.45, "Fine-tuned detector does not beat zero-shot strongly enough.")
    require(smoke_map > 0.30, "Fine-tuned detector smoke mAP50-95 too weak.")
    require(best_sweep_ap50 < smoke_ap50, "Postprocess sweep unexpectedly beats raw smoke AP50.")

    summary = {
        "overfit_map50": overfit_map50,
        "overfit_map50_95": overfit_map50_95,
        "zero_shot_ap50": zero_ap50,
        "fine_tuned_smoke_ap50": smoke_ap50,
        "fine_tuned_smoke_map50_95": smoke_map,
        "best_postprocess_sweep_ap50": best_sweep_ap50,
    }
    add_check(checks, stage="detector_learning", check_id="detector_controls", passed=True, details=summary)
    return summary


def verify_stage_detector_anchor(checks: list[dict[str, Any]]) -> dict[str, Any]:
    base = EXPERIMENTS_ROOT / "EXP-0006-det-yolov8-class-agnostic" / "artifacts"
    finalize_summary = read_json(base / "yolov8n-blocked-val-10ep-cpu-baseline-finalize-summary.json")
    final_eval = read_json(base / "eval-yolov8n-blocked-val-10ep-cpu-baseline" / "metrics.json")
    final_oracle = read_json(base / "oracle-class-yolov8n-blocked-val-10ep-cpu-baseline" / "metrics.json")
    smoke = read_json(base / "eval-yolov8n-blocked-val-1ep-cpu-smoke" / "metrics.json")
    exp11 = read_json(EXPERIMENTS_ROOT / "EXP-0011-oracle-box-pe-core-bound" / "metrics.json")

    final_overall = final_eval["overall"]
    final_oracle_global = final_oracle["global"]
    smoke_overall = smoke["overall"]
    oracle_box_global = exp11["global"]

    require(final_overall["ap50_ignore_class"] > 0.82, "Detector anchor AP50 too weak.")
    require(final_overall["map50_95_ignore_class"] > 0.48, "Detector anchor mAP50-95 too weak.")
    require(final_overall["ap50_ignore_class"] > smoke_overall["ap50_ignore_class"] + 0.12, "Detector anchor does not clearly beat the smoke baseline.")
    require(final_oracle_global["hybrid_proxy"] > 0.87, "Detector anchor oracle-class hybrid too weak.")
    require(final_oracle_global["hybrid_proxy"] > oracle_box_global["hybrid_proxy"], "Detector anchor oracle-class hybrid should now exceed perfect-box PE-Core hybrid.")
    require_close(
        finalize_summary["canonical_eval"]["overall"]["ap50_ignore_class"],
        final_overall["ap50_ignore_class"],
        1e-12,
        "Finalize summary AP50 drift",
    )
    require_close(
        finalize_summary["oracle_class_bound"]["global"]["hybrid_proxy"],
        final_oracle_global["hybrid_proxy"],
        1e-12,
        "Finalize summary oracle-class hybrid drift",
    )

    summary = {
        "anchor_ap50": final_overall["ap50_ignore_class"],
        "anchor_ap75": final_overall["ap75_ignore_class"],
        "anchor_map50_95": final_overall["map50_95_ignore_class"],
        "anchor_miss_rate": final_overall["miss_rate_iou50"],
        "anchor_count_mae": final_overall["count_mae"],
        "anchor_vs_smoke_ap50_delta": final_overall["ap50_ignore_class"] - smoke_overall["ap50_ignore_class"],
        "anchor_oracle_class_hybrid": final_oracle_global["hybrid_proxy"],
    }
    add_check(checks, stage="detector_anchor", check_id="canonical_10ep_anchor", passed=True, details=summary)
    return summary


def verify_stage_first_pipeline(checks: list[dict[str, Any]]) -> dict[str, Any]:
    base = EXPERIMENTS_ROOT / "EXP-0008-pipe-det-plus-retrieval" / "artifacts" / "pe-core-b16-ms0.4-representative"
    summary = read_json(base / "summary.json")
    analysis = read_json(base / "retrieval-analysis.json")
    fusion = read_json(base / "score-fusion-sweep.json")

    detector_only = summary["detector_only_global"]
    pipeline = summary["pipeline_global"]
    oracle_class = summary["oracle_class_global"]
    gaps = summary["gaps"]
    matched_topk = analysis["topk_on_matched_true_positives"]["global"]
    supported_topk = analysis["topk_on_matched_true_positives"]["supported_reference_like_only"]
    best_fusion = fusion["best_by_hybrid"]

    require_close(
        detector_only["detection_ap50_ignore_class"],
        pipeline["detection_ap50_ignore_class"],
        1e-12,
        "EXP-0008 detector-only and pipeline detection AP50 drift",
    )
    require_close(
        detector_only["miss_rate"],
        pipeline["miss_rate"],
        1e-12,
        "EXP-0008 detector-only and pipeline miss-rate drift",
    )
    require(pipeline["classification_map50"] > 0.45, "EXP-0008 pipeline classification mAP50 too weak.")
    require(pipeline["hybrid_proxy"] > 0.69, "EXP-0008 pipeline hybrid too weak.")
    require(gaps["hybrid_gain_vs_detector_only"] > 0.13, "EXP-0008 hybrid lift vs detector-only too small.")
    require(oracle_class["hybrid_proxy"] > pipeline["hybrid_proxy"], "EXP-0008 oracle-class should still beat real pipeline.")
    require(matched_topk["top5_rate"] > 0.82, "EXP-0008 matched-TP top5 too weak.")
    require(supported_topk["top1_rate"] > 0.65, "EXP-0008 supported-slice matched-TP top1 too weak.")
    require(supported_topk["top5_rate"] > 0.86, "EXP-0008 supported-slice matched-TP top5 too weak.")
    require(best_fusion["hybrid_proxy"] > pipeline["hybrid_proxy"] + 0.02, "EXP-0008 cheap score fusion no longer helps enough.")

    stage_summary = {
        "pipeline_detection_ap50": pipeline["detection_ap50_ignore_class"],
        "pipeline_classification_map50": pipeline["classification_map50"],
        "pipeline_hybrid": pipeline["hybrid_proxy"],
        "same_box_oracle_hybrid": oracle_class["hybrid_proxy"],
        "hybrid_gain_vs_detector_only": gaps["hybrid_gain_vs_detector_only"],
        "hybrid_gap_to_oracle": gaps["hybrid_gap_to_oracle"],
        "matched_tp_top1": matched_topk["top1_rate"],
        "matched_tp_top5": matched_topk["top5_rate"],
        "supported_matched_tp_top1": supported_topk["top1_rate"],
        "supported_matched_tp_top5": supported_topk["top5_rate"],
        "best_score_fusion_variant": best_fusion["variant_id"],
        "best_score_fusion_hybrid": best_fusion["hybrid_proxy"],
    }
    add_check(checks, stage="first_pipeline", check_id="detector_plus_retrieval_anchor", passed=True, details=stage_summary)
    return stage_summary


def verify_stage_oracle_bounds(checks: list[dict[str, Any]]) -> dict[str, Any]:
    exp11 = read_json(EXPERIMENTS_ROOT / "EXP-0011-oracle-box-pe-core-bound" / "metrics.json")
    exp12 = read_json(EXPERIMENTS_ROOT / "EXP-0012-det-box-oracle-class-bound" / "metrics.json")
    exp6_smoke = read_json(EXPERIMENTS_ROOT / "EXP-0006-det-yolov8-class-agnostic" / "artifacts" / "eval-yolov8n-blocked-val-1ep-cpu-smoke" / "metrics.json")

    global11 = exp11["global"]
    global12 = exp12["global"]
    smoke_overall = exp6_smoke["overall"]

    require_close(global11["detection_ap50_ignore_class"], 1.0, 1e-12, "EXP-0011 oracle-box detection AP50 drift")
    require_close(global11["miss_rate"], 0.0, 1e-12, "EXP-0011 oracle-box miss-rate drift")
    require_close(global11["count_mae"], 0.0, 1e-12, "EXP-0011 oracle-box count MAE drift")
    require(global11["hybrid_proxy"] > 0.85, "EXP-0011 oracle-box hybrid unexpectedly weak.")

    require_close(global12["detection_ap50_ignore_class"], smoke_overall["ap50_ignore_class"], 1e-12, "EXP-0012 detection AP50 no longer matches detector smoke")
    require_close(global12["miss_rate"], smoke_overall["miss_rate_iou50"], 1e-12, "EXP-0012 miss-rate no longer matches detector smoke")
    require_close(global12["duplicate_box_rate"], smoke_overall["duplicate_box_rate_iou50"], 1e-12, "EXP-0012 duplicate-rate no longer matches detector smoke")
    require_close(global12["background_fp_rate"], smoke_overall["background_fp_rate_iou50"], 1e-12, "EXP-0012 background-FP no longer matches detector smoke")
    require(global12["classification_map50"] > 0.85, "EXP-0012 oracle-class classification mAP unexpectedly weak.")
    require(global11["hybrid_proxy"] > global12["hybrid_proxy"], "Oracle-box bound should beat detector-box oracle-class bound.")

    summary = {
        "oracle_box_hybrid": global11["hybrid_proxy"],
        "detector_box_oracle_class_hybrid": global12["hybrid_proxy"],
        "detector_smoke_ap50": smoke_overall["ap50_ignore_class"],
        "detector_box_oracle_classification_map50": global12["classification_map50"],
    }
    add_check(checks, stage="oracle_bounds", check_id="bound_consistency", passed=True, details=summary)
    return summary


def known_gaps() -> list[dict[str, str]]:
    return [
        {
            "gap_id": "missing_shuffled_label_runs",
            "severity": "important",
            "why_it_matters": "Shuffled-label control artifacts now exist, but future supervised classifiers and multi-class detectors still need real shuffled-label training runs to prove collapse and rule out leakage.",
        },
        {
            "gap_id": "missing_supervised_crop_overfit_control",
            "severity": "important",
            "why_it_matters": "The future closed-set shelf-crop classifier should first memorize a tiny subset before any scaling runs are trusted.",
        },
        {
            "gap_id": "missing_multi_seed_stability_read",
            "severity": "important",
            "why_it_matters": "With only 248 images, one lucky run can mislead direction. At least 2-3 seed repeats are needed before promotion.",
        },
        {
            "gap_id": "missing_submission_contract_dry_run",
            "severity": "important",
            "why_it_matters": "A locally strong model is still not trustworthy until it passes the sandbox-like `run.py` contract and latency/size checks.",
        },
        {
            "gap_id": "missing_detector_recipe_ablation_matrix",
            "severity": "useful",
            "why_it_matters": "Current detector evidence is strong enough to continue, but we still need clean ablations for schedule/imgsz/augment choices before overfitting to one lucky recipe.",
        },
    ]


def build_summary() -> dict[str, Any]:
    checks: list[dict[str, Any]] = []

    prep_summary = verify_stage_prep(checks)
    eval_summary = verify_stage_eval_harness(checks)
    crop_summary = verify_stage_crop_recognition(checks)
    detector_summary = verify_stage_detector_learning(checks)
    detector_anchor_summary = verify_stage_detector_anchor(checks)
    pipeline_summary = verify_stage_first_pipeline(checks)
    oracle_summary = verify_stage_oracle_bounds(checks)

    summary = {
        "status": "ok",
        "data_date": DATA_DATE,
        "checks": checks,
        "stage_summaries": {
            "prep": {
                **prep_summary["verified_counts"],
                "optional_checks": prep_summary["optional_checks"],
            },
            "eval_harness": eval_summary,
            "crop_recognition": crop_summary,
            "detector_learning": detector_summary,
            "detector_anchor": detector_anchor_summary,
            "first_pipeline": pipeline_summary,
            "oracle_bounds": oracle_summary,
        },
        "known_gaps": known_gaps(),
        "operating_conclusions": [
            "Do not trust any new model family until empty/oracle controls and the relevant trivial baseline are checked on the same harness.",
            "Promote retrieval systems only if they beat both random and nearest-neighbor hash on the strict slice.",
            "Promote detectors only if they beat zero-shot floors, pass tiny overfit sanity, and survive oracle-bound consistency checks.",
            "Promote end-to-end pipeline changes only if detector-only invariants stay fixed or improve and the same-box oracle gap is interpreted explicitly.",
            "Treat oracle-box and oracle-class bounds as bottleneck-localization tools, not as final model scores.",
            "Do not spend downstream effort on OCR, classifier fusion, or submission packaging until upstream bottlenecks are shown with bounds and controls.",
        ],
    }
    return summary


def main() -> None:
    parser = argparse.ArgumentParser(description="Verify the end-to-end NorgesGruppen ML pipeline control surface.")
    parser.parse_args()
    summary = build_summary()
    write_json(ML_PIPELINE_VERIFICATION_JSON, summary)
    print(f"Wrote {ML_PIPELINE_VERIFICATION_JSON}")
    print("ML pipeline verification passed.")


if __name__ == "__main__":
    main()
