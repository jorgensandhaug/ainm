from __future__ import annotations

from enum import StrEnum


class ReplayEventKind(StrEnum):
    BIRTH = "birth"
    PORTIZATION = "portization"
    COLLAPSE = "collapse"
    REBUILD = "rebuild"
    RECLAIM_FOREST = "reclaim_forest"
    RECLAIM_EMPTY = "reclaim_empty"
    OWNER_SWITCH = "owner_switch"
    SETTLEMENT_DELTA = "settlement_delta"
