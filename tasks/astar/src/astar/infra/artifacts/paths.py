from __future__ import annotations

from pathlib import Path

from pydantic import BaseModel, ConfigDict, Field


class WorkspacePaths(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    root: Path = Field(default_factory=lambda: Path.cwd())

    @classmethod
    def from_root(cls, root: str | Path) -> WorkspacePaths:
        return cls(root=Path(root).resolve())

    @property
    def data_dir(self) -> Path:
        return self.root / "data"

    @property
    def raw_dir(self) -> Path:
        return self.data_dir / "raw"

    @property
    def derived_dir(self) -> Path:
        return self.data_dir / "derived"

    @property
    def artifacts_dir(self) -> Path:
        return self.data_dir / "artifacts"

    @property
    def catalog_path(self) -> Path:
        return self.data_dir / "catalog.duckdb"

    def ensure_layout(self) -> None:
        directories = [
            self.raw_dir / "rounds",
            self.raw_dir / "queries",
            self.raw_dir / "replays",
            self.raw_dir / "submissions",
            self.raw_dir / "analyses",
            self.derived_dir / "query_log",
            self.derived_dir / "cell_observations",
            self.derived_dir / "settlement_observations",
            self.derived_dir / "replay_summaries",
            self.derived_dir / "features",
            self.derived_dir / "evidence",
            self.derived_dir / "predictions",
            self.derived_dir / "analyses",
            self.artifacts_dir / "reports",
            self.artifacts_dir / "plots",
            self.artifacts_dir / "datasets",
            self.artifacts_dir / "models",
            self.artifacts_dir / "replays",
            self.artifacts_dir / "runs",
            self.artifacts_dir / "episodes",
            self.artifacts_dir / "live_specs",
            self.artifacts_dir / "benchmarks",
            self.artifacts_dir / "comparisons",
        ]
        for directory in directories:
            directory.mkdir(parents=True, exist_ok=True)

    def raw_round_path(self, round_id: str) -> Path:
        return self.raw_dir / "rounds" / f"{round_id}.json"

    def raw_query_dir(self, round_id: str) -> Path:
        return self.raw_dir / "queries" / round_id

    def raw_query_path(self, round_id: str, query_id: str) -> Path:
        return self.raw_query_dir(round_id) / f"{query_id}.json"

    def raw_replay_dir(self, round_id: str, seed_index: int) -> Path:
        return self.raw_dir / "replays" / round_id / f"seed_index={seed_index}"

    def raw_submission_dir(self, round_id: str) -> Path:
        return self.raw_dir / "submissions" / round_id

    def raw_analysis_dir(self, round_id: str) -> Path:
        return self.raw_dir / "analyses" / round_id

    def query_log_path(self, round_id: str) -> Path:
        return self.derived_dir / "query_log" / f"round_id={round_id}.parquet"

    def cell_observations_path(self, round_id: str) -> Path:
        return self.derived_dir / "cell_observations" / f"round_id={round_id}.parquet"

    def settlement_observations_path(self, round_id: str) -> Path:
        return self.derived_dir / "settlement_observations" / f"round_id={round_id}.parquet"

    def feature_dir(self, round_id: str) -> Path:
        return self.derived_dir / "features" / f"round_id={round_id}"

    def replay_summary_dir(self, round_id: str) -> Path:
        return self.derived_dir / "replay_summaries" / f"round_id={round_id}"

    def replay_summary_path(self, round_id: str, seed_index: int) -> Path:
        return self.replay_summary_dir(round_id) / f"seed_index={seed_index}.npz"

    def feature_tensor_path(self, round_id: str, seed_index: int) -> Path:
        return self.feature_dir(round_id) / f"seed_index={seed_index}.npz"

    def evidence_dir(self, round_id: str) -> Path:
        return self.derived_dir / "evidence" / f"round_id={round_id}"

    def evidence_tensor_path(self, round_id: str, seed_index: int) -> Path:
        return self.evidence_dir(round_id) / f"seed_index={seed_index}.npz"

    def prediction_dir(self, round_id: str) -> Path:
        return self.derived_dir / "predictions" / f"round_id={round_id}"

    def prediction_tensor_path(self, round_id: str, seed_index: int) -> Path:
        return self.prediction_dir(round_id) / f"seed_index={seed_index}.npz"

    def analysis_tensor_path(self, round_id: str, seed_index: int) -> Path:
        return self.derived_dir / "analyses" / f"round_id={round_id}_seed_index={seed_index}.npz"

    def report_dir(self, round_id: str) -> Path:
        return self.artifacts_dir / "reports" / round_id

    def episode_dir(self, round_id: str) -> Path:
        return self.artifacts_dir / "episodes" / round_id

    def replay_artifact_dir(self, round_id: str) -> Path:
        return self.artifacts_dir / "replays" / round_id

    def datasets_dir(self) -> Path:
        return self.artifacts_dir / "datasets"

    def dataset_dir(self, dataset_name: str) -> Path:
        return self.datasets_dir() / dataset_name

    def models_dir(self) -> Path:
        return self.artifacts_dir / "models"

    def model_dir(self, model_name: str) -> Path:
        return self.models_dir() / model_name

    def live_spec_path(self, round_id: str, spec_name: str) -> Path:
        return self.artifacts_dir / "live_specs" / round_id / f"{spec_name}.json"

    def benchmark_dir(self) -> Path:
        return self.artifacts_dir / "benchmarks"

    def benchmark_manifest_path(self, name: str) -> Path:
        return self.benchmark_dir() / f"{name}.json"

    def benchmark_result_path(self, name: str) -> Path:
        return self.benchmark_dir() / f"result__{name}.json"

    def comparison_dir(self) -> Path:
        return self.artifacts_dir / "comparisons"

    def comparison_result_path(self, name: str) -> Path:
        return self.comparison_dir() / f"{name}.json"


__all__ = ["WorkspacePaths"]
