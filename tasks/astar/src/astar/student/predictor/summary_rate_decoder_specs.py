from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class SummaryRateDecoderModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    request_names: tuple[str, ...]
    model_name: str
    budget: int = Field(default=50, ge=1)
    samples_per_round: int = Field(default=4, ge=1)
    k_neighbors: int = Field(default=7, ge=1)
    ridge_lambda: float = Field(default=12.0, ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    include_teacher_logits: bool = False
    target_family: str = "rates"
    summary_feature_variant: str = "basic"


SUMMARY_RATE_DECODER_MODEL_SPECS = (
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_v01",),
        model_name="f1_summary_rate_decoder_v01",
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_teacher_v01",),
        model_name="f1_summary_rate_decoder_teacher_v01",
        include_teacher_logits=True,
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_collapse_portsplit_v01",),
        model_name="f1_summary_rate_decoder_collapse_portsplit_v01",
        target_family="collapse_portsplit",
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_collapse_portsplit_teacher_v01",),
        model_name="f1_summary_rate_decoder_collapse_portsplit_teacher_v01",
        target_family="collapse_portsplit",
        include_teacher_logits=True,
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_birth_collapse_portsplit_v01",),
        model_name="f1_summary_rate_decoder_birth_collapse_portsplit_v01",
        target_family="birth_collapse_portsplit",
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_birth_collapse_portsplit_teacher_v01",),
        model_name="f1_summary_rate_decoder_birth_collapse_portsplit_teacher_v01",
        target_family="birth_collapse_portsplit",
        include_teacher_logits=True,
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_collapse_timing_stress_v01",),
        model_name="f1_summary_rate_decoder_collapse_timing_stress_v01",
        target_family="collapse_timing_stress",
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_collapse_timing_stress_teacher_v01",),
        model_name="f1_summary_rate_decoder_collapse_timing_stress_teacher_v01",
        target_family="collapse_timing_stress",
        include_teacher_logits=True,
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_birth_collapse_timing_stress_v01",),
        model_name="f1_summary_rate_decoder_birth_collapse_timing_stress_v01",
        target_family="birth_collapse_timing_stress",
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_birth_collapse_timing_stress_teacher_v01",),
        model_name="f1_summary_rate_decoder_birth_collapse_timing_stress_teacher_v01",
        target_family="birth_collapse_timing_stress",
        include_teacher_logits=True,
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_event_pca_r2_v01",),
        model_name="f1_summary_rate_decoder_event_pca_r2_v01",
        target_family="event_pca_r2",
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_event_pca_r2_teacher_v01",),
        model_name="f1_summary_rate_decoder_event_pca_r2_teacher_v01",
        target_family="event_pca_r2",
        include_teacher_logits=True,
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_event_pca_r3_v01",),
        model_name="f1_summary_rate_decoder_event_pca_r3_v01",
        target_family="event_pca_r3",
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_event_pca_r3_teacher_v01",),
        model_name="f1_summary_rate_decoder_event_pca_r3_teacher_v01",
        target_family="event_pca_r3",
        include_teacher_logits=True,
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_stress_v01",),
        model_name="f1_summary_rate_decoder_stress_v01",
        summary_feature_variant="stress_v1",
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_teacher_stress_v01",),
        model_name="f1_summary_rate_decoder_teacher_stress_v01",
        include_teacher_logits=True,
        summary_feature_variant="stress_v1",
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_collapse_portsplit_stress_v01",),
        model_name="f1_summary_rate_decoder_collapse_portsplit_stress_v01",
        target_family="collapse_portsplit",
        summary_feature_variant="stress_v1",
    ),
    SummaryRateDecoderModelSpec(
        request_names=("f1_summary_rate_decoder_collapse_portsplit_teacher_stress_v01",),
        model_name="f1_summary_rate_decoder_collapse_portsplit_teacher_stress_v01",
        target_family="collapse_portsplit",
        include_teacher_logits=True,
        summary_feature_variant="stress_v1",
    ),
)

_SUMMARY_RATE_DECODER_MODEL_SPECS_BY_NAME = {
    request_name: spec
    for spec in SUMMARY_RATE_DECODER_MODEL_SPECS
    for request_name in spec.request_names
}


def resolve_summary_rate_decoder_model_spec(
    model_name: str,
) -> SummaryRateDecoderModelSpec | None:
    return _SUMMARY_RATE_DECODER_MODEL_SPECS_BY_NAME.get(model_name.strip().lower())


def supported_summary_rate_decoder_model_names() -> list[str]:
    return sorted(_SUMMARY_RATE_DECODER_MODEL_SPECS_BY_NAME)


__all__ = [
    "SummaryRateDecoderModelSpec",
    "SUMMARY_RATE_DECODER_MODEL_SPECS",
    "resolve_summary_rate_decoder_model_spec",
    "supported_summary_rate_decoder_model_names",
]
