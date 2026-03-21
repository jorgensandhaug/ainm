# Score-Aware Reflection: prod-2026-03-21-224158753Z-2f5da463

## 1. Task Attribution

- **Prompt:** Register full payment on customer invoice for Luz do Sol Lda (org 939210970), 23900 NOK ex-VAT, "Manutenção" (Portuguese)
- **Task shape:** Register customer invoice payment → T1 task (max 2 points)
- **Inference status:** `ambiguous` — 3 leaderboard entries changed (tasks 05, 07, 12), candidate_count=2
- **Most likely task IDs:** Task 05 or Task 07 (both T1, both already at max score 2/2)
- **Submission:** `5575353c` (queued 22:42:51, ~7s after task completion at 22:42:44), still `processing` at capture time (22:43:15)
- **Score not yet available** at snapshot time; both candidate T1 tasks were already at max score 2/2

## 2. Correctness Verdict

**Almost certainly perfect (correctness = 1.0).**

Evidence:
- Invoice `2147575326` located correctly by org number `939210970`, ex-VAT amount `23900`, and description `Manutenção`
- Payment used live outstanding amount `29875` (not prompt's ex-VAT `23900`)
- Payment type `28406443` (`Betalt til bank`, debit `1920`) resolved from `/invoice/paymentType`
- PUT response confirmed `remainingOutstanding = 0`
- This exact flow has succeeded on 14 consecutive production runs with 0 correctness failures

Both candidate T1 tasks (05, 07) are already at best_score 2/2, confirming this task shape consistently achieves perfect correctness.

## 3. Efficiency Verdict

**Optimal — 3 calls, 0 errors, 0 wasted calls.**

| # | Call | Status |
|---|------|--------|
| 1 | `GET /invoice?invoiceDateFrom=...&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))` | 200 |
| 2 | `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` | 200 |
| 3 | `PUT /invoice/2147575326/:payment?paymentDate=2026-03-21&paymentTypeId=28406443&paidAmount=29875` | 200 |

- **3 calls** is the proven minimum for standalone payment without a same-run cached paymentTypeId
- **0 errors** — no 4xx or retries
- No 2-call shortcut exists (confirmed by 10+ sandbox proofs and this run's post-reflection sandbox verification)
- Maximum efficiency bonus expected

## 4. Likely Root Cause

**No issues.** This run was flawless. Score was still processing at capture time but almost certainly achieved 2/2 (max for T1) based on:
- Perfect correctness (payment registered, outstanding = 0)
- Minimum call count (3)
- Zero errors
- Both candidate T1 tasks already at max 2/2, confirming this flow reliably maxes the score

## 5. What Went Right

1. **Trusted standard followed exactly** — read the `.md` file before writing any script
2. **Correct payment amount** — used live outstanding `29875` from invoice object, not prompt's `23900` ex-VAT
3. **Correct field expansions** — `customer(*)`, `orderLines(*)`, `orders(*,orderLines(*))` on invoice read; `debitAccount(*)`, `creditAccount(*)` on payment type read
4. **Query parameters on PUT** — not JSON body (which would have caused 422)
5. **Required date params** — `invoiceDateFrom` and `invoiceDateTo` both provided (omitting causes 422)
6. **No unnecessary reads** — no follow-up GET after payment write, verified from response directly
7. **Portuguese prompt handled identically** — `sem IVA` correctly interpreted as ex-VAT locator, not payment amount

## 6. What To Change Next Time

**Nothing.** This run is the gold standard for this task shape:
- 3 calls, 0 errors, perfect correctness
- 14th consecutive production confirmation of this exact path
- No known improvement exists — 2-call shortcut has been exhaustively disproven

The only possible improvement is **same-run paymentTypeId caching**: if a prior task in the same run already resolved a valid incoming payment type for the same company/currency, skip step 2 and use 2 calls instead of 3. This optimization is already documented in the trusted standard.
