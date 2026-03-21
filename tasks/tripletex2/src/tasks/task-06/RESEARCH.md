# Task 06 — Create employee Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `06`
- Active strategy pin: `06.create-employee.v1`
- Task implementation: `task.ts`
- Stable task summary: `README.md`

## Current Research Queue Snapshot

- Priority: `1`
- Band: `focus`
- Queue eligibility: `ready`
- Research lane: `tier-1-gap`
- Best known score: `1.4` / `2`
- Baseline call budget: `2`
- Proof input: `research/proofs/task-06/task-06-proof-input.json`
- Verification plan: `task-06.create-employee.v1`

## Current State

### Queue Notes

- Only remaining Tier 1 gap.
- Fresh-account production evidence says the winning floor is still the 2-call employee create plus employment readback branch.

### Operator Notes

- Focus on closing the remaining 0.8 score gap without paying sandbox-only department or division reads in the hot path.

## Frontier Memory

Write the current frontier here in compact form:

- strongest known branch
- score / correctness ceiling
- call-budget frontier
- imported legacy evidence worth preserving
- anti-patterns / dead ends to avoid

If no frontier is justified, say so explicitly and record why.

## Next Improving-Agent Update Checklist

- Read the generated packet first.
- Compare against the current active strategy before editing code.
- Verify with the research OS / sandbox instead of writing strategy tests.
- Write back the outcome here, even if the result is "no import" or "frontier unchanged".

