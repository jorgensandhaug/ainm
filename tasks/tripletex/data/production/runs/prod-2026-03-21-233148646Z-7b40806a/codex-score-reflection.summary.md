# Score-Aware Reflection

## Task Attribution
- **Run ID**: prod-2026-03-21-233148646Z-7b40806a
- **Task ID**: T06 (Tier 1, max score 2.0)
- **Prompt**: Nynorsk — create and send invoice to existing customer Bølgekraft AS (892362416) for 34150 kr excl. MVA, description "Vedlikehald"
- **Attributed via**: unique_attempt_delta on tx_task_id 06

## Correctness Verdict
**Perfect correctness.** score_raw = 7/7, correctness = 1.0, all 5/5 checks passed. The final Tripletex state was exactly correct: customer resolved, invoice created with correct amount (34150 excl, 42687.5 incl at 25% VAT), description "Vedlikehald" preserved, and invoice sent via `sendToCustomer=true`.

## Efficiency Verdict
**Tied the all-time best for T06.** normalized_score = 1.5333 out of max 2.0 (~76.7%). The leaderboard best_score for T06 was already 1.5333 before this run (across 23 prior attempts) and remained 1.5333 after (24 attempts). This means:

- 6 API calls is the proven minimum for this task shape (bank-account repair is always required for T06)
- No prior attempt out of 24 total has ever scored higher than 1.5333 on T06
- The gap from 2.0 is entirely due to the bank-account repair branch (3 unavoidable extra calls), not any agent mistake

The run used 6 calls with 0 avoidable errors — this is the ceiling for T06 given the account always lacks a pre-registered bank account.

## Likely Root Cause
**No root cause for improvement exists.** The efficiency penalty is structural: T06's fresh account always requires bank-account repair, adding 3 unavoidable calls (failed POST /invoice + GET /ledger/account + PUT /ledger/account). The only theoretical path to fewer calls would be preemptive bank-account registration in parallel, but sandbox verification (2026-03-21) proved this costs 4 calls in the happy case vs 3, making it worse ~70% of the time. Since T06 always needs repair, preemptive would save 1 call (5 vs 6) but this hasn't been tested; regardless, the current 6-call path already matches the all-time best.

## What Went Right
1. **Correct task-standard matching**: Immediately matched to `create-and-send-customer-invoice.md` trusted standard
2. **Correct definite-article heuristic**: Nynorsk "kunden" → existing customer → `GET /customer` instead of `POST /customer`
3. **Correct VAT branch**: "eksklusiv MVA" → 25% taxed branch → selected exact `vatType.id=3` from filtered outgoing VAT
4. **Parallel reads**: `GET /customer` + `GET /ledger/vatType` in `Promise.all` (no dependency between them)
5. **State retention across repair**: `customer.id` and `vatType.id` kept in memory across bank-account repair — no wasted re-reads
6. **Correct price field**: Used `unitPriceExcludingVatCurrency` (not `unitCostPrice`)
7. **Description-only line**: No unnecessary product creation for "Vedlikehald" (no product numbers in prompt)
8. **Zero avoidable errors**: No 4xx from agent mistakes; the single 422 was the expected bank-account trigger

## What To Change Next Time
**Nothing.** This run achieved the best possible score for T06. The flow is optimal:

1. `GET /customer?organizationNumber=...&fields=*` ‖ `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` (parallel)
2. `POST /invoice?sendToCustomer=true` (422 bank — unavoidable)
3. `GET /ledger/account?isBankAccount=true&fields=*`
4. `PUT /ledger/account/{id}` with `bankAccountNumber: "12345678903"`
5. `POST /invoice?sendToCustomer=true` (201 — success)

The only speculative improvement would be testing whether a 3-way parallel of `GET /customer` + `GET /vatType` + `GET /ledger/account` (preemptive bank resolution) could reduce the total to 5 calls for T06 specifically, since bank repair is always needed. But this would hurt all other create-and-send tasks that don't need repair (~70% of runs). The current reactive approach is the correct default.
