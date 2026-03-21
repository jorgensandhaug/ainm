from __future__ import annotations

from astar.infra.artifacts.paths import WorkspacePaths
from astar.workflows.hazard_glm import HazardGlmAuditResult, run_hazard_glm_audit

BirthHazardGlmAuditResult = HazardGlmAuditResult


def run_birth_hazard_glm_audit(
    paths: WorkspacePaths,
    *,
    dataset_name: str = "f1_birth_riskset_nr8_v1",
    audit_name: str = "f1_birth_glm_staticlocal_audit_v01",
    ridge_lambda: float = 1.0,
    max_iter: int = 12,
    tol: float = 1e-5,
) -> BirthHazardGlmAuditResult:
    return run_hazard_glm_audit(
        paths,
        event_type="birth",
        dataset_name=dataset_name,
        audit_name=audit_name,
        ridge_lambda=ridge_lambda,
        max_iter=max_iter,
        tol=tol,
    )


__all__ = [
    "BirthHazardGlmAuditResult",
    "run_birth_hazard_glm_audit",
]
