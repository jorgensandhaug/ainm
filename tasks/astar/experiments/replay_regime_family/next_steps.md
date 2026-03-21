# Next Steps

1. Isolate whether semimechanistic failure is decoder-side or posterior-side.
2. Upgrade the semimechanistic family before more sweep budget:
   - richer transcript summaries or stronger transcript encoder
   - stronger round-coefficient / regime-factorization features
   - only then rerun hazard-only probes
3. Keep conservative bucket blending as a fallback calibration layer, but do not spend more grid budget on convex blends of the current hazard-v1 component.
4. After the hazard family becomes additive on the hard 3-round slice, rerun broader multi-seed policy sweeps and then promote to 8-round evaluation.
