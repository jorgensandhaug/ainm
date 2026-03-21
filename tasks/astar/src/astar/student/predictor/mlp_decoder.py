"""MLP nonlinear decoder predictor.

Replaces the linear ridge decoder with a 2-layer MLP using only numpy.
The MLP maps from (spatial basis, prior logits, regime vector) to
terminal logit corrections (delta from prior).

Uses Adam optimizer, entropy-weighted MSE loss, and held-in round
training on analysis ground truth tensors.
"""

from __future__ import annotations

from collections.abc import Sequence

import numpy as np
from pydantic import Field

from astar.core.prediction import PredictionBundle
from astar.core.score import entropy_map
from astar.core.terrain import CLASS_COUNT
from astar.envs.types import build_round_context_from_detail
from astar.features.geometry import RoundFeatureBundle, compute_round_features
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    resolve_synthetic_episode_path,
)
from astar.history.episodes.build import build_round_episode
from astar.infra.api.dto import RoundDetail
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_analysis_records, read_round_record
from astar.observe.evidence import RoundEvidenceBundle
from astar.student.posterior.deepset_student import (
    _summary_vector_from_artifact,
    _summary_vector_from_evidence,
)
from astar.student.predictor.calibrate import apply_probability_floor, softmax_logits
from astar.student.predictor.historical_bucket import HistoricalBucketPriorPredictor
from astar.student.predictor.round import BaseRoundPredictor
from astar.student.predictor.summary_bank_decoder import (
    _round_ids_with_replays_and_analyses,
    _spatial_basis,
)
from astar.teacher.dynamics.hazard_teacher import HazardTeacher


def _standardize(features: np.ndarray) -> tuple[np.ndarray, np.ndarray]:
    means = np.mean(features, axis=0)
    scales = np.sqrt(np.maximum(np.var(features, axis=0), 1.0e-6))
    return means, scales


def _relu(x: np.ndarray) -> np.ndarray:
    return np.maximum(x, 0.0)


def _mlp_forward(
    x: np.ndarray,
    w1: np.ndarray,
    b1: np.ndarray,
    w2: np.ndarray,
    b2: np.ndarray,
) -> tuple[np.ndarray, np.ndarray]:
    """Forward pass through 2-layer MLP. Returns (output, hidden_activations)."""
    hidden = _relu(x @ w1 + b1)
    output = hidden @ w2 + b2
    return output, hidden


def _mlp_backward(
    x: np.ndarray,
    hidden: np.ndarray,
    d_output: np.ndarray,
    w1: np.ndarray,
    w2: np.ndarray,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Backward pass. Returns gradients (dw1, db1, dw2, db2)."""
    n = x.shape[0]
    dw2 = hidden.T @ d_output / n
    db2 = np.mean(d_output, axis=0)
    d_hidden = d_output @ w2.T
    d_hidden = d_hidden * (hidden > 0).astype(np.float64)  # ReLU grad
    dw1 = x.T @ d_hidden / n
    db1 = np.mean(d_hidden, axis=0)
    return dw1, db1, dw2, db2


def _train_mlp(
    features: np.ndarray,
    targets: np.ndarray,
    weights: np.ndarray,
    *,
    hidden_dim: int = 64,
    lr: float = 1e-3,
    epochs: int = 200,
    weight_decay: float = 1e-4,
    batch_size: int = 4096,
) -> tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """Train 2-layer MLP with Adam optimizer and weighted MSE loss."""
    n_features = features.shape[1]
    n_outputs = targets.shape[1]
    rng = np.random.RandomState(42)

    # Xavier initialization
    w1 = rng.randn(n_features, hidden_dim).astype(np.float64) * np.sqrt(2.0 / n_features)
    b1 = np.zeros(hidden_dim, dtype=np.float64)
    w2 = rng.randn(hidden_dim, n_outputs).astype(np.float64) * np.sqrt(2.0 / hidden_dim)
    b2 = np.zeros(n_outputs, dtype=np.float64)

    # Adam state
    beta1, beta2, eps = 0.9, 0.999, 1e-8
    m_w1 = np.zeros_like(w1)
    v_w1 = np.zeros_like(w1)
    m_b1 = np.zeros_like(b1)
    v_b1 = np.zeros_like(b1)
    m_w2 = np.zeros_like(w2)
    v_w2 = np.zeros_like(w2)
    m_b2 = np.zeros_like(b2)
    v_b2 = np.zeros_like(b2)

    n_samples = features.shape[0]
    # Normalize weights
    w_norm = weights / np.sum(weights) * n_samples

    for epoch in range(epochs):
        # Shuffle
        perm = rng.permutation(n_samples)
        for start in range(0, n_samples, batch_size):
            batch_idx = perm[start : start + batch_size]
            x_batch = features[batch_idx]
            t_batch = targets[batch_idx]
            w_batch = w_norm[batch_idx]

            output, hidden = _mlp_forward(x_batch, w1, b1, w2, b2)
            residual = output - t_batch
            # Weighted MSE gradient
            d_output = 2.0 * residual * w_batch[:, None] / len(batch_idx)

            dw1, db1_g, dw2, db2_g = _mlp_backward(x_batch, hidden, d_output, w1, w2)

            # Weight decay
            dw1 += weight_decay * w1
            dw2 += weight_decay * w2

            t = epoch * ((n_samples + batch_size - 1) // batch_size) + (start // batch_size) + 1

            for param, grad, m, v in [
                (w1, dw1, m_w1, v_w1),
                (b1, db1_g, m_b1, v_b1),
                (w2, dw2, m_w2, v_w2),
                (b2, db2_g, m_b2, v_b2),
            ]:
                m[:] = beta1 * m + (1 - beta1) * grad
                v[:] = beta2 * v + (1 - beta2) * grad ** 2
                m_hat = m / (1 - beta1 ** t)
                v_hat = v / (1 - beta2 ** t)
                param -= lr * m_hat / (np.sqrt(v_hat) + eps)

    return w1, b1, w2, b2


class MLPDecoderPredictor(BaseRoundPredictor):
    """MLP-based nonlinear decoder for terminal tensor prediction."""

    name: str = "f1_mlp_decoder_v01"
    base_predictor: HistoricalBucketPriorPredictor
    teacher: HazardTeacher

    # kNN bank for regime inference
    bank_round_ids: list[str] = Field(default_factory=list)
    bank_summary_matrix: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 1), dtype=np.float64),
    )
    bank_regime_matrix: np.ndarray = Field(
        default_factory=lambda: np.zeros((0, 1), dtype=np.float64),
    )
    summary_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    summary_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))
    k_neighbors: int = Field(default=7, ge=1)

    # MLP weights
    mlp_w1: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    mlp_b1: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    mlp_w2: np.ndarray = Field(default_factory=lambda: np.zeros((1, 1), dtype=np.float64))
    mlp_b2: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))

    # Feature normalization
    feature_means: np.ndarray = Field(default_factory=lambda: np.zeros(1, dtype=np.float64))
    feature_scales: np.ndarray = Field(default_factory=lambda: np.ones(1, dtype=np.float64))

    hidden_dim: int = Field(default=64, ge=4)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    summary_feature_variant: str = "basic"

    @classmethod
    def fit_from_workspace(
        cls,
        paths: WorkspacePaths,
        *,
        round_ids: Sequence[str] | None = None,
        policy_name: str = "coverage",
        budget: int = 50,
        samples_per_round: int = 4,
        k_neighbors: int = 7,
        model_name: str = "f1_mlp_decoder_v01",
        probability_floor: float = 0.01,
        hidden_dim: int = 64,
        lr: float = 1e-3,
        epochs: int = 200,
        weight_decay: float = 1e-4,
        summary_feature_variant: str = "basic",
        synthetic_dataset_name: str | None = None,
    ) -> MLPDecoderPredictor:
        selected = _round_ids_with_replays_and_analyses(paths, round_ids)
        if len(selected) < 2:
            raise ValueError("MLP decoder requires at least two analyzed rounds")

        # Build base predictor and teacher
        base_predictor = HistoricalBucketPriorPredictor.fit_from_workspace(
            paths,
            round_ids=list(selected),
            model_name=f"{model_name}__historical_bucket",
            probability_floor=probability_floor,
        )

        # Build teacher from round episodes
        from astar.history.episodes.build import build_round_episode as _build_episode
        episodes = [_build_episode(paths, rid) for rid in selected]
        teacher = HazardTeacher().fit(episodes)

        # Build summary bank for kNN
        dataset_name = synthetic_dataset_name or f"{model_name}__synthetic_live"
        dataset = build_synthetic_live_dataset(
            paths,
            dataset_name=dataset_name,
            policy_name=policy_name,
            budget=budget,
            samples_per_round=samples_per_round,
            round_ids=list(selected),
        )
        if dataset.index_path is None:
            raise ValueError("MLP decoder requires synthetic live dataset with index")

        import polars as pl
        from pathlib import Path
        from collections import defaultdict

        index_table = pl.read_parquet(dataset.index_path).filter(
            pl.col("round_id").is_in(selected),
        )

        round_summaries: dict[str, list[np.ndarray]] = defaultdict(list)
        round_regimes: dict[str, np.ndarray] = {}
        for row in index_table.iter_rows(named=True):
            episode_path = resolve_synthetic_episode_path(
                dataset.dataset_dir,
                Path(str(row["episode_path"])),
            )
            summary_vector, regime_vector = _summary_vector_from_artifact(
                episode_path,
                feature_variant=summary_feature_variant,
            )
            rid = str(row["round_id"])
            round_summaries[rid].append(summary_vector)
            round_regimes[rid] = regime_vector

        bank_round_ids: list[str] = []
        bank_vectors: list[np.ndarray] = []
        bank_regimes: list[np.ndarray] = []
        for rid in selected:
            if rid in round_summaries and round_summaries[rid]:
                mean_vec = np.mean(np.stack(round_summaries[rid], axis=0), axis=0)
                bank_round_ids.append(rid)
                bank_vectors.append(mean_vec)
                bank_regimes.append(round_regimes[rid])

        bank_matrix = np.stack(bank_vectors, axis=0)
        regime_matrix = np.stack(bank_regimes, axis=0)
        summary_means_val, summary_scales_val = _standardize(bank_matrix)
        normalized_bank = (bank_matrix - summary_means_val[None, :]) / summary_scales_val[None, :]

        # Collect training data for MLP
        design_rows: list[np.ndarray] = []
        target_rows: list[np.ndarray] = []
        weight_rows: list[np.ndarray] = []

        for round_id in selected:
            round_detail = read_round_record(paths, round_id).round
            analyses = read_analysis_records(paths, round_id)
            if not analyses:
                continue
            features = compute_round_features(round_detail)
            prior_bundle = base_predictor.build_prediction_bundle(round_detail, features)

            # Get regime for this round
            episode = build_round_episode(paths, round_id)
            regime = teacher.encode_round(episode)

            for seed_index, analysis_record in sorted(analyses.items()):
                _, spatial = _spatial_basis(round_detail, features, seed_index)
                ground_truth = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)
                prior_probs = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
                prior_logits = np.log(np.maximum(prior_probs, 1e-6))
                target_delta = np.log(np.maximum(ground_truth, 1e-6)) - prior_logits
                cell_weights = entropy_map(ground_truth).reshape(-1) + 0.05

                h, w, c = ground_truth.shape
                n_cells = h * w
                regime_broadcast = np.broadcast_to(
                    np.asarray(regime, dtype=np.float64)[None, :],
                    (n_cells, len(regime)),
                )
                # Feature: spatial + prior_logits + regime
                cell_features = np.concatenate([
                    spatial.reshape(n_cells, -1),
                    prior_logits.reshape(n_cells, c),
                    regime_broadcast,
                ], axis=1)

                design_rows.append(cell_features)
                target_rows.append(target_delta.reshape(n_cells, c))
                weight_rows.append(cell_weights.astype(np.float64))

        all_features = np.concatenate(design_rows, axis=0)
        all_targets = np.concatenate(target_rows, axis=0)
        all_weights = np.concatenate(weight_rows, axis=0)

        # Normalize features
        feat_means, feat_scales = _standardize(all_features)
        norm_features = (all_features - feat_means[None, :]) / feat_scales[None, :]

        # Subsample if too large (keep entropy-weighted importance sampling)
        max_train = 500_000
        if norm_features.shape[0] > max_train:
            rng = np.random.RandomState(42)
            sample_probs = all_weights / np.sum(all_weights)
            indices = rng.choice(norm_features.shape[0], size=max_train, replace=False, p=sample_probs)
            norm_features = norm_features[indices]
            all_targets = all_targets[indices]
            all_weights = all_weights[indices]

        # Train MLP
        w1, b1, w2, b2 = _train_mlp(
            norm_features,
            all_targets,
            all_weights,
            hidden_dim=hidden_dim,
            lr=lr,
            epochs=epochs,
            weight_decay=weight_decay,
        )

        return cls(
            name=model_name,
            base_predictor=base_predictor,
            teacher=teacher,
            bank_round_ids=bank_round_ids,
            bank_summary_matrix=normalized_bank,
            bank_regime_matrix=regime_matrix,
            summary_means=summary_means_val,
            summary_scales=summary_scales_val,
            k_neighbors=k_neighbors,
            mlp_w1=w1,
            mlp_b1=b1,
            mlp_w2=w2,
            mlp_b2=b2,
            feature_means=feat_means,
            feature_scales=feat_scales,
            hidden_dim=hidden_dim,
            probability_floor=probability_floor,
            summary_feature_variant=summary_feature_variant,
        )

    def _infer_regime(self, evidence: RoundEvidenceBundle | None) -> np.ndarray:
        """Infer regime vector from live evidence using kNN on summary bank."""
        if evidence is None or evidence.total_queries == 0 or self.bank_summary_matrix.shape[0] == 0:
            return np.mean(self.bank_regime_matrix, axis=0) if self.bank_regime_matrix.shape[0] > 0 else np.zeros(1)

        summary = _summary_vector_from_evidence(
            evidence,
            feature_variant=self.summary_feature_variant,
        )
        normalized = (summary - self.summary_means) / self.summary_scales
        distances = np.linalg.norm(self.bank_summary_matrix - normalized[None, :], axis=1)
        k = min(len(self.bank_round_ids), self.k_neighbors)
        order = np.argsort(distances)[:k]
        weights = 1.0 / np.clip(distances[order], 1e-6, None)
        weights = weights / np.sum(weights)
        return np.asarray(np.tensordot(weights, self.bank_regime_matrix[order], axes=(0, 0)))

    def build_prediction_bundle(
        self,
        round_detail: RoundDetail,
        features: RoundFeatureBundle,
        evidence: RoundEvidenceBundle | None = None,
    ) -> PredictionBundle:
        prior_bundle = self.base_predictor.build_prediction_bundle(round_detail, features)
        regime = self._infer_regime(evidence)

        predictions: dict[int, np.ndarray] = {}
        for seed_index in range(len(round_detail.initial_states)):
            _, spatial = _spatial_basis(round_detail, features, seed_index)
            prior_probs = np.asarray(prior_bundle.predictions_by_seed[seed_index], dtype=np.float64)
            prior_logits = np.log(np.maximum(prior_probs, 1e-6))

            h, w, c = prior_probs.shape
            n_cells = h * w
            regime_broadcast = np.broadcast_to(
                np.asarray(regime, dtype=np.float64)[None, :],
                (n_cells, len(regime)),
            )
            cell_features = np.concatenate([
                spatial.reshape(n_cells, -1),
                prior_logits.reshape(n_cells, c),
                regime_broadcast,
            ], axis=1)

            # Normalize
            norm_features = (cell_features - self.feature_means[None, :]) / self.feature_scales[None, :]

            # MLP forward
            delta, _ = _mlp_forward(norm_features, self.mlp_w1, self.mlp_b1, self.mlp_w2, self.mlp_b2)
            corrected_logits = prior_logits.reshape(n_cells, c) + delta
            probs = softmax_logits(corrected_logits.reshape(h, w, c))
            predictions[seed_index] = apply_probability_floor(probs, self.probability_floor)

        return PredictionBundle(
            round_id=round_detail.id,
            model_name=self.name,
            predictions_by_seed=predictions,
        )
