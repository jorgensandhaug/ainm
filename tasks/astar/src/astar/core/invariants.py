from __future__ import annotations

from enum import StrEnum


class DocumentedInvariant(StrEnum):
    SHARED_ROUND_REGIME = "shared_round_regime"
    MOUNTAINS_STATIC = "mountains_static"
    CLASS_ZERO_COLLAPSES_EMPTY_PLAINS_OCEAN = "class_zero_collapses_empty_plains_ocean"
    LIVE_QUERY_RETURNS_FINAL_VIEWPORT_ONLY = "live_query_returns_final_viewport_only"
    SCORE_IS_ENTROPY_WEIGHTED_KL = "score_is_entropy_weighted_kl"
