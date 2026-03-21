# Task 11 — Create order, invoice, and register payment Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `11`
- Active strategy pin: `11.order-invoice-combined-payment.v1`
- Task implementation: `task.ts`
- Stable task summary: `README.md`

## Current Research Queue Snapshot

- Priority: `12`
- Band: `focus`
- Queue eligibility: `ready`
- Research lane: `hard-research`
- Best known score: `1` / `4`
- Baseline call budget: `5`
- Proof input: `research/proofs/task-11/task-11-proof-input.json`
- Verification plan: `task-11.order-invoice-payment.v1`

## Current State

### Queue Notes

- Hard research lane task involving order-to-invoice flow.
- Trusted Task 11 evidence points to the 5-call combined invoice-and-payment path as the current frontier.

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

