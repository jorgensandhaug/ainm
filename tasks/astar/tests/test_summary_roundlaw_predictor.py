from __future__ import annotations

import numpy as np

from astar.cli import build_parser
from astar.features.geometry import compute_round_features
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record
from astar.observe.evidence import build_round_evidence
from astar.student.predictor.interactive import build_online_predictor
from astar.student.predictor.summary_roundlaw import SummaryRoundLawPredictor
from tests.conftest import ROUND_ID
from tests.test_event_regime_posterior_audit import ROUND_ID_2, _duplicate_round_fixture
from tests.test_historical_bucket_baseline import _write_sample_analysis
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_summary_roundlaw_predictor_smoke(sample_paths: RepoPaths) -> None:
    _duplicate_round_fixture(
        sample_paths,
        source_round_id=ROUND_ID,
        target_round_id=ROUND_ID_2,
        round_number=2,
    )
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID_2)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID_2, seed_index=0)

    predictor = SummaryRoundLawPredictor.fit_from_workspace(
        sample_paths,
        round_ids=[ROUND_ID, ROUND_ID_2],
        policy_name="coverage",
        budget=2,
        samples_per_round=1,
        k_neighbors=1,
        model_name="summary_roundlaw_predictor_test",
        synthetic_dataset_name="summary_roundlaw_predictor_test_synth",
    )

    round_detail = read_round_record(sample_paths, ROUND_ID).round
    features = compute_round_features(round_detail)
    evidence = build_round_evidence(sample_paths, ROUND_ID)
    bundle = predictor.build_prediction_bundle(round_detail, features, evidence)

    assert set(bundle.predictions_by_seed) == {0, 1, 2, 3, 4}
    for prediction in bundle.predictions_by_seed.values():
        assert prediction.shape[-1] == 6
        assert np.allclose(prediction.sum(axis=-1), 1.0)


def test_build_online_predictor_supports_summary_roundlaw_models(sample_paths: RepoPaths) -> None:
    _duplicate_round_fixture(
        sample_paths,
        source_round_id=ROUND_ID,
        target_round_id=ROUND_ID_2,
        round_number=2,
    )
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID_2)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID, seed_index=0)
    _write_sample_analysis(sample_paths, round_id=ROUND_ID_2, seed_index=0)

    adapter = build_online_predictor(
        "f1_summary_roundlaw_v01",
        paths=sample_paths,
        historical_round_ids=[ROUND_ID, ROUND_ID_2],
    )

    assert adapter.name == "f1_summary_roundlaw_v01"


def test_cli_parser_accepts_summary_roundlaw_models() -> None:
    parser = build_parser()

    parsed = parser.parse_args(
        [
            "run-historical-benchmark",
            "--model",
            "f1_summary_roundlaw_v01",
            "--mode",
            "online_interactive",
        ],
    )
    assert parsed.model == "f1_summary_roundlaw_v01"

    parsed_k1 = parser.parse_args(
        [
            "run-historical-benchmark",
            "--model",
            "f1_summary_roundlaw_k1_v01",
            "--mode",
            "online_interactive",
        ],
    )
    assert parsed_k1.model == "f1_summary_roundlaw_k1_v01"

    parsed_r2 = parser.parse_args(
        [
            "run-historical-benchmark",
            "--model",
            "f1_summary_roundlaw_r2_v01",
            "--mode",
            "online_interactive",
        ],
    )
    assert parsed_r2.model == "f1_summary_roundlaw_r2_v01"
