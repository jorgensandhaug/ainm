from __future__ import annotations

import json

from astar.workflows.event_regime_posterior_audit import run_event_regime_posterior_audit
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from tests.conftest import ROUND_ID
from tests.test_historical_bucket_baseline import _write_sample_analysis
from tests.test_history_datasets import _write_replays_for_all_seeds

ROUND_ID_2 = "00000000-0000-0000-0000-000000000002"


def _duplicate_round_fixture(
    paths: RepoPaths,
    *,
    source_round_id: str,
    target_round_id: str,
    round_number: int,
) -> None:
    round_payload = json.loads(paths.raw_round_path(source_round_id).read_text(encoding="utf-8"))
    round_payload["round"]["id"] = target_round_id
    round_payload["round"]["round_number"] = round_number
    paths.raw_round_path(target_round_id).write_text(
        json.dumps(round_payload, indent=2),
        encoding="utf-8",
    )

    target_query_dir = paths.raw_query_dir(target_round_id)
    target_query_dir.mkdir(parents=True, exist_ok=True)
    for source_path in sorted(paths.raw_query_dir(source_round_id).glob("*.json")):
        payload = json.loads(source_path.read_text(encoding="utf-8"))
        payload["request"]["round_id"] = target_round_id
        (target_query_dir / source_path.name).write_text(
            json.dumps(payload, indent=2),
            encoding="utf-8",
        )


def test_event_regime_posterior_audit_runs_on_two_round_sample(sample_paths: RepoPaths) -> None:
    _duplicate_round_fixture(
        sample_paths,
        source_round_id=ROUND_ID,
        target_round_id=ROUND_ID_2,
        round_number=2,
    )
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID_2)

    result = run_event_regime_posterior_audit(
        sample_paths,
        dataset_name="synthetic_live_regime_posterior_test",
        audit_name="event_regime_posterior_test",
        policy_name="coverage",
        samples_per_round=1,
        budget=2,
        k_neighbors=1,
        birth_dataset_name="birth_riskset_regime_posterior_test",
        collapse_dataset_name="collapse_riskset_regime_posterior_test",
    )

    assert result.round_count == 2
    assert result.episode_count == 2
    assert result.budget == 2
    assert result.target_names == ["birth_logit_rate", "collapse_logit_rate"]
    assert result.artifact_path.exists()
    assert result.report_path.exists()


def test_event_regime_posterior_audit_supports_collapse_portsplit_family(
    sample_paths: RepoPaths,
) -> None:
    _duplicate_round_fixture(
        sample_paths,
        source_round_id=ROUND_ID,
        target_round_id=ROUND_ID_2,
        round_number=2,
    )
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID_2)

    result = run_event_regime_posterior_audit(
        sample_paths,
        dataset_name="synthetic_live_regime_posterior_portsplit_test",
        audit_name="event_regime_posterior_portsplit_test",
        policy_name="coverage",
        samples_per_round=1,
        budget=2,
        k_neighbors=1,
        collapse_dataset_name="collapse_riskset_regime_posterior_portsplit_test",
        target_family="collapse_portsplit",
    )

    assert result.target_family == "collapse_portsplit"
    assert result.target_names == [
        "collapse_logit_rate",
        "collapse_logit_port",
        "collapse_logit_nonport",
        "collapse_pos_port_share_logit",
    ]
    assert result.standardized_mae_gain == result.standardized_baseline_mae - result.standardized_knn_mae


def test_event_regime_posterior_audit_supports_collapse_timing_stress_family(
    sample_paths: RepoPaths,
) -> None:
    _duplicate_round_fixture(
        sample_paths,
        source_round_id=ROUND_ID,
        target_round_id=ROUND_ID_2,
        round_number=2,
    )
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID_2)

    result = run_event_regime_posterior_audit(
        sample_paths,
        dataset_name="synthetic_live_regime_posterior_collapse_stress_test",
        audit_name="event_regime_posterior_collapse_stress_test",
        policy_name="coverage",
        samples_per_round=1,
        budget=2,
        k_neighbors=1,
        collapse_dataset_name="collapse_riskset_regime_posterior_collapse_stress_test",
        target_family="collapse_timing_stress",
    )

    assert result.target_family == "collapse_timing_stress"
    assert result.target_names == [
        "collapse_logit_rate",
        "collapse_mean_year",
        "collapse_std_year",
        "collapse_early_share_logit",
        "collapse_late_share_logit",
        "collapse_food_before_mean",
        "collapse_defense_before_mean",
        "collapse_population_before_mean",
    ]


def test_event_regime_posterior_audit_supports_stress_summary_features(
    sample_paths: RepoPaths,
) -> None:
    _duplicate_round_fixture(
        sample_paths,
        source_round_id=ROUND_ID,
        target_round_id=ROUND_ID_2,
        round_number=2,
    )
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID)
    _write_replays_for_all_seeds(sample_paths, run_count=2, round_id=ROUND_ID_2)

    result = run_event_regime_posterior_audit(
        sample_paths,
        dataset_name="synthetic_live_regime_posterior_stress_features_test",
        audit_name="event_regime_posterior_stress_features_test",
        policy_name="coverage",
        samples_per_round=1,
        budget=2,
        k_neighbors=1,
        collapse_dataset_name="collapse_riskset_regime_posterior_stress_features_test",
        target_family="collapse_portsplit",
        summary_feature_variant="stress_v1",
    )

    assert result.summary_feature_variant == "stress_v1"
    assert result.target_family == "collapse_portsplit"


def test_event_regime_posterior_audit_supports_collapse_terminal_shock_family(
    sample_paths: RepoPaths,
) -> None:
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

    result = run_event_regime_posterior_audit(
        sample_paths,
        dataset_name="synthetic_live_regime_posterior_collapse_terminal_shock_test",
        audit_name="event_regime_posterior_collapse_terminal_shock_test",
        policy_name="coverage",
        samples_per_round=1,
        budget=2,
        k_neighbors=1,
        collapse_dataset_name="collapse_riskset_regime_posterior_collapse_terminal_shock_test",
        target_family="collapse_terminal_shock",
    )

    assert result.target_family == "collapse_terminal_shock"
    assert result.target_names == [
        "collapse_logit_rate",
        "collapse_port_gap_logit",
        "collapse_food_gap_z",
        "collapse_defense_gap_z",
        "collapse_timing_skew",
        "ruin_buildable_mean",
        "ruin_coast_mean",
        "port_coast_mean",
        "live_buildable_mean",
    ]
