# Score Reflection: prod-2026-03-22-112740476Z-07f71ed1

## Task Attribution

- **Inference status**: ambiguous (3 candidate tasks: 14, 27, 28)
- **Most likely task**: **T27** (register foreign-currency customer invoice payment with agio)
- **Reasoning**: Prior production failures and confirmations explicitly tag this prompt shape as task 27 (e.g., `prod-2026-03-21-193537525Z-840df81a (50% score — task 27)`). Task 27 `total_attempts` went 17→18 with `last_attempt_at` moving to 11:29:32, closest to the task completion at 11:29:26. Prompt content (Portuguese, EUR invoice, exchange rate, agio) matches the established T27 pattern exactly.
- **Tier**: T3 (tasks 19-30), max score = 6

## Correctness Verdict

- **Verdict**: Almost certainly **perfect correctness** (6/6)
- Task 27 `best_score` remained at 6 before and after — consistent with this run scoring 6 (tied best) since the approach is identical to the 7 prior consecutive full-score runs on this exact task shape.
- The run registered payment (amountOutstanding → 0) and booked agio manually on account 8060 with correct amount (2336 × 0.96 = 2242.56 NOK). Both side effects are confirmed correct.
- 5 API calls, 0 errors, matching the canonical NOK-fallback flow exactly.

## Efficiency Verdict

- **Verdict**: **Optimal efficiency** — 5 calls is the proven canonical minimum for the NOK-fallback path.
- Call breakdown:
  1. `GET /invoice` (locate) — required
  2. `GET /invoice/paymentType` (resolve payment type) — required
  3. `PUT /invoice/{id}/:payment` (register payment) — required
  4. `GET /ledger/account?number=8060` (resolve agio account ID) — required (account: { number } doesn't work in voucher body)
  5. `POST /ledger/voucher?sendToLedger=true` (manual agio voucher) — required
- 2 additional free verification GETs (invoice + voucher readback) — no scoring impact.
- 0 avoidable 4xx errors.
- No wasted calls, no retries, no unnecessary reads.

## Likely Root Cause

No issues. This was a clean, optimal execution matching the trusted standard exactly. The 8th consecutive full-score run on this task shape.

## What Went Right

1. **Read trusted standard first**: The agent read `register-foreign-currency-customer-invoice-payment.md` before writing code, avoiding all documented API traps.
2. **Correct field expansions**: Used `fields=*,currency(*),customer(*)` on invoice lookup — `customer(*)` was correctly added beyond what the standard originally specified (`fields=*,currency(*)` alone), enabling org number matching.
3. **Correct NOK detection**: Properly identified `amount === amountCurrency` as a NOK invoice and used the NOK fallback path.
4. **Correct agio calculation**: 2336 × (12.13 - 11.17) = 2336 × 0.96 = 2242.56 NOK — matches expected FX gain.
5. **Correct voucher structure**: Used `row: 1` and `row: 2` (not row 0), `vatType: { id: 0 }`, `account: { id: ... }` from resolved lookups.
6. **Reused paymentType debitAccount.id**: Used the bank account ID from the payment type's `debitAccount.id` instead of hardcoding 1920 — more correct and avoids a separate lookup.
7. **Zero errors**: No 4xx responses, no retries, no wasted calls.

## What To Change Next Time

Nothing material needs to change. The flow is proven optimal for this task shape across 8 consecutive production runs. Minor documentation improvement already applied:

- The trusted standard's Call 1 now recommends `fields=*,currency(*),customer(*)` instead of just `fields=*,currency(*)`, matching what the successful production scripts actually use. This was a documentation gap — the `customer(*)` expansion is required for org number matching in both EUR and NOK paths (sandbox-verified: without it, `customer.organizationNumber` is `undefined`).
- Playbook also updated with the `customer(*)` requirement and this production confirmation.

The next agent should continue using the exact same 5-call NOK-fallback flow with no modifications.
