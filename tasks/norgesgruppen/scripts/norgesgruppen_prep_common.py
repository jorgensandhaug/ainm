#!/usr/bin/env python3

from __future__ import annotations

import json
import re
import shutil
import unicodedata
from pathlib import Path
from typing import Any, Iterator


ROOT = Path(__file__).resolve().parents[1]
DATA_DATE = "2026-03-19"
DATA_ROOT = ROOT / "data" / DATA_DATE
EXTRACTED_ROOT = DATA_ROOT / "extracted"
COCO_ROOT = EXTRACTED_ROOT / "coco" / "train"
COCO_ANNOTATIONS = COCO_ROOT / "annotations.json"
COCO_IMAGES = COCO_ROOT / "images"
PRODUCT_ROOT = EXTRACTED_ROOT / "product_images"
PRODUCT_METADATA = PRODUCT_ROOT / "metadata.json"
MANUAL_REVIEW_DECISIONS = DATA_ROOT / "manual-review-decisions.json"
BLOCKED_SPLIT = DATA_ROOT / "section-blocked-val-split.json"
DOCS_ROOT = ROOT / "docs" / "norgesgruppen-data"
DEEP_AUDIT_JSON = DOCS_ROOT / "deep-audit-summary.json"
DERIVED_ROOT = DATA_ROOT / "derived"

PREP_OVERVIEW_JSON = DERIVED_ROOT / "prep-overview.json"
CATEGORY_MANIFEST_JSON = DERIVED_ROOT / "category-manifest.json"
CATEGORY_STRATEGY_MANIFEST_JSON = DERIVED_ROOT / "category-strategy-manifest.json"
IMAGE_MANIFEST_JSON = DERIVED_ROOT / "image-manifest.json"
IMAGE_SAMPLING_MANIFEST_JSON = DERIVED_ROOT / "image-sampling-manifest.json"
PACKSHOT_MANIFEST_JSON = DERIVED_ROOT / "packshot-manifest.json"
PROBLEM_CATEGORY_MANIFEST_JSON = DERIVED_ROOT / "problem-category-manifest.json"
ARTIFACT_INDEX_JSON = DERIVED_ROOT / "artifact-index.json"
TRAINING_MANIFEST_JSON = DERIVED_ROOT / "training-manifest.json"
GT_CROP_SUMMARY_JSON = DERIVED_ROOT / "gt-crop-summary.json"
GT_CROP_MANIFEST_JSONL = DERIVED_ROOT / "gt-crop-manifest.jsonl"
COCO_SPLIT_ROOT = DERIVED_ROOT / "coco-splits"
TRAIN_COCO_JSON = COCO_SPLIT_ROOT / "train.json"
VAL_COCO_JSON = COCO_SPLIT_ROOT / "val.json"
PREP_VERIFICATION_JSON = DERIVED_ROOT / "prep-verification.json"
ML_PIPELINE_VERIFICATION_JSON = DERIVED_ROOT / "ml-pipeline-verification.json"
CROP_CLASSIFIER_ROOT = DERIVED_ROOT / "crop-classifier"
CROP_CLASSIFIER_SUMMARY_JSON = CROP_CLASSIFIER_ROOT / "summary.json"
CROP_CLASSIFIER_CATEGORY_ROLE_JSON = CROP_CLASSIFIER_ROOT / "category-role-manifest.json"
CROP_CLASSIFIER_TRAIN_JSONL = CROP_CLASSIFIER_ROOT / "train-all.jsonl"
CROP_CLASSIFIER_VAL_JSONL = CROP_CLASSIFIER_ROOT / "val-all.jsonl"
CROP_CLASSIFIER_VAL_ZERO_TRAIN_SUPPORT_JSONL = CROP_CLASSIFIER_ROOT / "val-zero-train-support.jsonl"
CROP_CLASSIFIER_VAL_TRAIN_SEEN_JSONL = CROP_CLASSIFIER_ROOT / "val-train-seen.jsonl"
YOLO_ROOT = DERIVED_ROOT / "yolo"
YOLO_DATASET_YAML = YOLO_ROOT / "dataset.yaml"
YOLO_SUMMARY_JSON = YOLO_ROOT / "export-summary.json"
YOLO_VERIFICATION_JSON = YOLO_ROOT / "verification.json"
YOLO_CLASS_AGNOSTIC_ROOT = DERIVED_ROOT / "yolo-class-agnostic"
YOLO_CLASS_AGNOSTIC_DATASET_YAML = YOLO_CLASS_AGNOSTIC_ROOT / "dataset.yaml"
YOLO_CLASS_AGNOSTIC_SUMMARY_JSON = YOLO_CLASS_AGNOSTIC_ROOT / "export-summary.json"
YOLO_CLASS_AGNOSTIC_VERIFICATION_JSON = YOLO_CLASS_AGNOSTIC_ROOT / "verification.json"

INDEX_MD = DOCS_ROOT / "INDEX.md"
DATA_DICTIONARY_MD = DOCS_ROOT / "data-dictionary.md"
PREP_PLAYBOOK_MD = DOCS_ROOT / "prep-playbook.md"
MODELING_EXPERIMENT_PLAN_MD = DOCS_ROOT / "modeling-experiment-plan.md"
ML_VERIFICATION_PLAYBOOK_MD = DOCS_ROOT / "ml-verification-playbook.md"
PROJECT_OPERATING_SYSTEM_MD = DOCS_ROOT / "project-operating-system.md"
ROADMAP_PLAN_MD = DOCS_ROOT / "plans" / "PLAN-0001-roadmap-to-first-competitive-submission.md"
CRITICAL_PATH_PLAN_MD = DOCS_ROOT / "plans" / "PLAN-0003-critical-path-and-decision-tree-after-preflight.md"
CLASSIFIER_FUSION_PLAN_MD = DOCS_ROOT / "plans" / "PLAN-0004-classifier-and-fusion-strategy.md"
FIRST_CLASSIFIER_RECIPE_PLAN_MD = DOCS_ROOT / "plans" / "PLAN-0005-exp-0013a-first-classifier-recipe.md"
VALIDATION_DECISION_MD = DOCS_ROOT / "decisions" / "DEC-0001-freeze-validation-surface.md"
ML_VERIFICATION_DECISION_MD = DOCS_ROOT / "decisions" / "DEC-0004-freeze-ml-verification-gates.md"
EXPERIMENT_REGISTRY_JSON = DATA_ROOT / "experiments" / "experiment-registry.json"
IMMEDIATE_EXECUTION_PLAN_MD = DOCS_ROOT / "plans" / "PLAN-0002-immediate-execution-wave.md"


def read_json(path: Path) -> Any:
    return json.loads(path.read_text())


def write_json(path: Path, value: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2, ensure_ascii=False) + "\n")


def iter_jsonl(path: Path) -> Iterator[dict[str, Any]]:
    with path.open() as handle:
        for line in handle:
            if line.strip():
                yield json.loads(line)


def write_jsonl(path: Path, rows: list[dict[str, Any]]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w") as handle:
        for row in rows:
            handle.write(json.dumps(row, ensure_ascii=False) + "\n")


def normalize_name(value: str) -> str:
    value = unicodedata.normalize("NFKC", value).upper()
    value = re.sub(r"[^0-9A-ZÆØÅ]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def slugify(value: str) -> str:
    normalized = normalize_name(value)
    normalized = normalized.replace("Æ", "AE").replace("Ø", "O").replace("Å", "A")
    normalized = re.sub(r"[^0-9A-Z]+", "-", normalized)
    normalized = normalized.strip("-")
    return normalized.lower() or "empty-name"


def infer_theme(name: str) -> str:
    normalized = unicodedata.normalize("NFKC", name).upper()
    if any(
        token in normalized
        for token in [
            "KNEKKE",
            "WASA",
            "LEKSANDS",
            "FRIGGS",
            "RISKAKER",
            "MAISKAKER",
            "FLATBRØD",
            "RUGSPRØ",
            "SIGDAL",
            "FRØKRISP",
        ]
    ):
        return "knekkebrod"
    if any(
        token in normalized
        for token in [
            "KAFFE",
            "KOKMALT",
            "FILTERMALT",
            "PRESS",
            "BØNNER",
            "ESPRESSO",
            "LATTE",
            "CAPPUCC",
            "TE ",
            " TE",
            "NESCAFE",
            "DOLCE",
            "FRIELE",
            "EVERGOOD",
            "JACOBS",
            "ALI ",
            "ALI ORIGINAL",
            "O'BOY",
            "NESQUIK",
            "KAKAO",
            "SJOKOLADEDRIKK",
            "TODDY",
            "RETT I KOPPEN",
            "MOCHA",
            "FILTERPOSER",
            "KAFFEFILTER",
        ]
    ):
        return "varmedrikker"
    if any(token in normalized for token in ["EGG", "GÅRDSEGG", "FRITTGÅENDE", "PRIOR", "SUNNMØRSEGG", "VILJE", "VINGULMARK", "SOLEGG", "TOTEN"]):
        return "egg"
    if any(
        token in normalized
        for token in [
            "MÜSLI",
            "MUSLI",
            "GRYN",
            "FROKOST",
            "WEETABIX",
            "CORN",
            "LION",
            "CHEERIOS",
            "CINI",
            "CEREAL",
            "GRANOLA",
            "CRUESLI",
            "SMACKS",
            "POPS",
            "ALL-BRAN",
            "SPECIAL K",
            "HAVREFRAS",
            "SUPERGRØT",
            "HAVREGRØT",
            "MELLOMBAR",
            "PUFFET",
            "KORN",
            "QUINOA",
            "TRESOR",
        ]
    ):
        return "frokost"
    return "other"


def display_path(path: Path) -> str:
    resolved = path.resolve()
    try:
        return str(resolved.relative_to(ROOT))
    except ValueError:
        return str(resolved)


def reset_dir(path: Path) -> None:
    if path.exists():
        shutil.rmtree(path)
    path.mkdir(parents=True, exist_ok=True)


def ensure_hardlink_or_copy(source: Path, target: Path) -> str:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        target.unlink()
    try:
        target.hardlink_to(source)
        return "hardlink"
    except OSError:
        shutil.copy2(source, target)
        return "copy"
