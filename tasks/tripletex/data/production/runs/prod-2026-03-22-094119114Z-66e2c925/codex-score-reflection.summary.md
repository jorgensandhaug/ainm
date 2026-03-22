# Score Reflection: Run 66e2c925

## Task Attribution

- **Task ID:** 09 (T2 tier, max score = 4)
- **Prompt:** Create customer invoice for Sierra SL (861379760) with 3 product lines, mixed VAT 25%/15%/0%
- **Attempt:** 23 of this task
- **Best score before:** 4.0 (already at max)
- **Best score after:** 4.0 (unchanged)

## Correctness Verdict

**Perfect.** Correctness = 1.0, score_raw = 8/8, all 6/6 checks passed. The final Tripletex state was exactly correct — customer resolved, all 3 products linked, VAT types correct (25%/15%/0%), amounts correct (excl. 34800, incl. 42260).

## Efficiency Verdict

**Suboptimal.** normalized_score = 2.5333 out of max 4.0 (63.3% efficiency). The best score for task 09 is 4.0 (achieved by a prior run that completed in 3 calls with 0 errors). This run used 6 calls with 1 avoidable 422 error.

The efficiency gap (4.0 − 2.5333 = 1.4667 points lost) is entirely due to the bank-account repair branch:
- 1 avoidable 422 error (POST /invoice failed due to missing bank account number)
- 3 extra calls (GET bank account + PUT repair + retry POST)

## Likely Root Cause

The run followed the "try POST first, repair on 422" strategy for bank-account validation. This is a correct strategy when the account already has a bank number configured (achieves the 3-call minimum). But when it doesn't (as in this fresh account), it produces a 422 error that penalizes the efficiency score.

The prior run that scored 4.0 likely ran against an account where the bank account was already configured, achieving the 3-call path with 0 errors.

**The 422 is not truly "avoidable" without foreknowledge** — the agent cannot predict whether a fresh account has a bank account number configured. However, a proactive approach could eliminate the 422:

| Strategy | Calls (no repair) | Calls (repair needed) | Errors | Expected score |
|---|---|---|---|---|
| Try-then-repair (current) | 3, 0 errors | 6, 1 error | 0 or 1 | 4.0 or ~2.53 |
| Proactive check+repair | 4, 0 errors | 5, 0 errors | always 0 | ~3.5 or ~3.2 |

The proactive approach trades 1 extra call (when repair isn't needed) for eliminating the 422 penalty (when it is). Given that ~60% of production runs for this task shape hit the bank-account issue, the proactive approach would yield a higher average score.

## What Went Right

1. **Comma-separated product query** resolved all 3 products in one call (6th production confirmation).
2. **Product VAT reuse** — correctly skipped `/ledger/vatType` by reusing `product.vatType.id`.
3. **Correct invoice payload** — all 6 checks passed, amounts exact.
4. **Fast execution** — completed in ~150s, well within the 300s budget.
5. **Clean script** — no wasted reads, no speculative queries, no duplicate calls.

## What To Change Next Time

1. **Proactively check bank account before POST /invoice.** Insert `GET /ledger/account?isBankAccount=true&fields=*` after the product read. If the returned account lacks a `bankAccountNumber`, do `PUT /ledger/account/{id}` to set one before the invoice POST. This eliminates the 422 penalty at the cost of 1 extra call, yielding 5 calls / 0 errors instead of 6 calls / 1 error.

2. **Updated optimal path for fresh-account task shape:**
   1. `GET /customer?organizationNumber=...&fields=*`
   2. `GET /product?number=X,Y,Z&fields=*`
   3. `GET /ledger/account?isBankAccount=true&fields=*` — check bank account
   4. Conditionally `PUT /ledger/account/{id}` if `bankAccountNumber` is empty/missing
   5. `POST /invoice?sendToCustomer=false`
   = 4–5 calls, 0 errors, 0 422s

3. **Do not change the try-then-repair strategy if score is already at max.** Since the best score for task 09 is already 4.0 (from a prior 3-call run), this run couldn't improve it regardless. The proactive approach only helps achieve a consistently higher normalized_score when the bank-account state is unknown.
