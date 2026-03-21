# Codex Reflection Summary

## 1. Task

Register payment on an existing EUR invoice (2052 EUR ex-VAT, original rate 10.97 NOK/EUR) for Northwave Ltd (org 883808568) at settlement rate 10.01 NOK/EUR, and post the exchange rate difference (disagio) to the correct account.

## 2. Reflection

**What went well:**
- Correctly identified the trusted standard `register-foreign-currency-customer-invoice-payment.md` as an exact match
- Used `customerOrgNumber` filter to locate the invoice directly (no separate customer read)
- Invoice closed successfully (`amountOutstanding=0`, `amountCurrencyOutstanding=0`)
- No manual voucher write was attempted (correct — `:payment` auto-books FX)

**What went poorly:**
- First `GET /invoice` returned `422` because `invoiceDateFrom` and `invoiceDateTo` were missing — wasted 1 call
- Used `fields=*` without `currency(*)` — currency returned as sparse `{ id: 1, url: ... }` without `code`, so the agent never verified the invoice was actually in EUR
- Used `fields=*` on `/invoice/paymentType` without `debitAccount(*)` — debit account returned as sparse link, preventing reliable `19xx` / `isBankAccount` filtering; required fragile fallback logic
- Did not detect the invoice was in NOK (`amount === amountCurrency === 2565`, `currency.id=1=NOK`) — applied FX logic to a company-currency invoice
- Sent `paidAmount=25675.65` on a 2565 NOK invoice (10x overshoot) — Tripletex ignored the mismatch and debited bank by only 2565 NOK, so no actual damage, but no disagio was booked either

## 3. Call Efficiency

**Run used 4 API calls. Minimum was 3.**

| # | Call | Status | Necessary? |
|---|------|--------|-----------|
| 1 | `GET /invoice?customerOrgNumber=883808568&invoiceStatus=INVOICED&fields=*` | 422 | WASTED — missing required `invoiceDateFrom`/`invoiceDateTo` |
| 2 | `GET /invoice?customerOrgNumber=883808568&invoiceDateFrom=2020-01-01&invoiceDateTo=2026-12-31&fields=*` | 200 | Needed, but should have used `fields=*,currency(*)` |
| 3 | `GET /invoice/paymentType?fields=*` | 200 | Needed, but should have used `fields=*,debitAccount(*)` |
| 4 | `PUT /invoice/{id}/:payment?...&paidAmount=25675.65&paidAmountCurrency=2565` | 200 | Needed — closed invoice |

**Correct 3-call path:**
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-03-22&customerOrgNumber=883808568&fields=*,currency(*)`
2. Detect `currency.code=NOK` + `amount===amountCurrency` → company-currency invoice → fall back to simple payment
3. `GET /invoice/paymentType?fields=*,debitAccount(*)` → select `debitAccount.number=1920`
4. `PUT /invoice/{id}/:payment?paymentDate=2026-03-21&paymentTypeId=<id>&paidAmount=2565`

## 4. Root Causes

1. **Missing required params on `/invoice`**: The `invoiceDateFrom`/`invoiceDateTo` requirement is documented in `common-endpoints.md` but the agent didn't follow it. The trusted standard also didn't explicitly specify these params in the flow.
2. **No currency expansion**: The trusted standard said `fields=*` without specifying `currency(*)`. Plain `fields=*` returns currency as a sparse link `{ id, url }` without `code`, making company-currency detection impossible.
3. **No `debitAccount(*)` expansion on payment type read**: The trusted standard said `fields=*` without specifying `debitAccount(*)`. Plain `fields=*` returns the debit account as a sparse link, breaking the `19xx` / `isBankAccount` filter.
4. **No company-currency validation**: The trusted standard's "Do Not Use This Standard If" section mentions company-currency invoices, but the standard flow did not include an explicit validation step. The agent assumed EUR without checking.

## 5. Sandbox Verification

**Currency id 1 = NOK** confirmed via `GET /currency/1?fields=*` → `code: "NOK"`.

**Real EUR invoice structure** (sandbox invoice `2147608960`):
- `currency.id=5, currency.code=EUR`
- `amountCurrency=1000` (EUR), `amount=10001.3` (NOK) — amounts differ because of FX conversion
- This is the diagnostic: `amount !== amountCurrency` proves foreign currency

**EUR FX payment voucher structure** (voucher `609029215`):
- row 1: Bank 1920 debit +10010 NOK (paidAmount)
- row 1: AR 1500 credit -10010 NOK / -1000 EUR
- row 2: AR 1500 debit +8.7 NOK / 0 EUR (FX adjustment)
- row 2: **Agio 8060 credit -8.7 NOK** (FX gain auto-booked)

**NOK mismatch payment voucher** (voucher `609030030`):
- row 1: Bank 1920 debit +**2565** NOK (NOT 25675.65)
- row 1: AR 1500 credit -2565 NOK
- **Zero FX posting** — Tripletex ignored the mismatched `paidAmount` entirely

**Key sandbox findings:**
- Tripletex ignores `paidAmount` on company-currency invoices; uses `paidAmountCurrency` to settle
- FX gain goes to account 8060 (Valutagevinst/agio)
- FX loss goes to account 8160 (Valutatap/disagio)
- No manual voucher write needed for either case

## 6. Playbook Changes

**Updated existing files (not new):**

| File | Changes |
|------|---------|
| `trusted-standards/register-foreign-currency-customer-invoice-payment.md` | Added: REQUIRED `invoiceDateFrom`/`invoiceDateTo` params, REQUIRED `currency(*)` expansion, REQUIRED `debitAccount(*)` expansion, explicit currency validation step, company-currency fallback section, detailed pitfalls section with production run examples, new sandbox proofs |
| `task-playbooks/register-foreign-currency-customer-invoice-payment.md` | Added: currency expansion requirements, company-currency validation step, `debitAccount(*)` requirement, company-currency fallback section, expanded pitfalls |
| `trusted-standards/common-endpoints.md` | Added to Invoice section: REQUIRED `fields=*,currency(*)` for FX reads, REQUIRED `fields=*,debitAccount(*)` for payment type reads, `amount===amountCurrency` quick company-currency detection rule, production `Northwave Ltd` trap documentation |

No new files created. No AGENTS.md changes needed (no new standards or playbooks).

## 7. Commit

```
d204184e tripletex playbook: guard FX payment with currency expansion and company-currency detection
```

## 8. Reusable Heuristics

1. **Always expand nested objects in `fields`**: `fields=*` returns nested objects as sparse links. Use `currency(*)`, `debitAccount(*)`, `account(*)`, `customer(*)` etc. to get actual field values.

2. **`amount === amountCurrency` → company-currency invoice**: For any invoice, if these two fields are equal, the invoice is in the company currency (NOK). A foreign-currency invoice always has `amount ≠ amountCurrency` because `amount` is in NOK and `amountCurrency` is in the invoice currency.

3. **`GET /invoice` always needs date bounds**: `invoiceDateFrom` and `invoiceDateTo` are required. Use `invoiceDateFrom=2000-01-01&invoiceDateTo=<run-date+1>` as safe wide bounds.

4. **Tripletex ignores `paidAmount` on NOK invoices**: When both `paidAmount` and `paidAmountCurrency` are sent on a company-currency invoice, Tripletex uses `paidAmountCurrency` for the settlement. The bank is debited by the outstanding amount, not by `paidAmount`. No FX posting is created.

5. **FX auto-booking**: The `:payment` endpoint automatically books FX gain/loss on EUR (or other foreign currency) invoices. Account 8060 for gain (agio), 8160 for loss (disagio). No manual `POST /ledger/voucher` needed.

6. **Payment type debit account filter**: Use `debitAccount.number >= 1900 && < 2000` as the primary selector. `debitAccount.isBankAccount === true` is a secondary validator. The `description` field ("Betalt til bank") is informational, not a reliable filter.

7. **When task says EUR but invoice is NOK**: Fall back to simple payment. The agent cannot manufacture FX entries on a company-currency invoice. Closing the invoice at the correct outstanding is the best achievable outcome.
