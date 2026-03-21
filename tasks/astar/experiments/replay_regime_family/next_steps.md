# Next Steps

1. Finish the in-flight full 8-round v3 promotion:
   - `dev_hazard_v3_k5_r3_l16_m50_coverage_online50_v1`
2. Finish the in-flight v3 posterior sweeps on the hard slice:
   - `samples-per-round=4` coverage / exploration
   - stronger-ridge `l16` coverage variants with different mean-vs-neighbor mix
3. Current v3 mainline is `l16/m50`; only supersede it if the in-flight `s4` probes beat it on both score and KL.
4. Analyze the new v3 tradeoff structure:
   - big gains on `8e839...` and `ae780...`
   - regression on `fd3c92ff-3178-4dc9-8d9b-acf389b3982b`
5. Use that analysis to target the next v4 work at posterior calibration/shrinkage rather than larger latent rank:
   - better transcript-to-regime regularization
   - possible probability-floor or uncertainty-aware decoding
   - more synthetic episode volume only if `s4` materially helps
