from __future__ import annotations

from pathlib import Path

from astar.infra.api.client import AstarApiClient
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.infra.serialization.json_utils import to_jsonable
from astar.viz.spatial import plot_scalar_field
from astar.viz.types import FigureSpec
from astar.workflows.fetch_analysis import fetch_analysis
from astar.workflows.model_eval import (
    ModelSeedEvaluationContext,
    discover_historical_eval_round_ids,
    evaluate_model_on_round,
)
from astar.workflows.results import VisualizationReportResult
from astar.workflows.visualize_prediction_comparison import write_prediction_comparison_report


def write_model_evaluation_report(
    context: ModelSeedEvaluationContext,
    report_dir: Path,
    *,
    report_key: str = "model_prediction_comparison",
    title: str | None = None,
) -> VisualizationReportResult:
    extra_figures: list[FigureSpec] = []
    if context.diagnostics:
        extra_figures.extend(
            [
                FigureSpec(
                    key="terrain_bucket_count",
                    title="Terrain bucket support",
                    path=plot_scalar_field(
                        context.diagnostics["terrain_bucket_count"],
                        report_dir / "terrain_bucket_count.png",
                        title="Historical support: terrain bucket count",
                        cmap="viridis",
                        vmin=0.0,
                    ),
                    description="Number of historical cells in the matching terrain-only bucket.",
                ),
                FigureSpec(
                    key="structural_bucket_count",
                    title="Structural bucket support",
                    path=plot_scalar_field(
                        context.diagnostics["structural_bucket_count"],
                        report_dir / "structural_bucket_count.png",
                        title="Historical support: structural bucket count",
                        cmap="viridis",
                        vmin=0.0,
                    ),
                    description="Number of historical cells in the matching structural bucket.",
                ),
                FigureSpec(
                    key="full_bucket_count",
                    title="Full bucket support",
                    path=plot_scalar_field(
                        context.diagnostics["full_bucket_count"],
                        report_dir / "full_bucket_count.png",
                        title="Historical support: full bucket count",
                        cmap="viridis",
                        vmin=0.0,
                    ),
                    description="Number of historical cells in the full feature bucket.",
                ),
                FigureSpec(
                    key="support_level",
                    title="Fallback level",
                    path=plot_scalar_field(
                        context.diagnostics["support_level"],
                        report_dir / "support_level.png",
                        title="Fallback level: 0 global, 1 terrain, 2 structural, 3 full",
                        cmap="plasma",
                        vmin=0.0,
                        vmax=3.0,
                    ),
                    description="Deepest non-empty historical bucket used by the hierarchical prior.",
                ),
            ],
        )

    return write_prediction_comparison_report(
        report_key=report_key,
        title=title
        or (
            f"Model Prediction Round {context.round_number} "
            f"Seed {context.seed_index} {context.model_name}"
        ),
        report_dir=report_dir,
        round_id=context.round_id,
        seed_index=context.seed_index,
        initial_grid=context.initial_grid,
        settlements=context.settlements,
        left_tensor=context.prediction,
        right_tensor=context.ground_truth,
        left_name=context.model_name,
        right_name="ground truth",
        left_key="prediction",
        right_key="ground_truth",
        metadata={
            "mode": context.mode,
            "round_number": context.round_number,
            "model_name": context.model_name,
            "score": context.score_breakdown.score,
            "weighted_kl": context.score_breakdown.weighted_kl,
            "training_round_count": len(context.training_round_ids),
            "training_analyzed_seed_count": context.training_analyzed_seed_count,
            "training_cell_count": context.training_cell_count,
            "mean_prediction_entropy": context.mean_prediction_entropy,
            "mean_ground_truth_entropy": context.mean_ground_truth_entropy,
            "argmax_agreement_rate": context.argmax_agreement_rate,
            "predicted_class_mass": context.predicted_class_mass,
            "ground_truth_class_mass": context.ground_truth_class_mass,
            "residual_class_mass": context.residual_class_mass,
        },
        extra_figures=extra_figures,
    )


def visualize_model_prediction(
    paths: WorkspacePaths,
    round_id: str,
    seed_index: int,
    model_name: str,
    *,
    client: AstarApiClient | None = None,
) -> VisualizationReportResult:
    analysis_path = paths.raw_analysis_dir(round_id) / f"seed_index={seed_index}.json"
    if not analysis_path.exists():
        if client is None:
            msg = (
                f"analysis missing for round {round_id} seed {seed_index}; "
                "run `astar fetch-analysis ...` first"
            )
            raise FileNotFoundError(msg)
        fetch_analysis(paths, client, round_id, seed_index)

    training_round_ids = [
        item for item in discover_historical_eval_round_ids(paths) if item != round_id
    ]
    mode = "offline_observed" if model_name.strip().lower() == "latent_regime" else "prior_only"
    contexts = evaluate_model_on_round(
        paths,
        round_id=round_id,
        model_name=model_name,
        training_round_ids=training_round_ids,
        mode=mode,
    )
    context = next((item for item in contexts if item.seed_index == seed_index), None)
    if context is None:
        raise ValueError(f"seed_index {seed_index} has no saved analysis for round {round_id}")

    round_record = read_round_record(paths, round_id)
    report_dir = (
        paths.report_dir(round_id)
        / f"seed_index={seed_index}"
        / "model_prediction"
        / context.model_name
    )
    result = write_model_evaluation_report(
        context,
        report_dir,
        title=(
            f"Model Prediction Round {round_record.round.round_number} "
            f"Seed {seed_index} {context.model_name}"
        ),
    )
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="visualization_built",
            round_id=round_id,
            seed_index=seed_index,
            status="ok",
            artifact_path=result.manifest_path,
            payload_json=to_jsonable(result),
            spec_name=f"{result.report_key}:{context.model_name}",
        ),
    )
    return result


__all__ = ["visualize_model_prediction", "write_model_evaluation_report"]
