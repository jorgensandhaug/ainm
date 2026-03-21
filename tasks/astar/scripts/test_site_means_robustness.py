from astar.observe.evidence import _settlement_means_from_observations
from astar.core.trajectory import LiveQueryObs, LiveSettlementObs
from astar.core.grid import Viewport
import numpy as np

# Scenario 1: Mixed Nones and valid observations for different sites
obs = [
    LiveQueryObs(
        round_id="r1", seed_index=0, query_index=0,
        viewport=Viewport(x=0,y=0,w=5,h=5), grid=np.zeros((5,5)),
        settlements=[
            LiveSettlementObs(x=0, y=0, population=100.0, food=None, wealth=10.0, defense=None, has_port=False, alive=True, owner_id=1),
            LiveSettlementObs(x=1, y=1, population=200.0, food=50.0, wealth=20.0, defense=10.0, has_port=False, alive=True, owner_id=1)
        ]
    )
]
print("Mixed None obs:", _settlement_means_from_observations(obs))

# Scenario 2: What if we have overlapping queries where one has food=None and the other has food=50.0?
obs2 = [
    LiveQueryObs(
        round_id="r1", seed_index=0, query_index=0,
        viewport=Viewport(x=0,y=0,w=5,h=5), grid=np.zeros((5,5)),
        settlements=[
            LiveSettlementObs(x=0, y=0, population=100.0, food=None, wealth=10.0, defense=None, has_port=False, alive=True, owner_id=1),
        ]
    ),
    LiveQueryObs(
        round_id="r1", seed_index=0, query_index=1,
        viewport=Viewport(x=0,y=0,w=5,h=5), grid=np.zeros((5,5)),
        settlements=[
            LiveSettlementObs(x=0, y=0, population=110.0, food=50.0, wealth=20.0, defense=10.0, has_port=False, alive=True, owner_id=1),
        ]
    )
]
print("Overlap with missing obs:", _settlement_means_from_observations(obs2))
