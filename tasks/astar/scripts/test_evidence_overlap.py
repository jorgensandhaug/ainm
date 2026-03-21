from astar.observe.evidence import _build_seed_evidence_bundle
from astar.core.trajectory import LiveQueryObs
from astar.core.grid import Viewport
from astar.core.world_state import InitialSettlementState
import numpy as np

# Create overlapping observations
grid1 = np.full((15, 15), 1) # all settlements
grid2 = np.full((15, 15), 1)

obs1 = LiveQueryObs(
    round_id="test", seed_index=0, query_index=0,
    viewport=Viewport(x=0, y=0, w=15, h=15),
    grid=grid1,
    settlements=[]
)

obs2 = LiveQueryObs(
    round_id="test", seed_index=0, query_index=1,
    viewport=Viewport(x=10, y=0, w=15, h=15), # Overlaps in x from 10 to 15
    grid=grid2,
    settlements=[]
)

bundle = _build_seed_evidence_bundle(
    round_id="test",
    seed_index=0,
    map_width=40,
    map_height=40,
    observations=[obs1, obs2]
)

overlap_counts = bundle.observed_class_count_tensor[0, 10:15, 1]
single_counts = bundle.observed_class_count_tensor[0, 0:5, 1]

print("Overlap counts:", overlap_counts)
print("Single counts:", single_counts)
print("Max in count tensor:", bundle.observed_class_count_tensor.max())
print("Class frequencies:", bundle.observed_class_frequencies)

