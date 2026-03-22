# Task 17 — Register customer invoice payment Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `17`
- Active strategy pin: `17.register-payment.v1`
- Task implementation: `task.ts`
- Stable task summary: `README.md`

## Current Research Queue Snapshot

- Priority: `5`
- Band: `focus`
- Queue eligibility: `ready`
- Research lane: `execution-lane`
- Best known score: `3.5` / `4` (but see txTaskId mapping issue below)

## Current State

### Queue Notes

- Near-max Tier 2 cleanup target.

### Critical Finding: txTaskId Mapping Mismatch (2026-03-22)

Production evidence strongly suggests the txTaskId mapping is swapped between internal tasks 07 and 17:

- **Contest tx_task_id 17** = "Create free accounting dimension and book voucher" (our internal task 07)
  - Evidence: All 5 attributed runs (db84be61, 33209af0, d3275dcf, 8b1eefdb, 9a5130ef) have dimension/voucher prompts
  - Score: 3.5/4 with 13/13 raw, 6/6 checks passed
  - prompt-task-labels.jsonl confirms: "Créez une dimension comptable personnalisée" → tx_task_id 17

- **Contest tx_task_id 07** = "Register customer invoice payment" (our internal task 17)
  - Evidence: Runs with payment prompts (e93a67ba, b57fefd1, 483c9eaf, 66e3c043) all get attributed to tx_task_id 07
  - Score: 2.0/2.0 (max) with 7/7 raw, 2/2 checks passed
  - Best score in leaderboard: 2.0 (already at maximum)

**Impact**: The packet's `bestKnownScore: 3.5/4` is from the WRONG contest task (dimension/voucher). The actual payment task (contest tx_task_id 07) already scores 2.0/2.0 (100% max) in production.

**Blocker**: Fixing txTaskId requires changing both task-07 and task-17 mapping — a cross-task change that violates single-task discipline. This should be escalated to an operator.

## Frontier Memory

### Strongest known branch
- `17.register-payment.v1` — the 3-call exact-match payment path
- GET /invoice → GET /invoice/paymentType → PUT /invoice/{id}/:payment
- Uses live outstanding amount from invoice, not prompt ex-VAT amount

### Score / correctness ceiling
- Contest task 07 (actual payment task): 2.0 / 2.0 = **already at maximum**
- All production runs: 100% correctness (2/2 checks passed, 7/7 raw score)
- Time penalty exists: fast runs (~65s) get 2.0, slow runs (~141s) get 1.4
- No score improvement possible on correctness — already perfect

### Call-budget frontier
- 3 calls is the proven minimum for standalone exact-match payment
- 2 calls possible only with same-run cached paymentTypeId (not applicable for standalone task)

### Imported legacy evidence
- Trusted standard and playbook both specify the same 3-call path
- Production runs confirm: prompt ex-VAT is locator only, pay live outstanding amount
- Payment type IDs vary across accounts/environments — never cache cross-run

### Anti-patterns / dead ends
- Do not attempt 2-call shortcut by omitting paymentTypeId → 422 error
- Do not use prompt amount as payment amount → under/over-payment
- Do not add GET /customer unless invoice search is genuinely ambiguous (sandbox duplicate noise ≠ prod ambiguity)
- Do not persist paymentTypeId across runs
- Sandbox bank account 1920 has reconciled statements → use Kontant (1900) for sandbox proofs

## Production Evidence Consulted

### Attributed run IDs (from packet — WRONG ATTRIBUTION due to txTaskId swap)
- `prod-2026-03-21-231356274Z-db84be61` — dimension/voucher prompt (Portuguese), score 3.5/4
- `prod-2026-03-21-224412365Z-33209af0` — dimension/voucher prompt (Norwegian), score 3.5/4
- `prod-2026-03-21-184253285Z-d3275dcf` — dimension/voucher prompt (French), score 3.5/4
- `prod-2026-03-21-183055472Z-8b1eefdb` — dimension/voucher prompt (Portuguese), score 3.5/4
- `prod-2026-03-20-220811643Z-9a5130ef` — dimension/voucher prompt (German), score skipped

### Actual payment production runs consulted (tx_task_id=07)
- `prod-2026-03-21-214645584Z-483c9eaf` — payment for "Skylagring" 14200kr, score 2.0/2.0, 65s
- `prod-2026-03-21-203657923Z-b57fefd1` — payment for "Konsulenttimer" 31300kr, score 1.4/2.0, 141s (slow)
- `prod-2026-03-21-164504782Z-e93a67ba` — payment for "Datarådgivning" 15200kr, score 2.0/2.0, 70s
- `prod-2026-03-20-170929424Z-66e3c043` — payment for "Datarådgivning" 15200kr, leaderboard best→2.0

### Script files consulted
- `prod-2026-03-19-224558306Z-974b8299/scripts/register_invoice_payment.ts` — early 4-call path (included GET /customer)
- `prod-2026-03-20-222816328Z-0b339baa/scripts/register_invoice_payment.ts` — optimal 3-call path matching our strategy

## Sandbox Verification

### Automated verifier (blocked)
- `bun scripts/research_os.ts verify --packet ... --strategy 17.register-payment.v1`
- Failed at sandbox reset stage: cross-task employee leftovers from task-06 verification
- Blocker: 3 employee neutralization failures (Validering feilet, RevisionException)
- These employees are from task 06 — irrelevant to task 17

### Manual sandbox proof (passed, 2026-03-22)
- Invoice 2147552467 (org 907791616, "Prosjektadministrasjon", 7000 NOK ex-VAT)
- 3 API calls: GET /invoice (513 invoices, 2 matches, picked first) → GET /invoice/paymentType → PUT /invoice/:payment
- Remaining outstanding: 0 ✓
- Payment type: 32813747 (Kontant, debit 1900) — bank account 1920 reconciled in sandbox
- Proof script: `research/proofs/task-17/verify-direct.ts`

### Additional sandbox proof (2026-03-22)
- Invoice 2147644714 (org 999668353, "Rådgivning", 20000 NOK)
- PUT /invoice/:payment with Kontant type → remaining outstanding 0 ✓

## Changes Made (2026-03-22 research wave)

1. Added verification plan for task 17 in `src/research/verification-plan.ts`
2. Updated queue entry with `proofInputPath`, `verificationPlanId`, `baselineCallBudget`
3. Added txTaskId mapping finding to queue notes
4. Created proof input and direct verification scripts
5. Registered candidate `17.register-payment.v1` as `needs-review` with manual sandbox proof

## Next Improving-Agent Update Checklist

- [ ] Fix txTaskId mapping: task 17 should use txTaskId "07", task 07 should use txTaskId "17" (requires cross-task coordination)
- [ ] Re-verify that contest task 07 (payment) is truly at max score 2.0 — check if there's a higher ceiling not yet discovered
- [ ] Clean up sandbox employee leftovers so automated verifier can run
- [ ] Consider whether payment type fallback (try 1920, fall back to 1900 on 422) is worth adding for sandbox robustness
- [ ] Investigate time penalty: runs at 65s score 2.0, at 141s score 1.4 — any optimization opportunity in strategy execution time?
