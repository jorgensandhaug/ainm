import sys
import numpy as np

from astar.envs.types import build_round_context_from_detail
from astar.history.datasets.synthetic_live import build_synthetic_live_dataset
from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record
from astar.teacher.dynamics.state_space_teacher import StateSpaceTeacher
from tests.conftest import ROUND_ID

def main():
    paths = RepoPaths()
    episode = build_round_episode(paths, ROUND_ID)
    teacher = StateSpaceTeacher(
        name="state_space_teacher_test2",
        max_site_rows=10_000,
        max_live_rows=10_000,
        max_pairwise_rows=20_000,
        max_ruin_rows=10_000,
        max_initial_rows=10_000,
    ).fit([episode])
    
    record = read_round_record(paths, ROUND_ID)
    round_context = build_round_context_from_detail(record.round)
    
    regime = np.ones(teacher.regime_dim, dtype=np.float64) * 10.0
    runs = teacher.rollout(round_context.seeds[0], regime, n_rollouts=1, horizon=50)
    
    from astar.features.geometry import compute_round_features
    features = compute_round_features(record.round)
    coast = features.per_seed[0].feature("coast")
    
    inland_ports = 0
    for frame in runs[0].frames:
        for settlement in frame.settlements:
            if settlement.has_port and coast[settlement.y, settlement.x] < 0.5:
                inland_ports += 1
                
    print(f"Inland ports created: {inland_ports}")

if __name__ == "__main__":
    main()
