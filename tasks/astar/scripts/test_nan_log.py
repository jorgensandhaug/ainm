import numpy as np
probs = np.array([1.0, 0.0, 0.0])
print("Result:", -np.sum(probs * np.log(probs)))
