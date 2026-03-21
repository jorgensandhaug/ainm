# Next Steps

1. Finish the in-flight full 8-round multi-seed `regime_probe` promotions:
   - `dev_hazard_v4_k5_r3_l32_m70_regime_probe_online50_v1`
   - `dev_hazard_v3_k5_r3_l16_m50_regime_probe_online50_v1`
   - also finish the older comparator `dev_hazard_v4_k5_r3_l16_m50_exploration_online50_v1`
2. Compare those full results against the completed failure case:
   - `dev_hazard_v3_k5_r3_l16_m50_coverage_online50_v1` => `72.3675` / `0.114380`
   - identify whether the adaptive policy fixes true generalization or only the hard slice
3. If `v4 l32/m70 + regime_probe` survives full validation, center the next sweep around:
   - nearby shrinkage/mix settings around `l32/m70`
   - policy hyperparameters inside `regime_probe`
4. Analyze query traces from `regime_probe_v1` vs static exploration:
   - which windows get repeated
   - whether the gains come from same-window stochastic probing or hotspot expansion
   - which rounds gain the most
5. If full `regime_probe` still undergeneralizes, next major code move should be:
   - expose actual predictor/posterior state to the policy rather than relying on observation-only heuristics
