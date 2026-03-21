import numpy as np

p = np.array([0.9, 0.1, 0.0])
q = np.array([0.0, 1.0, 0.0])

positive = p > 0.0
safe_p = np.where(positive, p, 1.0)
safe_q = np.where(q > 0.0, q, 1.0) # WARNING: if p>0 but q=0, safe_q becomes 1.0, which means log(safe_q) = 0!
cellwise = np.sum(
    np.where(positive, p * (np.log(safe_p) - np.log(safe_q)), 0.0),
    axis=-1,
)
print("safe_p:", safe_p)
print("safe_q:", safe_q)
print("log(safe_p):", np.log(safe_p))
print("log(safe_q):", np.log(safe_q)) 
print("cellwise:", cellwise)
