from __future__ import annotations

import os
import time
from typing import Any

import httpx
from pydantic import BaseModel, ConfigDict, Field

from astar.api.auth import AuthConfig
from astar.infra.api.dto import (
    AnalysisResponse,
    BudgetStatus,
    PredictionSummary,
    ReplayRequest,
    ReplayResponse,
    RoundDetail,
    RoundSummary,
    SimulationRequest,
    SimulationResponse,
    SubmissionRequest,
    SubmissionResponse,
)


class ClientConfig(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    base_url: str = "https://api.ainm.no/astar-island"
    timeout_seconds: float = Field(default=30.0, gt=0.0)
    replay_rate_limit_per_second: float = Field(default=1.0, gt=0.0)
    simulate_rate_limit_per_second: float = Field(default=5.0, gt=0.0)
    submit_rate_limit_per_second: float = Field(default=2.0, gt=0.0)
    retry_attempts: int = Field(default=4, ge=0)
    retry_backoff_seconds: float = Field(default=0.5, gt=0.0)

    @classmethod
    def from_env(cls) -> ClientConfig:
        return cls(base_url=os.environ.get("ASTAR_BASE_URL", "https://api.ainm.no/astar-island"))


class AstarApiClient:
    def __init__(self, config: ClientConfig, auth: AuthConfig | None = None) -> None:
        self._config = config
        self._auth = auth or AuthConfig.from_env()
        self._last_request_started_at: dict[str, float] = {}

    def _rate_limit_key(self, method: str, path: str) -> str | None:
        if method == "POST" and path == "/replay":
            return "replay"
        if method == "POST" and path == "/simulate":
            return "simulate"
        if method == "POST" and path == "/submit":
            return "submit"
        return None

    def _min_interval_seconds(self, key: str | None) -> float:
        if key == "replay":
            return 1.0 / self._config.replay_rate_limit_per_second
        if key == "simulate":
            return 1.0 / self._config.simulate_rate_limit_per_second
        if key == "submit":
            return 1.0 / self._config.submit_rate_limit_per_second
        return 0.0

    def _wait_for_rate_limit(self, key: str | None) -> None:
        min_interval = self._min_interval_seconds(key)
        if key is None or min_interval <= 0.0:
            return

        now = time.monotonic()
        last_started_at = self._last_request_started_at.get(key)
        if last_started_at is not None:
            delay = min_interval - (now - last_started_at)
            if delay > 0.0:
                time.sleep(delay)

        self._last_request_started_at[key] = time.monotonic()

    def _retry_delay_seconds(
        self,
        response: httpx.Response,
        attempt_index: int,
        key: str | None,
    ) -> float:
        retry_after = response.headers.get("Retry-After")
        if retry_after is not None:
            try:
                return max(float(retry_after), self._min_interval_seconds(key))
            except ValueError:
                pass

        backoff_seconds = float(self._config.retry_backoff_seconds) * float(2**attempt_index)
        return max(backoff_seconds, self._min_interval_seconds(key))

    def _request(self, method: str, path: str, json_body: dict[str, Any] | None = None) -> Any:
        key = self._rate_limit_key(method, path)
        with httpx.Client(
            base_url=self._config.base_url,
            timeout=self._config.timeout_seconds,
            headers=self._auth.headers(),
            cookies=self._auth.cookies(),
        ) as client:
            for attempt_index in range(self._config.retry_attempts + 1):
                self._wait_for_rate_limit(key)
                response = client.request(method=method, url=path, json=json_body)
                if response.status_code != 429:
                    response.raise_for_status()
                    return response.json()
                if attempt_index >= self._config.retry_attempts:
                    response.raise_for_status()
                time.sleep(self._retry_delay_seconds(response, attempt_index, key))

        raise RuntimeError("request loop exited unexpectedly")

    def list_rounds(self) -> list[RoundSummary]:
        payload = self._request("GET", "/rounds")
        return [RoundSummary.model_validate(item) for item in payload]

    def get_active_round(self) -> RoundSummary:
        rounds = self.list_rounds()
        for round_summary in rounds:
            if round_summary.status == "active":
                return round_summary
        raise ValueError("no active round found")

    def get_round(self, round_id: str) -> RoundDetail:
        payload = self._request("GET", f"/rounds/{round_id}")
        return RoundDetail.model_validate(payload)

    def get_budget(self) -> BudgetStatus:
        payload = self._request("GET", "/budget")
        return BudgetStatus.model_validate(payload)

    def replay(self, request: ReplayRequest) -> ReplayResponse:
        payload = self._request("POST", "/replay", json_body=request.model_dump(mode="json"))
        return ReplayResponse.model_validate(payload)

    def simulate(self, request: SimulationRequest) -> SimulationResponse:
        payload = self._request("POST", "/simulate", json_body=request.model_dump(mode="json"))
        return SimulationResponse.model_validate(payload)

    def submit_prediction(self, request: SubmissionRequest) -> SubmissionResponse:
        payload = self._request("POST", "/submit", json_body=request.model_dump(mode="json"))
        return SubmissionResponse.model_validate(payload)

    def my_predictions(self, round_id: str) -> list[PredictionSummary]:
        payload = self._request("GET", f"/my-predictions/{round_id}")
        return [PredictionSummary.model_validate(item) for item in payload]

    def get_analysis(self, round_id: str, seed_index: int) -> AnalysisResponse:
        payload = self._request("GET", f"/analysis/{round_id}/{seed_index}")
        return AnalysisResponse.model_validate(payload)
