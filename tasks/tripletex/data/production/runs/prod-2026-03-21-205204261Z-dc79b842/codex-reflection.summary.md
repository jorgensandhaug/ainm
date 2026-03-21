# Codex Reflection Summary

## Task

Reverse a customer invoice payment for Sierra SL (org 910318144). The invoice "Almacenamiento en la nube" (19250 NOK ex-VAT, 24062.50 gross) had its payment returned by the bank. Revert the payment so the invoice shows the outstanding amount again. Spanish prompt.

## Reflection

The run was a perfect execution of the trusted standard `reverse-customer-invoice-payment`. The agent:

1. Read the trusted standard first (as required by AGENTS.md)
2. Recognized this as an exact match for the canonical 2-call path
3. Wrote a single script with the correct GET + PUT flow
4. Executed it successfully on the first attempt

What went well:
- Exact trusted standard match identified immediately
- Script used correct field names (`amountExcludingVatCurrency`) for the local filter
- Fallback matcher correctly handled `type=null` payment postings without requiring `account.number`
- No wasted calls, no errors, no retries

What went poorly:
- Nothing. This was a clean 2-call execution.

## Call Efficiency

**The run was minimal-call.** 2 API calls total, which is the theoretical minimum for this task shape.

| # | Method | Endpoint | Purpose | Result |
|---|--------|----------|---------|--------|
| 1 | GET | `/invoice?customerOrgNumber=910318144&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` | Locate paid invoice and extract payment voucher ID | count=1, invoice 2147570785, payment voucher 608889441 |
| 2 | PUT | `/ledger/voucher/608889441/:reverse?date=2026-03-21` | Reverse the payment voucher | Reverse voucher 609147189 created |

Wasted calls: **0**
4xx errors: **0**

The next agent should follow the exact same 2-call path for this task shape.

## Root Causes

No issues to diagnose. The run matched the trusted standard exactly and executed without error.

## Sandbox Verification

Re-verified in persistent sandbox on 2026-03-21:
- Used existing invoice `2147637165` (created earlier in the session for Sierra SL / 910318144)
- Paid via `PUT /invoice/{id}/:payment?paymentTypeId=32813747` (Kontant)
- Sandbox broad search hit the known "sandbox trap" (fresh invoice not in broad search results), fell back to direct GET
- Payment posting shape confirmed: `description="Betaling: Faktura nummer 358 til Sierra SL (99788)"`, `amountCurrency=-19250`, `voucherId=609148368`, `type=null`, `account.number=1500`
- `PUT /ledger/voucher/609148368/:reverse?date=2026-03-21` produced reverse voucher `609148385`
- Verification read confirmed `amountCurrencyOutstanding=19250` (outstanding amount restored)

The sandbox trap (fresh invoices not appearing in broad search) is sandbox-only and does not affect production.

## Playbook Changes

Updated existing files only (no new files created):

- `./trusted-standards/reverse-customer-invoice-payment.md` — added 8th production confirmation (910318144 / 19250 / Spanish prompt) and sandbox re-proof with disposable invoice 358
- `./task-playbooks/reverse-customer-invoice-payment.md` — added production confirmation section for this run

No AGENTS.md changes needed (trusted standard and playbook paths unchanged).

## Commit

- Hash: `45e8a9ed`
- Message: `tripletex playbook: reverse-customer-invoice-payment — add 8th production confirmation (dc79b842, Spanish prompt, 910318144 / 19250 ex-VAT Almacenamiento en la nube / 24062.5 gross, 2 calls 0 errors), sandbox re-proof with disposable invoice 358 / id 2147637165 confirming type=null fallback matcher with account.number=1500`

## Reusable Heuristics

1. **This task shape is fully solved.** The canonical 2-call path (GET invoice → PUT voucher/:reverse) has now been confirmed 8 times in production across nb, es, pt, nn, de, and fr prompts.

2. **The `type=null` fallback matcher is reliable.** Every production and sandbox observation shows the payment posting arrives with `type=null`, not `INCOMING_PAYMENT`. The matcher must accept the unique negative `Betaling: ...` posting regardless of `type` or `account` values.

3. **Single-invoice customers need no local filter.** When `count=1`, skip the `amountExcludingVatCurrency` filter and use the only invoice directly. The local filter matters only when multiple invoices exist for the same customer org number.

4. **No verification read needed.** The score-optimal path stops after the reverse write. Adding a third GET for balance proof wastes a call without improving correctness.

5. **Spanish prompt keywords map cleanly.** "El pago ... fue devuelto por el banco. Revierta el pago" = reverse the payment. "Importe pendiente" = outstanding amount. These Spanish phrases reliably indicate the reverse-customer-invoice-payment task shape.
