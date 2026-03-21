# Codex Reflection Summary

## Task

Reverse a returned bank payment from Vestfjord AS (org.nr 805747536) for invoice "Systemutvikling" (46850 kr excl. VAT, 58562.50 incl.) so the invoice shows outstanding balance again. Prompt was in Norwegian Nynorsk.

## Reflection

**What went well:**
- Correctly identified the exact trusted-standard match (`reverse-customer-invoice-payment`) immediately
- Read the trusted standard before writing any code
- Used the canonical 2-call path: one `GET /invoice` to locate, one `PUT /ledger/voucher/:reverse` to reverse
- Correctly handled the multi-invoice case (customer had 2 invoices) by filtering on `amountExcludingVatCurrency === 46850`
- Used correct field name `amountExcludingVatCurrency` (not the wrong `amountExVat` / `amountExVatCurrency`)
- Fallback matcher correctly accepted the `type=null` payment posting with `Betaling:` prefix
- No 4xx errors, no wasted calls

**What went poorly:**
- Nothing. The run was flawless.

**Mistakes:**
- None.

## Call Efficiency

**The run was minimal-call (2 calls, 0 errors). Perfect score: 4/4 normalized, correctness 1.0, tied with leaderboard best.**

| # | Call | Purpose | Result |
|---|------|---------|--------|
| 1 | `GET /invoice?customerOrgNumber=805747536&invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` | Locate paid invoice and extract payment voucher | Found 2 invoices, filtered to 1 by ex-VAT amount; payment voucher 608888605 extracted |
| 2 | `PUT /ledger/voucher/608888605/:reverse?date=2026-03-21` | Reverse the payment | Reverse voucher 609123301 created |

**Wasted calls:** 0
**Lower-call path:** Not possible — 2 calls is the theoretical minimum for this task shape (must locate invoice, must reverse voucher).

## Root Causes

No errors or inefficiencies to diagnose. The agent followed the trusted standard exactly as documented.

## Sandbox Verification

Created a disposable fixture in the persistent sandbox:
- Customer `108412002` (org `815701311`), product `84419501` (Systemutvikling, 46850 excl. VAT), order `402032831`, invoice `2147632391`
- Paid the invoice via `PUT /invoice/{id}/:payment` with `paidAmount=46850`
- Verified the 2-call reversal path:
  1. `GET /invoice/2147632391?fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` — found payment posting `voucherId=609125196`, `type=null`, `amountCurrency=-46850`, `account.number=1500`
  2. `PUT /ledger/voucher/609125196/:reverse?date=2026-03-21` — created reverse voucher `609125545`
- Verification read confirmed `amountCurrencyOutstanding=46850` matches original `amountCurrency=46850`

Note: sandbox broad search (`GET /invoice?customerOrgNumber=...`) returned 100 results due to accumulated persistent data, so the sandbox verification used direct `GET /invoice/{id}` instead. This is a sandbox-only issue — production accounts are fresh and the broad search works correctly there.

## Playbook Changes

**Updated existing trusted standard:**
- `./trusted-standards/reverse-customer-invoice-payment.md` — added 7th production confirmation (5434d311, Nynorsk prompt, multi-invoice local filter) and sandbox re-proof with disposable invoice 337

No AGENTS.md or playbook file changes needed — the trusted standard table entry already exists, the task shape is unchanged, and the flow remains the same canonical 2-call path.

## Commit

- Hash: `1f1db0bf86c7838d9164acc53a4ff1acbba8ebde`
- Message: `tripletex playbook: reverse-customer-invoice-payment — add 7th production confirmation (5434d311, Nynorsk prompt, 805747536 / Systemutvikling / 46850, multi-invoice local filter, 2 calls 0 errors), sandbox re-proof with disposable invoice 337`

## Reusable Heuristics

1. **Multi-invoice local filter is battle-tested**: This is the second production confirmation where `customerOrgNumber` returned multiple invoices and `amountExcludingVatCurrency` correctly isolated the target. The field name must be exactly `amountExcludingVatCurrency`, not `amountExVat` or `amountExVatCurrency`.

2. **Nynorsk prompts use the same task shape**: Norwegian Nynorsk ("Betalinga frå... vart returnert av banken. Reverser betalinga...") maps to the exact same reverse-payment trusted standard. The prompt language does not affect the API flow.

3. **The 2-call path is robust across 7 production runs**: After 7 production confirmations with different customers, amounts, languages (Norwegian, Spanish, Portuguese, French, Nynorsk), and single/multi-invoice scenarios, the canonical 2-call path has never needed a third call for correctness.

4. **`type=null` fallback matcher is the norm, not the exception**: Every production payment posting has had `type=null`. The `INCOMING_PAYMENT` typed posting check is kept as a priority branch but has never been the winning match in production.

5. **`account` field can be null or present**: Both `account.number=1500` and `account=null` have been observed on the winning payment posting. The matcher must not depend on `account.number`.
