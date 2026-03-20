from __future__ import annotations

from pathlib import Path

import streamlit as st

from astar.ops.round_report import build_round_report
from astar.storage.manifests import RepoPaths


def main() -> None:
    st.set_page_config(page_title="Astar Island", layout="wide")
    st.title("Astar Island Dashboard")

    root = Path(__file__).resolve().parents[1]
    paths = RepoPaths.from_root(root)
    paths.ensure_layout()

    round_id = st.text_input("Round ID", value="00000000-0000-0000-0000-000000000001")
    seed_index = st.number_input("Seed index", min_value=0, value=0, step=1)

    if st.button("Build report"):
        artifacts = build_round_report(paths, round_id, int(seed_index))
        st.markdown(artifacts.report_path.read_text(encoding="utf-8"))
        for image_path in [
            artifacts.initial_map_path,
            artifacts.coverage_path,
            artifacts.baseline_path,
            artifacts.entropy_path,
        ]:
            st.image(str(image_path), caption=image_path.name)


if __name__ == "__main__":
    main()

