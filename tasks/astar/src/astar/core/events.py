from __future__ import annotations

from enum import StrEnum


class ReplayEventKind(StrEnum):
    BUILD = "build"
    PORT = "port"
    RUIN = "ruin"
    OWNER_FLIP = "owner_flip"
    RECLAIM = "reclaim"
