import numpy as np
from astar.teacher.dynamics.hazard_teacher import HazardTeacher
from astar.history.episodes.models import RoundEpisode, SeedEpisode

# Let's mock the scenario to absolutely prove the math.
build_score = np.array([[10.0]]) # Very high, sigmoid -> ~1.0
ruin_score = np.array([[0.0]]) # sigmoid -> 0.5 (meaning 50% of the board is ruin)
port_score = np.array([[-10.0]]) # sigmoid -> ~0.0 (0% port)
buildable = np.array([[1.0]])
coast = np.array([[1.0]])

# Old logic
def old_logic():
    build_prob = 1.0 * buildable
    ruin_cond = 0.5
    port_cond = 0.0 * coast
    
    ruin_prob = build_prob * ruin_cond
    port_prob = build_prob * (1.0 - ruin_cond) * port_cond
    settlement_prob = build_prob * (1.0 - ruin_cond) * (1.0 - port_cond)
    return ruin_prob, port_prob, settlement_prob

# New logic
def new_logic():
    build_prob = 1.0 * buildable
    raw_ruin = 0.5 * buildable
    raw_port = 0.0 * coast
    
    ruin_prob = np.minimum(raw_ruin, build_prob)
    port_prob = np.minimum(raw_port, build_prob - ruin_prob)
    settlement_prob = build_prob - ruin_prob - port_prob
    return ruin_prob, port_prob, settlement_prob

print("Old:", old_logic())
print("New:", new_logic())
