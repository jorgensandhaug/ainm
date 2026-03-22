# Score-Aware Reflection — prod-2026-03-22-030511674Z-dd4ea857

## 1. Task Attribution

- **tx_task_id**: 09 (T2 tier, max score 4.0)
- **Prompt**: Portuguese — create invoice for Floresta Lda (919172657) with 3 product lines (4783/24900/25%, 3343/14050/15%, 4380/15750/0%), register full payment
- **Trusted standard**: `create-order-invoice-and-register-payment.md`

## 2. Correctness Verdict

**Perfect.** correctness=1.0, score_raw=8/8, 6/6 checks passed. All product lines, amounts, VAT rates, customer linkage, and payment settlement were correct.

## 3. Efficiency Verdict

**Severely inefficient.** normalized_score=2.3333 out of max 4.0 (58.3%). The leaderboard best for task 09 is 4.0 (achieved in prior attempts). This run lost 1.6667 points purely to efficiency penalties.

### Call accounting

The run executed **two separate script runs** due to the initial script lacking a bank-account recovery branch:

| Script Run | Calls | Errors | Notes |
|---|---|---|---|
| Run 1 (no recovery) | 4 | 1 × 422 | GET customer, GET product, GET paymentType, POST /invoice 422 — script crashed |
| Run 2 (with recovery) | 7 | 1 × 422 | Same 4 calls repeated + GET /ledger/account, PUT /ledger/account, POST /invoice success |
| **Total** | **11** | **2 × 422** | 4 calls wasted from script restart |

### Optimal paths

- **If bank acct exists**: 4 calls, 0 errors (canonical minimum)
- **Reactive recovery (built-in from start)**: 7 calls, 1 error (when bank acct missing)
- **Proactive hedge (GET /ledger/account before POST /invoice)**: 6 calls, 0 errors (when bank acct missing); 5 calls, 0 errors (when bank acct exists)
- **This run**: 11 calls, 2 errors — the worst possible outcome

Prior runs achieving best_score=4.0 likely hit accounts with bank accounts already configured, yielding the clean 4-call path with 0 errors.

## 4. Likely Root Cause

**The script was written without any bank-account recovery logic.** When POST /invoice returned 422 ("bankkontonummer"), the script crashed. The agent then rewrote the script with recovery and re-ran it from scratch, repeating all 4 initial calls plus the 422 error a second time.

Two compounding failures:
1. **Missing recovery branch** — the trusted standard documents this exact 422 failure and its repair path, but the agent's initial script omitted it entirely
2. **Full script restart** — instead of resuming from the failed POST /invoice with cached entity IDs, the agent re-ran the entire script, re-doing GET customer + GET product + GET paymentType unnecessarily

The bank-account issue itself is not the agent's fault (unpredictable on fresh accounts), but failing to handle it gracefully cost 7 extra calls and 1 extra error.

## 5. What Went Right

- Correctly matched the task to the `create-order-invoice-and-register-payment` trusted standard
- Read the trusted standard before writing the script (avoided the "write from memory" trap)
- Used the new POST /invoice with embedded orders path (4-call canonical, not the old 5-call POST /order + PUT /order/:invoice)
- Correct paidAmount computation using vatType(*) expansion (63032.50 NOK)
- Correct product lookup with comma-separated `number=4783,3343,4380` (OR semantics)
- Used `String(p.number)` comparison (avoided the type pitfall)
- Used `pts[0]` for payment type (avoided the nonexistent `isIncoming` pitfall)
- All 6 correctness checks passed on first attempt — no data/state errors

## 6. What To Change Next Time

1. **Always include bank-account recovery in the initial script.** The recovery branch (GET /ledger/account + conditional PUT + retry POST /invoice) adds zero calls when bank account exists but saves 4 calls when the script would otherwise crash and restart. This is the single highest-impact fix.

2. **Consider the proactive hedge for fresh accounts.** GET /ledger/account before POST /invoice costs 1 extra call when bank account exists (5 vs 4) but saves 1 call + 1 error when missing (6 vs 7). Since production always uses fresh accounts where bank account status is unpredictable, the proactive approach avoids all 422 errors and gives a better expected score (0 errors always beats 1 error on the scorer).

3. **If recovery is reactive, cache entity IDs across the retry.** If the script hits the 422 and needs to retry POST /invoice, it should NOT re-fetch customer, products, and payment types. Those are already resolved. The retry should only do GET /ledger/account + PUT /ledger/account + POST /invoice (3 calls), not restart from scratch (7 calls).

4. **Target call counts for this task shape:**
   - Bank acct exists: 4 calls, 0 errors (canonical minimum, likely scores 4.0)
   - Bank acct missing, proactive hedge: 6 calls, 0 errors (best achievable)
   - Bank acct missing, reactive with caching: 7 calls, 1 error (acceptable)
   - Bank acct missing, script restart (this run): 11 calls, 2 errors (unacceptable — lost 1.67 points)
