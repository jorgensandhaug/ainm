from astar.core.trajectory import LiveQueryObs, LiveSettlementObs
from astar.core.grid import Viewport
import numpy as np

def _owner_summary_fixed(observations):
    site_owners = {}
    for observation in observations:
        for settlement in observation.settlements:
            if settlement.owner_id is None:
                continue
            key = (settlement.y, settlement.x)
            if key not in site_owners:
                site_owners[key] = {}
            site_owners[key][settlement.owner_id] = site_owners[key].get(settlement.owner_id, 0) + 1
            
    if not site_owners:
        return (0.0, 0.0, 0.0)
        
    global_owner_expected = {}
    for site_counts in site_owners.values():
        total_obs = float(sum(site_counts.values()))
        for owner_id, count in site_counts.items():
            global_owner_expected[owner_id] = global_owner_expected.get(owner_id, 0.0) + (float(count) / total_obs)
            
    total_sites = float(len(site_owners))
    shares = np.asarray([expected / total_sites for expected in global_owner_expected.values()], dtype=np.float64)
    return (
        float(len(global_owner_expected)) / 10.0,
        float(np.max(shares)),
        float(np.sum(shares * shares)),
    )

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

print("Base stats (Count, MaxShare, HHI):", _owner_summary_fixed(base_obs))

# Now we repeatedly query owner 1's settlement 99 more times
skewed_obs = [base_obs[0]] * 100 + [base_obs[1]]
print("Skewed stats (Count, MaxShare, HHI):", _owner_summary_fixed(skewed_obs))

