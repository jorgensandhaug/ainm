# Codex Reflection Summary

## Task

Reverse customer invoice payment for Étoile SARL (org 943745862), invoice "Conseil en données" (33900 NOK ex-VAT). French prompt. Cancel the bank-returned payment so the invoice shows the unpaid amount again.

## Reflection

The run was clean and optimal. The agent:
1. Read the `reverse-customer-invoice-payment` trusted standard before writing the script
2. Wrote a single script implementing the canonical 2-call path
3. Used correct field expansions: `fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))`
4. Used correct field names for local filtering (`amountExcludingVatCurrency`)
5. Included both typed-posting and fallback `Betaling:` matcher logic
6. Did not require `account.number` in the fallback matcher
7. Located invoice `2147573575` (amountCurrency=42375, exVat=33900) in a single GET returning count=1
8. Extracted payment voucher `608891408` from the unique negative `Betaling:` posting
9. Reversed with `PUT /ledger/voucher/608891408/:reverse?date=2026-03-21` → reverse voucher `609194171`
10. Stopped after the reverse write without a proof-only re-read

Nothing went poorly. No mistakes.

## Call Efficiency

**Minimal-call: YES.** The run used exactly 2 API calls with 0 errors, matching the canonical minimum:

| # | Method | Endpoint | Status | Purpose |
|---|--------|----------|--------|---------|
| 1 | GET | `/invoice?invoiceDateFrom=...&invoiceDateTo=...&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` | 200 | Locate paid invoice + extract payment voucher id |
| 2 | PUT | `/ledger/voucher/608891408/:reverse?date=2026-03-21` | 200 | Reverse the payment |

**Wasted calls: 0.** No unnecessary reads, no avoidable 4xx errors, no verification re-reads.

The next agent should follow the same 2-call path:
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&count=100&fields=*,customer(*),orderLines(*),orders(*),postings(*,voucher(*),account(*),customer(*),closeGroup(*))` — filter locally by org number + ex-VAT amount + description
2. `PUT /ledger/voucher/{paymentVoucherId}/:reverse?date=<task-date>` — reverse the payment voucher extracted from postings

## Root Causes

No root causes to document — the run matched the trusted standard perfectly.

## Sandbox Verification

Sandbox verification was attempted but blocked: all existing paid invoices in the persistent sandbox have bank account 1920 reconciled (through October 2026), causing `PUT /ledger/voucher/{id}/:reverse` to return 422 "Handlingen kan ikke utføres fordi følgende bankkonto er avstemt: 1920 Bankinnskudd (oktober 2026)". Creating a new paid invoice also failed because the payment step encounters the same reconciliation lock.

This is sandbox-specific state, not a production concern. The 2-call path is already proven by 11 production confirmations across 7 languages (nb, en, es, pt, nn, de, fr).

## Playbook Changes

Updated existing files only:
- `./trusted-standards/reverse-customer-invoice-payment.md` — added 11th production confirmation (943745862 / 33900 / French prompt)
- `./task-playbooks/reverse-customer-invoice-payment.md` — added same production confirmation

No AGENTS.md changes needed (existing entries already reference the correct file paths).

## Commit

- Hash: `96fc2383800c8ed28543ffffeffc20f8ca7f901f`
- Message: `tripletex playbook: reverse-customer-invoice-payment — add 11th production confirmation (5f57f4dd, French prompt, Étoile SARL / 943745862 / Conseil en données / 33900 / 42375, 2 calls 0 errors); first French-prompt confirmation for reversal task shape; canonical 2-call path continues optimal across nb/en/es/pt/nn/de/fr`

## Reusable Heuristics

1. **French prompts work identically** — the canonical 2-call reverse path is language-agnostic; French "Conseil en données" matched via `orderLines[].description` the same way Norwegian/English/Spanish/Portuguese/German descriptions do
2. **Single-invoice accounts are the norm** — this run returned `count=1` for org 943745862, matching the majority of production runs; the multi-invoice filter (by `amountExcludingVatCurrency`) is exercised less frequently but must remain in the script
3. **Reconciled sandbox blocks reversal writes** — if the persistent sandbox bank account 1920 is reconciled, `PUT /ledger/voucher/:reverse` returns 422; this is sandbox-only state and does not affect production fresh accounts
4. **The 2-call path is the proven minimum** — 11 production confirmations across 7 languages, with no evidence of a 1-call alternative; the next agent should not attempt shortcuts
5. **No AGENTS.md update needed for new confirmations** — when adding a production confirmation to an existing trusted standard and playbook whose file paths haven't changed, only the standard and playbook files need updating
