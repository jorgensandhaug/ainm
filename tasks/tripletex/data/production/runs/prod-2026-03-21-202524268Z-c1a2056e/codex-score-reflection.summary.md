# Score-Aware Reflection — prod-2026-03-21-202524268Z-c1a2056e

## 1. Task Attribution

- **tx_task_id**: 16 (T2 tier, max normalized score = 4)
- **Task**: Register 28 hours for Bjørn Kvamme on activity "Analyse" in project "Datamigrering" for Fjelltopp AS (org.nr 986191127), rate 1200 kr/t, create project invoice
- **Trusted standard**: `register-project-hours-and-create-project-invoice` (exact match)
- **Attempt**: 17th attempt on task 16

## 2. Correctness Verdict

**Perfect correctness.** `correctness = 1`, `score_raw = 8/8`, all 4 checks passed.

- Timesheet hours registered correctly (24h + 4h split across 2 dates)
- Activity "Analyse" resolved as non-chargeable → correct branch taken
- Invoice created with correct amount: `amountExcludingVatCurrency = 33600` (28 × 1200), `amountCurrencyOutstanding = 42000` (25% VAT applied via vatType id=3)
- Customer correctly linked via project expansion

## 3. Efficiency Verdict

**Below best score. Efficiency gap.**

| Metric | This run | Best for task 16 | Max possible |
|--------|----------|-------------------|-------------|
| normalized_score | 2.5333 | 3.0 | 4.0 |
| API calls | 11 | ~8 (inferred) | 7 (batch + configured) |
| 4xx errors | 1 | 0 (inferred) | 0 |

The run scored 2.5333 vs the existing best of 3.0. Since correctness was perfect, the entire 0.4667 gap is from inefficiency: too many API calls and 1 avoidable 422 error.

### API calls made (11 total, 1 error):
1. `GET /employee` ✓
2. `GET /project` ✓
3. `GET /activity/>forTimeSheet` ✓
4. `POST /timesheet/entry` (24h on 2026-03-21) ✓
5. `POST /timesheet/entry` (4h on 2026-03-22) ✓ — **wasted: should have been batched with #4**
6. `GET /ledger/vatType` ✓
7. `POST /order` ✓
8. `PUT /order/:invoice` → 422 — **avoidable error**
9. `GET /ledger/account` ✓ (recovery)
10. `PUT /ledger/account` ✓ (recovery)
11. `PUT /order/:invoice` ✓ (retry)

### Optimal path for this exact scenario (unconfigured bank account, >24h, non-chargeable):
1. `GET /employee`
2. `GET /project?...&fields=*,customer(*)`
3. `GET /activity/>forTimeSheet`
4. `POST /timesheet/entry/list` (batch: 24h + 4h in one call)
5. `GET /ledger/vatType` ‖ `GET /ledger/account` (parallel)
6. `PUT /ledger/account` (set bank account number)
7. `POST /order`
8. `PUT /order/:invoice`
= **8 calls, 0 errors**

Savings: 3 fewer calls, 0 errors vs 1 error.

## 4. Likely Root Cause

Two independent inefficiencies:

1. **No batch timesheet**: The run used 2 individual `POST /timesheet/entry` calls instead of 1 `POST /timesheet/entry/list`. The trusted standard (at the time of the run) said to "split into one entry per date" but did not mention the batch endpoint. This cost +1 unnecessary call.

2. **Reactive bank account recovery**: The run followed the trusted standard's optimistic branch — attempt `PUT /order/:invoice` first, then recover if 422. On this fresh account, the bank account was not configured, causing a failed PUT (422) + 3 recovery calls (GET + PUT + retry PUT). The proactive approach (check bank account before invoicing) would have been GET + PUT + successful PUT = 2 fewer calls and 0 errors. Net cost of reactive vs proactive on unconfigured account: +2 calls, +1 error.

The trusted standard explicitly said to keep the optimistic branch as canonical. That guidance was wrong for this account — but the batch timesheet optimization was the more clear-cut miss.

## 5. What Went Right

- **Correct trusted standard match**: Immediately identified `register-project-hours-and-create-project-invoice` as exact match
- **Read the standard first**: Followed the documented flow without wasting time on openapi.json
- **Correct >24h split**: Pre-planned 24+4 split, no oversized entry attempt, no same-day duplicate attempt
- **Correct non-chargeable branch**: Skipped `/project/hourlyRates` when `isChargeable=false`
- **Correct VAT handling**: Used `GET /ledger/vatType` and applied the correct 25% rate (id=3)
- **Working bank account recovery**: Correctly handled the 422 and repaired the account
- **Perfect correctness**: All 4 checks passed, 8/8 score

## 6. What To Change Next Time

### Must fix (directly impacted score):

1. **Use `POST /timesheet/entry/list` for >24h tasks**: Batch all date-chunk entries in one call instead of N individual `POST /timesheet/entry` calls. This saves N-1 calls. The trusted standard has now been updated to recommend this.

2. **Proactive bank account check for fresh accounts**: Before `PUT /order/:invoice`, run `GET /ledger/account?isBankAccount=true&fields=*` in parallel with `GET /ledger/vatType`. If the invoice account has empty `bankAccountNumber`, `PUT /ledger/account` to set one. Then the invoice attempt succeeds on first try with 0 errors. On configured accounts this costs +1 call but avoids the catastrophic +3 calls and +1 error on unconfigured accounts. Given the frequency of unconfigured accounts in production (Soleil SARL, Fjelltopp AS), the proactive approach has better expected value.

### Target call counts for next run (>24h non-chargeable):

| Account state | Optimistic + batch | Proactive + batch |
|---------------|-------------------|-------------------|
| Configured    | 7 calls, 0 errors | 8 calls, 0 errors |
| Unconfigured  | 10 calls, 1 error | 9 calls, 0 errors |

The proactive + batch path is 9 calls / 0 errors on unconfigured accounts — better than both the 11 calls / 1 error this run achieved and the inferred ~8-10 calls of the current best score holder.
