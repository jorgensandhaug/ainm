from __future__ import annotations

from pathlib import Path

from astar.api.schemas import StoredQueryRecord, StoredRoundRecord
from tests.conftest import ROUND_ID


def test_round_fixture_parses(repo_root: Path) -> None:
    payload = (
        repo_root / "data" / "raw" / "rounds" / f"{ROUND_ID}.json"
    ).read_text(encoding="utf-8")
    record = StoredRoundRecord.model_validate_json(payload)
    assert record.round.map_width == 8
    assert record.round.seeds_count == 5



def test_query_fixture_parses(repo_root: Path) -> None:
    payload = (
        repo_root
        / "data"
        / "raw"
        / "queries"
        / ROUND_ID
        / "q-0001.json"
    ).read_text(encoding="utf-8")
    record = StoredQueryRecord.model_validate_json(payload)
    assert record.request.seed_index == 0
    assert record.response.viewport.w == 5
