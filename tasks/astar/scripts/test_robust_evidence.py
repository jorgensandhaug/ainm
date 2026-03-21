import numpy as np
from collections import defaultdict

# 1. Fixing frequencies
count_tensor = np.zeros((2, 2, 6), dtype=np.int64)
count_tensor[0, 0, 1] = 9
count_tensor[0, 0, 2] = 1 # cell (0,0) sampled 10 times
count_tensor[1, 1, 3] = 1 # cell (1,1) sampled 1 time

count_total = count_tensor.sum(axis=-1)
mask = count_total > 0
exact_freq = np.zeros_like(count_tensor, dtype=np.float64)
exact_freq[mask] = count_tensor[mask] / count_total[mask, None]

robust_freq = exact_freq[mask].mean(axis=0)
print("Robust frequencies:", robust_freq)

# 2. Fixing settlement means
obs = [
    {"x": 0, "y": 0, "pop": 100},
    {"x": 0, "y": 0, "pop": 110},
    {"x": 1, "y": 1, "pop": 50},
]
site_pops = defaultdict(list)
for o in obs:
    site_pops[(o["y"], o["x"])].append(o["pop"])

site_means = [np.mean(vals) for vals in site_pops.values()]
robust_mean_pop = np.mean(site_means) if site_means else 0.0
print("Robust mean pop:", robust_mean_pop)

