# Next Steps

1. Finish the in-flight full 8-round v2 raw promotions:
   - `dev_hazard_v2_k5_r3_coverage_online50_v1`
   - `dev_hazard_v2_k5_r3_exploration_online50_v1`
2. Treat raw v2 as mainline and stop spending immediate budget on v2 blend sweeps unless full-round evidence unexpectedly reverses the hard-slice ordering.
3. Analyze remaining v2 failure structure on `ae78003a-4efe-425a-881a-d16a39bca0ad` and top-KL forest/empty confusion cells.
4. If full 8-round results hold up, push from v2 into targeted v3 work:
   - better forest/empty discrimination
   - sharper handling of the worst `ae780...` seeds
   - explicit speedups for multi-job historical benchmark execution so the large machine is better utilized
