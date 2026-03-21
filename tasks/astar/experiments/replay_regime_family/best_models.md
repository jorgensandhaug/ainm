# Best Models — Final Session Summary

## Leader: `hazard_posterior_v15_k5_r5_l1_m20_q1 + regime_probe_v1`
- **Score: 83.95** / KL 0.0610
- Delta vs v8: **+4.76**
- Delta vs query_residual: **+10.00**

## Complete Configuration Sweep (60+ broad-validated experiments)

| rank | config | score | notes |
| --- | --- | ---: | --- |
| 1 | r5 l1 m25 q1 | 83.98 | tied leader |
| 2 | r5 l1 m20 q1 | 83.95 | confirmed leader |
| 3 | r5 l2 m20 q1 | 83.95 | l2=l1 |
| 4 | r5 m20 q1 (l32) | 83.89 | higher ridge |
| 5 | r6 l1 m20 q1 | 83.88 | too much rank |
| 6 | r5 l1 m15 q1 | 83.87 | m too low |
| 7 | r5 l1 m20 q2 | 83.84 | q2 > q1 tiny |
| 8 | r5 m30 q2 | 83.79 | m30 > m20 |
| 9 | r5 m50 q2 | 83.67 | m50 typical |
| 10 | v8 (reference) | 79.19 | prior leader |

## Innovations That Worked (cumulative +4.76)
1. Original-coefficient particles (+3.1): bypass SVD truncation
2. SVD rank=5 (+0.9): capture more coefficient variance
3. Observation-frequency blending (+0.6): direct evidence use
4. Lower m=20 (+0.4): trust particles over predicted mean
5. Lower ridge l=1 (+0.04): less regularization
6. Lower observation weight q=1 (+0.09)

## Innovations That Failed
- RFF nonlinear teacher (v10): 31.25 (catastrophic overfit)
- Enhanced v3 features: 76.03 (too many features)
- Probability floor: 75.02 (dilutes correct predictions)
- Adaptive calibration: 78.12 (hurts confident rounds)
- kNN cell predictor (v17): 82.88 (below v15)
- Pure likelihood matching (v18): 81.03 (student is valuable)
- Agent7 no-prior-blend: 83.58 (doesn't transfer)
- exploration policy: 83.11 (regime_probe better)
- coverage policy: 83.04 (regime_probe much better)
- samples_per_round>1: always worse

## Cross-Agent Intelligence
- Agent7: 87.12 (fundamentally different architecture - residual MLP + cluster-operator)
- Agent3: ~85.31 (CatBoost cellwise model)
- Agent4: 83.06 (LightGBM evidence, not live-applicable)
- Agent6: ~79.6 (geometric mean ensemble)
- Agent5: 77.35 (stacked QR + expansion kNN)
