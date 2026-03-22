# Task 10 — Issue full credit note Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `10`
- Active strategy pin: `10.issue-full-credit-note.v1`
- Task implementation: `task.ts`
- Stable task summary: `README.md`

## Current Research Queue Snapshot

- Priority: `7`
- Band: `focus`
- Queue eligibility: `ready`
- Research lane: `execution-lane`
- Best known score: `3` / `4` (tracked from leaderboard tx_task_id 10 — see mapping hazard below)
- Actual production score under tx_task_id 14: `4` / `4` (14+ consecutive runs)

## Task ID Mapping Hazard

**CRITICAL**: The tripletex2 system maps this task to `txTaskId: "10"`, but in the production leaderboard, credit note runs are attributed to `tx_task_id: 14`. The runs attributed to `tx_task_id: 10` in the leaderboard are actually order/invoice/payment flows (a completely different task shape).

- `tx_task_id 10` in leaderboard = order/invoice/payment flow (best_score 3/4, scored differently)
- `tx_task_id 14` in leaderboard = credit note (best_score 4/4, 14+ consecutive optimal runs)
- Tripletex2 task 14 = `set-fixed-price-milestone` (different task entirely)
- The research queue `bestKnownScore: 3` is reading from the wrong leaderboard task

**Evidence**: All 5 recent runs attributed to tx_task_id 10 in `prompt-task-labels.jsonl` are order/invoice/payment prompts (Portuguese, Nynorsk, Spanish). All credit note prompts (German, Norwegian, Spanish) are attributed to tx_task_id 14.

## Frontier Memory

- **Strongest known branch**: 2-call exact match (`GET /invoice?...` + `PUT /invoice/{id}/:createCreditNote?date=...&sendToCustomer=false`)
- **Score / correctness ceiling**: 4/4 under tx_task_id 14 (14+ consecutive production runs across en/nb/nn/es/fr/de)
- **Call-budget frontier**: 2 calls minimum for the standard prompt shape; 1 call possible only when prompt provides exact invoice id
- **Imported legacy evidence**: Trusted standard `create-customer-invoice-credit-note.md` documents 14 production confirmations and 10+ sandbox re-verifications
- **Anti-patterns / dead ends**:
  - Do not add `GET /customer` before the invoice locate — the invoice response already contains `customer.organizationNumber`
  - Do not add a verification readback after the credit note write — the write response itself proves `isCreditNote=true` and `creditedInvoice=<original id>`
  - Do not use voucher reversal for this task shape
  - Do not create a manual negative invoice

## Production Runs Consulted (2026-03-22 Research)

### Task-10-Attributed Runs (NOT credit notes — order/invoice/payment)

| Run ID | Task Shape | Score |
|--------|-----------|-------|
| `prod-2026-03-21-222435205Z-dd7f6755` | Order/invoice/payment (Portuguese) | 8/8 raw, norm=3 |
| `prod-2026-03-21-204051670Z-cc819daa` | Order/invoice/payment (Nynorsk) | 8/8 raw, norm=3 |
| `prod-2026-03-21-194143438Z-8e978a3e` | Order/invoice/payment (Portuguese) | 8/8 raw, norm=3 |
| `prod-2026-03-21-180354595Z-419dbb16` | Order/invoice/payment (Portuguese) | 8/8 raw, norm=3 |
| `prod-2026-03-21-171446078Z-7315b8b8` | Order/invoice/payment (Spanish) | 8/8 raw, norm=3 |

### Task-14-Attributed Runs (ACTUAL credit note evidence)

| Run ID | Prompt | Score |
|--------|--------|-------|
| `prod-2026-03-22-013352179Z-4032eb04` | Gutschrift Bruckentor GmbH, Webdesign 38800 (German) | 8/8 raw, norm=4 |
| `prod-2026-03-22-013352179Z-ee7cb0fd` | Kreditnota Lysgard AS, Webdesign 9900 (Norwegian) | 8/8 raw, norm=4 |
| `prod-2026-03-22-013352179Z-8ed57511` | Nota de credito Viento SL, Licencia 25450 (Spanish) | 8/8 raw, norm=4 |
| `prod-2026-03-21-234345624Z-da4a5fb0` | Kreditnota Stormberg AS, Opplæring 13100 (Norwegian) | 8/8 raw, norm=4 |
| `prod-2026-03-21-234345624Z-bbc455f7` | Kreditnota Elvdal AS, Datarådgjeving 45300 (Nynorsk) | 8/8 raw, norm=4 |

All 5 used the canonical 2-call path with 0 errors.

## Sandbox Verification (2026-03-22)

### Successful Verification

- **Command**: `bun scripts/sandbox.ts verify --task 10 --strategy 10.issue-full-credit-note.v1 --input-file research/proofs/task-10/task-10-proof-input.json --packet research/packets/task-10/task-10-packet-2026-03-22T02-21-54-601Z.json --no-reset`
- **Verdict**: `sandbox-pass`
- **Correctness**: `passed`
- **Within budget**: `true` (2 calls / 2 budget)
- **Report path**: `research/verifications/task-10/verify-10-10.issue-full-credit-note.v1-2026-03-22T02-29-50-998Z/`
- **Proof input**: org `905570862`, description `Test without vatType`, amount `100000`, date `2026-03-22`

### Pre-verification sandbox run (also successful)

- org `907791616`, description `Prosjektadministrasjon sandbox fallback proof`, amount `6200`
- 2 API calls, runtimeStatus=completed, creditNoteId=2147668961

### Sandbox Reset Blocker (Non-Task-10)

Sandbox reset fails because task-06 employee artifacts (3 employees from prior verification runs) can't be neutralized ("Validering feilet"). This is unrelated to task 10. Workaround: use `--no-reset` or remove non-task-10 verification artifacts from scanner scope.

### Proof Input Caveat

Sandbox proof inputs must reference invoices with `invoiceDate` before the credit note date. The strategy uses `invoiceDateTo = creditNoteDate + 1 day` in the locate query, so future-dated invoices are excluded.

## Candidate Store Status

- **Candidate ID**: `10.issue-full-credit-note.v1`
- **Status**: `sandbox-pass`
- **Latest sandbox verdict**: correctness=true, withinBudget=true, apiCallCount=2, baselineCallBudget=2

## Infrastructure Added (2026-03-22)

- Verification plan: `task-10.issue-full-credit-note.v1` in `src/research/verification-plan.ts`
  - Check: `credit-note-readback` — reads created credit note, asserts `creditedInvoice` matches original invoice ID and `invoiceNumber` matches
- Proof input: `research/proofs/task-10/task-10-proof-input.json`
- Queue metadata: `baselineCallBudget=2`, `proofInputPath`, `verificationPlanId`

## Next Improving-Agent Update Checklist

- The strategy is already at the production frontier (4/4, 2 calls, 14+ consecutive runs)
- No plausible code improvement exists for the standard prompt shape
- The only remaining work is resolving the txTaskId mapping hazard so the research queue reads the correct leaderboard score
- If the txTaskId is changed to 14, update the research queue's `bestKnownScore` to 4
- Watch for new prompt shapes that might require fallback branches (e.g., prompts with exact invoice id → 1-call path)
