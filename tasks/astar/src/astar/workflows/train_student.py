from __future__ import annotations

from astar.history.datasets.synthetic_live import build_synthetic_live_dataset
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.catalog.db import CatalogDB
from astar.infra.catalog.schema import CatalogEvent
from astar.student.posterior.deepset_student import SummaryBankStudent
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.workflows.results import TrainSummaryStudentResult
from astar.workflows.train_teacher import train_hazard_teacher


def train_summary_bank_student(
    paths: WorkspacePaths,
    *,
    dataset_name: str = "synthetic_live_v1",
    policy_name: str = "coverage",
    samples_per_round: int = 1,
    k_neighbors: int = 5,
    model_name: str = "summary_bank_student_v1",
    teacher_model_name: str = "hazard_teacher_v1",
) -> TrainSummaryStudentResult:
    teacher_checkpoint_path = paths.model_dir(teacher_model_name) / "checkpoint.json"
    if teacher_checkpoint_path.exists():
        teacher = HazardTeacher.load_checkpoint(teacher_checkpoint_path)
    else:
        teacher_result = train_hazard_teacher(paths, model_name=teacher_model_name)
        teacher_checkpoint_path = teacher_result.checkpoint_path
        teacher = HazardTeacher.load_checkpoint(teacher_checkpoint_path)
    dataset = build_synthetic_live_dataset(
        paths,
        policy_name=policy_name,
        samples_per_round=samples_per_round,
        dataset_name=dataset_name,
    )
    student = SummaryBankStudent.fit_from_dataset(
        dataset,
        teacher,
        k_neighbors=k_neighbors,
    )
    checkpoint_path = student.save_checkpoint(
        paths.model_dir(model_name),
        teacher_checkpoint_path,
    )
    result = TrainSummaryStudentResult(
        model_name=model_name,
        dataset=dataset,
        checkpoint_path=checkpoint_path,
        teacher_checkpoint_path=teacher_checkpoint_path,
        sample_count=int(student.summary_vectors.shape[0]),
        summary_dim=int(student.summary_vectors.shape[1]),
        regime_dim=int(student.regime_vectors.shape[1]),
    )
    CatalogDB(paths.catalog_path).log_event(
        CatalogEvent(
            event_kind="training_run",
            spec_name=model_name,
            status="ok",
            artifact_path=checkpoint_path,
            payload_json=result.model_dump(mode="json"),
        ),
    )
    return result
