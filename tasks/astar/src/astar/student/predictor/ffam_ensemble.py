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
from astar.student.predictor.ffam_knn_config import is_ffam_knn_model_name, resolve_ffam_knn_config
from astar.student.predictor.ffam_mode import FFAMModePredictor
from astar.student.predictor.ffam_mode_config import resolve_ffam_mode_config
from astar.student.predictor.ffam_pooled import FFAMPooledPredictor
from astar.student.predictor.ffam_pooled_config import is_ffam_pooled_model_name, resolve_ffam_pooled_config
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
    adaptive_blend: bool = False
    adaptive_scale: float = Field(default=1.0, ge=0.0)
    blend_space: str = "probability"  # "probability" or "logodds"


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
    # v10: Try different kNN component
    "ffam_ensemble_v10": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v10",
        mode_model="ffam_mode_v234",  # 4 clusters
        knn_model="ffam_knn_v1",
        mode_weight=0.97,
    ),
    # v11: 4-cluster mode + 3% kNN (finer blend for the best mode)
    "ffam_ensemble_v11": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v11",
        mode_model="ffam_mode_v234",  # 4 clusters
        knn_model="ffam_knn_v1",
        mode_weight=0.93,
    ),
    # v12: 4c mode + 4% kNN + slightly different params
    "ffam_ensemble_v12": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v12",
        mode_model="ffam_mode_v234",
        knn_model="ffam_knn_v1",
        mode_weight=0.96,
    ),
    # v13: v214 + 4% kNN
    "ffam_ensemble_v13": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v13",
        mode_model="ffam_mode_v214",
        knn_model="ffam_knn_v1",
        mode_weight=0.96,
    ),
    # v14: 4c + 3-seed MLP + 5% kNN (combine internal + external ensemble)
    "ffam_ensemble_v14": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v14",
        mode_model="ffam_mode_v248",  # 4c + 3-seed MLP
        knn_model="ffam_knn_v1",
        mode_weight=0.95,
    ),
    # v15-v17: Adaptive blending (more kNN where mode is uncertain)
    "ffam_ensemble_v15": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v15",
        mode_model="ffam_mode_v248",  # 4c + 3-seed MLP
        knn_model="ffam_knn_v1",
        mode_weight=0.90,
        adaptive_blend=True,
        adaptive_scale=1.0,
    ),
    "ffam_ensemble_v16": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v16",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.85,
        adaptive_blend=True,
        adaptive_scale=0.5,
    ),
    "ffam_ensemble_v17": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v17",
        mode_model="ffam_mode_v234",  # 4c without multi-seed
        knn_model="ffam_knn_v1",
        mode_weight=0.90,
        adaptive_blend=True,
        adaptive_scale=1.0,
    ),
    # v18-v20: Sweep adaptive scale with best setup (3-seed, 4c)
    "ffam_ensemble_v18": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v18",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.92,
        adaptive_blend=True,
        adaptive_scale=1.0,
    ),
    "ffam_ensemble_v19": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v19",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.88,
        adaptive_blend=True,
        adaptive_scale=1.0,
    ),
    "ffam_ensemble_v20": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v20",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.90,
        adaptive_blend=True,
        adaptive_scale=1.5,
    ),
    # v21-v23: Higher adaptive scales
    "ffam_ensemble_v21": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v21",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.90,
        adaptive_blend=True,
        adaptive_scale=2.0,
    ),
    "ffam_ensemble_v22": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v22",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.88,
        adaptive_blend=True,
        adaptive_scale=1.5,
    ),
    "ffam_ensemble_v23": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v23",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.92,
        adaptive_blend=True,
        adaptive_scale=2.0,
    ),
    "ffam_ensemble_v24": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v24",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.90,
        adaptive_blend=True,
        adaptive_scale=3.0,
    ),
    # v25: Use pooled predictor instead of kNN (different diversity source)
    "ffam_ensemble_v25": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v25",
        mode_model="ffam_mode_v248",
        knn_model="ffam_pooled_v1",
        mode_weight=0.88,
        adaptive_blend=True,
        adaptive_scale=1.5,
    ),
    # v26: Fine-tune around champion: mode_weight=0.87
    "ffam_ensemble_v26": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v26",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.87,
        adaptive_blend=True,
        adaptive_scale=1.5,
    ),
    # v27: Fine-tune: mode_weight=0.89
    "ffam_ensemble_v27": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v27",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.89,
        adaptive_blend=True,
        adaptive_scale=1.5,
    ),
    # v28: Use improved kNN v7 (k=150, bw=1.5)
    "ffam_ensemble_v28": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v28",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v7",
        mode_weight=0.88,
        adaptive_blend=True,
        adaptive_scale=1.5,
    ),
    # v29: Large MLP (h=128) + adaptive kNN
    "ffam_ensemble_v29": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v29",
        mode_model="ffam_mode_v251",
        knn_model="ffam_knn_v1",
        mode_weight=0.88,
        adaptive_blend=True,
        adaptive_scale=1.5,
    ),
    # v30: Use 2-cluster mode (v214) + adaptive kNN (compare cluster effect in ensemble)
    "ffam_ensemble_v30": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v30",
        mode_model="ffam_mode_v214",
        knn_model="ffam_knn_v1",
        mode_weight=0.88,
        adaptive_blend=True,
        adaptive_scale=1.5,
    ),
    # v31-v32: Log-odds space blending (different from probability space)
    "ffam_ensemble_v31": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v31",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.88,
        adaptive_blend=True,
        adaptive_scale=1.5,
        blend_space="logodds",
    ),
    "ffam_ensemble_v32": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v32",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.90,
        adaptive_blend=True,
        adaptive_scale=1.5,
        blend_space="logodds",
    ),
    # v33-v38: Log-odds sweep (BEST DIRECTION!)
    "ffam_ensemble_v33": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v33",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.85,
        adaptive_blend=True,
        adaptive_scale=1.5,
        blend_space="logodds",
    ),
    "ffam_ensemble_v34": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v34",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.92,
        adaptive_blend=True,
        adaptive_scale=1.5,
        blend_space="logodds",
    ),
    "ffam_ensemble_v35": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v35",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.88,
        adaptive_blend=True,
        adaptive_scale=2.0,
        blend_space="logodds",
    ),
    "ffam_ensemble_v36": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v36",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.88,
        adaptive_blend=True,
        adaptive_scale=1.0,
        blend_space="logodds",
    ),
    "ffam_ensemble_v37": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v37",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.88,
        adaptive_blend=False,
        blend_space="logodds",
    ),
    "ffam_ensemble_v38": FFAMEnsembleConfig(
        model_name="ffam_ensemble_v38",
        mode_model="ffam_mode_v248",
        knn_model="ffam_knn_v1",
        mode_weight=0.95,
        adaptive_blend=True,
        adaptive_scale=1.5,
        blend_space="logodds",
    ),
    # Agent6 novel: use our a6_v19 (slower MLP) with kNN
    "ffam_ensemble_a6_v1": FFAMEnsembleConfig(
        model_name="ffam_ensemble_a6_v1",
        mode_model="ffam_mode_a6_v19",  # slower MLP training
        knn_model="ffam_knn_v1",
        mode_weight=0.95,
    ),
    # Agent6 novel: a6_v23 (v19 + 3 clusters) with kNN
    "ffam_ensemble_a6_v2": FFAMEnsembleConfig(
        model_name="ffam_ensemble_a6_v2",
        mode_model="ffam_mode_a6_v23",  # v19 + 3 clusters
        knn_model="ffam_knn_v1",
        mode_weight=0.95,
    ),
    # Agent6 novel: a6_v24 (v19 + 4 clusters) with kNN
    "ffam_ensemble_a6_v3": FFAMEnsembleConfig(
        model_name="ffam_ensemble_a6_v3",
        mode_model="ffam_mode_a6_v24",  # v19 + 4 clusters
        knn_model="ffam_knn_v1",
        mode_weight=0.95,
    ),
    # Agent6 novel: a6_v25 (3-seed MLP ensemble) with kNN
    "ffam_ensemble_a6_v4": FFAMEnsembleConfig(
        model_name="ffam_ensemble_a6_v4",
        mode_model="ffam_mode_a6_v25",  # 3-seed MLP ensemble
        knn_model="ffam_knn_v1",
        mode_weight=0.95,
    ),
    # Agent6 further exploration around a6_v1 (best so far)
    # a6_v5: v19 + kNN at 93/7 blend
    "ffam_ensemble_a6_v5": FFAMEnsembleConfig(
        model_name="ffam_ensemble_a6_v5",
        mode_model="ffam_mode_a6_v19",
        knn_model="ffam_knn_v1",
        mode_weight=0.93,
    ),
    # a6_v6: v19 + kNN at 97/3 blend
    "ffam_ensemble_a6_v6": FFAMEnsembleConfig(
        model_name="ffam_ensemble_a6_v6",
        mode_model="ffam_mode_a6_v19",
        knn_model="ffam_knn_v1",
        mode_weight=0.97,
    ),
    # a6_v7: v19 + kNN at 96/4 blend
    "ffam_ensemble_a6_v7": FFAMEnsembleConfig(
        model_name="ffam_ensemble_a6_v7",
        mode_model="ffam_mode_a6_v19",
        knn_model="ffam_knn_v1",
        mode_weight=0.96,
    ),
    # a6_v8: v19 + kNN at 94/6 blend
    "ffam_ensemble_a6_v8": FFAMEnsembleConfig(
        model_name="ffam_ensemble_a6_v8",
        mode_model="ffam_mode_a6_v19",
        knn_model="ffam_knn_v1",
        mode_weight=0.94,
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
    knn_predictor: BaseRoundPredictor  # Can be kNN or pooled or any BaseRoundPredictor
    mode_weight: float = Field(default=0.85, ge=0.0, le=1.0)
    probability_floor: float = Field(default=0.0003, gt=0.0, lt=1.0)
    adaptive_blend: bool = False
    adaptive_scale: float = Field(default=1.0, ge=0.0)
    blend_space: str = "probability"

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

        if is_ffam_pooled_model_name(config.knn_model):
            knn_predictor: BaseRoundPredictor = FFAMPooledPredictor.fit_named_from_workspace(
                paths,
                model_name=config.knn_model,
                round_ids=round_ids,
                policy_name=config.policy_name,
                samples_per_round=config.samples_per_round,
            )
        else:
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
            adaptive_blend=config.adaptive_blend,
            adaptive_scale=config.adaptive_scale,
            blend_space=config.blend_space,
        )

    def _blend_predictions(
        self,
        mode_pred: np.ndarray,
        knn_pred: np.ndarray,
    ) -> np.ndarray:
        if not self.adaptive_blend:
            return self.mode_weight * mode_pred + (1.0 - self.mode_weight) * knn_pred

        # Adaptive blending: where mode prediction is less confident, use more kNN
        mode_entropy = -np.sum(
            mode_pred * np.log(np.clip(mode_pred, 1e-10, 1.0)),
            axis=-1, keepdims=True,
        ) / np.log(6.0)  # normalized to [0, 1]

        # Higher entropy → lower confidence → more kNN weight
        effective_mode_weight = np.clip(
            self.mode_weight + (1.0 - self.mode_weight) * (1.0 - self.adaptive_scale * mode_entropy),
            0.5,
            1.0,
        )
        return effective_mode_weight * mode_pred + (1.0 - effective_mode_weight) * knn_pred

    def _blend_logodds(
        self,
        mode_pred: np.ndarray,
        knn_pred: np.ndarray,
    ) -> np.ndarray:
        """Blend in log-odds space instead of probability space."""
        floor = 1e-6
        mode_log = np.log(np.clip(mode_pred, floor, 1.0))
        knn_log = np.log(np.clip(knn_pred, floor, 1.0))

        if self.adaptive_blend:
            mode_entropy = -np.sum(
                mode_pred * np.log(np.clip(mode_pred, 1e-10, 1.0)),
                axis=-1, keepdims=True,
            ) / np.log(6.0)
            effective_mode_weight = np.clip(
                self.mode_weight + (1.0 - self.mode_weight) * (1.0 - self.adaptive_scale * mode_entropy),
                0.5,
                1.0,
            )
        else:
            effective_mode_weight = self.mode_weight

        blended_log = effective_mode_weight * mode_log + (1.0 - effective_mode_weight) * knn_log
        blended = np.exp(blended_log)
        blended = blended / np.sum(blended, axis=-1, keepdims=True)
        return blended

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
            if self.blend_space == "logodds":
                combined = self._blend_logodds(mode_pred, knn_pred)
            else:
                combined = self._blend_predictions(mode_pred, knn_pred)
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
            combined = self._blend_predictions(mode_pred, knn_pred)
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
            "adaptive_blend": self.adaptive_blend,
            "adaptive_scale": self.adaptive_scale,
            "blend_space": self.blend_space,
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
            adaptive_blend=meta.get("adaptive_blend", False),
            adaptive_scale=meta.get("adaptive_scale", 1.0),
            blend_space=meta.get("blend_space", "probability"),
        )
