from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class SummaryBankDecoderModelSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    request_names: tuple[str, ...]
    model_name: str
    budget: int = Field(default=50, ge=1)
    samples_per_round: int = Field(default=4, ge=1)
    k_neighbors: int = Field(default=7, ge=1)
    ridge_lambda: float = Field(default=12.0, ge=0.0)
    probability_floor: float = Field(default=0.01, gt=0.0, lt=1.0)
    include_teacher_logits: bool = False


SUMMARY_BANK_DECODER_MODEL_SPECS = (
    SummaryBankDecoderModelSpec(
        request_names=("f1_summary_bank_decoder_v01",),
        model_name="f1_summary_bank_decoder_v01",
    ),
    SummaryBankDecoderModelSpec(
        request_names=("f1_summary_bank_decoder_teacher_v01",),
        model_name="f1_summary_bank_decoder_teacher_v01",
        include_teacher_logits=True,
    ),
    SummaryBankDecoderModelSpec(
        request_names=("f1_summary_bank_decoder_r3_v02",),
        model_name="f1_summary_bank_decoder_r3_v02",
        ridge_lambda=3.0,
    ),
    SummaryBankDecoderModelSpec(
        request_names=("f1_summary_bank_decoder_teacher_r3_v02",),
        model_name="f1_summary_bank_decoder_teacher_r3_v02",
        ridge_lambda=3.0,
        include_teacher_logits=True,
    ),
    SummaryBankDecoderModelSpec(
        request_names=("f1_summary_bank_decoder_teacher_r1_v02",),
        model_name="f1_summary_bank_decoder_teacher_r1_v02",
        ridge_lambda=1.0,
        include_teacher_logits=True,
    ),
)

_SUMMARY_BANK_DECODER_MODEL_SPECS_BY_NAME = {
    request_name: spec
    for spec in SUMMARY_BANK_DECODER_MODEL_SPECS
    for request_name in spec.request_names
}


def resolve_summary_bank_decoder_model_spec(
    model_name: str,
) -> SummaryBankDecoderModelSpec | None:
    return _SUMMARY_BANK_DECODER_MODEL_SPECS_BY_NAME.get(model_name.strip().lower())


def supported_summary_bank_decoder_model_names() -> list[str]:
    return sorted(_SUMMARY_BANK_DECODER_MODEL_SPECS_BY_NAME)


__all__ = [
    "SummaryBankDecoderModelSpec",
    "SUMMARY_BANK_DECODER_MODEL_SPECS",
    "resolve_summary_bank_decoder_model_spec",
    "supported_summary_bank_decoder_model_names",
]
