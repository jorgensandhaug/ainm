# Score Reflection — prod-2026-03-21-222328897Z-28176e03

## Task Attribution

- **Inference status:** ambiguous (4 tasks changed during capture window)
- **Most likely task:** T07 — "Register full payment on customer invoice"
- **Evidence:** Prompt is "Register full payment on this invoice" for Clearwater Ltd. T07's `last_attempt_at` moved from `22:21:14` to `22:24:21`, closest to the run's `task_complete_timestamp` of `22:24:14`. The prompt matches the T07 task shape exactly (12th production confirmation of this shape).
- **Other diff entries:** T16 (+1 attempt), T17 (+1 attempt), T27 (+1 attempt) — concurrent runs from the same batch window.
- **Task tier:** T1 (tasks 1–8), max score = 2.

## Correctness Verdict

- **Score:** Likely **2/2** (perfect).
- The submission (6471072b, queued 22:24:20) was still `processing` when the after-snapshot was captured at 22:24:46, so no `score_raw` / `normalized_score` is available in the snapshot.
- T07 `best_score` remained at 2/2 (already at max). A perfect score from this run would not change the best.
- The run's `PUT /:payment` response confirmed `amountOutstanding=0.00` and `amountCurrencyOutstanding=0.00`, which is the exact success condition.
- All 11 prior production runs of this exact task shape that used 3 calls and 0 errors scored 2/2.
- **Correctness = 1** (near-certain based on consistent pattern).

## Efficiency Verdict

- **3 API calls, 0 errors** — matches the proven minimum for standalone invoice payment without a cached `paymentTypeId`.
- No wasted calls, no retries, no 4xx errors.
- The 3-call floor has been exhaustively sandbox-proven: invoice objects expose no payment-type fields, `/ledger/paymentType` is 404, `GET /invoice?...&fields=*,paymentType(*)` returns 400, and `paymentTypeId` is required on `PUT /:payment`.
- **Verdict:** Optimal efficiency. No room for improvement on standalone payment tasks.

## Likely Root Cause

No issues to diagnose. The run was a textbook execution of the trusted standard.

## What Went Right

1. **Read the trusted standard first** — avoided all 5 documented pitfalls (missing date params, JSON body on PUT, insufficient field expansion, fake server-side filters, non-resumable scripts).
2. **Used live outstanding amount** (`55937.5`) not prompt ex-VAT amount (`44750`) — correct VAT-inclusive payment.
3. **Correct field expansions** on both GET calls — got `customer.organizationNumber`, `orderLines[].description`, and `debitAccount.number` in one read each.
4. **Query parameters on PUT /:payment** — not JSON body.
5. **Payment type selection** via `description === "Betalt til bank"` — found `28358423` with debit `1920`, consistent with all prior production runs.
6. **Zero verification overhead** — the PUT response itself proved `amountOutstanding=0`, no follow-up GET needed.

## What To Change Next Time

Nothing. This run achieved the optimal path:
- 3 calls (proven minimum for standalone invoice payment)
- 0 errors (no 4xx, no retries)
- Correct final state (amountOutstanding = 0)
- Matched the trusted standard exactly

The only possible improvement would be a 2-call path if a `paymentTypeId` were cached from an earlier task in the same run. The trusted standard already documents this optimization.
