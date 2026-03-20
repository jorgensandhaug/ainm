from __future__ import annotations

import shutil
from pathlib import Path

import numpy as np
import pytest

from astar.core.prediction import PredictionBundle
from astar.core.trajectory import LiveQueryObs
from astar.envs.base import TranscriptBeliefState
from astar.envs.types import OnlineEpisodeSample, OnlineTranscript, RoundContext
from astar.infra.api.auth import AuthConfig
from astar.infra.api.client import AstarApiClient, ClientConfig
from astar.infra.api.dto import BudgetStatus, RoundDetail, SimulationRequest, SimulationResponse
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_query_records, read_round_record
from astar.workflows.live_online import run_live_online_round
from tests.conftest import ROUND_ID


class NoQueryPolicy:
    name = "no_query"

    def select(self, belief: TranscriptBeliefState, budget_left: int):  # type: ignore[no-untyped-def]
        del belief, budget_left
        return None


class UniformOnlinePredictor:
    name = "uniform_online"

    def init_belief(self, ctx: RoundContext) -> TranscriptBeliefState:
        return TranscriptBeliefState(
            online_episode=OnlineEpisodeSample(
                round_context=ctx,
                transcript=OnlineTranscript(),
            ),
        )

    def update(
        self,
        belief: TranscriptBeliefState,
        obs: LiveQueryObs,
    ) -> TranscriptBeliefState:
        return TranscriptBeliefState(
            online_episode=belief.online_episode.model_copy(
                update={
                    "transcript": belief.online_episode.transcript.model_copy(
                        update={"observations": (*belief.observations, obs)},
                    ),
                },
            ),
        )

    def predict(self, belief: TranscriptBeliefState) -> PredictionBundle:
        height = belief.round_context.map_height
        width = belief.round_context.map_width
        base_prediction = np.full((height, width, 6), 1.0 / 6.0, dtype=np.float64)
        return PredictionBundle(
            round_id=belief.round_context.round_id,
            model_name=self.name,
            predictions_by_seed={
                seed.seed_index: np.array(base_prediction, copy=True)
                for seed in belief.round_context.seeds
            },
        )


def _make_stub_client(
    round_detail: RoundDetail,
    *,
    budget_status: BudgetStatus | None = None,
    budget_error: Exception | None = None,
) -> tuple[AstarApiClient, dict[str, int]]:
    client = AstarApiClient(
        ClientConfig(base_url="http://example.test"),
        AuthConfig(),
    )
    calls = {"simulate": 0, "get_budget": 0}

    def get_round(round_id: str) -> RoundDetail:
        assert round_id == round_detail.id
        return round_detail

    def simulate(request: SimulationRequest) -> SimulationResponse:
        calls["simulate"] += 1
        raise AssertionError(f"simulate should not be called in this test: {request}")

    def get_budget() -> BudgetStatus:
        calls["get_budget"] += 1
        if budget_error is not None:
            raise budget_error
        if budget_status is None:
            raise AssertionError("get_budget stub missing budget status")
        return budget_status

    client.get_round = get_round  # type: ignore[method-assign]
    client.simulate = simulate  # type: ignore[method-assign]
    client.get_budget = get_budget  # type: ignore[method-assign]
    return client, calls


def _paths_with_round_only(tmp_path: Path, repo_root: Path) -> WorkspacePaths:
    paths = WorkspacePaths.from_root(tmp_path)
    paths.ensure_layout()
    shutil.copy(
        repo_root / "data" / "raw" / "rounds" / f"{ROUND_ID}.json",
        paths.raw_round_path(ROUND_ID),
    )
    return paths


def test_run_live_online_round_budget_zero_uses_saved_queries(
    sample_paths: WorkspacePaths,
) -> None:
    client, calls = _make_stub_client(
        read_round_record(sample_paths, ROUND_ID).round,
        budget_error=AssertionError("get_budget should not be called for budget=0 offline replay"),
    )
    predictor = UniformOnlinePredictor()
    policy = NoQueryPolicy()

    result = run_live_online_round(
        sample_paths,
        client,  # type: ignore[arg-type]
        round_id=ROUND_ID,
        predictor=predictor,
        policy=policy,
        budget=0,
        submit_predictions=False,
    )

    assert result.loaded_queries == len(read_query_records(sample_paths, ROUND_ID))
    assert result.executed_queries == 0
    assert calls["get_budget"] == 0
    assert calls["simulate"] == 0
    assert sample_paths.prediction_tensor_path(ROUND_ID, 0).exists()


def test_run_live_online_round_fails_before_queries_when_budget_exceeds_remaining(
    tmp_path: Path,
    repo_root: Path,
) -> None:
    paths = _paths_with_round_only(tmp_path, repo_root)
    client, calls = _make_stub_client(
        read_round_record(paths, ROUND_ID).round,
        budget_status=BudgetStatus(
            round_id=ROUND_ID,
            queries_used=45,
            queries_max=50,
            active=True,
        ),
    )

    with pytest.raises(ValueError, match="only 5 remain remotely"):
        run_live_online_round(
            paths,
            client,
            round_id=ROUND_ID,
            predictor=UniformOnlinePredictor(),
            policy=NoQueryPolicy(),
            budget=10,
            submit_predictions=False,
        )

    assert calls["get_budget"] == 1
    assert calls["simulate"] == 0


def test_run_live_online_round_refuses_new_live_queries_when_local_queries_exist(
    sample_paths: WorkspacePaths,
) -> None:
    client, calls = _make_stub_client(
        read_round_record(sample_paths, ROUND_ID).round,
        budget_error=AssertionError(
            "get_budget should not be called when local queries already exist",
        ),
    )

    with pytest.raises(ValueError, match="already has 3 saved local raw queries"):
        run_live_online_round(
            sample_paths,
            client,
            round_id=ROUND_ID,
            predictor=UniformOnlinePredictor(),
            policy=NoQueryPolicy(),
            budget=1,
            submit_predictions=False,
        )

    assert calls["get_budget"] == 0
    assert calls["simulate"] == 0
