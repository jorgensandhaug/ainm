import numpy as np

prediction = np.array([0.0, 1.0, 0.0]) # Our model output
prior = np.array([0.33, 0.33, 0.33])   # The base prior
exact = np.array([5.0, 0.0, 0.0])      # We queried this cell 5 times, saw 5 empty

# Simulate exact_cell_blend
def _exact(pred, exact, p):
    beta = 10.0
    return (beta * pred + exact) / (beta + 5.0)

post_exact = _exact(prediction, exact, prior)
print("After Exact Blend:", post_exact)

# Then effective_prior_blend
eff_prior = 0.35
polluted = (1.0 - eff_prior) * post_exact + eff_prior * prior
print("After Polluting Blend:", polluted)

# It was supposed to be:
proper_base = (1.0 - eff_prior) * prediction + eff_prior * prior
proper_exact = _exact(proper_base, exact, prior)
print("Proper Result:", proper_exact)
