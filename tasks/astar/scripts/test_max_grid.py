import numpy as np

beta = 8.0
count_total = np.zeros((2, 2))

try:
    res = max(beta + count_total, 1e-6)
    print("Success")
except Exception as e:
    print(f"Error: {e}")
