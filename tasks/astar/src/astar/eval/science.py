from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.envs.types import RoundContext, SeedContext
from astar.features.geometry import compute_round_features
from astar.history.episodes.models import RoundEpisode
from astar.history.replay.frame_stats import summarize_replay_runs
from astar.history.summaries.hazards import build_seed_hazard_summary
from astar.teacher.dynamics.base import DynamicsTeacher


def _episode_round_context(episode: RoundEpisode) -> RoundContext:
    return RoundContext(
        round_id=episode.metadata.round_id,
        round_number=episode.metadata.round_number,
        status=episode.metadata.status,
        map_width=episode.metadata.map_width,
        map_height=episode.metadata.map_height,
        seeds=tuple(
            SeedContext(seed_index=seed.seed_index, initial_state=seed.initial_state)
            for seed in episode.seeds
        ),
    )


class ScienceSeedReport(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    seed_index: int = Field(ge=0)
    actual_replay_runs: int = Field(ge=0)
    predicted_replay_runs: int = Field(ge=0)
    terminal_l1: float = Field(ge=0.0)
    alive_curve_mae: float = Field(ge=0.0)
    port_curve_mae: float = Field(ge=0.0)
    ruin_curve_mae: float = Field(ge=0.0)
    owner_flip_mae: float = Field(ge=0.0)
    build_hit_rate_mae: float = Field(ge=0.0)
    port_hit_rate_mae: float = Field(ge=0.0)
    ruin_hit_rate_mae: float = Field(ge=0.0)
    coefficient_l2: float = Field(ge=0.0)


class ScienceRoundReport(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int | None = None
    teacher_name: str
    regime_dim: int = Field(ge=1)
    seed_reports: list[ScienceSeedReport]
    mean_terminal_l1: float = Field(ge=0.0)
    mean_alive_curve_mae: float = Field(ge=0.0)
    mean_port_curve_mae: float = Field(ge=0.0)
    mean_ruin_curve_mae: float = Field(ge=0.0)
    mean_owner_flip_mae: float = Field(ge=0.0)
    mean_build_hit_rate_mae: float = Field(ge=0.0)
    mean_port_hit_rate_mae: float = Field(ge=0.0)
    mean_ruin_hit_rate_mae: float = Field(ge=0.0)
    mean_coefficient_l2: float = Field(ge=0.0)


def evaluate_teacher_science(
    teacher: DynamicsTeacher,
    episode: RoundEpisode,
    *,
    n_rollouts: int | None = None,
) -> ScienceRoundReport:
    if episode.replay_run_count == 0:
        raise ValueError(f"round {episode.metadata.round_id} has no replay runs")

    round_context = _episode_round_context(episode)
    round_features = compute_round_features(round_context.to_round_detail())
    regime = teacher.encode_round(episode)

    seed_reports: list[ScienceSeedReport] = []
    for actual_seed in episode.seeds:
        if not actual_seed.replay_runs:
            continue
        online_seed = round_context.seeds[actual_seed.seed_index]
        predicted_runs = teacher.rollout(
            online_seed,
            regime,
            n_rollouts=n_rollouts or len(actual_seed.replay_runs),
        )
        if not predicted_runs:
            continue

        actual_aggregate = summarize_replay_runs(list(actual_seed.replay_runs))
        predicted_aggregate = summarize_replay_runs(list(predicted_runs))
        actual_hazards = build_seed_hazard_summary(
            list(actual_seed.replay_runs),
            actual_aggregate,
            round_features,
        )
        predicted_hazards = build_seed_hazard_summary(
            list(predicted_runs),
            predicted_aggregate,
            round_features,
        )
        seed_reports.append(
            ScienceSeedReport(
                round_id=episode.metadata.round_id,
                seed_index=actual_seed.seed_index,
                actual_replay_runs=len(actual_seed.replay_runs),
                predicted_replay_runs=len(predicted_runs),
                terminal_l1=float(
                    np.mean(
                        np.abs(
                            actual_aggregate.mean_terminal_probs
                            - predicted_aggregate.mean_terminal_probs
                        ),
                    ),
                ),
                alive_curve_mae=float(
                    np.mean(
                        np.abs(
                            actual_aggregate.survival_curve_mean
                            - predicted_aggregate.survival_curve_mean
                        ),
                    ),
                ),
                port_curve_mae=float(
                    np.mean(
                        np.abs(
                            actual_aggregate.port_curve_mean - predicted_aggregate.port_curve_mean
                        ),
                    ),
                ),
                ruin_curve_mae=float(
                    np.mean(
                        np.abs(
                            actual_aggregate.ruin_curve_mean - predicted_aggregate.ruin_curve_mean
                        ),
                    ),
                ),
                owner_flip_mae=float(
                    np.mean(
                        np.abs(
                            actual_aggregate.owner_flip_counts.astype(np.float64)
                            - predicted_aggregate.owner_flip_counts.astype(np.float64)
                        ),
                    ),
                ),
                build_hit_rate_mae=float(
                    np.mean(
                        np.abs(
                            actual_hazards.build_hit_rate - predicted_hazards.build_hit_rate,
                        ),
                    ),
                ),
                port_hit_rate_mae=float(
                    np.mean(
                        np.abs(
                            actual_hazards.port_hit_rate - predicted_hazards.port_hit_rate,
                        ),
                    ),
                ),
                ruin_hit_rate_mae=float(
                    np.mean(
                        np.abs(
                            actual_hazards.ruin_hit_rate - predicted_hazards.ruin_hit_rate,
                        ),
                    ),
                ),
                coefficient_l2=float(
                    np.linalg.norm(
                        actual_hazards.coefficient_vector - predicted_hazards.coefficient_vector,
                    ),
                ),
            ),
        )

    if not seed_reports:
        raise ValueError(f"round {episode.metadata.round_id} produced no science seed reports")

    return ScienceRoundReport(
        round_id=episode.metadata.round_id,
        round_number=episode.metadata.round_number,
        teacher_name=teacher.name,
        regime_dim=int(getattr(teacher, "selected_rank", regime.shape[0])),
        seed_reports=seed_reports,
        mean_terminal_l1=float(np.mean([item.terminal_l1 for item in seed_reports])),
        mean_alive_curve_mae=float(np.mean([item.alive_curve_mae for item in seed_reports])),
        mean_port_curve_mae=float(np.mean([item.port_curve_mae for item in seed_reports])),
        mean_ruin_curve_mae=float(np.mean([item.ruin_curve_mae for item in seed_reports])),
        mean_owner_flip_mae=float(np.mean([item.owner_flip_mae for item in seed_reports])),
        mean_build_hit_rate_mae=float(
            np.mean([item.build_hit_rate_mae for item in seed_reports]),
        ),
        mean_port_hit_rate_mae=float(np.mean([item.port_hit_rate_mae for item in seed_reports])),
        mean_ruin_hit_rate_mae=float(np.mean([item.ruin_hit_rate_mae for item in seed_reports])),
        mean_coefficient_l2=float(np.mean([item.coefficient_l2 for item in seed_reports])),
    )


__all__ = [
    "ScienceRoundReport",
    "ScienceSeedReport",
    "evaluate_teacher_science",
]
