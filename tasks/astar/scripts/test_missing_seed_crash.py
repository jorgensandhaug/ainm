import numpy as np
from pathlib import Path
from astar.student.posterior.deepset_student import _summary_vector_from_artifact
from astar.core.trajectory import LiveQueryObs
from astar.core.grid import Viewport
from astar.history.datasets.synthetic_live import SyntheticEpisodeArtifact

# Create a mock artifact with ONLY seed 1 queried, missing seed 0
obs = LiveQueryObs(
    round_id="r", seed_index=1, query_index=0,
    viewport=Viewport(x=0, y=0, w=1, h=1), grid=np.zeros((1,1)), settlements=[]
)

artifact = SyntheticEpisodeArtifact(
    round_id="r", round_number=1, sample_index=0, policy_name="test",
    regime_vector=np.zeros(3), target_sources={}, target_paths={},
    observations=(obs,)
)

# Mock load_synthetic_episode
import astar.student.posterior.deepset_student as ds
ds.load_synthetic_episode = lambda path: artifact

print("Computing vector...")
vec, reg = _summary_vector_from_artifact(Path("dummy"))
print("Vector length:", len(vec))
