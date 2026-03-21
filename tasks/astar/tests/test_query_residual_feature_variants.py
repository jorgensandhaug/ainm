from __future__ import annotations

import numpy as np

from astar.student.predictor.query_residual import (
    TranscriptDerivedFeatures,
    _compose_design_tensor,
    _full_feature_names,
    _global_summary_names,
    _local_evidence_names,
    _regime_input_vector,
    _regime_summary_names,
    _seed_summary_names,
    _static_feature_names,
)


def test_query_residual_feature_variant_slicing_supports_v1_and_v2() -> None:
    height = 2
    width = 2
    static_stack = np.zeros((height, width, len(_static_feature_names())), dtype=np.float64)
    prior = np.full((height, width, 6), 1.0 / 6.0, dtype=np.float64)
    teacher_prior = np.full((height, width, 6), 1.0 / 6.0, dtype=np.float64)
    derived = TranscriptDerivedFeatures(
        global_summary=np.arange(len(_global_summary_names()), dtype=np.float64),
        seed_summaries={0: np.arange(len(_seed_summary_names()), dtype=np.float64)},
        local_evidence={
            0: np.zeros((height, width, len(_local_evidence_names())), dtype=np.float64),
        },
        exact_counts={0: np.zeros((height, width, 6), dtype=np.float64)},
    )
    regime_vector = np.zeros(len(_regime_summary_names()), dtype=np.float64)

    design_v1 = _compose_design_tensor(
        static_stack,
        prior,
        teacher_prior,
        derived,
        regime_vector,
        seed_index=0,
        probability_floor=0.01,
        selected_feature_names=_full_feature_names("v1"),
    )
    design_v2 = _compose_design_tensor(
        static_stack,
        prior,
        teacher_prior,
        derived,
        regime_vector,
        seed_index=0,
        probability_floor=0.01,
        selected_feature_names=_full_feature_names("v2_state"),
    )
    design_v3 = _compose_design_tensor(
        static_stack,
        prior,
        teacher_prior,
        derived,
        regime_vector,
        seed_index=0,
        probability_floor=0.01,
        selected_feature_names=_full_feature_names("v3_state_tails"),
    )
    design_v4 = _compose_design_tensor(
        static_stack,
        prior,
        teacher_prior,
        derived,
        regime_vector,
        seed_index=0,
        probability_floor=0.01,
        selected_feature_names=_full_feature_names("v4_localstate"),
    )

    assert design_v1.shape == (height, width, len(_full_feature_names("v1")))
    assert design_v2.shape == (height, width, len(_full_feature_names("v2_state")))
    assert design_v3.shape == (height, width, len(_full_feature_names("v3_state_tails")))
    assert design_v4.shape == (height, width, len(_full_feature_names("v4_localstate")))
    assert design_v2.shape[-1] > design_v1.shape[-1]
    assert design_v3.shape[-1] > design_v2.shape[-1]
    assert design_v4.shape[-1] > design_v2.shape[-1]


def test_query_residual_regime_input_vector_supports_v1_and_v2() -> None:
    derived = TranscriptDerivedFeatures(
        global_summary=np.arange(len(_global_summary_names()), dtype=np.float64),
        seed_summaries={
            0: np.arange(len(_seed_summary_names()), dtype=np.float64),
            1: np.arange(len(_seed_summary_names()), dtype=np.float64) + 1.0,
        },
        local_evidence={
            0: np.zeros((1, 1, len(_local_evidence_names())), dtype=np.float64),
            1: np.zeros((1, 1, len(_local_evidence_names())), dtype=np.float64),
        },
        exact_counts={
            0: np.zeros((1, 1, 6), dtype=np.float64),
            1: np.zeros((1, 1, 6), dtype=np.float64),
        },
    )

    vector_v1 = _regime_input_vector(derived, feature_variant="v1")
    vector_v2 = _regime_input_vector(derived, feature_variant="v2_state")
    vector_v3 = _regime_input_vector(derived, feature_variant="v3_state_tails")
    vector_v4 = _regime_input_vector(derived, feature_variant="v4_localstate")

    assert vector_v2.shape[0] > vector_v1.shape[0]
    assert vector_v3.shape[0] > vector_v2.shape[0]
    assert vector_v4.shape[0] == vector_v2.shape[0]
