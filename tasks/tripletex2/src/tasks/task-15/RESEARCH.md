# Task 15 — Register project hours and create project invoice Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `15`
- Active strategy pin: `15.register-hours-then-project-order-invoice.v1`
- Challenger strategy: `15.register-hours-direct-invoice.v2`
- Task implementation: `task.ts`
- Stable task summary: `README.md`

## Current Research Queue Snapshot

- Priority: `6`
- Band: `focus`
- Queue eligibility: `ready`
- Research lane: `execution-lane`
- Best known score: `3.3333` / `4`

## Current State

### Queue Notes

- Near-max Tier 2 cleanup target.
- Verification infrastructure built: verification plan + proof input + queue config.

## Frontier Memory

### Strongest known branch (sandbox-verified)

**v2 challenger: `15.register-hours-direct-invoice.v2`**
- Non-chargeable branch: **6 calls** (down from 7 in v1)
- Request path: GET /employee → GET /project → GET /activity/>forTimeSheet → POST /timesheet/entry → GET /ledger/vatType → POST /invoice
- Key insight: POST /invoice accepts embedded orders with project linkage, customer, and order lines, replacing the two-step POST /order + PUT /order/:invoice path
- Sandbox-verified 2026-03-22: timesheet entry + invoice readback both passed, amountExcludingVatCurrency=9600 (8h * 1200 NOK/hr)

### v1 baseline: `15.register-hours-then-project-order-invoice.v1`
- Non-chargeable branch: **7 calls**
- Request path: GET /employee → GET /project → GET /activity/>forTimeSheet → POST /timesheet/entry → GET /ledger/vatType → POST /order → PUT /order/:invoice
- Sandbox-verified 2026-03-22: all assertions passed, amountExcludingVatCurrency=9600

### Score / correctness ceiling

- Leaderboard best: 3.3333/4 (from tx_task_id 15, which includes multiple prompt types via noisy attribution)
- All recent production runs pass 4/4 checks (100% correctness)
- The 0.6667 gap appears to be efficiency-based (not correctness), likely API call count or latency
- Reducing from 7 to 6 calls should improve the normalized score

### Call-budget frontier

- Non-chargeable branch: 6 calls (v2) vs 7 calls (v1)
- Chargeable branch: ~9-10 calls (v2) vs ~10-11 calls (v1) — same 1-call reduction
- Multi-day split (>24h): +1 call per extra date chunk
- Bank account repair branch: +2 calls when missing bank account

### Production run evidence consulted

- `prod-2026-03-21-214315010Z-edea42c4` — French, "set fixed price 75%", 3/4 normalized, 4/4 checks (noisy attribution to tx_task_id 15)
- `prod-2026-03-21-190544892Z-d64d5813` — Portuguese, "set fixed price 50%", 3/4 normalized, 4/4 checks
- `prod-2026-03-21-183449812Z-49332405` — Portuguese, "correct ledger errors", 3/4 normalized, 4/4 checks
- `prod-2026-03-21-171706513Z-d961e89d` — Portuguese, "set fixed price 50%", 3.3333/4 normalized, 4/4 checks (best scoring run)
- `prod-2026-03-21-165237770Z-a63caffa` — 2.64/4 normalized, 4/4 checks
- Note: all attributed runs are for different task types (fixed price, ledger errors), not "register hours" — tx_task_id attribution is noisy

### Anti-patterns / dead ends to avoid

- Do NOT drop GET /ledger/vatType even though sandbox 0%-only accounts accept omitted vatType — production taxable accounts need it
- Do NOT try to skip POST /timesheet/entry — the task requires registering hours
- Do NOT send projectChargeableHours > 24 in a single entry
- Do NOT attempt same-day duplicate entries for same employee+project+activity
- Do NOT try to embed projectSpecificRates inside PUT /project/hourlyRates — these are separate writes
- POST /invoice requires `invoiceDueDate` (unlike the PUT /order/:invoice path which auto-computes it)

## Verification Infrastructure

- Verification plan: `task-15.register-hours-project-invoice.v1` in `src/research/verification-plan.ts`
- Proof input: `research/proofs/task-15/task-15-proof-input.json`
- Checks: timesheet-entry-readback (project, activity, hours) + invoice-readback (customer, amount, invoiceNumber)
- Baseline call budget: 7
- Queue config: `proofInputPath` + `verificationPlanId` + `baselineCallBudget` all set

## Next Improving-Agent Update Checklist

- [ ] Verify the v2 challenger on the chargeable branch (use `Fakturerbart arbeid` activity in proof input)
- [ ] Verify the v2 challenger with >24 hour multi-day split
- [ ] Consider whether POST /invoice handles the missing-bank-account error the same way as PUT /order/:invoice
- [ ] If v2 is promoted to active, update the strategy pin in active-strategies.json
- [ ] Investigate whether the leaderboard scoring formula is API-call-count-based — if so, the 7→6 reduction should improve the normalized score
