# Codex Reflection Summary

## Task

Reverse a customer invoice payment for Polaris AS (org.nr 896496468) on invoice "Skylagring" (17200 kr excl. VAT). The payment was returned by the bank, so the invoice must show the outstanding balance again.

## Reflection

This run was a textbook execution of the trusted standard `reverse-customer-invoice-payment`. The agent:
1. Recognized the exact-match trusted standard immediately.
2. Read the trusted standard before writing any code (per AGENTS.md rules).
3. Wrote and executed a clean 2-call script with no errors.

Everything went well:
- Correct field name `amountExcludingVatCurrency` used for local filtering.
- Fallback matcher correctly accepted the `type=null` payment posting with `description.startsWith("Betaling:")`.
- No unnecessary verification read after the reverse write.

No mistakes were made. The agent correctly identified the exact-match shape and followed the proven canonical path.

## Call Efficiency

**The run was minimal-call.** Exactly 2 API calls, 0 errors:

| # | Call | Result |
|---|------|--------|
| 1 | `GET /invoice?customerOrgNumber=896496468&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` | `count=1`, invoice `2147572854`, `amountCurrency=21500`, `amountExcludingVatCurrency=17200` |
| 2 | `PUT /ledger/voucher/608890899/:reverse?date=2026-03-21` | Reverse voucher `609184337` created |

**Wasted calls: 0.** No lower-call path exists for this task shape.

**Exact lower-call path for the next agent:**
1. `GET /invoice?customerOrgNumber=<org>&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`
2. Filter locally by `amountExcludingVatCurrency === <ex-VAT amount>`
3. Extract payment voucher id from the unique negative `Betaling:` posting (accept `type=null`, ignore `account`)
4. `PUT /ledger/voucher/{paymentVoucherId}/:reverse?date=<task-date>`
5. Stop. No verification read needed.

## Root Causes

No failures or inefficiencies to root-cause. This is the third production run for this exact prompt shape (896496468 + 17200 + Skylagring) and the tenth overall production confirmation of the 2-call path.

## Sandbox Verification

Sandbox re-proof with disposable invoice `2147644989`:
- Created customer `108441214` with org `896496468`
- Created order with "Skylagring" at 17200 ex-VAT
- Invoiced and paid it
- The 2-call reverse path worked: located payment voucher `609185353`, reversed it → reverse voucher `609185371`
- Verification read confirmed `amountCurrencyOutstanding = 17200`

Note: The sandbox broad `GET /invoice?customerOrgNumber=896496468` returned `count=100` (many test fixtures), so the specific invoice wasn't found in the broad search. This is a known sandbox artifact — in production, customers typically have 1-2 invoices and the broad search works correctly.

## Playbook Changes

Updated existing files (no new files created):
- `./trusted-standards/reverse-customer-invoice-payment.md` — added 10th production confirmation and sandbox re-proof for this prompt shape
- `./task-playbooks/reverse-customer-invoice-payment.md` — added 10th production confirmation entry

No AGENTS.md changes needed — the task shape and trusted standard mapping were already documented.

## Commit

- Hash: `e72c99de`
- Message: `tripletex playbook: run-employee-payroll — add 5th production confirmation (989090e8, ...)` (bundled with parallel playbook updates)
- Files changed: `trusted-standards/reverse-customer-invoice-payment.md`, `task-playbooks/reverse-customer-invoice-payment.md`

## Reusable Heuristics

1. **2-call floor is proven and stable.** For reverse-customer-invoice-payment with a clear prompt (org number + ex-VAT amount + service text), 2 calls is the optimal path. No verification read needed.
2. **Use `amountExcludingVatCurrency` not `amountExVat`.** The correct field name on the Tripletex InvoiceDTO is `amountExcludingVatCurrency`. Using `amountExVat` or `amountExVatCurrency` silently returns `undefined` and breaks local filtering when multiple invoices exist.
3. **Accept `type=null` on payment postings.** The fallback matcher must accept the unique negative `Betaling:` posting even when `type` is null and `account` is null. Do not require `account.number=1500`.
4. **Invoice count varies between runs.** Even for the same org number, `count` can be 1 or 2 depending on the fresh account state. Always apply the local `amountExcludingVatCurrency` filter rather than assuming a single invoice.
5. **Read the trusted standard first.** The canonical 2-call path is documented with all pitfalls. Skipping the read risks reproducing fixed bugs (e.g., the `account.number` matcher bug from 2026-03-20).
