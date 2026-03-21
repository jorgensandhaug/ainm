import sys
import numpy as np

from astar.envs.conversion import round_context_to_live_inference_context
from astar.envs.types import build_round_context_from_detail
from astar.history.datasets.synthetic_live import (
    build_synthetic_live_dataset,
    load_synthetic_episode,
)
from astar.history.episodes.build import build_round_episode
from astar.infra.artifacts.paths import WorkspacePaths as RepoPaths
from astar.infra.artifacts.store import read_round_record
from astar.student.posterior.state_space_student import StateSpaceStudent
from astar.teacher.dynamics.state_space_teacher import StateSpaceTeacher
from tests.conftest import ROUND_ID

def main():
    paths = RepoPaths()
    episode = build_round_episode(paths, ROUND_ID)
    teacher = StateSpaceTeacher(
        name="state_space_teacher_test",
        max_site_rows=10_000,
        max_live_rows=10_000,
        max_pairwise_rows=20_000,
        max_ruin_rows=10_000,
        max_initial_rows=10_000,
    ).fit([episode])
    
    dataset = build_synthetic_live_dataset(
        paths,
        round_ids=[ROUND_ID],
        policy_name="coverage",
        samples_per_round=1,
        dataset_name="synthetic_live_state_space_test",
        regime_encoder=teacher,
    )
    
    student = StateSpaceStudent.fit_from_dataset(
        dataset,
        teacher,
        prototype_count=2,
        decoder_rollouts=2,  # Very low rollouts!
        terminal_calibration_rollouts=1,
        max_terminal_calibration_samples=1,
    )
    
    artifact = load_synthetic_episode(
        dataset.dataset_dir / "episodes" / f"{ROUND_ID}__sample_index=0.json"
    )
    round_record = read_round_record(paths, ROUND_ID)
    round_context = build_round_context_from_detail(round_record.round)
    context = round_context_to_live_inference_context(round_context, artifact.observations)
    
    prediction = student.predict_seed(context, 0)
    
    zeros = np.sum(prediction == 0.0)
    total = prediction.size
    print(f"Total cells x classes: {total}")
    print(f"Zeros in prediction: {zeros}")
    if zeros > 0:
        print("BUG FOUND: Missing probability floor in StateSpaceStudent predictions!")

if __name__ == "__main__":
    main()
