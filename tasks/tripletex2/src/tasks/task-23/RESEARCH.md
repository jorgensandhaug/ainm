# Task 23 — Reconcile bank statement Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `23`
- Active strategy pin: `23.reconcile-bank-statement.v1`
- Task implementation: `task.ts`
- Stable task summary: _No task-local README.md yet_

## Current Research Queue Snapshot

- Priority: `15`
- Band: `focus`
- Queue eligibility: `ready`
- Best known score: `0.6` / `6`

## Current State

### Queue Notes

- Secondary open Tier 3 frontier.
- Candidate 23.reconcile-bank-statement.v1 is logged with a manual sandbox proof for the one-row customer-payment branch.
- Current verified branch is correct but still over the checked-in 3-call lower bound, using 6 calls for the exact one-row incoming customer-payment shape.

## Frontier Memory

- Strongest known current hypothesis: full CSV reconciliation must book **all** bank-statement rows, including non-invoice lines such as interest, tax withholding, and bank-fee rows.
- Legacy production ceiling: all examined attributed runs plateau at `0.6 / 6`, with `Check 2` passing and `Check 1` failing while using the same 11-call invoice-focused flow.
- Imported legacy evidence worth preserving: the repeated ceiling strongly suggests the old trusted-standard rule to skip non-invoice rows is the structural bottleneck.
- Current call frontier: the important open question is correctness, not just call count. A worthwhile challenger should preserve roughly the same call class unless a split-voucher design is proven necessary.
- Anti-patterns / dead ends to avoid:
  - skipping non-invoice CSV rows by default
  - assuming the invoice-only path is sufficient just because it has zero API errors
  - promoting account-number guesses without sandbox verification
  - assuming the current main implementation and the agent-branch implementation are identical without comparison

See also: `research/frontier-import/task-23.md`.

## Next Improving-Agent Update Checklist

- Read the generated packet first.
- Compare against the current active strategy before editing code.
- Verify with the research OS / sandbox instead of writing strategy tests.
- Write back the outcome here, even if the result is "no import" or "frontier unchanged".

