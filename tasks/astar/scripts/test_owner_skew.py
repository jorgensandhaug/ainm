from astar.student.predictor.query_residual import _owner_summary
from astar.core.trajectory import LiveQueryObs, LiveSettlementObs
from astar.core.grid import Viewport
import numpy as np

# A map with 2 equal settlements of different owners
base_obs = [
    LiveQueryObs(
        round_id="r", seed_index=0, query_index=0,
        viewport=Viewport(x=0, y=0, w=1, h=1), grid=np.zeros((1,1)),
        settlements=[LiveSettlementObs(x=0, y=0, population=100.0, alive=True, has_port=False, owner_id=1)]
    ),
    LiveQueryObs(
        round_id="r", seed_index=0, query_index=1,
        viewport=Viewport(x=1, y=1, w=1, h=1), grid=np.zeros((1,1)),
        settlements=[LiveSettlementObs(x=1, y=1, population=100.0, alive=True, has_port=False, owner_id=2)]
    )
]

print("Base stats (Count, MaxShare, HHI):", _owner_summary(base_obs))

# Now we repeatedly query owner 1's settlement 99 more times
skewed_obs = [base_obs[0]] * 100 + [base_obs[1]]
print("Skewed stats (Count, MaxShare, HHI):", _owner_summary(skewed_obs))

