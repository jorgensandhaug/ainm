from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path

import numpy as np
from pydantic import BaseModel, ConfigDict, Field

from astar.features.geometry import compute_round_features
from astar.infra.artifacts.paths import WorkspacePaths
from astar.infra.artifacts.store import read_round_record

MAX_INTERNAL_CODE = 12
FEATURE_BIN_COUNT = 5
FEATURE_BIN_EDGES = np.linspace(0.0, 1.0, FEATURE_BIN_COUNT + 1)
FEATURE_NAMES = (
    "coastal_exposure",
    "settlement_proximity",
    "frontier_score",
    "forest_density",
    "mountain_density",
)
FOOD_BUCKET_EDGES = np.asarray(
    [-1.0e18, -50.0, -10.0, 0.0, 20.0, 100.0, 1.0e18],
    dtype=np.float64,
)
FOOD_BUCKET_LABELS = (
    "<-50",
    "[-50,-10)",
    "[-10,0)",
    "[0,20)",
    "[20,100)",
    ">=100",
)
INITIAL_CODE_ORDER = (10, 11, 0, 1, 2, 3, 4, 5)
EDGE_BUCKET_LABELS = ("0", "1", "2", "3+")
INTERNAL_CODE_NAMES = {
    0: "empty",
    1: "settlement",
    2: "port",
    3: "ruin",
    4: "forest",
    5: "mountain",
    10: "ocean",
    11: "plains",
}


class ReplayEdaTransition(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    from_code: int
    from_name: str
    to_code: int
    to_name: str
    count: int = Field(ge=0)


class ReplayEdaCodeRate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    initial_code: int
    initial_name: str
    site_run_count: int = Field(ge=0)
    ever_changed_rate: float = Field(ge=0.0)
    cell_year_change_rate: float = Field(ge=0.0)
    ever_build_rate: float = Field(ge=0.0)
    ever_ruin_rate: float = Field(ge=0.0)
    ever_port_rate: float = Field(ge=0.0)


class ReplayEdaRate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    label: str
    numerator: int = Field(ge=0)
    denominator: int = Field(ge=0)
    rate: float = Field(ge=0.0)


class ReplayEdaFeatureBin(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    feature_name: str
    bin_index: int = Field(ge=0)
    bin_start: float = Field(ge=0.0)
    bin_end: float = Field(ge=0.0)
    site_count: int = Field(ge=0)
    ever_changed_rate: float = Field(ge=0.0)
    ever_build_rate: float = Field(ge=0.0)
    ever_ruin_rate: float = Field(ge=0.0)
    ever_port_rate: float = Field(ge=0.0)


class ReplayEdaEdgeRate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    edge_bucket: str
    site_count: int = Field(ge=0)
    ever_changed_rate: float = Field(ge=0.0)
    ever_build_rate: float = Field(ge=0.0)
    ever_ruin_rate: float = Field(ge=0.0)


class ReplayEdaStepSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    step: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    changed_cells_per_run: float = Field(ge=0.0)
    build_events_per_run: float = Field(ge=0.0)
    ruin_events_per_run: float = Field(ge=0.0)
    forest_gain_events_per_run: float = Field(ge=0.0)
    port_gain_events_per_run: float = Field(ge=0.0)
    clear_events_per_run: float = Field(ge=0.0)
    births_per_run: float = Field(ge=0.0)
    rebuilds_per_run: float = Field(ge=0.0)
    collapses_per_run: float = Field(ge=0.0)
    owner_flip_rate: float = Field(ge=0.0)


class ReplayEdaFoodRate(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    food_bucket: str
    exposure_count: int = Field(ge=0)
    collapse_rate: float = Field(ge=0.0)
    owner_flip_rate: float = Field(ge=0.0)


class ReplayEdaRoundSummary(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    round_id: str
    round_number: int
    run_count: int = Field(ge=0)
    changed_cell_year_rate: float = Field(ge=0.0)
    build_events_per_run: float = Field(ge=0.0)
    ruin_events_per_run: float = Field(ge=0.0)
    births_per_run: float = Field(ge=0.0)
    rebuilds_per_run: float = Field(ge=0.0)
    collapses_per_100_live: float = Field(ge=0.0)
    owner_flips_per_100_live: float = Field(ge=0.0)
    port_gains_per_100_live: float = Field(ge=0.0)


class ReplayEdaResult(BaseModel):
    model_config = ConfigDict(extra="forbid", arbitrary_types_allowed=True, frozen=True)

    summary_path: Path
    report_path: Path
    selected_round_ids: list[str]
    round_count: int = Field(ge=0)
    seed_count: int = Field(ge=0)
    replay_run_count: int = Field(ge=0)
    skipped_short_replay_count: int = Field(ge=0)
    cell_year_transition_count: int = Field(ge=0)
    changed_cell_year_count: int = Field(ge=0)
    changed_cell_year_rate: float = Field(ge=0.0)
    mountain_break_count: int = Field(ge=0)
    mountain_birth_count: int = Field(ge=0)
    ocean_change_out_count: int = Field(ge=0)
    ocean_change_in_count: int = Field(ge=0)
    inland_port_gain_count: int = Field(ge=0)
    top_transitions: list[ReplayEdaTransition]
    per_initial_code: list[ReplayEdaCodeRate]
    key_rates: list[ReplayEdaRate]
    edge_rates: list[ReplayEdaEdgeRate]
    feature_rates: list[ReplayEdaFeatureBin]
    step_summaries: list[ReplayEdaStepSummary]
    food_rates: list[ReplayEdaFoodRate]
    round_summaries: list[ReplayEdaRoundSummary]


def _safe_rate(numerator: int, denominator: int) -> float:
    if denominator <= 0:
        return 0.0
    return float(numerator) / float(denominator)


def _mountain_neighbor_mask(grid: np.ndarray) -> np.ndarray:
    mountain = grid == 5
    height, width = grid.shape
    out = np.zeros((height, width), dtype=np.bool_)
    for y in range(height):
        for x in range(width):
            y0 = max(0, y - 1)
            y1 = min(height, y + 2)
            x0 = max(0, x - 1)
            x1 = min(width, x + 2)
            out[y, x] = bool(np.any(mountain[y0:y1, x0:x1]))
    return out


def _edge_distance(grid: np.ndarray) -> np.ndarray:
    height, width = grid.shape
    yy, xx = np.indices((height, width))
    return np.minimum.reduce([yy, xx, height - 1 - yy, width - 1 - xx])


def _bin_feature(values: np.ndarray) -> np.ndarray:
    clipped = np.clip(values, 0.0, 1.0)
    return np.digitize(clipped, FEATURE_BIN_EDGES[1:-1], right=False).astype(np.int64)


def _rate_item(label: str, numerator: int, denominator: int) -> ReplayEdaRate:
    return ReplayEdaRate(
        label=label,
        numerator=numerator,
        denominator=denominator,
        rate=_safe_rate(numerator, denominator),
    )


def _top_steps(
    summaries: list[ReplayEdaStepSummary],
    attribute: str,
    *,
    limit: int = 5,
) -> list[ReplayEdaStepSummary]:
    return sorted(
        summaries,
        key=lambda item: getattr(item, attribute),
        reverse=True,
    )[:limit]


def _render_report(result: ReplayEdaResult) -> str:
    lines = [
        "# Replay EDA",
        "",
        "## Corpus",
        f"- rounds: {result.round_count}",
        f"- seeds_with_replays: {result.seed_count}",
        f"- replay_runs: {result.replay_run_count}",
        f"- skipped_short_replays: {result.skipped_short_replay_count}",
        f"- cell_year_transitions: {result.cell_year_transition_count}",
        f"- changed_cell_years: {result.changed_cell_year_count}",
        f"- changed_cell_year_rate: {result.changed_cell_year_rate:.4%}",
        "",
        "## Hard Invariants",
        f"- mountain_break_count: {result.mountain_break_count}",
        f"- mountain_birth_count: {result.mountain_birth_count}",
        f"- ocean_change_out_count: {result.ocean_change_out_count}",
        f"- ocean_change_in_count: {result.ocean_change_in_count}",
        f"- inland_port_gain_count: {result.inland_port_gain_count}",
        "",
        "## Dominant Cell Transitions",
        "| from | to | count | share_of_changes |",
        "| --- | --- | ---: | ---: |",
    ]
    for item in result.top_transitions:
        share = _safe_rate(item.count, result.changed_cell_year_count)
        lines.append(
            f"| {item.from_name} ({item.from_code}) | {item.to_name} ({item.to_code}) | "
            f"{item.count} | {share:.2%} |",
        )

    lines.extend(
        [
            "",
            "## Rates By Initial Terrain",
            "| initial | site_runs | ever_changed | cell_year_change | ever_build | ever_ruin | ever_port |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        ],
    )
    for item in result.per_initial_code:
        lines.append(
            f"| {item.initial_name} ({item.initial_code}) | {item.site_run_count} | "
            f"{item.ever_changed_rate:.2%} | {item.cell_year_change_rate:.2%} | "
            f"{item.ever_build_rate:.2%} | {item.ever_ruin_rate:.2%} | {item.ever_port_rate:.2%} |",
        )

    lines.extend(
        [
            "",
            "## Key Spatial Contrasts",
            "| label | rate | numerator | denominator |",
            "| --- | ---: | ---: | ---: |",
        ],
    )
    for item in result.key_rates:
        lines.append(f"| {item.label} | {item.rate:.2%} | {item.numerator} | {item.denominator} |")

    lines.extend(
        [
            "",
            "## Edge Buckets",
            "| edge_bucket | site_count | ever_changed | ever_build | ever_ruin |",
            "| --- | ---: | ---: | ---: | ---: |",
        ],
    )
    for item in result.edge_rates:
        lines.append(
            f"| {item.edge_bucket} | {item.site_count} | {item.ever_changed_rate:.2%} | "
            f"{item.ever_build_rate:.2%} | {item.ever_ruin_rate:.2%} |",
        )

    for feature_name in FEATURE_NAMES:
        lines.extend(
            [
                "",
                f"## Feature Gradient: {feature_name}",
                "| bin | range | site_count | ever_changed | ever_build | ever_ruin | ever_port |",
                "| --- | --- | ---: | ---: | ---: | ---: | ---: |",
            ],
        )
        feature_rows = [item for item in result.feature_rates if item.feature_name == feature_name]
        for item in feature_rows:
            lines.append(
                f"| {item.bin_index} | [{item.bin_start:.1f}, {item.bin_end:.1f}) | {item.site_count} | "
                f"{item.ever_changed_rate:.2%} | {item.ever_build_rate:.2%} | "
                f"{item.ever_ruin_rate:.2%} | {item.ever_port_rate:.2%} |",
            )

    lines.extend(
        [
            "",
            "## Temporal Peaks",
            "### Most dynamic steps",
            "| step | changed_cells/run | build/run | ruin/run | forest_gain/run | collapses/run | owner_flip_rate |",
            "| --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        ],
    )
    for item in _top_steps(result.step_summaries, "changed_cells_per_run"):
        lines.append(
            f"| {item.step} | {item.changed_cells_per_run:.2f} | {item.build_events_per_run:.2f} | "
            f"{item.ruin_events_per_run:.2f} | {item.forest_gain_events_per_run:.2f} | "
            f"{item.collapses_per_run:.2f} | {item.owner_flip_rate:.2%} |",
        )

    lines.extend(
        [
            "",
            "### Most build-heavy steps",
            "| step | build/run | port_gain/run | births/run |",
            "| --- | ---: | ---: | ---: |",
        ],
    )
    for item in _top_steps(result.step_summaries, "build_events_per_run"):
        lines.append(
            f"| {item.step} | {item.build_events_per_run:.2f} | "
            f"{item.port_gain_events_per_run:.2f} | {item.births_per_run:.2f} |",
        )

    lines.extend(
        [
            "",
            "### Most collapse-heavy steps",
            "| step | ruin/run | collapses/run | rebuilds/run |",
            "| --- | ---: | ---: | ---: |",
        ],
    )
    for item in _top_steps(result.step_summaries, "collapses_per_run"):
        lines.append(
            f"| {item.step} | {item.ruin_events_per_run:.2f} | "
            f"{item.collapses_per_run:.2f} | {item.rebuilds_per_run:.2f} |",
        )

    lines.extend(
        [
            "",
            "## Settlement Food Buckets",
            "| food_bucket | exposure_count | collapse_rate | owner_flip_rate |",
            "| --- | ---: | ---: | ---: |",
        ],
    )
    for item in result.food_rates:
        lines.append(
            f"| {item.food_bucket} | {item.exposure_count} | "
            f"{item.collapse_rate:.2%} | {item.owner_flip_rate:.2%} |",
        )

    lines.extend(
        [
            "",
            "## Most Dynamic Rounds",
            "| round_number | round_id | runs | changed_cell_year_rate | build/run | ruin/run | collapses_per_100_live | owner_flips_per_100_live |",
            "| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |",
        ],
    )
    for item in result.round_summaries[:8]:
        lines.append(
            f"| {item.round_number} | {item.round_id} | {item.run_count} | "
            f"{item.changed_cell_year_rate:.2%} | {item.build_events_per_run:.2f} | "
            f"{item.ruin_events_per_run:.2f} | {item.collapses_per_100_live:.2f} | "
            f"{item.owner_flips_per_100_live:.2f} |",
        )

    lines.extend(
        [
            "",
            "## Next Investigations",
            "- Fit simple site-level hazard models for build, ruin, port gain, and collapse using initial geometry plus previous-year settlement state.",
            "- Compare replay terminal marginals against official post-round analyses to isolate where replay support still misses uncertainty mass.",
            "- Quantify local contagion: whether nearby collapse, ruin creation, or owner flips predict next-year shocks at adjacent sites.",
            "- Cluster rounds by dynamic signature to separate expansion-heavy, maritime-heavy, collapse-heavy, and reclamation-heavy regimes.",
            "- Build residual heatmaps after controlling for coast, settlement proximity, forest density, and mountain density to expose genuinely strange map regions.",
        ],
    )
    return "\n".join(lines) + "\n"


def analyze_replay_corpus(
    paths: WorkspacePaths,
    *,
    round_ids: list[str] | None = None,
) -> ReplayEdaResult:
    replay_root = paths.raw_dir / "replays"
    round_dirs = sorted(path for path in replay_root.iterdir() if path.is_dir())
    if round_ids is not None:
        selected = set(round_ids)
        round_dirs = [path for path in round_dirs if path.name in selected]
        missing = sorted(selected - {path.name for path in round_dirs})
        if missing:
            msg = f"missing replay directories for round ids: {', '.join(missing)}"
            raise ValueError(msg)
    if not round_dirs:
        raise ValueError("no replay directories found for requested selection")

    transition_matrix = np.zeros((MAX_INTERNAL_CODE, MAX_INTERNAL_CODE), dtype=np.int64)
    site_runs_by_code = np.zeros(MAX_INTERNAL_CODE, dtype=np.int64)
    ever_changed_by_code = np.zeros(MAX_INTERNAL_CODE, dtype=np.int64)
    ever_build_by_code = np.zeros(MAX_INTERNAL_CODE, dtype=np.int64)
    ever_ruin_by_code = np.zeros(MAX_INTERNAL_CODE, dtype=np.int64)
    ever_port_by_code = np.zeros(MAX_INTERNAL_CODE, dtype=np.int64)
    cell_years_by_code = np.zeros(MAX_INTERNAL_CODE, dtype=np.int64)
    changed_cell_years_by_code = np.zeros(MAX_INTERNAL_CODE, dtype=np.int64)

    key_denominators: defaultdict[str, int] = defaultdict(int)
    key_numerators: defaultdict[str, int] = defaultdict(int)

    feature_denominators = {
        name: np.zeros(FEATURE_BIN_COUNT, dtype=np.int64) for name in FEATURE_NAMES
    }
    feature_change = {
        name: np.zeros(FEATURE_BIN_COUNT, dtype=np.int64) for name in FEATURE_NAMES
    }
    feature_build = {
        name: np.zeros(FEATURE_BIN_COUNT, dtype=np.int64) for name in FEATURE_NAMES
    }
    feature_ruin = {
        name: np.zeros(FEATURE_BIN_COUNT, dtype=np.int64) for name in FEATURE_NAMES
    }
    feature_port = {
        name: np.zeros(FEATURE_BIN_COUNT, dtype=np.int64) for name in FEATURE_NAMES
    }

    edge_denominators: defaultdict[str, int] = defaultdict(int)
    edge_change: defaultdict[str, int] = defaultdict(int)
    edge_build: defaultdict[str, int] = defaultdict(int)
    edge_ruin: defaultdict[str, int] = defaultdict(int)

    step_replay_runs = np.zeros(60, dtype=np.int64)
    step_changed_cells = np.zeros(60, dtype=np.int64)
    step_build_events = np.zeros(60, dtype=np.int64)
    step_ruin_events = np.zeros(60, dtype=np.int64)
    step_forest_gain_events = np.zeros(60, dtype=np.int64)
    step_port_gain_events = np.zeros(60, dtype=np.int64)
    step_clear_events = np.zeros(60, dtype=np.int64)
    step_live_exposure = np.zeros(60, dtype=np.int64)
    step_births = np.zeros(60, dtype=np.int64)
    step_rebuilds = np.zeros(60, dtype=np.int64)
    step_collapses = np.zeros(60, dtype=np.int64)
    step_owner_flips = np.zeros(60, dtype=np.int64)

    food_exposure = np.zeros(len(FOOD_BUCKET_LABELS), dtype=np.int64)
    food_collapse = np.zeros(len(FOOD_BUCKET_LABELS), dtype=np.int64)
    food_owner_flip = np.zeros(len(FOOD_BUCKET_LABELS), dtype=np.int64)

    round_summaries: list[ReplayEdaRoundSummary] = []
    replay_run_count = 0
    skipped_short_replay_count = 0
    seed_count = 0
    inland_port_gain_count = 0

    for round_dir in round_dirs:
        round_id = round_dir.name
        round_record = read_round_record(paths, round_id)
        round_features = compute_round_features(round_record.round)

        round_run_count = 0
        round_cell_years = 0
        round_changed_cell_years = 0
        round_build_events = 0
        round_ruin_events = 0
        round_births = 0
        round_rebuilds = 0
        round_collapses = 0
        round_owner_flips = 0
        round_port_gains = 0
        round_live_exposure = 0

        for seed_dir in sorted(path for path in round_dir.iterdir() if path.is_dir()):
            seed_index = int(seed_dir.name.split("=", 1)[1])
            seed_count += 1

            initial_grid = np.asarray(
                round_record.round.initial_states[seed_index].grid,
                dtype=np.int16,
            )
            feature_bundle = round_features.per_seed[seed_index]
            buildable_mask = np.isin(initial_grid, [0, 1, 2, 3, 4, 11])
            coast_mask = feature_bundle.feature("coast") > 0.5
            mountain_neighbor_mask = _mountain_neighbor_mask(initial_grid)
            edge_bucket = np.minimum(_edge_distance(initial_grid), 3).astype(np.int64)
            feature_bins = {
                name: _bin_feature(feature_bundle.feature(name)) for name in FEATURE_NAMES
            }

            initial_flat = initial_grid.reshape(-1)
            buildable_flat = buildable_mask.reshape(-1)
            coast_flat = coast_mask.reshape(-1)
            mountain_neighbor_flat = mountain_neighbor_mask.reshape(-1)
            edge_bucket_flat = edge_bucket.reshape(-1)

            for replay_path in sorted(seed_dir.glob("*.json")):
                record = json.loads(replay_path.read_text(encoding="utf-8"))
                frames = record["response"]["frames"]
                if len(frames) < 2:
                    skipped_short_replay_count += 1
                    continue

                replay_run_count += 1
                round_run_count += 1

                grids = np.asarray([frame["grid"] for frame in frames], dtype=np.int16)
                previous = grids[:-1]
                current = grids[1:]
                step_count = previous.shape[0]

                transition_matrix += np.bincount(
                    (previous.reshape(-1) * MAX_INTERNAL_CODE + current.reshape(-1)).astype(
                        np.int64,
                    ),
                    minlength=MAX_INTERNAL_CODE * MAX_INTERNAL_CODE,
                ).reshape(MAX_INTERNAL_CODE, MAX_INTERNAL_CODE)

                changed = previous != current
                changed_counts_by_site = changed.sum(axis=0).astype(np.int64)
                any_changed = changed_counts_by_site > 0
                previous_built = (previous == 1) | (previous == 2) | (previous == 3)
                ever_build = np.any(
                    (~previous_built) & ((current == 1) | (current == 2)),
                    axis=0,
                )
                ever_ruin = np.any((previous != 3) & (current == 3), axis=0)
                ever_port = np.any((previous != 2) & (current == 2), axis=0)

                round_cell_years += previous.size
                round_changed_cell_years += int(changed.sum())
                round_build_events += int(
                    np.count_nonzero((~previous_built) & ((current == 1) | (current == 2))),
                )
                round_ruin_events += int(np.count_nonzero((previous != 3) & (current == 3)))
                inland_port_gain_count += int(
                    np.count_nonzero((previous != 2) & (current == 2) & (~coast_mask)),
                )

                site_runs_by_code += np.bincount(initial_flat, minlength=MAX_INTERNAL_CODE)
                ever_changed_by_code += np.bincount(
                    initial_flat,
                    weights=any_changed.reshape(-1).astype(np.int64),
                    minlength=MAX_INTERNAL_CODE,
                ).astype(np.int64)
                ever_build_by_code += np.bincount(
                    initial_flat,
                    weights=ever_build.reshape(-1).astype(np.int64),
                    minlength=MAX_INTERNAL_CODE,
                ).astype(np.int64)
                ever_ruin_by_code += np.bincount(
                    initial_flat,
                    weights=ever_ruin.reshape(-1).astype(np.int64),
                    minlength=MAX_INTERNAL_CODE,
                ).astype(np.int64)
                ever_port_by_code += np.bincount(
                    initial_flat,
                    weights=ever_port.reshape(-1).astype(np.int64),
                    minlength=MAX_INTERNAL_CODE,
                ).astype(np.int64)
                cell_years_by_code += np.bincount(
                    initial_flat,
                    weights=np.full(initial_flat.shape, step_count, dtype=np.int64),
                    minlength=MAX_INTERNAL_CODE,
                ).astype(np.int64)
                changed_cell_years_by_code += np.bincount(
                    initial_flat,
                    weights=changed_counts_by_site.reshape(-1),
                    minlength=MAX_INTERNAL_CODE,
                ).astype(np.int64)

                buildable_any_changed = any_changed.reshape(-1)[buildable_flat]
                buildable_ever_build = ever_build.reshape(-1)[buildable_flat]
                buildable_ever_ruin = ever_ruin.reshape(-1)[buildable_flat]
                buildable_ever_port = ever_port.reshape(-1)[buildable_flat]

                key_denominators["buildable_sites"] += int(buildable_flat.sum())
                key_numerators["buildable_ever_changed"] += int(buildable_any_changed.sum())
                key_numerators["buildable_ever_build"] += int(buildable_ever_build.sum())
                key_numerators["buildable_ever_ruin"] += int(buildable_ever_ruin.sum())
                key_numerators["buildable_ever_port"] += int(buildable_ever_port.sum())

                coastal_buildable = buildable_flat & coast_flat
                inland_buildable = buildable_flat & (~coast_flat)
                key_denominators["coastal_buildable_sites"] += int(coastal_buildable.sum())
                key_denominators["inland_buildable_sites"] += int(inland_buildable.sum())
                key_numerators["coastal_buildable_ever_changed"] += int(
                    any_changed.reshape(-1)[coastal_buildable].sum(),
                )
                key_numerators["inland_buildable_ever_changed"] += int(
                    any_changed.reshape(-1)[inland_buildable].sum(),
                )
                key_numerators["coastal_buildable_ever_build"] += int(
                    ever_build.reshape(-1)[coastal_buildable].sum(),
                )
                key_numerators["inland_buildable_ever_build"] += int(
                    ever_build.reshape(-1)[inland_buildable].sum(),
                )
                key_numerators["coastal_buildable_ever_port"] += int(
                    ever_port.reshape(-1)[coastal_buildable].sum(),
                )
                key_numerators["inland_buildable_ever_port"] += int(
                    ever_port.reshape(-1)[inland_buildable].sum(),
                )

                mountain_adjacent_buildable = buildable_flat & mountain_neighbor_flat
                non_mountain_adjacent_buildable = buildable_flat & (~mountain_neighbor_flat)
                key_denominators["mountain_adjacent_buildable_sites"] += int(
                    mountain_adjacent_buildable.sum(),
                )
                key_denominators["non_mountain_adjacent_buildable_sites"] += int(
                    non_mountain_adjacent_buildable.sum(),
                )
                key_numerators["mountain_adjacent_buildable_ever_changed"] += int(
                    any_changed.reshape(-1)[mountain_adjacent_buildable].sum(),
                )
                key_numerators["non_mountain_adjacent_buildable_ever_changed"] += int(
                    any_changed.reshape(-1)[non_mountain_adjacent_buildable].sum(),
                )
                key_numerators["mountain_adjacent_buildable_ever_ruin"] += int(
                    ever_ruin.reshape(-1)[mountain_adjacent_buildable].sum(),
                )
                key_numerators["non_mountain_adjacent_buildable_ever_ruin"] += int(
                    ever_ruin.reshape(-1)[non_mountain_adjacent_buildable].sum(),
                )
                key_numerators["mountain_adjacent_buildable_ever_build"] += int(
                    ever_build.reshape(-1)[mountain_adjacent_buildable].sum(),
                )
                key_numerators["non_mountain_adjacent_buildable_ever_build"] += int(
                    ever_build.reshape(-1)[non_mountain_adjacent_buildable].sum(),
                )

                for feature_name, bins in feature_bins.items():
                    flat_bins = bins.reshape(-1)[buildable_flat]
                    feature_denominators[feature_name] += np.bincount(
                        flat_bins,
                        minlength=FEATURE_BIN_COUNT,
                    )
                    feature_change[feature_name] += np.bincount(
                        flat_bins,
                        weights=buildable_any_changed.astype(np.int64),
                        minlength=FEATURE_BIN_COUNT,
                    ).astype(np.int64)
                    feature_build[feature_name] += np.bincount(
                        flat_bins,
                        weights=buildable_ever_build.astype(np.int64),
                        minlength=FEATURE_BIN_COUNT,
                    ).astype(np.int64)
                    feature_ruin[feature_name] += np.bincount(
                        flat_bins,
                        weights=buildable_ever_ruin.astype(np.int64),
                        minlength=FEATURE_BIN_COUNT,
                    ).astype(np.int64)
                    feature_port[feature_name] += np.bincount(
                        flat_bins,
                        weights=buildable_ever_port.astype(np.int64),
                        minlength=FEATURE_BIN_COUNT,
                    ).astype(np.int64)

                buildable_edge = edge_bucket_flat[buildable_flat]
                edge_den_counts = np.bincount(buildable_edge, minlength=len(EDGE_BUCKET_LABELS))
                edge_change_counts = np.bincount(
                    buildable_edge,
                    weights=buildable_any_changed.astype(np.int64),
                    minlength=len(EDGE_BUCKET_LABELS),
                ).astype(np.int64)
                edge_build_counts = np.bincount(
                    buildable_edge,
                    weights=buildable_ever_build.astype(np.int64),
                    minlength=len(EDGE_BUCKET_LABELS),
                ).astype(np.int64)
                edge_ruin_counts = np.bincount(
                    buildable_edge,
                    weights=buildable_ever_ruin.astype(np.int64),
                    minlength=len(EDGE_BUCKET_LABELS),
                ).astype(np.int64)
                for index, label in enumerate(EDGE_BUCKET_LABELS):
                    edge_denominators[label] += int(edge_den_counts[index])
                    edge_change[label] += int(edge_change_counts[index])
                    edge_build[label] += int(edge_build_counts[index])
                    edge_ruin[label] += int(edge_ruin_counts[index])

                step_replay_runs[:step_count] += 1
                step_changed_cells[:step_count] += changed.reshape(step_count, -1).sum(axis=1)
                step_build_events[:step_count] += (
                    ((~previous_built) & ((current == 1) | (current == 2)))
                    .reshape(step_count, -1)
                    .sum(axis=1)
                )
                step_ruin_events[:step_count] += (
                    ((previous != 3) & (current == 3)).reshape(step_count, -1).sum(axis=1)
                )
                step_forest_gain_events[:step_count] += (
                    ((previous != 4) & (current == 4)).reshape(step_count, -1).sum(axis=1)
                )
                step_port_gain_events[:step_count] += (
                    ((previous != 2) & (current == 2)).reshape(step_count, -1).sum(axis=1)
                )
                step_clear_events[:step_count] += (
                    (
                        ((previous == 1) | (previous == 2) | (previous == 3))
                        & ((current == 0) | (current == 10) | (current == 11))
                    )
                    .reshape(step_count, -1)
                    .sum(axis=1)
                )

                for step in range(step_count):
                    previous_settlements = {
                        (item["x"], item["y"]): item for item in frames[step]["settlements"]
                    }
                    current_settlements = {
                        (item["x"], item["y"]): item for item in frames[step + 1]["settlements"]
                    }
                    positions = sorted(
                        set(previous_settlements) | set(current_settlements),
                        key=lambda item: (item[1], item[0]),
                    )
                    births = 0
                    rebuilds = 0
                    collapses = 0
                    owner_flips = 0
                    port_gains = 0
                    live_exposure = 0
                    for position in positions:
                        previous_settlement = previous_settlements.get(position)
                        current_settlement = current_settlements.get(position)
                        previous_alive = bool(
                            previous_settlement and previous_settlement["alive"],
                        )
                        current_alive = bool(current_settlement and current_settlement["alive"])
                        previous_has_port = bool(
                            previous_settlement and previous_settlement["has_port"],
                        )
                        current_has_port = bool(
                            current_settlement and current_settlement["has_port"],
                        )

                        if previous_alive:
                            live_exposure += 1
                            previous_food = float(previous_settlement["food"])
                            food_bucket = int(
                                np.digitize(previous_food, FOOD_BUCKET_EDGES[1:-1], right=False),
                            )
                            food_exposure[food_bucket] += 1
                            if not current_alive:
                                collapses += 1
                                food_collapse[food_bucket] += 1
                            elif (
                                previous_settlement["owner_id"] is not None
                                and current_settlement is not None
                                and current_settlement["owner_id"] is not None
                                and previous_settlement["owner_id"]
                                != current_settlement["owner_id"]
                            ):
                                owner_flips += 1
                                food_owner_flip[food_bucket] += 1
                            if current_alive and (not previous_has_port) and current_has_port:
                                port_gains += 1

                        if (not previous_alive) and current_alive:
                            previous_code = int(grids[step, position[1], position[0]])
                            if previous_code == 3:
                                rebuilds += 1
                            else:
                                births += 1

                    step_live_exposure[step] += live_exposure
                    step_births[step] += births
                    step_rebuilds[step] += rebuilds
                    step_collapses[step] += collapses
                    step_owner_flips[step] += owner_flips
                    round_live_exposure += live_exposure
                    round_births += births
                    round_rebuilds += rebuilds
                    round_collapses += collapses
                    round_owner_flips += owner_flips
                    round_port_gains += port_gains

        if round_run_count == 0:
            continue

        round_summaries.append(
            ReplayEdaRoundSummary(
                round_id=round_id,
                round_number=round_record.round.round_number,
                run_count=round_run_count,
                changed_cell_year_rate=_safe_rate(round_changed_cell_years, round_cell_years),
                build_events_per_run=float(round_build_events) / float(round_run_count),
                ruin_events_per_run=float(round_ruin_events) / float(round_run_count),
                births_per_run=float(round_births) / float(round_run_count),
                rebuilds_per_run=float(round_rebuilds) / float(round_run_count),
                collapses_per_100_live=100.0 * _safe_rate(
                    round_collapses,
                    round_live_exposure,
                ),
                owner_flips_per_100_live=100.0 * _safe_rate(
                    round_owner_flips,
                    round_live_exposure,
                ),
                port_gains_per_100_live=100.0 * _safe_rate(
                    round_port_gains,
                    round_live_exposure,
                ),
            ),
        )

    if replay_run_count == 0:
        raise ValueError("no multi-frame replay runs found for requested selection")

    changed_cell_year_count = int(transition_matrix.sum() - np.trace(transition_matrix))
    top_transitions: list[ReplayEdaTransition] = []
    for from_code in range(MAX_INTERNAL_CODE):
        for to_code in range(MAX_INTERNAL_CODE):
            count = int(transition_matrix[from_code, to_code])
            if from_code == to_code or count == 0:
                continue
            top_transitions.append(
                ReplayEdaTransition(
                    from_code=from_code,
                    from_name=INTERNAL_CODE_NAMES.get(from_code, f"code_{from_code}"),
                    to_code=to_code,
                    to_name=INTERNAL_CODE_NAMES.get(to_code, f"code_{to_code}"),
                    count=count,
                ),
            )
    top_transitions = sorted(top_transitions, key=lambda item: item.count, reverse=True)[:15]

    per_initial_code = [
        ReplayEdaCodeRate(
            initial_code=code,
            initial_name=INTERNAL_CODE_NAMES.get(code, f"code_{code}"),
            site_run_count=int(site_runs_by_code[code]),
            ever_changed_rate=_safe_rate(int(ever_changed_by_code[code]), int(site_runs_by_code[code])),
            cell_year_change_rate=_safe_rate(
                int(changed_cell_years_by_code[code]),
                int(cell_years_by_code[code]),
            ),
            ever_build_rate=_safe_rate(int(ever_build_by_code[code]), int(site_runs_by_code[code])),
            ever_ruin_rate=_safe_rate(int(ever_ruin_by_code[code]), int(site_runs_by_code[code])),
            ever_port_rate=_safe_rate(int(ever_port_by_code[code]), int(site_runs_by_code[code])),
        )
        for code in INITIAL_CODE_ORDER
        if int(site_runs_by_code[code]) > 0
    ]

    key_rates = [
        _rate_item(
            "buildable_ever_changed",
            key_numerators["buildable_ever_changed"],
            key_denominators["buildable_sites"],
        ),
        _rate_item(
            "buildable_ever_build",
            key_numerators["buildable_ever_build"],
            key_denominators["buildable_sites"],
        ),
        _rate_item(
            "buildable_ever_ruin",
            key_numerators["buildable_ever_ruin"],
            key_denominators["buildable_sites"],
        ),
        _rate_item(
            "buildable_ever_port",
            key_numerators["buildable_ever_port"],
            key_denominators["buildable_sites"],
        ),
        _rate_item(
            "coastal_buildable_ever_changed",
            key_numerators["coastal_buildable_ever_changed"],
            key_denominators["coastal_buildable_sites"],
        ),
        _rate_item(
            "inland_buildable_ever_changed",
            key_numerators["inland_buildable_ever_changed"],
            key_denominators["inland_buildable_sites"],
        ),
        _rate_item(
            "coastal_buildable_ever_build",
            key_numerators["coastal_buildable_ever_build"],
            key_denominators["coastal_buildable_sites"],
        ),
        _rate_item(
            "inland_buildable_ever_build",
            key_numerators["inland_buildable_ever_build"],
            key_denominators["inland_buildable_sites"],
        ),
        _rate_item(
            "coastal_buildable_ever_port",
            key_numerators["coastal_buildable_ever_port"],
            key_denominators["coastal_buildable_sites"],
        ),
        _rate_item(
            "inland_buildable_ever_port",
            key_numerators["inland_buildable_ever_port"],
            key_denominators["inland_buildable_sites"],
        ),
        _rate_item(
            "mountain_adjacent_buildable_ever_changed",
            key_numerators["mountain_adjacent_buildable_ever_changed"],
            key_denominators["mountain_adjacent_buildable_sites"],
        ),
        _rate_item(
            "non_mountain_adjacent_buildable_ever_changed",
            key_numerators["non_mountain_adjacent_buildable_ever_changed"],
            key_denominators["non_mountain_adjacent_buildable_sites"],
        ),
        _rate_item(
            "mountain_adjacent_buildable_ever_ruin",
            key_numerators["mountain_adjacent_buildable_ever_ruin"],
            key_denominators["mountain_adjacent_buildable_sites"],
        ),
        _rate_item(
            "non_mountain_adjacent_buildable_ever_ruin",
            key_numerators["non_mountain_adjacent_buildable_ever_ruin"],
            key_denominators["non_mountain_adjacent_buildable_sites"],
        ),
        _rate_item(
            "mountain_adjacent_buildable_ever_build",
            key_numerators["mountain_adjacent_buildable_ever_build"],
            key_denominators["mountain_adjacent_buildable_sites"],
        ),
        _rate_item(
            "non_mountain_adjacent_buildable_ever_build",
            key_numerators["non_mountain_adjacent_buildable_ever_build"],
            key_denominators["non_mountain_adjacent_buildable_sites"],
        ),
    ]

    edge_rates = [
        ReplayEdaEdgeRate(
            edge_bucket=label,
            site_count=edge_denominators[label],
            ever_changed_rate=_safe_rate(edge_change[label], edge_denominators[label]),
            ever_build_rate=_safe_rate(edge_build[label], edge_denominators[label]),
            ever_ruin_rate=_safe_rate(edge_ruin[label], edge_denominators[label]),
        )
        for label in EDGE_BUCKET_LABELS
    ]

    feature_rates: list[ReplayEdaFeatureBin] = []
    for feature_name in FEATURE_NAMES:
        for index in range(FEATURE_BIN_COUNT):
            site_count = int(feature_denominators[feature_name][index])
            feature_rates.append(
                ReplayEdaFeatureBin(
                    feature_name=feature_name,
                    bin_index=index,
                    bin_start=float(FEATURE_BIN_EDGES[index]),
                    bin_end=float(FEATURE_BIN_EDGES[index + 1]),
                    site_count=site_count,
                    ever_changed_rate=_safe_rate(
                        int(feature_change[feature_name][index]),
                        site_count,
                    ),
                    ever_build_rate=_safe_rate(
                        int(feature_build[feature_name][index]),
                        site_count,
                    ),
                    ever_ruin_rate=_safe_rate(
                        int(feature_ruin[feature_name][index]),
                        site_count,
                    ),
                    ever_port_rate=_safe_rate(
                        int(feature_port[feature_name][index]),
                        site_count,
                    ),
                ),
            )

    step_summaries = [
        ReplayEdaStepSummary(
            step=step,
            replay_run_count=int(step_replay_runs[step]),
            changed_cells_per_run=_safe_rate(
                int(step_changed_cells[step]),
                int(step_replay_runs[step]),
            ),
            build_events_per_run=_safe_rate(
                int(step_build_events[step]),
                int(step_replay_runs[step]),
            ),
            ruin_events_per_run=_safe_rate(
                int(step_ruin_events[step]),
                int(step_replay_runs[step]),
            ),
            forest_gain_events_per_run=_safe_rate(
                int(step_forest_gain_events[step]),
                int(step_replay_runs[step]),
            ),
            port_gain_events_per_run=_safe_rate(
                int(step_port_gain_events[step]),
                int(step_replay_runs[step]),
            ),
            clear_events_per_run=_safe_rate(
                int(step_clear_events[step]),
                int(step_replay_runs[step]),
            ),
            births_per_run=_safe_rate(int(step_births[step]), int(step_replay_runs[step])),
            rebuilds_per_run=_safe_rate(
                int(step_rebuilds[step]),
                int(step_replay_runs[step]),
            ),
            collapses_per_run=_safe_rate(
                int(step_collapses[step]),
                int(step_replay_runs[step]),
            ),
            owner_flip_rate=_safe_rate(
                int(step_owner_flips[step]),
                int(step_live_exposure[step]),
            ),
        )
        for step in range(50)
        if int(step_replay_runs[step]) > 0
    ]

    food_rates = [
        ReplayEdaFoodRate(
            food_bucket=label,
            exposure_count=int(food_exposure[index]),
            collapse_rate=_safe_rate(int(food_collapse[index]), int(food_exposure[index])),
            owner_flip_rate=_safe_rate(
                int(food_owner_flip[index]),
                int(food_exposure[index]),
            ),
        )
        for index, label in enumerate(FOOD_BUCKET_LABELS)
    ]

    round_summaries = sorted(
        round_summaries,
        key=lambda item: item.changed_cell_year_rate,
        reverse=True,
    )

    report_dir = paths.artifacts_dir / "reports" / "replay_eda"
    report_dir.mkdir(parents=True, exist_ok=True)
    summary_path = report_dir / "summary.json"
    report_path = report_dir / "report.md"

    result = ReplayEdaResult(
        summary_path=summary_path,
        report_path=report_path,
        selected_round_ids=[path.name for path in round_dirs],
        round_count=len(round_summaries),
        seed_count=seed_count,
        replay_run_count=replay_run_count,
        skipped_short_replay_count=skipped_short_replay_count,
        cell_year_transition_count=int(transition_matrix.sum()),
        changed_cell_year_count=changed_cell_year_count,
        changed_cell_year_rate=_safe_rate(changed_cell_year_count, int(transition_matrix.sum())),
        mountain_break_count=int(transition_matrix[5, :].sum() - transition_matrix[5, 5]),
        mountain_birth_count=int(transition_matrix[:, 5].sum() - transition_matrix[5, 5]),
        ocean_change_out_count=int(transition_matrix[10, :].sum() - transition_matrix[10, 10]),
        ocean_change_in_count=int(transition_matrix[:, 10].sum() - transition_matrix[10, 10]),
        inland_port_gain_count=inland_port_gain_count,
        top_transitions=top_transitions,
        per_initial_code=per_initial_code,
        key_rates=key_rates,
        edge_rates=edge_rates,
        feature_rates=feature_rates,
        step_summaries=step_summaries,
        food_rates=food_rates,
        round_summaries=round_summaries,
    )

    summary_path.write_text(
        json.dumps(result.model_dump(mode="json"), indent=2),
        encoding="utf-8",
    )
    report_path.write_text(_render_report(result), encoding="utf-8")
    return result


__all__ = ["ReplayEdaResult", "analyze_replay_corpus"]
