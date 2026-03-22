"""Ensemble predictor that combines ffam_mode and kNN predictions.

Uses stacking: run both models, then combine with learned weights.
The weight can be fixed or per-cell adaptive.
"""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.prediction import PredictionBundle
from astar.core.terrain import CLASS_COUNT
from astar.features.geometry import RoundFeatureBundle
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.serialization.json_utils import to_jsonable
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.predictor.base import LiveInferenceContext
from astar.student.predictor.calibrate import apply_probability_floor
from astar.student.predictor.ffam_knn import FFAMKNNPredictor
from astar.student.predictor.ffam_knn_config import resolve_ffam_knn_config
from astar.student.predictor.ffam_mode import FFAMModePredictor
from astar.student.predictor.ffam_mode_config import resolve_ffam_mode_config
from astar.student.predictor.query_residual import (
    _round_ids_with_analyses_and_replays,
)
from astar.student.predictor.round import BaseRoundPredictor


class FFAMEnsembleConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    mode_model: str = "ffam_mode_v214"
    knn_model: str = "ffam_knn_v1"
    mode_weight: float = Field(default=0.85, ge=0.0, le=1.0)
    policy_name: str = "exploration_r3"
    samples_per_round: int = Field(default=6, ge=1)
    probability_floor: float = Field(default=0.0003, gt=0.0, lt=1.0)


FFAM_ENSEMBLE_CONFIGS: dict[str, FFAMEnsembleConfig] = {
    "ffam_ensemble_v1": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v1",
        mode_model="ffam_mode_v214",
        knn_model="ffam_knn_v1",
        mode_weight=0.90,
    ),
    "ffam_ensemble_v2": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v2",
        mode_model="ffam_mode_v214",
        knn_model="ffam_knn_v1",
        mode_weight=0.85,
    ),
    "ffam_ensemble_v3": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v3",
        mode_model="ffam_mode_v214",
        knn_model="ffam_knn_v1",
        mode_weight=0.80,
    ),
    "ffam_ensemble_v4": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v4",
        mode_model="ffam_mode_v234",  # 4 clusters (best R7)
        knn_model="ffam_knn_v1",
        mode_weight=0.90,
    ),
    "ffam_ensemble_v5": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v5",
        mode_model="ffam_mode_v214",
        knn_model="ffam_knn_v1",
        mode_weight=0.95,
    ),
    "ffam_ensemble_v6": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v6",
        mode_model="ffam_mode_v214",
        knn_model="ffam_knn_v1",
        mode_weight=0.97,
    ),
    "ffam_ensemble_v7": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v7",
        mode_model="ffam_mode_v214",
        knn_model="ffam_knn_v1",
        mode_weight=0.98,
    ),
    "ffam_ensemble_v8": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v8",
        mode_model="ffam_mode_v228",  # 3 clusters
        knn_model="ffam_knn_v1",
        mode_weight=0.95,
    ),
    "ffam_ensemble_v9": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v9",
        mode_model="ffam_mode_v234",  # 4 clusters (best R7)
        knn_model="ffam_knn_v1",
        mode_weight=0.95,
    ),
}


def available_ffam_ensemble_model_names() -> list[str]:
    return ["ffam_ensemble", *sorted(FFAM_ENSEMBLE_CONFIGS)]


def is_ffam_ensemble_model_name(model_name: str) -> bool:
    normalized = model_name.strip().lower()
    return normalized == "ffam_ensemble" or normalized in FFAM_ENSEMBLE_CONFIGS


def resolve_ffam_ensemble_config(
    model_name: str,
    *,
    policy_name: str | None = None,
    samples_per_round: int | None = None,
) -> FFAMEnsembleConfig:
    normalized = model_name.strip().lower()
    resolved_name = "ffam_ensemble_v1" if normalized == "ffam_ensemble" else normalized
    if resolved_name not in FFAM_ENSEMBLE_CONFIGS:
        raise ValueError(f"unsupported ffam ensemble model: {model_name}")
    config = FFAM_ENSEMBLE_CONFIGS[resolved_name]
    updates: dict[str, object] = {}
    if policy_name is not None:
        updates["policy_name"] = policy_name.strip().lower()
    if samples_per_round is not None:
        updates["samples_per_round"] = samples_per_round
    return config if not updates else config.model_copy(update=updates)


def ffam_ensemble_checkpoint_name(
    model_name: str,
    *,
    policy_name: str,
    samples_per_round: int | None = None,
) -> str:
    config = resolve_ffam_ensemble_config(
        model_name,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
    )
    suffix = f"{config.model_name}__policy={config.policy_name}"
    if config.samples_per_round != 1:
        suffix += f"__samples={config.samples_per_round}"
    return suffix


class FFAMEnsemblePredictor(BaseRoundPredictor):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    name: str = "ffam_ensemble_v1"
    mode_predictor: FFAMModePredictor
    knn_predictor: FFAMKNNPredictor
    mode_weight: float = Field(default=0.85, ge=0.0, le=1.0)
    probability_floor: float = Field(default=0.0003, gt=0.0, lt=1.0)

    @classmethod
    def fit_named_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        model_name: str,
        round_ids: list[str] | None = None,
        policy_name: str | None = None,
        samples_per_round: int | None = None,
    ) -> FFAMEnsemblePredictor:
        config = resolve_ffam_ensemble_config(
            model_name,
            policy_name=policy_name,
            samples_per_round=samples_per_round,
        )

        mode_predictor = FFAMModePredictor.fit_named_from_workspace(
            paths,
            model_name=config.mode_model,
            round_ids=round_ids,
            policy_name=config.policy_name,
            samples_per_round=config.samples_per_round,
        )

        knn_predictor = FFAMKNNPredictor.fit_named_from_workspace(
            paths,
            model_name=config.knn_model,
            round_ids=round_ids,
            policy_name=config.policy_name,
            samples_per_round=config.samples_per_round,
        )

        return cls(
            name=config.model_name,
            mode_predictor=mode_predictor,
            knn_predictor=knn_predictor,
            mode_weight=config.mode_weight,
            probability_floor=config.probability_floor,
        )

    def build_prediction_bundle_from_context(
        self,
        context: LiveInferenceContext,
    ) -> PredictionBundle:
        mode_bundle = self.mode_predictor.build_prediction_bundle_from_context(context)
        knn_bundle = self.knn_predictor.build_prediction_bundle_from_context(context)

        blended: dict[int, np.ndarray] = {}
        for seed_index in mode_bundle.predictions_by_seed:
            mode_pred = np.asarray(mode_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            knn_pred = np.asarray(knn_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            combined = self.mode_weight * mode_pred + (1.0 - self.mode_weight) * knn_pred
            blended[seed_index] = apply_probability_floor(combined, self.probability_floor)

        return PredictionBundle(
            round_id=mode_bundle.round_id,
            model_name=self.name,
            predictions_by_seed=blended,
        )

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        mode_bundle = self.mode_predictor.build_prediction_bundle(round_detail, features, evidence)
        knn_bundle = self.knn_predictor.build_prediction_bundle(round_detail, features, evidence)

        blended: dict[int, np.ndarray] = {}
        for seed_index in mode_bundle.predictions_by_seed:
            mode_pred = np.asarray(mode_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            knn_pred = np.asarray(knn_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            combined = self.mode_weight * mode_pred + (1.0 - self.mode_weight) * knn_pred
            blended[seed_index] = apply_probability_floor(combined, self.probability_floor)

        return PredictionBundle(
            round_id=mode_bundle.round_id,
            model_name=self.name,
            predictions_by_seed=blended,
        )

    def save_checkpoint(self, path: Path) -> Path:
        path.parent.mkdir(parents=True, exist_ok=True)
        mode_cp = self.mode_predictor.save_checkpoint(path.parent / "mode_predictor" / "checkpoint.json")
        knn_cp = self.knn_predictor.save_checkpoint(path.parent / "knn_predictor" / "checkpoint.json")
        meta = {
            "name": self.name,
            "mode_weight": self.mode_weight,
            "probability_floor": self.probability_floor,
            "mode_checkpoint_path": str(mode_cp),
            "knn_checkpoint_path": str(knn_cp),
        }
        path.write_text(json.dumps(meta, indent=2), encoding="utf-8")
        return path

    @classmethod
    def load_checkpoint(cls, path: Path) -> FFAMEnsemblePredictor:
        meta = json.loads(path.read_text(encoding="utf-8"))
        mode_predictor = FFAMModePredictor.load_checkpoint(Path(meta["mode_checkpoint_path"]))
        knn_predictor = FFAMKNNPredictor.load_checkpoint(Path(meta["knn_checkpoint_path"]))
        return cls(
            name=meta["name"],
            mode_predictor=mode_predictor,
            knn_predictor=knn_predictor,
            mode_weight=meta["mode_weight"],
            probability_floor=meta["probability_floor"],
        )
