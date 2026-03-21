import numpy as np

count_tensor = np.zeros((2, 2, 6), dtype=np.int64)
# Query 1
count_tensor[0, 0, 1] += 1
# Query 2 (overlapping)
count_tensor[0, 0, 1] += 1 
count_tensor[0, 0, 3] += 1 # A different roll

print("Sum:", count_tensor.sum(axis=(0, 1)))
print("Deduped (My bad fix):", (count_tensor > 0).sum(axis=(0, 1)))
