# Task 30 — Simplified Annual Closing (2025) Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `30`
- Active strategy pin: `30.simplified-annual-closing.v2` (promoted 2026-03-22)
- Task implementation: `task.ts`
- Proof input: `research/proofs/task-30/task-30-proof-input.json`

## Current Research Queue Snapshot

- Priority: `14`
- Band: `focus`
- Queue eligibility: `ready`
- Best known score: `1.8` / `6`

## Current State

### Queue Notes

- Tax-account/runtime drift has been corrected; the remaining question is production confirmation on positive-profit runs.

## Frontier Memory

- Strongest known branch: `30.simplified-annual-closing.v2` (sandbox-verified tax-account fix, coercion-hardened, active runtime pin)
- Score / correctness ceiling: `1.8 / 6`; checks 1-3 and 6 pass, tax-related checks 4-5 still await a decisive positive-profit production run
- Call-budget frontier: 7-10 calls, depending on whether account creation is needed
- Imported legacy evidence worth preserving: 8300/2500 is the correct tax-account pair; 8700/2920 is wrong for Tripletex year-end tax grouping
- Anti-patterns / dead ends to avoid: do not repin `30.not-implemented.v1`; do not post tax to 8700/2920 just because the prompt mentions those accounts

## Next Improving-Agent Update Checklist

- Read the generated packet first.
- Compare against the current active strategy before editing code.
- Verify with the research OS / sandbox instead of writing strategy tests.
- Write back the outcome here, even if the result is "no import" or "frontier unchanged".
