# Task XX — Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `XX`
- Active strategy pin: `<strategy-id>`
- Task implementation: `task.ts`
- Stable task summary: `README.md`

## Current Research Queue Snapshot

- Priority: `<priority>`
- Band: `<focus|watch|kill>`
- Queue eligibility: `<ready|hold|do-not-work>`
- Research lane: `<lane>`
- Best known score: `<best>` / `<max>`
- Baseline call budget: `<calls>`
- Proof input: `<path>`
- Verification plan: `<plan-id>`

## Current State

### Queue Notes

- Add the current task state here.

### Operator Notes

- Add the current operator constraints here.

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
