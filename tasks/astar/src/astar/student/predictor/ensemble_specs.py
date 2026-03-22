"""Immutable model specs for ensemble predictor family."""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class EnsembleModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    model_name: str
    component_model_names: tuple[str, ...]
    component_weights: tuple[float, ...]
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    policy_name: str = "coverage"
    blend_mode: str = "geometric"
    obs_blend_temperature: float = 0.0
    spatial_smooth_sigma: float = 0.0


_ENSEMBLE_SPECS: dict[str, EnsembleModelSpec] = {
    # Hazard V2 + query_residual, equal weight
    "f1_ensemble_hv2_qr_50_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_qr_50_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "query_residual",
        ),
        component_weights=(0.5, 0.5),
    ),
    # Hazard V2 dominant
    "f1_ensemble_hv2_qr_70_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_qr_70_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "query_residual",
        ),
        component_weights=(0.7, 0.3),
    ),
    # Query residual dominant
    "f1_ensemble_hv2_qr_30_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_qr_30_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "query_residual",
        ),
        component_weights=(0.3, 0.7),
    ),
    # k9 hazard + supportx
    "f1_ensemble_hv2k9_sx_50_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2k9_sx_50_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k9_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.5, 0.5),
    ),
    # Fine-grained blend sweep
    "f1_ensemble_hv2_qr_40_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_qr_40_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "query_residual",
        ),
        component_weights=(0.4, 0.6),
    ),
    "f1_ensemble_hv2_qr_60_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_qr_60_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "query_residual",
        ),
        component_weights=(0.6, 0.4),
    ),
    # Triple ensemble: hazard + qr + cell_type_transfer
    "f1_ensemble_triple_v01": EnsembleModelSpec(
        model_name="f1_ensemble_triple_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "query_residual",
            "f1_cell_type_transfer_blend50_v01",
        ),
        component_weights=(0.4, 0.4, 0.2),
    ),
    # k5 hazard + supportx (best individual models)
    "f1_ensemble_hv2_sx_50_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_sx_50_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.5, 0.5),
    ),
    # k7 hazard + supportx
    "f1_ensemble_hv2k7_sx_50_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2k7_sx_50_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k7_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.5, 0.5),
    ),
    # k5 hazard 60% + supportx 40%
    "f1_ensemble_hv2_sx_60_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_sx_60_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.6, 0.4),
    ),
    # k5 hazard 40% + supportx 60%
    "f1_ensemble_hv2_sx_40_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_sx_40_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.4, 0.6),
    ),
    # Arithmetic mean variants
    "f1_ensemble_hv2_sx_50_arith_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_sx_50_arith_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.5, 0.5),
        blend_mode="arithmetic",
    ),
    "f1_ensemble_hv2_qr_50_arith_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_qr_50_arith_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "query_residual",
        ),
        component_weights=(0.5, 0.5),
        blend_mode="arithmetic",
    ),
    # 3-component with bucket prior as regularizer
    "f1_ensemble_hv2_sx_bp_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_sx_bp_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
            "historical_bucket_prior",
        ),
        component_weights=(0.45, 0.45, 0.10),
    ),
    # k5 hazard 45% + supportx 55%
    "f1_ensemble_hv2_sx_45_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_sx_45_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.45, 0.55),
    ),
    # k5 hazard 55% + supportx 45%
    "f1_ensemble_hv2_sx_55_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_sx_55_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.55, 0.45),
    ),
    # 3-model: two hazard variants + supportx
    "f1_ensemble_hv2duo_sx_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2duo_sx_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_hazard_posterior_v2_k9_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.25, 0.25, 0.5),
    ),
    # s=1 hazard + supportx ensemble
    "f1_ensemble_hv2s1_sx_50_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2s1_sx_50_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_s1_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.5, 0.5),
    ),
    # LOW PROBABILITY FLOOR COMPONENTS (agent7 insight: floor=0.01 is massively over-conservative)
    # Both components use low floor, ensemble also uses low floor
    "f1_ensemble_hv2f001_sxf001_50_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2f001_sxf001_50_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_f001_v01",
            "f1_student_query_residual_supportx_f001_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.001,
    ),
    "f1_ensemble_hv2f005_sxf005_50_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2f005_sxf005_50_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_f005_v01",
            "f1_student_query_residual_supportx_f005_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.005,
    ),
    "f1_ensemble_hv2f0003_sxf0003_50_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2f0003_sxf0003_50_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_f0003_v01",
            "f1_student_query_residual_supportx_f0003_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.0003,
    ),
    "f1_ensemble_hv2f0005_sxf0005_50_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2f0005_sxf0005_50_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_f0005_v01",
            "f1_student_query_residual_supportx_f0005_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.0005,
    ),
    # LOW FLOOR + OBS BLENDING with different weights
    "f1_ensemble_hv2f0001_sxf0001_40_obs20_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2f0001_sxf0001_40_obs20_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_f0001_v01",
            "f1_student_query_residual_supportx_f0001_v01",
        ),
        component_weights=(0.4, 0.6),
        probability_floor=0.0001,
        obs_blend_temperature=20.0,
    ),
    "f1_ensemble_hv2f0001_sxf0001_60_obs20_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2f0001_sxf0001_60_obs20_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_f0001_v01",
            "f1_student_query_residual_supportx_f0001_v01",
        ),
        component_weights=(0.6, 0.4),
        probability_floor=0.0001,
        obs_blend_temperature=20.0,
    ),
    # SPATIAL SMOOTHING + OBS BLENDING + LOW FLOOR (all 3 innovations combined)
    "f1_ensemble_hv2f0001_sxf0001_50_obs20_smooth03_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2f0001_sxf0001_50_obs20_smooth03_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_f0001_v01",
            "f1_student_query_residual_supportx_f0001_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.0001,
        obs_blend_temperature=20.0,
        spatial_smooth_sigma=0.3,
    ),
    # RANK 5 + LOW FLOOR ensemble (agent1's full architecture)
    "f1_ensemble_hv2r5f0001_sxf0001_50_obs20_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2r5f0001_sxf0001_50_obs20_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r5_f0001_v01",
            "f1_student_query_residual_supportx_f0001_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.0001,
        obs_blend_temperature=20.0,
    ),
    # Agent1 full: r5 + m30 + low floor
    "f1_ensemble_hv2r5f0001m30_sxf0001_50_obs20_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2r5f0001m30_sxf0001_50_obs20_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r5_f0001_m30_v01",
            "f1_student_query_residual_supportx_f0001_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.0001,
        obs_blend_temperature=20.0,
    ),
    # m=0.30 + f=0.0003 (agent1 + agent7 combined insights)
    "f1_ensemble_hv2f0003m30_sxf0003_50_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2f0003m30_sxf0003_50_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_f0003_m30_v01",
            "f1_student_query_residual_supportx_f0003_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.0003,
    ),
    # f=0.0001 (even lower)
    "f1_ensemble_hv2f0001_sxf0001_50_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2f0001_sxf0001_50_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_f0001_v01",
            "f1_student_query_residual_supportx_f0001_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.0001,
    ),
    # OBSERVATION-FREQUENCY BLENDING (agent1 innovation) + low floor
    "f1_ensemble_hv2f0001_sxf0001_50_obs20_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2f0001_sxf0001_50_obs20_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_f0001_v01",
            "f1_student_query_residual_supportx_f0001_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.0001,
        obs_blend_temperature=20.0,
    ),
    "f1_ensemble_hv2f0001_sxf0001_50_obs10_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2f0001_sxf0001_50_obs10_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_f0001_v01",
            "f1_student_query_residual_supportx_f0001_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.0001,
        obs_blend_temperature=10.0,
    ),
    "f1_ensemble_hv2f0001_sxf0001_50_obs15_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2f0001_sxf0001_50_obs15_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_f0001_v01",
            "f1_student_query_residual_supportx_f0001_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.0001,
        obs_blend_temperature=15.0,
    ),
    "f1_ensemble_hv2f0001_sxf0001_50_obs30_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2f0001_sxf0001_50_obs30_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_f0001_v01",
            "f1_student_query_residual_supportx_f0001_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.0001,
        obs_blend_temperature=30.0,
    ),
    "f1_ensemble_hv2f0003_sxf0003_50_obs20_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2f0003_sxf0003_50_obs20_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_f0003_v01",
            "f1_student_query_residual_supportx_f0003_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.0003,
        obs_blend_temperature=20.0,
    ),
    # LOW PROBABILITY FLOOR VARIANTS (ensemble-only floor, components keep 0.01)
    "f1_ensemble_hv2_sx_50_f005_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_sx_50_f005_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.005,
    ),
    "f1_ensemble_hv2_sx_50_f003_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_sx_50_f003_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.003,
    ),
    "f1_ensemble_hv2_sx_50_f001_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_sx_50_f001_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.001,
    ),
    "f1_ensemble_hv2_sx_50_f0003_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_sx_50_f0003_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
        ),
        component_weights=(0.5, 0.5),
        probability_floor=0.0003,
    ),
    # 3-model: hazard k5 + supportx + plain qr
    "f1_ensemble_hv2_sx_qr_v01": EnsembleModelSpec(
        model_name="f1_ensemble_hv2_sx_qr_v01",
        component_model_names=(
            "f1_hazard_posterior_v2_k5_r3_v01",
            "f1_student_query_residual_supportx_v01",
            "query_residual",
        ),
        component_weights=(0.5, 0.25, 0.25),
    ),
}


def supported_ensemble_model_names() -> list[str]:
    return sorted(_ENSEMBLE_SPECS.keys())


def resolve_ensemble_model_spec(
    model_name: str,
) -> EnsembleModelSpec | None:
    return _ENSEMBLE_SPECS.get(model_name)
