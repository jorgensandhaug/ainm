import numpy as np

grid = np.zeros((10, 10))
# Slice completely out of bounds
window = grid[20:25, 20:25]
print("Shape:", window.shape)
print("Size:", window.size)
_, counts = np.unique(window, return_counts=True)
print("counts:", counts)
print("counts.sum():", counts.sum())
