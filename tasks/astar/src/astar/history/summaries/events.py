from __future__ import annotations

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.core.trajectory import ReplayRun
from astar.core.types import BoolArray, IntArray


class ReplayEventTensorBundle(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    replay_run_id: str
    round_id: str
    seed_index: int = Field(ge=0)
    built_mask_by_step: BoolArray
    port_mask_by_step: BoolArray
    ruin_mask_by_step: BoolArray
    alive_count_by_step: IntArray
    port_count_by_step: IntArray
    ruin_count_by_step: IntArray


def extract_replay_event_tensors(run: ReplayRun) -> ReplayEventTensorBundle:
    built_masks: list[np.ndarray] = []
    port_masks: list[np.ndarray] = []
    ruin_masks: list[np.ndarray] = []
    alive_counts: list[int] = []
    port_counts: list[int] = []
    ruin_counts: list[int] = []

    for frame in run.frames:
        built_mask = np.isin(frame.grid, (1, 2, 3))
        port_mask = frame.grid == 2
        ruin_mask = frame.grid == 3
        built_masks.append(built_mask.astype(np.bool_))
        port_masks.append(port_mask.astype(np.bool_))
        ruin_masks.append(ruin_mask.astype(np.bool_))
        alive_counts.append(sum(1 for settlement in frame.settlements if settlement.alive))
        port_counts.append(sum(1 for settlement in frame.settlements if settlement.has_port))
        ruin_counts.append(int(np.count_nonzero(ruin_mask)))

    return ReplayEventTensorBundle(
        replay_run_id=run.replay_run_id,
        round_id=run.round_id,
        seed_index=run.seed_index,
        built_mask_by_step=np.stack(built_masks, axis=0),
        port_mask_by_step=np.stack(port_masks, axis=0),
        ruin_mask_by_step=np.stack(ruin_masks, axis=0),
        alive_count_by_step=np.asarray(alive_counts, dtype=np.int64),
        port_count_by_step=np.asarray(port_counts, dtype=np.int64),
        ruin_count_by_step=np.asarray(ruin_counts, dtype=np.int64),
    )
