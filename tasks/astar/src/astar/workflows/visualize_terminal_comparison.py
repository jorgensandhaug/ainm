from __future__ import annotations

import numpy as np

from astar.history.replay.ingest import load_seed_replay_runs
from astar.infra.api.client import AstarApiClient
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import load_named_arrays, read_analysis_record, read_round_record
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.workflows.fetch_analysis import fetch_analysis
from astar.workflows.results import VisualizationReportResult
from astar.workflows.summarize_replays import summarize_round_replays
from astar.workflows.visualize_prediction_comparison import write_prediction_comparison_report


def _load_replay_terminal_probs(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
) -> tuple[np.ndarray, int]:
    summary_path = paths.replay_summary_path(round_id, seed_index)
    if not summary_path.exists():
        summarize_round_replays(paths, round_id)
    payload = load_named_arrays(paths.replay_summary_path(round_id, seed_index))
    return (
        np.asarray(payload["mean_terminal_probs"], dtype=np.float64),
        int(payload["replay_run_count"][0]),
    )


def visualize_terminal_comparison(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
    client: AstarApiClient | None = None,
) -> VisualizationReportResult:
    round_record = read_round_record(paths, round_id)
    if seed_index >= round_record.round.seeds_count:
        msg = f"seed_index {seed_index} out of range for round {round_id}"
        raise ValueError(msg)

    replay_tensor, replay_run_count = _load_replay_terminal_probs(paths, round_id, seed_index)
    analysis_path = paths.raw_analysis_dir(round_id) / f"seed_index={seed_index}.json"
    if not analysis_path.exists():
        if client is None:
            msg = (
                f"analysis missing for round {round_id} seed {seed_index}; "
                "run `astar fetch-analysis ...` first"
            )
            raise FileNotFoundError(msg)
        fetch_analysis(paths, client, round_id, seed_index)
    analysis_record = read_analysis_record(paths, round_id, seed_index)
    ground_truth = np.asarray(analysis_record.analysis.ground_truth, dtype=np.float64)

    initial_state = round_record.round.initial_states[seed_index]
    initial_grid = np.asarray(initial_state.grid, dtype=np.int64)

    report_dir = paths.report_dir(round_id) / f"seed_index={seed_index}" / "terminal_comparison"
    replay_runs = load_seed_replay_runs(paths, round_id, seed_index)
    result = write_prediction_comparison_report(
        report_key="terminal_comparison",
        title=f"Terminal Comparison Round {round_record.round.round_number} Seed {seed_index}",
        report_dir=report_dir,
        round_id=round_id,
        seed_index=seed_index,
        initial_grid=initial_grid,
        settlements=[(item.x, item.y, item.has_port) for item in initial_state.settlements],
        left_tensor=replay_tensor,
        right_tensor=ground_truth,
        left_name="replay aggregate",
        right_name="ground truth",
        left_key="replay",
        right_key="ground_truth",
        metadata={
            "round_number": round_record.round.round_number,
            "replay_run_count": replay_run_count,
            "replay_source": str(paths.replay_summary_path(round_id, seed_index)),
            "analysis_source": str(paths.raw_analysis_dir(round_id) / f"seed_index={seed_index}.json"),
            "score": analysis_record.analysis.score,
            "replay_frame_count": (len(replay_runs[0].frames) if replay_runs else None),
        },
    )
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="visualization_built",
            round_id=round_id,
            seed_index=seed_index,
            status="ok",
            artifact_path=result.manifest_path,
            payload_json=to_jsonable(result),
            spec_name=result.report_key,
        ),
    )
    return result


__all__ = ["visualize_terminal_comparison"]
