from __future__ import annotations

import os

from pydantic import BaseModel, ConfigDict, SecretStr


class AuthConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    bearer_token: SecretStr | None = None
    access_token: SecretStr | None = None

    @classmethod
    def from_env(cls) -> AuthConfig:
        bearer_token = os.environ.get("ASTAR_BEARER_TOKEN")
        access_token = os.environ.get("ASTAR_ACCESS_TOKEN")
        return cls(
            bearer_token=SecretStr(bearer_token) if bearer_token else None,
            access_token=SecretStr(access_token) if access_token else None,
        )

    def headers(self) -> dict[str, str]:
        if self.bearer_token is None:
            return {}
        return {"Authorization": f"Bearer {self.bearer_token.get_secret_value()}"}

    def cookies(self) -> dict[str, str]:
        if self.access_token is None:
            return {}
        return {"access_token": self.access_token.get_secret_value()}

