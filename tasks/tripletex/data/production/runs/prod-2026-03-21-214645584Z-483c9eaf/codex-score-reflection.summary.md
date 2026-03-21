# Score-Aware Reflection

## Task Attribution

- **Run ID**: `prod-2026-03-21-214645584Z-483c9eaf`
- **Task ID**: `07` (T1 tier, max score 2)
- **Prompt**: Register full payment on Nordhav AS (841333608) invoice for 14200 kr excl. MVA for "Skylagring"
- **Attempt**: 19th attempt on task 07

## Correctness Verdict

**Perfect correctness.** `correctness = 1.0`, `normalized_score = 2/2`, `score_raw = 7/7`, `2/2 checks passed`. All scored fields matched expected values exactly.

The run achieved the maximum possible score for this T1 task.

## Efficiency Verdict

**Maximum efficiency achieved.** The `normalized_score = 2` matches the `best_score = 2` already on the leaderboard. The run tied the existing best with:
- 3 API calls (canonical minimum for standalone payment without cached `paymentTypeId`)
- 0 errors / 0 avoidable 4xx responses
- 65.6s duration

No wasted calls. No retries. No unnecessary reads. The 3-call floor (`GET /invoice` → `GET /invoice/paymentType` → `PUT /invoice/:payment`) is proven optimal — sandbox investigation confirmed no 2-call shortcut exists.

## Likely Root Cause

No issues to diagnose. This was a clean, optimal execution of the trusted standard.

## What Went Right

1. **Exact trusted-standard match recognized immediately** — the agent read `register-customer-invoice-payment.md` before writing any code
2. **Correct field expansions from the start** — `customer(*)`, `orderLines(*)`, `orders(*,orderLines(*))` on invoice read; `debitAccount(*)`, `creditAccount(*)` on payment type read
3. **Required date params included** — `invoiceDateFrom` and `invoiceDateTo` both present, avoiding the documented 422 trap
4. **Payment params sent as query parameters** — not as JSON body, avoiding the documented 422 trap
5. **Live outstanding amount used** — paid `amountOutstanding = 17750` (incl. 25% MVA), not the prompt's lookup amount `14200` (excl. MVA)
6. **Correct payment type selection** — `description === "Betalt til bank"` with `debitAccount.number = 1920`
7. **No unnecessary verification call** — the `PUT /:payment` response confirmed `amountOutstanding = 0`, so no follow-up `GET /invoice/{id}` was needed

## What To Change Next Time

Nothing needs to change for this exact task shape. The trusted standard is battle-tested across 9+ production runs in Norwegian, Portuguese, French, Spanish, and English. The next agent should:

1. **Continue following `register-customer-invoice-payment.md` exactly** — it is proven optimal at 3 calls
2. **Continue using live outstanding amount** — never the prompt's ex-VAT lookup amount
3. **Continue preferring "Betalt til bank" / debit 19xx** — this heuristic has worked in every production run
4. **If a same-run earlier step already resolved a `paymentTypeId`**, reuse it to achieve the 2-call path
5. **Never hardcode payment type IDs** — they vary across accounts (this run: `28273555`, prior runs: `27869893`, `28180406`, `27076191`, `32813748`, etc.)
