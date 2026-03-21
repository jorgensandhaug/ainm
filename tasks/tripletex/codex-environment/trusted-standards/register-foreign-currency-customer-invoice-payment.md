# Register Foreign Currency Customer Invoice Payment

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## CRITICAL: Read This File First
You MUST `cat` or read this entire file before writing any script. Do NOT write from memory. Every production failure on this task shape came from skipping this file. The API has silent-ignore traps and missing-expansion traps that you will not anticipate from general knowledge.

## Exact Match
- register full payment on one existing outgoing customer invoice
- prompt explicitly describes a non-company-currency invoice payment
- prompt gives customer identifier plus exact invoice-currency amount
- prompt also gives either the settlement exchange rate or the company-currency paid amount
- prompt explicitly wants the realized FX gain or loss booked on payment
- one decisive `GET /invoice` can isolate the exact unpaid foreign-currency invoice

## Do Not Use This Standard If
- the decisive invoice read returns only company-currency invoices
- the prompt amount could just be an ex-VAT locator on a company-currency invoice
- the task includes creating the order or invoice first
- the task is a supplier-invoice payment
- the prompt is too ambiguous to isolate one foreign-currency invoice safely

## Standard Flow (3 calls, 0 errors)

### Call 1: Locate the invoice
```
GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=<run-date-plus-one-day>&fields=*,currency(*)
```

MANDATORY rules for this call:
- `invoiceDateFrom` and `invoiceDateTo` are REQUIRED — omitting them returns `422`
- `fields=*,currency(*)` is REQUIRED — plain `fields=*` returns `currency` as `{ id, url }` with no `code` field, making currency detection impossible
- DO NOT use `customerOrganizationNumber` as a query param — it is SILENTLY IGNORED (sandbox-proven: `customerOrganizationNumber=000000000` returns identical results to no filter)
- DO NOT use `currency=EUR` as a query param — it is SILENTLY IGNORED (sandbox-proven: `currency=DOESNOTEXIST` returns identical results to no filter)
- The ONLY valid customer filter is `customerId` (internal ID), but in fresh production accounts with few invoices, fetching all and filtering locally is simpler and avoids a preliminary `GET /customer`

After the response, filter locally:
1. `currency.code !== "NOK"` (must be foreign currency)
2. `amountCurrencyOutstanding > 0` (must be unpaid)
3. Match prompt amount: the prompt typically gives an ex-VAT amount, so match `amountExcludingVatCurrency`; the full outstanding incl. 25% VAT is `promptAmount * 1.25`

### MANDATORY: Validate the invoice is actually foreign currency
Before proceeding, you MUST check:
- `currency.code` is NOT `"NOK"`
- `amount !== amountCurrency` (if they are equal, the invoice is in company currency regardless of what `currency.code` says)

If the invoice is in company currency (NOK), go to the Company-Currency Fallback section below. Do NOT apply FX logic to a NOK invoice.

A real EUR invoice example: `amount=160033.50` (NOK) vs `amountCurrency=14575` (EUR) — these are always different.
A NOK invoice example: `amount=14575` vs `amountCurrency=14575` — these are always equal.

### Call 2: Resolve payment type
```
GET /invoice/paymentType?fields=*,debitAccount(*)
```

MANDATORY rules for this call:
- `debitAccount(*)` expansion is REQUIRED — without it, `debitAccount` returns as `{ id, url }` with no `number` or `isBankAccount` fields
- DO NOT filter by `paymentType.isIncoming` — this field DOES NOT EXIST on the payment type object
- DO NOT filter by `paymentType.isBankAccount` — this field DOES NOT EXIST on the payment type object
- These fields exist ONLY on the expanded `debitAccount` subobject

Selection logic (in order):
1. `debitAccount.number >= 1900 && debitAccount.number < 2000 && debitAccount.isBankAccount === true`
2. Fallback: `debitAccount.number >= 1900 && debitAccount.number < 2000` (without `isBankAccount` check)
3. Last resort: `description.toLowerCase().includes("bank")` — "Betalt til bank" is the standard Norwegian bank payment type

Do NOT choose a payment type in the same foreign currency — use a company-currency (NOK) bank payment type so Tripletex can book the FX difference.

### Call 3: Register the payment
```
PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<NOK>&paidAmountCurrency=<foreign-currency-outstanding>
```

Parameter definitions:
- `paidAmountCurrency` = `amountCurrencyOutstanding` from the invoice (the full foreign-currency amount)
- `paidAmount` = `amountCurrencyOutstanding * settlementRate` (the NOK amount at the new exchange rate)

Verify from the response: `amountCurrencyOutstanding === 0` and `amountOutstanding === 0`. Stop.

The `:payment` endpoint AUTO-BOOKS the FX gain/loss:
- Account 8060 (Valutagevinst/agio) for gain
- Account 8160 (Valutatap/disagio) for loss

NEVER create a manual `POST /ledger/voucher` for the FX difference. The payment endpoint handles it automatically.

## Company-Currency Fallback

If the located invoice is in company currency (NOK) despite the prompt saying EUR/foreign:
- The invoice was set up without the foreign currency — you cannot manufacture FX entries
- Register a simple payment: `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<amountOutstanding>`
- Omit `paidAmountCurrency` or set it equal to `paidAmount`
- Do NOT try to manually book agio/disagio via `POST /ledger/voucher` — it will corrupt the accounting state and score 0%
- Do NOT send FX-adjusted `paidAmount` on a NOK invoice — Tripletex ignores the mismatch and debits bank by only the actual outstanding; no FX posting is created regardless of parameters sent

Sandbox proof (2026-03-21): paying NOK invoice `2147609133` with mismatched `paidAmount=25675.65` + `paidAmountCurrency=2565` still closed the invoice, but bank was debited only 2565 NOK with zero FX posting.

## Canonical Call Count
- standalone exact-match foreign-currency payment task with no cached same-run payment type: `3` calls
- same task shape with a cached same-run incoming company-currency `paymentTypeId`: `2` calls
- do not treat cross-run or cross-account cached ids as reusable

## Known Recovery Branches
- if the same run already resolved one valid incoming company-currency `paymentTypeId`, reuse it instead of reading `/invoice/paymentType` again
- if the decisive invoice read shows that the prompt amount only matches `amountExcludingVatCurrency` or `amountExcludingVat` on a company-currency invoice, stop treating the prompt as an exact foreign-currency-payment match
- if the decisive invoice read returns an invoice where `amount === amountCurrency` and `currency.code === "NOK"`, this is a company-currency invoice; fall back to simple payment with no FX logic, even if the prompt explicitly says EUR or agio/disagio

## Production Failure History

### Run 1 (0% score): Timed out reading docs, never executed API calls
### Run 2 (50% score — 2/4 checks failed):
- Used `customerOrganizationNumber=959783748` and `currency=EUR` as query params — both silently ignored
- Used `fields=*` without `currency(*)` — could not verify invoice was actually EUR
- Used `fields=*` without `debitAccount(*)` on payment type — filtered by nonexistent `p.isIncoming` and `p.isBankAccount`
- Ended up paying a NOK invoice as if it were EUR — checks 1-2 passed (payment registered) but checks 3-4 failed (no agio booked)
### Run 3 (0% score):
- Correctly used `currency(*)` and detected invoice was NOK
- But then manually created a `POST /ledger/voucher` to book agio — this corrupted the accounting state
- Should have used the Company-Currency Fallback (simple payment, no FX logic)

## OpenAPI / Sandbox Status
- `/invoice`, `/invoice/{id}/:payment`, and `/invoice/paymentType` verified in `./openapi.json`
- persistent sandbox proof on 2026-03-21 created a disposable EUR invoice for `FX Reflection 532193 GmbH` / `999532193`, then located invoice `2147581286` with `currency.code=EUR`, `amountCurrencyOutstanding=19107`, and `amount=215823.12`
- the same proof used incoming bank payment type `32813748` (`currencyCode=NOK`, debit account `1920`) and `PUT /invoice/2147581286/:payment?paymentDate=2026-03-21&paymentTypeId=32813748&paidAmount=214823.12&paidAmountCurrency=19107`
- that payment write closed the invoice with `remainingOutstanding=0`
- the resulting payment voucher `608897955` auto-booked the FX loss on account `8160` with amount `1000`; no manual `/ledger/voucher` write was needed
- 2026-03-21 sandbox re-proof with EUR invoice `2147608960` (`amountCurrency=1000 EUR`, `amount=10001.3 NOK`): payment at settlement rate 10.01 auto-booked FX gain on account 8060 with amount 8.7 NOK
- 2026-03-21 sandbox NOK-mismatch proof with NOK invoice `2147609133` (`amount=amountCurrency=2565`): sending `paidAmount=25675.65` + `paidAmountCurrency=2565` still closed the invoice; zero FX posting was created
