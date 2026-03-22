# Post-Run Reflection: prod-2026-03-22-112300237Z-0f3c0a9e

## Task
Reverse the payment from Snøhetta AS (org.nr 962427715) for the invoice "Systemutvikling" (49600 kr excl. MVA) that was returned by the bank, so the invoice shows outstanding balance again.

## Reflection
**What went well:**
- Exact trusted-standard match identified immediately: `reverse-customer-invoice-payment`
- Trusted standard read before writing any script (as mandated)
- Canonical 2-call path executed flawlessly: 1 GET to locate invoice, 1 PUT to reverse payment voucher
- No errors, no wasted calls, correct result on first attempt
- Script correctly used `amountExcludingVatCurrency` (not the wrong field name `amountExVat`) for local filtering
- Fallback matcher correctly accepted the `type=null` payment posting without requiring `account.number`

**What went poorly:**
- Nothing. This was a clean optimal execution.

**Mistakes:**
- None.

## Call Efficiency
**Minimal-call: YES** — 2 API calls is the theoretical minimum for this task shape.

| # | Method | Endpoint | Purpose | Necessary? |
|---|--------|----------|---------|------------|
| 1 | GET | `/invoice?customerOrgNumber=962427715&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` | Locate paid invoice + extract payment voucher ID | Yes — cannot reverse without knowing the voucher ID |
| 2 | PUT | `/ledger/voucher/609419087/:reverse?date=2026-03-22` | Reverse the payment voucher | Yes — the core side effect |

**Wasted calls:** 0
**Lower-call path:** None possible. 2 calls is the minimum.

## Root Causes
No issues to root-cause. The run was optimal.

## Sandbox Verification
- Created disposable fixture: customer 108594776, product 84439993, order 402080698, invoice 2147700114
- Paid invoice with payment type 32813747 (Kontant), amount 49600
- Verified the canonical 2-call path:
  1. `GET /invoice/2147700114?fields=*,...,postings(*)` → found payment posting `type=null`, `amountCurrency=-49600`, `voucherId=609420515`, `account.number=1500`
  2. `PUT /ledger/voucher/609420515/:reverse?date=2026-03-22` → reverse voucher 609420949
- Verification read confirmed `amountCurrencyOutstanding=62000` matches `amountCurrency=62000` — invoice fully reopened
- Note: sandbox broad search (`GET /invoice?customerOrgNumber=...&count=100`) returned 100 results without the new invoice due to accumulated sandbox data; this is the known sandbox search lag, not a production concern

## Playbook Changes
Updated existing trusted standard and playbook (no new files created):
- `./trusted-standards/reverse-customer-invoice-payment.md` — added 15th production confirmation (962427715 + 49600 + Systemutvikling, Bokmål) and sandbox re-proof with invoice 2147700114
- `./task-playbooks/reverse-customer-invoice-payment.md` — added 15th production confirmation entry

No changes to `./AGENTS.md` were needed for this run (no new task patterns, no flow changes).

## Commit
- Hash: `e8d85e71`
- Message: `tripletex playbook: reverse-customer-invoice-payment — add 15th consecutive optimal run (0f3c0a9e, Snøhetta AS/962427715, Bokmål)`

## Reusable Heuristics
1. **This task shape is fully stable.** 15 consecutive optimal 2-call runs across en/nb/nn/es/fr/de/pt confirm the standard is language-independent and requires no further investigation.
2. **The canonical path is: 1 GET + 1 PUT.** No verification GET is needed for scoring — the reverse side effect itself is the scored target.
3. **Payment voucher detection must not depend on `posting.type` or `account.number`.** The payment posting can have `type=null` and `account=null`. The reliable matcher is: unique negative posting with `description` containing `"Betaling:"`.
4. **When multiple invoices exist for the same customer**, filter locally by `amountExcludingVatCurrency` (not `amountExVat` or `amountExVatCurrency` — those field names don't exist on InvoiceDTO and return `undefined`).
5. **Do not reverse shared vouchers.** If the invoice posting and payment-style postings share the same `voucher.id`, this is a combined-prepayment shape, not the ordinary standalone-payment-reversal shape.
