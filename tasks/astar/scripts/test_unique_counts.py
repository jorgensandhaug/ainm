import numpy as np

count_tensor = np.zeros((2, 2, 6), dtype=np.int64)
count_tensor[0, 0, 1] = 2 # class 1 observed twice
count_tensor[0, 1, 1] = 1 # class 1 observed once
count_tensor[1, 0, 2] = 3 # class 2 observed thrice
count_tensor[1, 1, 0] = 0 # unobserved

unique_counts = (count_tensor > 0).sum(axis=(0, 1))
print("unique_counts:", unique_counts)
print("frequencies:", unique_counts / unique_counts.sum())
