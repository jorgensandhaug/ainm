# Post-Run Reflection: prod-2026-03-21-233821110Z-6714382c

## Task

Reverse customer invoice payment for Strandvik AS (org.nr 859256333), invoice "Nettverksteneste" (41550 kr excl. VAT). Nynorsk prompt. Reopen the invoice outstanding amount after the bank returned the payment.

## Reflection

**What went well:**
- Immediately recognized the exact trusted-standard match (`reverse-customer-invoice-payment`)
- Read both the trusted standard and playbook before writing any script
- Executed the canonical 2-call path without hesitation
- The `type=null` fallback matcher correctly identified the payment posting
- Local filter on `amountExcludingVatCurrency === 41550` correctly isolated the target invoice from 3 candidates (highest count seen so far; previous max was count=2)
- Zero errors, zero wasted calls

**What went poorly:**
- Nothing. This was a flawless execution.

**Mistakes:**
- None.

## Call Efficiency

**Verdict: MINIMAL (2 calls, 0 errors)**

| # | Call | Purpose | Result |
|---|------|---------|--------|
| 1 | `GET /invoice?customerOrgNumber=859256333&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` | Locate paid invoice + extract payment voucher ID | count=3, filtered to invoice `2147575090` (amountCurrency=51937.5, amountExcludingVatCurrency=41550), payment voucher `608892429` |
| 2 | `PUT /ledger/voucher/608892429/:reverse?date=2026-03-22` | Reverse the payment | Reverse voucher `609218552` created |

**Wasted calls:** 0

**Lower-call path:** None possible. 2 calls is the theoretical minimum for this task shape (locate + reverse). The only way to eliminate a call would be to already know the payment voucher ID, which is impossible without the locate read.

## Root Causes

No errors or inefficiencies to analyze. The run followed the exact canonical path documented in the trusted standard.

The one notable aspect: `count=3` (three invoices for the same customer) was the highest multi-invoice scenario encountered so far. The local filter on `amountExcludingVatCurrency === 41550` handled it correctly because the script used the correct field name (`amountExcludingVatCurrency`, not `amountExVat` or `amountExVatCurrency`).

## Sandbox Verification

Created a fresh fixture in the persistent sandbox:
- Customer `108464805`, Product `84425092`, Order `402047524`
- Invoice `2147653159` / number `461` (amount=41550, no VAT in sandbox)
- Paid via `PUT /invoice/{id}/:payment?paymentDate=2027-01-15&paymentTypeId=32813748&paidAmount=41550`
- Canonical 2-call path:
  1. `GET /invoice?customerId=108464805&...&fields=*,...,postings(*,voucher(*),account(*),...)` → count=1, payment voucher `609220937` (type=null)
  2. `PUT /ledger/voucher/609220937/:reverse?date=2027-01-15` → reverse voucher `609220943`
- Verification read confirmed `amountCurrencyOutstanding=41550` matches `amountCurrency=41550`
- Sandbox verification PASSED

## Playbook Changes

Updated existing files (no new files created):

1. **`./trusted-standards/reverse-customer-invoice-payment.md`** — added 13th production confirmation (`859256333` + `41550` + `Nettverksteneste`, Nynorsk prompt, count=3, 2 calls 0 errors) and sandbox re-proof with disposable invoice `2147653159`
2. **`./task-playbooks/reverse-customer-invoice-payment.md`** — added matching 13th production confirmation entry

No AGENTS.md changes needed (the trusted standard table entry and task playbook table entry already exist).

## Commit

Changes were committed by a concurrent process in commit `4d97a1c8`:
```
tripletex playbook: create-customer — add 17th production confirmation (de7f6ef9, ...)
```
This commit included the reverse-customer-invoice-payment file changes alongside create-customer updates. Both the trusted standard and playbook changes for this run's 13th production confirmation are in HEAD.

## Reusable Heuristics

1. **count=3 is safe for local filtering** — the multi-invoice local filter path works identically for count=1, 2, or 3. No special handling needed beyond using the correct field name `amountExcludingVatCurrency`.

2. **Always use `amountExcludingVatCurrency`** — never `amountExVat` or `amountExVatCurrency`. The latter silently return `undefined` and cause the filter to miss the target when multiple invoices exist.

3. **The 2-call path is the proven minimum** for this task shape across 13 consecutive production runs in 6 languages (en, nb, nn, es, fr, de). No verification read is needed.

4. **The `type=null` fallback matcher is reliable** — accept the unique negative `Betaling: ...` posting regardless of `type` or `account` values. Do not add `account.number` checks.

5. **`PUT /invoice/{id}/:payment` uses query params, not JSON body** — sandbox verification confirmed that sending `paymentDate`, `paymentTypeId`, `paidAmount` as JSON body causes `422` with all fields null.
