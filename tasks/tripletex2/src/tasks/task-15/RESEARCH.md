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

Key change: POST /invoice with embedded order replaces POST /order + PUT /order/:invoice (saves 1 call).

#### Sandbox-verified branches

| Branch | Calls | Date | Input | Result |
|--------|-------|------|-------|--------|
| Non-chargeable, single-day | 6 | 2026-03-22 | Prosjektadministrasjon, 8h, 1200 NOK/hr | pass, amount=9600 |
| Chargeable, single-day | 7 | 2026-03-22 | Fakturerbart arbeid, 5h, 1550 NOK/hr | pass, amount=7750, hourlyRate=1550 |
| Non-chargeable, multi-day (39h) | 7 | 2026-03-22 | Prosjektadministrasjon, 39h, 1450 NOK/hr | pass, amount=56550, split 24+15 |

#### invoiceDueDate fix (2026-03-22)

- v2 originally hardcoded `+30 days`, which was semantically wrong
- Fixed to read `customer.invoicesDueIn` from the already-expanded project/customer response (no extra call)
- Sandbox-verified: computed dueDate matches PUT /order/:invoice auto-derived dueDate exactly (14 days for this sandbox customer)
- Default fallback: 14 days if `invoicesDueIn` is missing

#### Missing-bank-account recovery

- **Not independently sandbox-proven**: the sandbox already has a valid bank account (1920: 12345678903), so the error path cannot be triggered without destructive setup
- The recovery code is **structurally identical** to v1: same error message detection (`MISSING_BANK_ACCOUNT_MESSAGE`), same account resolution (`chooseInvoiceBankAccount`), same repair (`makeValidBankAccountNumber` + PUT /ledger/account), same retry pattern
- The only difference is the retry calls `createDirectInvoice` (POST /invoice) instead of `createInvoiceFromOrder` (PUT /order/:invoice)
- Risk is low but the path is unproven

### v1 baseline: `15.register-hours-then-project-order-invoice.v1`
- Non-chargeable branch: **7 calls**
- Sandbox-verified 2026-03-22: all assertions passed
- Does NOT have the `invoiceDueDate` issue (PUT /order/:invoice auto-derives it)

### Score / correctness ceiling

- Leaderboard best: 3.3333/4 (from tx_task_id 15, which includes multiple prompt types via noisy attribution)
- All recent production runs pass 4/4 checks (100% correctness)
- The 0.6667 gap appears to be efficiency-based (not correctness), likely API call count or latency
- Reducing from 7 to 6 calls should improve the normalized score

### Call-budget frontier

| Branch | v1 calls | v2 calls | Savings |
|--------|----------|----------|---------|
| Non-chargeable, single-day | 7 | 6 | -1 |
| Chargeable, single-day (existing rate) | 8 | 7 | -1 |
| Chargeable, single-day (new rate holder + rate) | 10 | 9 | -1 |
| Multi-day split (>24h) | +1/extra day | +1/extra day | same |
| Bank account repair | +2 | +2 | same |

### Production run evidence consulted

- `prod-2026-03-21-214315010Z-edea42c4` — French, "set fixed price 75%", 3/4 normalized, 4/4 checks
- `prod-2026-03-21-190544892Z-d64d5813` — Portuguese, "set fixed price 50%", 3/4 normalized, 4/4 checks
- `prod-2026-03-21-183449812Z-49332405` — Portuguese, "correct ledger errors", 3/4 normalized, 4/4 checks
- `prod-2026-03-21-171706513Z-d961e89d` — Portuguese, "set fixed price 50%", 3.3333/4 normalized, 4/4 checks (best scoring run)
- `prod-2026-03-21-165237770Z-a63caffa` — 2.64/4 normalized, 4/4 checks
- Note: all attributed runs are for different task types — tx_task_id 15 attribution is noisy

### Anti-patterns / dead ends to avoid

- Do NOT drop GET /ledger/vatType — production taxable accounts need it
- Do NOT skip POST /timesheet/entry — the task requires registering hours
- Do NOT send projectChargeableHours > 24 in a single entry
- Do NOT attempt same-day duplicate entries for same employee+project+activity
- Do NOT hardcode invoiceDueDate — read `customer.invoicesDueIn` from expanded project data
- POST /invoice requires `invoiceDueDate` (unlike PUT /order/:invoice which auto-computes it)
- POST /invoice requires `invoiceDueDate` to not be null (422 validation error)

## Verification Infrastructure

- Verification plan: `task-15.register-hours-project-invoice.v1` in `src/research/verification-plan.ts`
- Proof inputs:
  - `research/proofs/task-15/task-15-proof-input.json` (non-chargeable, 8h)
  - `research/proofs/task-15/task-15-proof-input-chargeable.json` (chargeable, 5h)
  - `research/proofs/task-15/task-15-proof-input-multiday.json` (non-chargeable, 39h multi-day)
- Checks: timesheet-entry-readback (project, activity, hours) + invoice-readback (customer, amount, invoiceNumber)
- Baseline call budget: 7
- Queue config: `proofInputPath` + `verificationPlanId` + `baselineCallBudget` all set

## Next Improving-Agent Update Checklist

- [ ] Promote v2 to active if a production run confirms score improvement
- [ ] If promoting, update strategy pin in active-strategies.json and reduce baselineCallBudget to 6
- [ ] Consider destructive sandbox setup to test the missing-bank-account recovery path for POST /invoice
- [ ] Investigate whether the scoring formula is API-call-count-based or latency-based
