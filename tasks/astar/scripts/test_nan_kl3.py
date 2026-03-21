import numpy as np

p = np.array([0.9, 0.1, 0.0])
q = np.array([0.0, 1.0, 0.0])

positive = p > 0.0
infinite_cells = np.any(positive & (q <= 0.0), axis=-1)

safe_p = np.where(positive, p, 1.0)
safe_q = np.where(q > 0.0, q, 1.0) 
cellwise = np.sum(
    np.where(positive, p * (np.log(safe_p) - np.log(safe_q)), 0.0),
    axis=-1,
)

print("cellwise raw:", cellwise)
print("infinite_cells:", infinite_cells)
result = np.where(infinite_cells, np.inf, cellwise)
print("result:", result)
