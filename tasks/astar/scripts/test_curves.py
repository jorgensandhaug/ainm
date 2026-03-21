from astar.history.episodes.models import SeedEpisode
def test_curve(seed: SeedEpisode):
    survival_curves = []
    port_curves = []
    ruin_curves = []
    for run in seed.replay_runs:
        survival_curve = [sum(1.0 for s in f.settlements if s.alive) for f in run.frames]
        port_curve = [sum(1.0 for s in f.settlements if s.has_port) for f in run.frames]
        ruin_curve = [float(np.count_nonzero(f.grid == 3)) for f in run.frames]
        survival_curves.append(survival_curve)
        port_curves.append(port_curve)
        ruin_curves.append(ruin_curve)
    
    survival_mean = np.mean(survival_curves, axis=0)
    port_mean = np.mean(port_curves, axis=0)
    ruin_mean = np.mean(ruin_curves, axis=0)
    
    return float(np.mean(survival_mean)), float(np.mean(port_mean)), float(np.mean(ruin_mean))
