from __future__ import annotations

import numpy as np

from astar.domain.validation import SubmissionSpec, validate_prediction_tensor
from astar.features.geometry import compute_round_features
from astar.models.geometry_baseline import GeometryPriorPredictor
from astar.models.latent_regime import LatentRegimePredictor
from astar.observe.evidence import build_round_evidence
from astar.storage.io_raw import read_round_record
from astar.storage.manifests import RepoPaths
from tests.conftest import ROUND_ID


def test_geometry_prior_predictor_builds_valid_prediction(sample_paths: RepoPaths) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    features = compute_round_features(round_record.round)
    predictor = GeometryPriorPredictor()
    bundle = predictor.build_prediction_bundle(round_record.round, features)

    prediction = bundle.predictions_by_seed[0]
    report = validate_prediction_tensor(
        prediction,
        SubmissionSpec(height=round_record.round.map_height, width=round_record.round.map_width),
    )

    assert report.classes == 6
    assert prediction.shape == (round_record.round.map_height, round_record.round.map_width, 6)


def test_latent_regime_predictor_uses_evidence(sample_paths: RepoPaths) -> None:
    round_record = read_round_record(sample_paths, ROUND_ID)
    features = compute_round_features(round_record.round)
    evidence = build_round_evidence(sample_paths, ROUND_ID)
    predictor = LatentRegimePredictor()

    posterior = predictor.infer_regime_posterior(round_record.round, features, evidence)
    bundle = predictor.build_prediction_bundle(round_record.round, features, evidence)

    assert posterior.evidence_queries == evidence.total_queries
    assert bundle.predictions_by_seed[0].shape[-1] == 6
    assert np.allclose(bundle.predictions_by_seed[0].sum(axis=-1), 1.0)
