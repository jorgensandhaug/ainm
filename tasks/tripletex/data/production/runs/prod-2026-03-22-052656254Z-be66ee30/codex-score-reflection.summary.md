# Score Reflection — prod-2026-03-22-052656254Z-be66ee30

## Task Attribution

- **tx_task_id**: 10 (T2 tier, max normalized score = 4)
- **Prompt**: Norwegian — create order for Snøhetta AS (800082021) with Webdesign (2797) at 33100 kr + Analyserapport (5684) at 18550 kr, convert to invoice, register full payment
- **Matched trusted standard**: `create-order-invoice-and-register-payment.md`

## Correctness Verdict

**Perfect correctness.** score_raw = 8/8, correctness = 1.0, all 5/5 checks passed.

- Check 1: passed
- Check 2: passed
- Check 3: passed
- Check 4: passed
- Check 5: passed

No missing fields, no wrong values, no side-effect errors.

## Efficiency Verdict

**Maximum score achieved.** normalized_score = 4/4 (T2 max).

- **5 API calls, 0 errors, 0 retries** — clean execution
- Duration: ~66 seconds
- Leaderboard before: T10 best_score = 3 (21 attempts)
- Leaderboard after: T10 best_score = **4** (22 attempts) — **new leaderboard best**
- This run set the new high score for T10, improving from 3 to 4

The 5-call path (with proactive bank-account hedge) achieved maximum score. The theoretical 4-call minimum (skip hedge) would not have improved the normalized score beyond 4 — it was already at the tier cap.

The proactive hedge (GET /ledger/account) was technically unnecessary since bank account 1920 already had a bankAccountNumber, but it cost only 1 extra call and guaranteed 0 errors. Given the maximum score was achieved regardless, the hedge was a net-positive safety decision.

## Likely Root Cause

No issues. This was a clean, optimal execution:

1. Correctly identified exact trusted-standard match
2. Read the trusted standard before writing the script
3. Used the recommended 5-call path with proactive hedge
4. Computed exact paidAmount from vatType percentages (64562.5)
5. Used `POST /invoice` with embedded orders for atomic order+invoice+payment creation
6. Verified amountOutstanding=0 from the write response

## What Went Right

1. **Instant task recognition** — identified `create-order-invoice-and-register-payment` trusted standard immediately from the Norwegian prompt keywords (ordre, faktura, betaling, products by number)
2. **Followed trusted standard exactly** — read the `.md` file first, then wrote the script directly without unnecessary spec exploration
3. **Correct product resolution** — comma-separated `number=2797,5684&fields=*,vatType(*)` returned both products with VAT info in one call
4. **Exact paidAmount computation** — 33100×1.25 + 18550×1.25 = 64562.5, computed from resolved vatType.percentage
5. **Zero errors** — no 4xx responses, no retries, no script restarts
6. **Proactive bank-account hedge** — guaranteed 0 errors at cost of 1 call; scored maximum regardless
7. **Fast execution** — 66 seconds total, well within 300s budget
8. **New leaderboard best** — improved T10 from 3 to 4

## What To Change Next Time

Nothing material needs to change. This run achieved the maximum possible score for the task tier. For marginal improvement:

1. **Consider skipping the hedge** — the 4-call path (no GET /ledger/account) would save 1 call. Since the maximum T2 score was already achieved at 5 calls, this is only relevant if scoring ever rewards sub-tier efficiency beyond the cap. The risk is a 422 on ~10% of fresh accounts, which would cost 3 extra calls + 1 error (7 calls total).
2. **Keep the current trusted standard as-is** — the 5-call path with proactive hedge is the proven safe default. It has now achieved maximum score twice in production (Floresta Lda would have been 6 calls if done correctly, Snøhetta AS was 5 calls).
3. **No documentation changes needed** — playbook and trusted standard already updated with this run's confirmation data during the prior reflection pass.
