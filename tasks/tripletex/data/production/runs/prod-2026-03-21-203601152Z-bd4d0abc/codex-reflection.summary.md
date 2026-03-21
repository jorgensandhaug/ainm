# Codex Reflection Summary

## Task

Reverse a returned bank payment for Montaña SL (org 888412972) on invoice "Diseño web" (35800 NOK ex-VAT) so the invoice shows the outstanding amount again. Spanish-language prompt.

## Reflection

The run executed the canonical 2-call trusted standard path flawlessly:

1. `GET /invoice?customerOrgNumber=888412972&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` → returned `count=2`, local filter on `amountExcludingVatCurrency === 35800` isolated invoice `2147570315` (amountCurrency=44750).
2. `PUT /ledger/voucher/608889112/:reverse?date=2026-03-21` → reverse voucher `609140250`.

**What went well:**
- Immediate exact-match recognition of the trusted standard.
- Correct field names (`amountExcludingVatCurrency`) used in the local filter — critical since 2 invoices existed for this customer.
- Fallback matcher correctly accepted `type=null` payment posting without requiring `account.number`.
- No unnecessary verification read.
- 0 errors.

**What went poorly:**
- Nothing. This was a clean optimal execution.

**Previous run comparison:**
- The 2026-03-20 run for the exact same prompt shape (`888412972` + `35800` + `Diseño web`) wasted 1 call because the matcher rejected the payment posting when `account` was null. That bug was fixed in the trusted standard, and this run confirms the fix works.

## Call Efficiency

**Minimal-call: YES.** 2 API calls, 0 errors — this is the theoretical minimum for this task shape (1 read to locate invoice + extract payment voucher, 1 write to reverse).

| # | Call | Purpose | Result |
|---|------|---------|--------|
| 1 | `GET /invoice?customerOrgNumber=888412972&...` | Locate invoice + extract payment voucher | count=2, filtered to 1, voucherId=608889112 |
| 2 | `PUT /ledger/voucher/608889112/:reverse?date=2026-03-21` | Reverse payment | Reverse voucher 609140250 |

**Wasted calls:** None.

**Lower-call path:** Not possible. 2 calls is the absolute minimum — you need at least one read to discover the payment voucher ID and one write to reverse it.

## Root Causes

No issues in this run. The run correctly applied all lessons from the 2026-03-20 production miss for this same prompt shape:
- Matcher accepts `type=null` payment postings
- Matcher does not require `account.number`
- Uses correct field name `amountExcludingVatCurrency` for multi-invoice filtering
- Skips unnecessary verification read

## Sandbox Verification

Sandbox re-proof on 2026-03-21 with disposable invoice `356` / invoice id `2147635893`:
- Created customer with org `888412972`, product `Diseño web` at 35800
- Paid invoice via `PUT /invoice/{id}/:payment`
- Payment posting shape: `type=null`, `description="Betaling: Faktura nummer 356 til MontañaSL..."`, `amountCurrency=-35800`, `voucherId=609141962`, `account.number=1500`
- `PUT /ledger/voucher/609141962/:reverse?date=2026-03-21` → reverse voucher `609141968`
- Verification: `amountCurrencyOutstanding` restored to `35800` = `amountCurrency` ✓

Confirms the 2-call path is correct and sufficient.

## Playbook Changes

Updated existing files (no new files created):

| File | Change |
|------|--------|
| `trusted-standards/reverse-customer-invoice-payment.md` | Added production confirmation for `888412972`/`35800`/`Diseño web` (2-call, 0 errors, multi-invoice filter exercised) and sandbox re-proof with disposable invoice 356 |
| `task-playbooks/reverse-customer-invoice-payment.md` | Added production confirmation section documenting the successful 2-call run and noting this is the same prompt shape that failed on 2026-03-20 |

No AGENTS.md changes needed — no new endpoints, playbooks, or trusted standards were created.

## Commit

- **Hash:** `3cbefe26`
- **Message:** `tripletex playbook: reverse-customer-invoice-payment — add 4th production confirmation (bd4d0abc, Spanish prompt, Montaña SL / 888412972 / Diseño web / 35800 ex-VAT, 2 calls 0 errors), confirms the 2026-03-20 matcher bug fix is working for the same prompt shape that previously wasted a call; third production confirmation of multi-invoice local filter path (count=2, amountExcludingVatCurrency===35800 isolates target)`

## Reusable Heuristics

1. **Fallback matcher must not gate on `account.number`** — payment postings can have `account=null` in production. The unique negative `Betaling: ...` posting with `type=null` is sufficient to identify the reverse target.

2. **Use correct field names for local filtering** — `amountExcludingVatCurrency` / `amountExcludingVat`, never `amountExVat` / `amountExVatCurrency`. Wrong names silently return `undefined` and the filter misses when multiple invoices exist.

3. **Multi-invoice customers are common** — always filter by ex-VAT amount when `count > 1`. Three production runs have now exercised this path successfully.

4. **Skip verification reads** — the scored target is the side effect (payment reversal), not a balance proof. The 2-call path (locate + reverse) is the score-optimal flow.

5. **Same prompt shape can recur across runs** — the `888412972`/`35800`/`Diseño web` shape appeared on both 2026-03-20 and 2026-03-21. The first failed the matcher; the second (this run) succeeded. Trusted standard bug fixes propagate to future runs of the same shape.
