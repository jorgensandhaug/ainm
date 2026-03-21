# Score Reflection — prod-2026-03-21-195923370Z-5434d311

## Task Attribution

- **tx_task_id**: 18 (T2 task, max score = 4)
- **Prompt language**: Norwegian Nynorsk
- **Task shape**: Reverse customer invoice payment — Vestfjord AS / org.nr 805747536 / "Systemutvikling" / 46850 kr excl. VAT
- **Trusted standard match**: `reverse-customer-invoice-payment` (exact match)

## Correctness Verdict

**Perfect.** Correctness = 1.0, score_raw = 8/8, all 3/3 checks passed.

The reversal was executed correctly:
- Invoice 2147569584 (Faktura nummer 2) was located for Vestfjord AS
- Payment voucher 608888605 was correctly identified from the `type=null` fallback matcher
- `PUT /ledger/voucher/608888605/:reverse?date=2026-03-21` produced reverse voucher 609123301
- The invoice outstanding balance was reopened to 58562.50 kr (46850 + 25% MVA)

## Efficiency Verdict

**Maximum efficiency achieved.** Normalized score = 4/4 (tied with leaderboard best of 4).

- 2 API calls total — the theoretical minimum for this task shape
- 0 errors, 0 retries, 0 wasted calls
- Call 1: `GET /invoice?customerOrgNumber=805747536&...` — located 2 invoices, filtered locally by `amountExcludingVatCurrency === 46850`
- Call 2: `PUT /ledger/voucher/608888605/:reverse?date=2026-03-21` — reversed the payment
- No verification read (correctly omitted for score-optimal path)
- Duration: 65s — well within the 300s budget

**Leaderboard context**: Task 18 best_score was already 4 before this run (12 attempts). This run maintained the max at attempt 13. No improvement possible — already at ceiling.

## Likely Root Cause

No issues. The run executed the canonical 2-call trusted standard path without deviation. Every decision was correct:
1. Immediate trusted standard match recognition
2. Correct field names for local filtering (`amountExcludingVatCurrency`)
3. Robust fallback matcher accepting `type=null` payment postings
4. Shared-voucher safety check included but not triggered
5. No unnecessary verification read

## What Went Right

- **Trusted standard followed exactly**: Read the trusted standard first, then wrote one script executing both calls
- **Multi-invoice filter worked**: The `GET /invoice` returned 2 invoices for this customer; the local filter on `amountExcludingVatCurrency === 46850` correctly isolated the target — second production confirmation of this branch
- **Fallback matcher robust**: Payment posting had `type=null`, `description="Betaling: Faktura nummer 2 til Vestfjord AS (10004)"`, `amountCurrency=-58562.5` — correctly accepted without requiring `account.number`
- **No wasted reads**: Skipped the optional proof read, saving 1 API call
- **Fast execution**: 65s total, single script execution, no retries

## What To Change Next Time

Nothing. This run is the reference implementation for task 18. The next agent should replicate exactly:

1. Read `trusted-standards/reverse-customer-invoice-payment.md`
2. Write a single script with 2 API calls:
   - `GET /invoice?customerOrgNumber=<org>&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`
   - Filter locally by `amountExcludingVatCurrency` if multiple invoices returned
   - Extract payment voucher from the unique negative `Betaling:` posting (accept `type=null`, ignore `account.number`)
   - `PUT /ledger/voucher/{paymentVoucherId}/:reverse?date=<task-date>`
3. Stop — do not add a verification read
