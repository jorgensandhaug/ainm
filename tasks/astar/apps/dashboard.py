from __future__ import annotations

from pathlib import Path

import streamlit as st

from astar.infra.artifacts.paths import WorkspacePaths
from astar.workflows.round_report import build_round_report
from astar.workflows.visualize_terminal_comparison import visualize_terminal_comparison


def main() -> None:
    st.set_page_config(page_title="Astar Island", layout="wide")
    st.title("Astar Island Dashboard")

    root = Path(__file__).resolve().parents[1]
    paths = WorkspacePaths.from_root(root)
    paths.ensure_layout()

    round_id = st.text_input("Round ID", value="00000000-0000-0000-0000-000000000001")
    seed_index = st.number_input("Seed index", min_value=0, value=0, step=1)
    report_kind = st.selectbox(
        "Report",
        options=["round_report", "terminal_comparison"],
        index=0,
    )

    if st.button("Build report"):
        if report_kind == "round_report":
            artifacts = build_round_report(paths, round_id, int(seed_index))
            figure_paths = artifacts.figure_paths or {
                "initial_map": artifacts.initial_map_path,
                "query_coverage": artifacts.coverage_path,
                "baseline_prediction": artifacts.baseline_path,
                "prediction_entropy": artifacts.entropy_path,
            }
        else:
            artifacts = visualize_terminal_comparison(paths, round_id, int(seed_index))
            figure_paths = artifacts.figure_paths
        st.markdown(artifacts.report_path.read_text(encoding="utf-8"))
        for key, image_path in sorted(figure_paths.items()):
            st.image(str(image_path), caption=key)


if __name__ == "__main__":
    main()
