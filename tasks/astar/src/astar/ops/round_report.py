from __future__ import annotations

from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict

from astar.baselines.static_semantic import (
    build_static_semantic_prediction,
    default_static_semantic_config,
)
from astar.domain.geometry import MapShape
from astar.domain.validation import SubmissionSpec, validate_prediction_tensor
from astar.storage.io_raw import read_query_records, read_round_record
from astar.storage.io_tensors import save_prediction_tensor
from astar.storage.manifests import RepoPaths
from astar.viz.coverage import plot_query_coverage
from astar.viz.entropy import plot_entropy_heatmap
from astar.viz.maps import plot_argmax_prediction, plot_initial_state


class RoundReportArtifacts(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    report_path: Path
    initial_map_path: Path
    coverage_path: Path
    baseline_path: Path
    entropy_path: Path


def build_round_report(paths: RepoPaths, round_id: str, seed_index: int) -> RoundReportArtifacts:
    round_record = read_round_record(paths, round_id)
    query_files = [
        item
        for item in read_query_records(paths, round_id)
        if item.record.request.seed_index == seed_index
    ]
    report_dir = paths.report_dir(round_id) / f"seed_index={seed_index}"
    report_dir.mkdir(parents=True, exist_ok=True)

    initial_state = round_record.round.initial_states[seed_index]
    initial_grid = np.asarray(initial_state.grid, dtype=np.int64)
    initial_map_path = plot_initial_state(
        initial_grid,
        [(item.x, item.y, item.has_port) for item in initial_state.settlements],
        report_dir / "initial_map.png",
    )

    coverage_path = plot_query_coverage(
        MapShape(width=round_record.round.map_width, height=round_record.round.map_height),
        [item.record.response.viewport for item in query_files],
        report_dir / "query_coverage.png",
    )

    prediction = build_static_semantic_prediction(initial_grid, default_static_semantic_config())
    validate_prediction_tensor(
        prediction,
        SubmissionSpec(height=round_record.round.map_height, width=round_record.round.map_width),
    )
    save_prediction_tensor(paths.prediction_tensor_path(round_id, seed_index), prediction)

    baseline_path = plot_argmax_prediction(prediction, report_dir / "baseline_prediction.png")
    entropy_path = plot_entropy_heatmap(prediction, report_dir / "prediction_entropy.png")

    report_path = report_dir / "report.md"
    report_path.write_text(
        "\n".join(
            [
                f"# Round {round_record.round.round_number} seed {seed_index}",
                "",
                f"- round_id: `{round_id}`",
                f"- map_shape: `{round_record.round.map_height}x{round_record.round.map_width}`",
                f"- queries_logged: `{len(query_files)}`",
                "- baseline_model: `static_semantic`",
                "",
                "## Artifacts",
                "",
                f"- initial_map: `{initial_map_path.name}`",
                f"- query_coverage: `{coverage_path.name}`",
                f"- baseline_prediction: `{baseline_path.name}`",
                f"- prediction_entropy: `{entropy_path.name}`",
            ]
        ),
        encoding="utf-8",
    )

    return RoundReportArtifacts(
        report_path=report_path,
        initial_map_path=initial_map_path,
        coverage_path=coverage_path,
        baseline_path=baseline_path,
        entropy_path=entropy_path,
    )
