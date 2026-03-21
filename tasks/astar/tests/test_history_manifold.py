from __future__ import annotations

from astar.history.summaries.manifold import factorize_round_regime_manifold
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from tests.conftest import ROUND_ID
from tests.test_history_datasets import _write_replays_for_all_seeds


def test_factorize_round_regime_manifold_writes_summary_and_basis(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    manifold, summary_path, basis_path = factorize_round_regime_manifold(
        sample_paths,
        round_ids=[ROUND_ID],
        max_rank=2,
        summary_name="round_regime_manifold_test",
    )

    assert len(manifold.round_ids) == 1
    assert manifold.effective_rank == 1
    assert summary_path.exists()
    assert basis_path.exists()


def test_factorize_round_regime_manifold_v2_writes_summary_and_basis(
    sample_paths: RepoPaths,
) -> None:
    _write_replays_for_all_seeds(sample_paths, run_count=2)

    manifold, summary_path, basis_path = factorize_round_regime_manifold(
        sample_paths,
        round_ids=[ROUND_ID],
        max_rank=2,
        summary_name="round_regime_manifold_v2_test",
        summary_version="v2",
    )

    assert manifold.summary_version == "v2"
    assert len(manifold.round_ids) == 1
    assert manifold.effective_rank == 1
    assert len(manifold.reconstruction_rmse_by_rank) == 1
    assert summary_path.exists()
    assert basis_path.exists()
