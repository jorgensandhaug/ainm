from __future__ import annotations

from pydantic import BaseModel, ConfigDict


class ObservationEmulatorSpec(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: str = "observation_emulator_stub_v1"
    description: str = (
        "Typed seam for a future patch-joint emulator. Historical final tensors alone do not "
        "identify this object; it must be learned from logged live query transcripts."
    )
