# Codex Reflection Summary

## Task
Register payment on a foreign-currency customer invoice (8387 EUR to Dalheim AS / 847589930) at settlement rate 12.84 NOK/EUR (original rate 11.99), and book the FX gain (agio) to the correct account.

## Reflection
**What went well:**
- Agent read the trusted standard before writing code — no wasted exploration
- Correctly identified this as an exact match for `register-foreign-currency-customer-invoice-payment`
- Script included inline NOK fallback logic (critical — earlier runs scored 0% by omitting this)
- Invoice was correctly identified as NOK (`amount === amountCurrency`), so the NOK fallback path was taken
- Simple payment registered first, then manual agio voucher with `row: 1`+ (not row 0)
- Bank account ID reused from paymentType `debitAccount.id` instead of hardcoded 1920
- Agio amount correctly calculated: 8387 × (12.84 − 11.99) = 8387 × 0.85 = 7128.95 NOK

**What went poorly:**
- Nothing — this was a clean, optimal execution

**Mistakes:**
- None. The run matched the canonical 5-call NOK fallback flow exactly.

## Call Efficiency
**Verdict: MINIMAL — 5 calls, 0 errors**

The run used exactly the canonical minimum for the NOK fallback path:

| # | Call | Purpose |
|---|------|---------|
| 1 | `GET /invoice?invoiceDateFrom=...&fields=*,currency(*)` | Locate the invoice |
| 2 | `GET /invoice/paymentType?fields=*,debitAccount(*)` | Resolve bank payment type + get bank account ID |
| 3 | `PUT /invoice/{id}/:payment?paidAmount=10483.75` | Register simple payment |
| 4 | `GET /ledger/account?number=8060&fields=id,number` | Resolve agio account ID |
| 5 | `POST /ledger/voucher?sendToLedger=true` | Book manual agio (7128.95 on 8060) |

**Wasted calls: 0**

**Lower-call path investigation:** Sandbox re-confirmed that `POST /ledger/voucher` with `account: { number: 8060 }` (no ID) → 422. The account ID lookup (call 4) cannot be skipped. 5 calls is the absolute minimum for the NOK fallback path.

For a genuine EUR invoice (where `amount ≠ amountCurrency`), the path would be 3 calls — the `:payment` endpoint auto-books FX on 8060/8160 and no manual voucher is needed. But all production runs so far have encountered NOK invoices, making the 5-call path the de facto standard.

## Root Causes
No failures in this run. For reference, earlier runs failed due to:
- No NOK fallback logic (0% — script exited when no EUR invoice found)
- NOK fallback without manual voucher (50% — payment registered but no agio booked)
- `row: 0` in voucher postings (0% — universally rejected by Tripletex)
- `account: { number }` without ID (422 — must use `account: { id }`)

## Sandbox Verification
Sandbox re-confirmed:
1. `account: { number: 8060 }` in voucher body → 422 ("account.name: Kan ikke være null") — account ID lookup is mandatory
2. Batch account lookup `number=8060,8160` works but doesn't save calls (only one account needed per run)
3. PaymentType `debitAccount.id` is reusable in voucher postings — no separate bank account lookup needed
4. 5 calls is the proven minimum for the NOK fallback path

## Playbook Changes
**Updated existing files (no new files created):**
- `./trusted-standards/register-foreign-currency-customer-invoice-payment.md` — added 5th production confirmation (507de3ea)
- `./task-playbooks/register-foreign-currency-customer-invoice-payment.md` — added 5th production confirmation (507de3ea)

No AGENTS.md changes needed — the trusted standard table entry already exists.

## Commit
- **Hash:** `1be3a31f`
- **Message:** `tripletex playbook: register-foreign-currency-customer-invoice-payment — add 5th production confirmation (507de3ea, Nynorsk prompt, Dalheim AS / 847589930 / 8387 EUR, rate 11.99→12.84, 5 calls 0 errors); 5th consecutive full-score NOK-fallback, 4th agio confirmation`

## Reusable Heuristics
1. **Every FX payment task so far has been NOK fallback** — all 5 production confirmations found `amount === amountCurrency`. The script MUST always include inline NOK fallback logic.
2. **5 calls is the floor for NOK fallback** — `GET /ledger/account` cannot be skipped because `POST /ledger/voucher` requires `account: { id }`, not `{ number }`.
3. **Reuse paymentType `debitAccount.id`** for the bank account in manual vouchers — saves a separate bank account lookup and uses the actual payment bank account.
4. **Agio = settlement rate > original rate** → debit bank (+fxAmount), credit 8060 (−fxAmount). **Disagio = settlement rate < original rate** → debit 8160 (+fxAmount), credit bank (−fxAmount).
5. **FX amount = promptEurAmount × |settlementRate − originalRate|** — always use the ex-VAT EUR amount from the prompt, not the outstanding NOK amount.
6. **Row numbering starts at 1** — row 0 is universally reserved by Tripletex as "system-generated". Using row 0 in any voucher posting → 422.
7. **Read the trusted standard, don't write from memory** — every production failure on this task shape came from agents skipping the standard or not implementing the full NOK fallback flow.
