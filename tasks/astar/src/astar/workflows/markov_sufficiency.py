from __future__ import annotations

import json
import math
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.terrain import buildable_mask, collapse_internal_grid
from astar.features.coasts import coast_mask
from astar.history.episodes.build import build_round_episode
from astar.history.episodes.models import RoundEpisode, SeedEpisode
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.serialization.json_utils import to_jsonable

CURRENT_DESCRIPTOR_CARDINALITY = 6 * 2 * 2 * 4 * 3 * 3 * 5
LAG_DESCRIPTOR_CARDINALITY = CURRENT_DESCRIPTOR_CARDINALITY * 6
EVENT_NAMES = ("birth_or_found", "portization", "collapse", "rebuild", "reclaim_forest")


def _neighbor_count(mask: np.ndarray) -> np.ndarray:
    mask_array = np.asarray(mask, dtype=np.int64)
    height, width = mask_array.shape
    padded = np.pad(mask_array, 1, mode="constant", constant_values=0)
    out = np.zeros((height, width), dtype=np.int64)
    for dy in range(3):
        for dx in range(3):
            out += padded[dy : dy + height, dx : dx + width]
    return out


def _current_descriptor_ids(
    current_class: np.ndarray,
    buildable: np.ndarray,
    coast: np.ndarray,
    settlement_count: np.ndarray,
    port_count: np.ndarray,
    ruin_count: np.ndarray,
    forest_count: np.ndarray,
) -> np.ndarray:
    descriptor = np.asarray(current_class, dtype=np.int64)
    descriptor = descriptor * 2 + np.asarray(buildable, dtype=np.int64)
    descriptor = descriptor * 2 + np.asarray(coast, dtype=np.int64)
    descriptor = descriptor * 4 + np.minimum(np.asarray(settlement_count, dtype=np.int64), 3)
    descriptor = descriptor * 3 + np.minimum(np.asarray(port_count, dtype=np.int64), 2)
    descriptor = descriptor * 3 + np.minimum(np.asarray(ruin_count, dtype=np.int64), 2)
    descriptor = descriptor * 5 + np.minimum(np.asarray(forest_count, dtype=np.int64), 4)
    return descriptor


def _dynamic_mask(
    buildable: np.ndarray,
    current_class: np.ndarray,
    next_class: np.ndarray,
) -> np.ndarray:
    dynamic_classes = np.isin(current_class, (1, 2, 3, 4)) | np.isin(next_class, (1, 2, 3, 4))
    return np.asarray(buildable | dynamic_classes, dtype=np.bool_)


def _transition_arrays_for_seed(
    seed: SeedEpisode,
) -> list[tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]]:
    outputs: list[tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray, np.ndarray]] = []
    static_grid = np.asarray(seed.initial_state.grid, dtype=np.int64)
    buildable = buildable_mask(static_grid)
    coast = coast_mask(static_grid)

    for run in seed.replay_runs:
        if len(run.frames) < 3:
            continue
        collapsed_frames = [
            np.asarray(collapse_internal_grid(frame.grid), dtype=np.int64)
            for frame in run.frames
        ]
        settlement_counts = [_neighbor_count(frame == 1) for frame in collapsed_frames]
        port_counts = [_neighbor_count(frame == 2) for frame in collapsed_frames]
        ruin_counts = [_neighbor_count(frame == 3) for frame in collapsed_frames]
        forest_counts = [_neighbor_count(frame == 4) for frame in collapsed_frames]

        for step in range(1, len(collapsed_frames) - 1):
            prev_class = collapsed_frames[step - 1]
            current_class = collapsed_frames[step]
            next_class = collapsed_frames[step + 1]
            mask = _dynamic_mask(buildable, current_class, next_class)
            if not np.any(mask):
                continue
            current_ids = _current_descriptor_ids(
                current_class,
                buildable,
                coast,
                settlement_counts[step],
                port_counts[step],
                ruin_counts[step],
                forest_counts[step],
            )
            outputs.append(
                (
                    current_ids[mask].reshape(-1),
                    (current_ids * 6 + prev_class)[mask].reshape(-1),
                    current_class[mask].reshape(-1),
                    next_class[mask].reshape(-1),
                    buildable[mask].reshape(-1),
                ),
            )
    return outputs


class _RoundTransitionTables(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    round_id: str
    round_number: int | None = None
    current_counts: np.ndarray
    lag_counts: np.ndarray
    current_class_counts: np.ndarray
    global_counts: np.ndarray
    transition_count: int = Field(ge=0)


class _EventAccumulator:
    def __init__(self) -> None:
        self.eligible_count = 0
        self.positive_count = 0
        self.current_log_loss_sum = 0.0
        self.lag_log_loss_sum = 0.0
        self.current_brier_sum = 0.0
        self.lag_brier_sum = 0.0

    def update(
        self,
        labels: np.ndarray,
        current_prob: np.ndarray,
        lag_prob: np.ndarray,
    ) -> None:
        if labels.size == 0:
            return
        labels_float = np.asarray(labels, dtype=np.float64)
        current_safe = np.clip(np.asarray(current_prob, dtype=np.float64), 1e-6, 1.0 - 1e-6)
        lag_safe = np.clip(np.asarray(lag_prob, dtype=np.float64), 1e-6, 1.0 - 1e-6)
        self.eligible_count += int(labels.size)
        self.positive_count += int(np.sum(labels_float))
        self.current_log_loss_sum += float(
            np.sum(-(labels_float * np.log(current_safe) + (1.0 - labels_float) * np.log(1.0 - current_safe))),
        )
        self.lag_log_loss_sum += float(
            np.sum(-(labels_float * np.log(lag_safe) + (1.0 - labels_float) * np.log(1.0 - lag_safe))),
        )
        self.current_brier_sum += float(np.sum((current_safe - labels_float) ** 2))
        self.lag_brier_sum += float(np.sum((lag_safe - labels_float) ** 2))


class MarkovEventMetric(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    event_name: str
    eligible_count: int = Field(ge=0)
    positive_count: int = Field(ge=0)
    prevalence: float = Field(ge=0.0, le=1.0)
    current_log_loss: float = Field(ge=0.0)
    lag_log_loss: float = Field(ge=0.0)
    log_loss_gain: float
    current_brier: float = Field(ge=0.0)
    lag_brier: float = Field(ge=0.0)
    brier_gain: float


class MarkovRoundMetric(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int | None = None
    transition_count: int = Field(ge=0)
    current_log_loss: float = Field(ge=0.0)
    lag_log_loss: float = Field(ge=0.0)
    log_loss_gain: float
    current_accuracy: float = Field(ge=0.0, le=1.0)
    lag_accuracy: float = Field(ge=0.0, le=1.0)
    accuracy_gain: float
    event_metrics: list[MarkovEventMetric]


class MarkovSufficiencyAuditResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    audit_name: str
    audit_scope: str
    round_ids: list[str]
    round_count: int = Field(ge=1)
    transition_count: int = Field(ge=0)
    current_log_loss: float = Field(ge=0.0)
    lag_log_loss: float = Field(ge=0.0)
    log_loss_gain: float
    current_accuracy: float = Field(ge=0.0, le=1.0)
    lag_accuracy: float = Field(ge=0.0, le=1.0)
    accuracy_gain: float
    event_metrics: list[MarkovEventMetric]
    rounds: list[MarkovRoundMetric]
    markov_sufficiency: str
    artifact_path: Path
    report_path: Path


def _round_transition_tables(episode: RoundEpisode) -> _RoundTransitionTables:
    current_counts = np.zeros((CURRENT_DESCRIPTOR_CARDINALITY, 6), dtype=np.float64)
    lag_counts = np.zeros((LAG_DESCRIPTOR_CARDINALITY, 6), dtype=np.float64)
    current_class_counts = np.zeros((6, 6), dtype=np.float64)
    global_counts = np.zeros(6, dtype=np.float64)
    transition_count = 0

    for seed in episode.seeds:
        for current_ids, lag_ids, current_classes, next_classes, _ in _transition_arrays_for_seed(seed):
            np.add.at(current_counts, (current_ids, next_classes), 1.0)
            np.add.at(lag_counts, (lag_ids, next_classes), 1.0)
            np.add.at(current_class_counts, (current_classes, next_classes), 1.0)
            np.add.at(global_counts, next_classes, 1.0)
            transition_count += int(next_classes.size)

    return _RoundTransitionTables(
        round_id=episode.metadata.round_id,
        round_number=episode.metadata.round_number,
        current_counts=current_counts,
        lag_counts=lag_counts,
        current_class_counts=current_class_counts,
        global_counts=global_counts,
        transition_count=transition_count,
    )


def _merge_round_tables(
    tables: list[_RoundTransitionTables],
) -> _RoundTransitionTables:
    if not tables:
        raise ValueError("markov sufficiency audit requires at least one training round")
    return _RoundTransitionTables(
        round_id="__train__",
        current_counts=np.sum(np.stack([item.current_counts for item in tables], axis=0), axis=0),
        lag_counts=np.sum(np.stack([item.lag_counts for item in tables], axis=0), axis=0),
        current_class_counts=np.sum(np.stack([item.current_class_counts for item in tables], axis=0), axis=0),
        global_counts=np.sum(np.stack([item.global_counts for item in tables], axis=0), axis=0),
        transition_count=int(sum(item.transition_count for item in tables)),
    )


def _smoothed_distribution(
    counts: np.ndarray,
    prior: np.ndarray,
    *,
    alpha: float,
) -> np.ndarray:
    totals = np.sum(counts, axis=1, keepdims=True)
    return (counts + alpha * prior) / np.maximum(totals + alpha, 1e-12)


def _binary_event_probabilities(
    probs: np.ndarray,
    *,
    event_name: str,
) -> np.ndarray:
    if event_name == "birth_or_found":
        return np.asarray(probs[:, 1] + probs[:, 2], dtype=np.float64)
    if event_name == "portization":
        return np.asarray(probs[:, 2], dtype=np.float64)
    if event_name == "collapse":
        return np.asarray(probs[:, 3], dtype=np.float64)
    if event_name == "rebuild":
        return np.asarray(probs[:, 1] + probs[:, 2], dtype=np.float64)
    if event_name == "reclaim_forest":
        return np.asarray(probs[:, 4], dtype=np.float64)
    raise ValueError(f"unsupported event name: {event_name}")


def _event_mask_and_labels(
    current_class: np.ndarray,
    next_class: np.ndarray,
    buildable: np.ndarray,
    *,
    event_name: str,
) -> tuple[np.ndarray, np.ndarray]:
    if event_name == "birth_or_found":
        mask = buildable & ~np.isin(current_class, (1, 2, 3, 5))
        labels = np.isin(next_class, (1, 2))
        return mask, labels
    if event_name == "portization":
        mask = current_class == 1
        labels = next_class == 2
        return mask, labels
    if event_name == "collapse":
        mask = np.isin(current_class, (1, 2))
        labels = next_class == 3
        return mask, labels
    if event_name == "rebuild":
        mask = current_class == 3
        labels = np.isin(next_class, (1, 2))
        return mask, labels
    if event_name == "reclaim_forest":
        mask = current_class == 3
        labels = next_class == 4
        return mask, labels
    raise ValueError(f"unsupported event name: {event_name}")


def _event_metric(name: str, accumulator: _EventAccumulator) -> MarkovEventMetric:
    if accumulator.eligible_count <= 0:
        return MarkovEventMetric(
            event_name=name,
            eligible_count=0,
            positive_count=0,
            prevalence=0.0,
            current_log_loss=0.0,
            lag_log_loss=0.0,
            log_loss_gain=0.0,
            current_brier=0.0,
            lag_brier=0.0,
            brier_gain=0.0,
        )
    current_log_loss = accumulator.current_log_loss_sum / float(accumulator.eligible_count)
    lag_log_loss = accumulator.lag_log_loss_sum / float(accumulator.eligible_count)
    current_brier = accumulator.current_brier_sum / float(accumulator.eligible_count)
    lag_brier = accumulator.lag_brier_sum / float(accumulator.eligible_count)
    return MarkovEventMetric(
        event_name=name,
        eligible_count=accumulator.eligible_count,
        positive_count=accumulator.positive_count,
        prevalence=float(accumulator.positive_count) / float(accumulator.eligible_count),
        current_log_loss=current_log_loss,
        lag_log_loss=lag_log_loss,
        log_loss_gain=current_log_loss - lag_log_loss,
        current_brier=current_brier,
        lag_brier=lag_brier,
        brier_gain=current_brier - lag_brier,
    )


def _evaluate_round(
    episode: RoundEpisode,
    train_tables: _RoundTransitionTables,
    *,
    alpha: float,
) -> MarkovRoundMetric:
    global_total = float(np.sum(train_tables.global_counts))
    if global_total <= 0.0:
        raise ValueError("training tables contain no transitions")
    global_probs = train_tables.global_counts / global_total
    event_accumulators = {name: _EventAccumulator() for name in EVENT_NAMES}

    total_examples = 0
    current_log_loss_sum = 0.0
    lag_log_loss_sum = 0.0
    current_correct = 0
    lag_correct = 0

    for seed in episode.seeds:
        for current_ids, lag_ids, current_classes, next_classes, buildable in _transition_arrays_for_seed(seed):
            if next_classes.size == 0:
                continue
            class_counts = train_tables.current_class_counts[current_classes]
            class_prior = _smoothed_distribution(
                class_counts,
                np.broadcast_to(global_probs, class_counts.shape),
                alpha=alpha,
            )
            current_probs = _smoothed_distribution(
                train_tables.current_counts[current_ids],
                class_prior,
                alpha=alpha,
            )
            lag_probs = _smoothed_distribution(
                train_tables.lag_counts[lag_ids],
                current_probs,
                alpha=alpha,
            )
            current_safe = np.clip(current_probs[np.arange(next_classes.size), next_classes], 1e-9, None)
            lag_safe = np.clip(lag_probs[np.arange(next_classes.size), next_classes], 1e-9, None)
            current_log_loss_sum += float(np.sum(-np.log(current_safe)))
            lag_log_loss_sum += float(np.sum(-np.log(lag_safe)))
            current_correct += int(np.sum(np.argmax(current_probs, axis=1) == next_classes))
            lag_correct += int(np.sum(np.argmax(lag_probs, axis=1) == next_classes))
            total_examples += int(next_classes.size)

            for event_name, accumulator in event_accumulators.items():
                event_mask, event_labels = _event_mask_and_labels(
                    current_classes,
                    next_classes,
                    buildable,
                    event_name=event_name,
                )
                if not np.any(event_mask):
                    continue
                accumulator.update(
                    event_labels[event_mask],
                    _binary_event_probabilities(current_probs[event_mask], event_name=event_name),
                    _binary_event_probabilities(lag_probs[event_mask], event_name=event_name),
                )

    if total_examples <= 0:
        raise ValueError(f"round {episode.metadata.round_id} produced no dynamic transitions")
    current_log_loss = current_log_loss_sum / float(total_examples)
    lag_log_loss = lag_log_loss_sum / float(total_examples)
    current_accuracy = float(current_correct) / float(total_examples)
    lag_accuracy = float(lag_correct) / float(total_examples)
    return MarkovRoundMetric(
        round_id=episode.metadata.round_id,
        round_number=episode.metadata.round_number,
        transition_count=total_examples,
        current_log_loss=current_log_loss,
        lag_log_loss=lag_log_loss,
        log_loss_gain=current_log_loss - lag_log_loss,
        current_accuracy=current_accuracy,
        lag_accuracy=lag_accuracy,
        accuracy_gain=lag_accuracy - current_accuracy,
        event_metrics=[_event_metric(name, event_accumulators[name]) for name in EVENT_NAMES],
    )


def _markov_conclusion(
    current_log_loss: float,
    lag_log_loss: float,
    event_metrics: list[MarkovEventMetric],
) -> str:
    overall_gain = current_log_loss - lag_log_loss
    max_event_gain = max((item.log_loss_gain for item in event_metrics), default=0.0)
    if overall_gain < 0.002 and max_event_gain < 0.005:
        return "likely"
    if overall_gain < 0.01 and max_event_gain < 0.02:
        return "uncertain"
    return "unlikely"


def _render_report(result: MarkovSufficiencyAuditResult) -> str:
    lines = [
        f"markov-sufficiency-audit {result.audit_name}",
        "",
        f"scope: {result.audit_scope}",
        f"rounds: {result.round_count}",
        f"transition_count: {result.transition_count}",
        f"current_log_loss: {result.current_log_loss:.6f}",
        f"lag_log_loss: {result.lag_log_loss:.6f}",
        f"log_loss_gain: {result.log_loss_gain:.6f}",
        f"current_accuracy: {result.current_accuracy:.6f}",
        f"lag_accuracy: {result.lag_accuracy:.6f}",
        f"accuracy_gain: {result.accuracy_gain:.6f}",
        f"markov_sufficiency: {result.markov_sufficiency}",
        "",
        "notes:",
        "- proxy audit over dynamic cells only",
        "- conditioning compares cell-local descriptor at t vs same descriptor plus previous cell class",
        "- strong lag gains here are evidence against strong observed-state Markov sufficiency",
        "",
        "event_metrics:",
    ]
    for metric in result.event_metrics:
        lines.append(
            (
                f"- {metric.event_name}: n={metric.eligible_count} "
                f"prev={metric.prevalence:.4f} "
                f"current_ll={metric.current_log_loss:.6f} "
                f"lag_ll={metric.lag_log_loss:.6f} "
                f"gain={metric.log_loss_gain:.6f}"
            ),
        )
    lines.append("")
    lines.append("per_round:")
    for round_metric in result.rounds:
        lines.append(
            (
                f"- round={round_metric.round_id} n={round_metric.transition_count} "
                f"current_ll={round_metric.current_log_loss:.6f} "
                f"lag_ll={round_metric.lag_log_loss:.6f} "
                f"gain={round_metric.log_loss_gain:.6f}"
            ),
        )
    return "\n".join(lines) + "\n"


def run_markov_sufficiency_audit(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
    audit_name: str = "f1_markov_sufficiency_cellproxy_v1",
    alpha: float = 2.0,
) -> MarkovSufficiencyAuditResult:
    selected_round_ids = round_ids or sorted(
        round_dir.name
        for round_dir in paths.raw_dir.joinpath("replays").glob("*")
        if round_dir.is_dir()
    )
    if len(selected_round_ids) < 2:
        raise ValueError("markov sufficiency audit requires at least two replay-backed rounds")

    episodes = {round_id: build_round_episode(paths, round_id) for round_id in selected_round_ids}
    table_by_round = {
        round_id: _round_transition_tables(episode)
        for round_id, episode in episodes.items()
    }
    round_metrics: list[MarkovRoundMetric] = []
    for held_out_round_id in selected_round_ids:
        training_tables = _merge_round_tables(
            [
                table
                for round_id, table in table_by_round.items()
                if round_id != held_out_round_id
            ],
        )
        round_metrics.append(
            _evaluate_round(
                episodes[held_out_round_id],
                training_tables,
                alpha=alpha,
            ),
        )

    transition_count = int(sum(item.transition_count for item in round_metrics))
    current_log_loss = sum(
        item.current_log_loss * item.transition_count for item in round_metrics
    ) / float(max(transition_count, 1))
    lag_log_loss = sum(
        item.lag_log_loss * item.transition_count for item in round_metrics
    ) / float(max(transition_count, 1))
    current_accuracy = sum(
        item.current_accuracy * item.transition_count for item in round_metrics
    ) / float(max(transition_count, 1))
    lag_accuracy = sum(
        item.lag_accuracy * item.transition_count for item in round_metrics
    ) / float(max(transition_count, 1))

    aggregate_events: list[MarkovEventMetric] = []
    for event_name in EVENT_NAMES:
        accumulator = _EventAccumulator()
        for round_metric in round_metrics:
            event_metric = next(item for item in round_metric.event_metrics if item.event_name == event_name)
            accumulator.eligible_count += event_metric.eligible_count
            accumulator.positive_count += event_metric.positive_count
            accumulator.current_log_loss_sum += event_metric.current_log_loss * event_metric.eligible_count
            accumulator.lag_log_loss_sum += event_metric.lag_log_loss * event_metric.eligible_count
            accumulator.current_brier_sum += event_metric.current_brier * event_metric.eligible_count
            accumulator.lag_brier_sum += event_metric.lag_brier * event_metric.eligible_count
        aggregate_events.append(_event_metric(event_name, accumulator))

    artifact_dir = paths.artifacts_dir / "family1" / "markov" / audit_name
    artifact_dir.mkdir(parents=True, exist_ok=True)
    artifact_path = artifact_dir / "result.json"
    report_path = artifact_dir / "report.md"
    result = MarkovSufficiencyAuditResult(
        audit_name=audit_name,
        audit_scope="cell_local_dynamic_proxy__descriptor_t_vs_descriptor_t_plus_prev_class",
        round_ids=selected_round_ids,
        round_count=len(selected_round_ids),
        transition_count=transition_count,
        current_log_loss=current_log_loss,
        lag_log_loss=lag_log_loss,
        log_loss_gain=current_log_loss - lag_log_loss,
        current_accuracy=current_accuracy,
        lag_accuracy=lag_accuracy,
        accuracy_gain=lag_accuracy - current_accuracy,
        event_metrics=aggregate_events,
        rounds=round_metrics,
        markov_sufficiency=_markov_conclusion(current_log_loss, lag_log_loss, aggregate_events),
        artifact_path=artifact_path,
        report_path=report_path,
    )
    artifact_path.write_text(json.dumps(to_jsonable(result), indent=2), encoding="utf-8")
    report_path.write_text(_render_report(result), encoding="utf-8")
    return result


__all__ = [
    "MarkovEventMetric",
    "MarkovRoundMetric",
    "MarkovSufficiencyAuditResult",
    "run_markov_sufficiency_audit",
]
