# Score Reflection — prod-2026-03-21-203601152Z-bd4d0abc

## Task Attribution

- **Task ID**: 18 (T2 tier, max score 4)
- **Prompt**: Reverse payment for Montaña SL (888412972), invoice "Diseño web" (35800 NOK ex-VAT)
- **Matched standard**: `reverse-customer-invoice-payment`
- **Attempt**: 14th for this task

## Correctness Verdict

**Perfect.** correctness=1, score_raw=8/8, all 3/3 checks passed. The payment reversal left the invoice in exactly the right final state (outstanding amount restored).

## Efficiency Verdict

**Maximum score achieved.** normalized_score=4 on a T2 max-4 task. best_score stayed at 4 (already achieved on prior attempts). The run matched the theoretical ceiling — 2 API calls, 0 errors, 0 wasted reads.

Call breakdown:
1. `GET /invoice?customerOrgNumber=888412972&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,...` — decisive locate, returned count=2, local filter on `amountExcludingVatCurrency===35800` isolated invoice `2147570315`
2. `PUT /ledger/voucher/608889112/:reverse?date=2026-03-21` — reverse write, produced voucher `609140250`

No verification read, no retries, no 4xx errors. This is the minimum possible call count for this task shape.

## Likely Root Cause

No issue. The run executed the canonical 2-call trusted-standard path flawlessly. This is the same prompt shape (`888412972` + `35800` + `Diseño web`) that wasted a call on 2026-03-20 due to the matcher rejecting the payment posting when `account` was null. The matcher bug fix from that reflection was applied correctly this time.

## What Went Right

1. **Exact trusted-standard match** recognized immediately — no time wasted on spec reading or exploratory calls
2. **Correct field names** used in the local filter (`amountExcludingVatCurrency`, not `amountExVat`)
3. **Robust fallback matcher** accepted the `type=null` payment posting with `description.startsWith("Betaling:")` without requiring `account.number`
4. **Multi-invoice filter** worked correctly when count=2 for this customer
5. **No unnecessary verification read** — stopped after the reverse write
6. **Fast execution** — 49s total duration including agent overhead

## What To Change Next Time

Nothing. This run achieved the maximum score with the minimum API calls. The canonical 2-call path for `reverse-customer-invoice-payment` is fully proven for this exact prompt shape. Future agents should continue to:

- Use `amountExcludingVatCurrency` (not `amountExVat`) for local filtering
- Accept `type=null` payment postings via the `Betaling:` description matcher
- Skip the optional verification read in scored runs
- Not depend on `account.number` being present
