from __future__ import annotations

from pathlib import Path


def test_mainline_planning_stack_is_not_yaml_driven() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    guarded_paths = [
        repo_root / "src" / "astar" / "cli.py",
        repo_root / "src" / "astar" / "baselines" / "static_semantic.py",
        repo_root / "src" / "astar" / "features" / "motifs.py",
        *sorted((repo_root / "src" / "astar" / "observe").glob("*.py")),
        *sorted((repo_root / "src" / "astar" / "observe" / "policies").glob("*.py")),
        *sorted((repo_root / "src" / "astar" / "workflows").glob("*.py")),
        *sorted((repo_root / "src" / "experiments").rglob("*.py")),
    ]

    for path in guarded_paths:
        text = path.read_text(encoding="utf-8")
        assert "import yaml" not in text, path
        assert "yaml.safe_load" not in text, path
        assert "configs/" not in text, path


def test_new_bounded_contexts_do_not_import_legacy_layers_directly() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    disallowed = (
        "from astar.api",
        "from astar.domain",
        "from astar.storage",
        "from astar.policies",
    )
    guarded_roots = [
        repo_root / "src" / "astar" / "core",
        repo_root / "src" / "astar" / "features",
        repo_root / "src" / "astar" / "models",
        repo_root / "src" / "astar" / "eval",
        repo_root / "src" / "astar" / "observe",
    ]
    for root in guarded_roots:
        for path in sorted(root.rglob("*.py")):
            text = path.read_text(encoding="utf-8")
            for prefix in disallowed:
                assert prefix not in text, f"{path}: found {prefix}"


def test_workflows_do_not_import_api_domain_storage_directly() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    disallowed = (
        "from astar.api",
        "from astar.domain",
        "from astar.storage",
        "from astar.policies",
        "from astar.ops",
    )
    for path in sorted((repo_root / "src" / "astar" / "workflows").rglob("*.py")):
        text = path.read_text(encoding="utf-8")
        for prefix in disallowed:
            assert prefix not in text, f"{path}: found {prefix}"


def test_cli_avoids_direct_legacy_ops_and_api_surface() -> None:
    repo_root = Path(__file__).resolve().parents[1]
    path = repo_root / "src" / "astar" / "cli.py"
    text = path.read_text(encoding="utf-8")
    disallowed = (
        "from astar.api.auth",
        "from astar.api.client",
        "from astar.api.schemas",
        "from astar.ops.",
    )
    for prefix in disallowed:
        assert prefix not in text, f"{path}: found {prefix}"
