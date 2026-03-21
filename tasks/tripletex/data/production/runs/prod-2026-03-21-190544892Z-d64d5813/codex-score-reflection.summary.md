# Score Reflection — prod-2026-03-21-190544892Z-d64d5813

## Task Attribution

- **tx_task_id**: 15 (T2, max score 4)
- **prompt**: Set fixed price 313650 NOK on project "Migração para nuvem" for Estrela Lda (922471126), manager Leonor Sousa, invoice 50% milestone
- **run_id**: prod-2026-03-21-190544892Z-d64d5813
- **attempt**: 15th attempt on task 15

## Correctness Verdict

**Perfect.** `correctness=1`, `score_raw=8/8`, `4/4 checks passed`. All side effects were correct: project fixed price set, customer linked, manager assigned, milestone invoice created for 156825 NOK (50% of 313650).

## Efficiency Verdict

**Optimal for the environmental state encountered, but below the leaderboard best due to bank-account variance.**

| Metric | Value |
|--------|-------|
| normalized_score | 3.0 / 4.0 |
| leaderboard best (before) | 3.333 |
| leaderboard best (after) | 3.333 (unchanged) |
| API calls | 7 |
| 4xx errors | 0 |
| This run improved best? | No |

The run used 7 calls on the update-needed proactive-hedge branch because invoice account 1920 had an empty `bankAccountNumber`:

1. `GET /project?name=...&fields=*,customer(*),projectManager(*)` — proved project with fixedprice=0, correct customer and manager
2. `PUT /project/{id}` — set fixedprice=313650, isFixedPrice=true
3. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-21&fields=*` — resolved VAT 25% (id=3)
4. `POST /order` — created order with milestone line for 156825
5. `GET /ledger/account?isBankAccount=true&fields=*` — proactive hedge, found bank missing
6. `PUT /ledger/account/{id}` — set bankAccountNumber to fix the prerequisite
7. `PUT /order/{id}/:invoice?invoiceDate=2026-03-21&sendToCustomer=false` — created invoice

All 7 calls were necessary. No wasted calls. The proactive hedge saved 1 call and 1 error vs the optimistic path (which would have been 8 calls + 422).

The leaderboard best of 3.333 was achieved on a prior run (likely earlier Estrela Lda or Tindra AS) where the bank was already configured, needing only 6 calls. The score ceiling for the update-needed + missing-bank branch is 3.0 — this run hit that ceiling exactly.

Known call-count → score mapping for task 15:
- 4 calls (skip-PUT branch) → 4.0
- 6 calls (update-needed + configured bank) → 3.333
- 7 calls (update-needed + missing bank) → 3.0
- 8 calls (optimistic + missing bank + 422) → worse than 3.0

## Likely Root Cause

The score gap (3.0 vs best 3.333) is entirely due to **environmental variance**: this fresh production account had an empty `bankAccountNumber` on account 1920, requiring one extra `PUT /ledger/account` call. This is not an agent mistake — it's an uncontrollable variable that differs between fresh Tripletex accounts.

Production evidence across 6 update-needed runs shows 4/6 (67%) have missing bank accounts. The proactive hedge strategy is correct: it guarantees 0 errors at a cost of 1 extra GET call on the 33% of accounts that are already configured.

The only way to score higher than 3.333 on this task would be to encounter a production account where the project already has `fixedprice=313650` (skip-PUT branch, 4 calls → 4.0). This has never happened for this task in production, since the project always starts with `fixedprice=0`.

## What Went Right

1. **Exact trusted-standard match identified instantly** — no time wasted on spec exploration
2. **Project-first resolver** — one `GET /project` with `fields=*,customer(*),projectManager(*)` proved project, customer, and manager in a single call, saving separate `GET /customer` and `GET /employee`
3. **Proactive hedge** — correctly detected and fixed the missing bank account before the invoice write, avoiding a 422 error and the 8-call recovery path
4. **Correct VAT resolution** — used filtered `GET /ledger/vatType` and selected 25% (id=3) from the response
5. **Exact milestone arithmetic** — `313650 * 0.50 = 156825` accepted directly, no rounding needed
6. **Zero errors** — 0 retries, 0 4xx, clean execution
7. **Fast execution** — 82s duration, well within the 300s budget

## What To Change Next Time

**Nothing actionable.** This run followed the optimal strategy for the update-needed branch. The score lag vs the leaderboard best is due to environmental variance (bank-account state), not agent behavior.

The only theoretical improvement would be to somehow skip the proactive hedge when the bank is already configured, but that requires precognition about the bank state — which is exactly what the proactive hedge exists to check. Given the 67% missing rate, the proactive hedge remains the dominant strategy.

If future production evidence shifts the missing-bank rate below ~40%, the optimistic path could become competitive again on the update-needed branch. But at 67% (4/6), the proactive hedge wins on both expected calls (6.67 vs 7.0) and expected errors (0 vs 0.67).
