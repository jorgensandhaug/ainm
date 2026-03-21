# Register Foreign Currency Customer Invoice Payment

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- register full payment on one existing outgoing customer invoice
- prompt explicitly describes a non-company-currency invoice payment
- prompt gives customer identifier plus exact invoice-currency amount
- prompt also gives either the settlement exchange rate or the company-currency paid amount
- prompt explicitly wants the realized FX loss booked on payment
- one decisive `GET /invoice` can isolate the exact unpaid foreign-currency invoice

## Do Not Use This Standard If
- the decisive invoice read returns only company-currency invoices
- the prompt amount could just be an ex-VAT locator on a company-currency invoice
- the task includes creating the order or invoice first
- the task is a supplier-invoice payment
- the prompt is too ambiguous to isolate one foreign-currency invoice safely

## Standard Flow
1. `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=<run-date-plus-one-day>&fields=*,currency(*)` to get all invoices, then filter locally
   - `invoiceDateFrom` and `invoiceDateTo` are REQUIRED; omitting them returns `422`
   - `fields=*,currency(*)` is REQUIRED; plain `fields=*` returns `currency` as a sparse link stub without `code`
   - **`customerOrganizationNumber`, `customerOrgNumber`, and `currency` are NOT valid query params** for GET /invoice — they are silently ignored and return all invoices regardless; the only valid customer filter is `customerId` (internal ID)
   - filter locally: `currency.code !== "NOK"` AND `amountCurrencyOutstanding > 0`; if the prompt gives an ex-VAT amount, match against `amountExcludingVatCurrency`; the full invoice total incl. 25% VAT is `promptAmount * 1.25`
   - in a fresh production account there are typically very few invoices, so fetching all and filtering locally is cheap and avoids a preliminary GET /customer call
2. Validate that the located invoice is actually in a foreign currency:
   - check `currency.code` — it must NOT be `NOK` (company currency)
   - quick-check: if `amount === amountCurrency`, the invoice is in the company currency; do NOT apply FX logic
   - if the invoice is in the company currency, fall back to the simple payment standard (`paidAmount = amountOutstanding`); the task cannot produce disagio on a NOK invoice regardless of what the prompt says
3. Reuse a previously resolved same-run incoming `paymentTypeId` if one is already known for the same company and payment currency
4. Otherwise `GET /invoice/paymentType?fields=*,debitAccount(*)` once to resolve a valid incoming company-currency bank payment type
   - `debitAccount(*)` expansion is REQUIRED; plain `fields=*` returns the debit account as a sparse link without `number` or `isBankAccount`
   - **`isIncoming` and `isBankAccount` are NOT top-level fields on the payment type object** — they exist only on the expanded `debitAccount` subobject; do not filter by `paymentType.isIncoming` or `paymentType.isBankAccount`
   - select a payment type whose `debitAccount.number` is in the `19xx` range and `debitAccount.isBankAccount===true`
   - if `isBankAccount` is not present, match on `debitAccount.number >= 1900 && < 2000` alone
   - description-based fallback: "Betalt til bank" is the standard Norwegian bank payment type name; match `description.toLowerCase().includes("bank")` as a last resort
5. `PUT /invoice/{id}/:payment` with both `paidAmount` and `paidAmountCurrency`
6. verify from payment write response
7. stop

## Canonical Call Count
- standalone exact-match foreign-currency payment task with no cached same-run payment type: `3` calls
- same task shape with a cached same-run incoming company-currency `paymentTypeId`: `2` calls
- do not treat cross-run or cross-account cached ids as reusable

## Payload Rules
- identify the invoice by prompt identifiers, not by guessing
- for foreign-currency payment tasks, `paidAmount` is the settlement amount in the payment type currency, not the original booked company-currency invoice amount
- for foreign-currency payment tasks, `paidAmountCurrency` is the live outstanding amount in the invoice currency
- when the prompt gives a settlement exchange rate, derive `paidAmount` from `amountCurrencyOutstanding * settlement-rate` (NOT `prompt-ex-VAT-amount * rate`; use the full outstanding including VAT)
- when the prompt instead gives the company-currency paid amount directly, use that as `paidAmount`
- choose an incoming bank payment type in the company/payment currency, typically debit account `19xx` with `isBankAccount=true` or `isInvoiceAccount=true`
- do not choose a payment type in the same foreign currency when the prompt explicitly requires realized FX loss booking on settlement
- do not add a manual `POST /ledger/voucher`; the payment write itself books the realized FX loss on the payment voucher
- if more than one foreign-currency invoice candidate remains after matching customer + invoice currency + exact `amountCurrencyOutstanding`, use the prompt's original invoicing exchange rate as a tie-break against invoice `amount` / `amountOutstanding`
- if that prompt-rate tie-break still leaves ambiguity, this is not an exact-match trusted-standard task

## Reuse From Write Response
- invoice id from locate step
- invoice-currency outstanding amount from locate step
- post-payment remaining amount from write response

## Verification
- default verification is zero extra calls after the payment write if the response proves `amountCurrencyOutstanding=0`, `amountOutstanding=0`, or equivalent final state

## Known Recovery Branches
- if the same run already resolved one valid incoming company-currency `paymentTypeId`, reuse it instead of reading `/invoice/paymentType` again
- if the decisive invoice read shows that the prompt amount only matches `amountExcludingVatCurrency` or `amountExcludingVat` on a company-currency invoice, stop treating the prompt as an exact foreign-currency-payment match
- if the decisive invoice read returns an invoice where `amount === amountCurrency` and `currency.code === "NOK"`, this is a company-currency invoice; fall back to simple payment `paidAmount = amountOutstanding` with no FX logic, even if the prompt explicitly says EUR or disagio

## Company-Currency Fallback
- when the located invoice is in company currency (NOK) but the prompt describes a foreign-currency payment, the invoice was set up without the foreign currency; the agent cannot manufacture FX entries that Tripletex does not support for a company-currency invoice
- in that case, register a simple payment: `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<amountOutstanding>` — omit `paidAmountCurrency` or set it equal to `paidAmount`
- sandbox 2026-03-21 proof: paying a NOK invoice with mismatched `paidAmount=25675.65` + `paidAmountCurrency=2565` still closed the invoice correctly (`amountOutstanding=0`); Tripletex ignored the `paidAmount` mismatch and debited the bank by only 2565 NOK; no FX posting was created
- this means sending wrong `paidAmount` is harmless on NOK invoices, but it is NOT a correct FX booking path; the bank debit and customer receivable are both 2565 NOK with zero disagio

## Pitfalls
- `GET /invoice` REQUIRES `invoiceDateFrom` and `invoiceDateTo`; omitting them returns `422 invoiceDateTo: Kan ikke være null.` — the 2026-03-21 production run wasted 1 call on this exact `422`
- `fields=*` without `currency(*)` returns `currency` as `{ id, url }` with no `code`; the 2026-03-21 production run did not expand currency and could not validate the invoice was foreign-currency
- `GET /invoice/paymentType?fields=*` without `debitAccount(*)` returns debit account as a link stub with no `number` or `isBankAccount`; the 2026-03-21 production run had to use fragile fallback logic to select the payment type
- **`customerOrganizationNumber`, `customerOrgNumber`, and `currency` are silently ignored** by GET /invoice — sandbox proof on 2026-03-21 confirmed `currency=DOESNOTEXIST` and `customerOrganizationNumber=000000000` both return fullResultSize identical to unfiltered; the only valid customer filter is `customerId` (internal ID); always filter locally by `currency.code` after expansion
- **`isIncoming` and `isBankAccount` do NOT exist as top-level fields** on the `/invoice/paymentType` response object; they only exist on the expanded `debitAccount` subobject when `debitAccount(*)` is used; filtering by `paymentType.isIncoming` always fails
- for a true EUR invoice, `amount != amountCurrency` (e.g., `amount=23178.37 NOK` vs `amountCurrency=2052 EUR`); when `amount === amountCurrency`, the invoice is in the company currency and no FX applies
- the `:payment` endpoint auto-books FX gain/loss: account 8160 (Valutatap/disagio) for loss, account 8060 (Valutagevinst/agio) for gain; the 2026-03-21 sandbox proof on EUR invoice `2147608960` showed a +8.7 NOK gain auto-posted on account 8060
- `paidAmount` is the NOK amount debited to the bank; `paidAmountCurrency` closes the foreign-currency customer receivable; the FX difference between the original NOK booking and the settlement NOK amount is auto-booked
- the prompt amount is typically ex-VAT; when the prompt says "facture de 11660 EUR", the invoice total with 25% MVA is `11660 * 1.25 = 14575 EUR`; match against `amountCurrencyOutstanding` (total incl. VAT), not `amountExcludingVatCurrency`

## OpenAPI / Sandbox Status
- `/invoice`, `/invoice/{id}/:payment`, and `/invoice/paymentType` verified in `./openapi.json`
- persistent sandbox proof on 2026-03-21 created a disposable EUR invoice for `FX Reflection 532193 GmbH` / `999532193`, then located invoice `2147581286` with `currency.code=EUR`, `amountCurrencyOutstanding=19107`, and `amount=215823.12`
- the same proof used incoming bank payment type `32813748` (`currencyCode=NOK`, debit account `1920`) and `PUT /invoice/2147581286/:payment?paymentDate=2026-03-21&paymentTypeId=32813748&paidAmount=214823.12&paidAmountCurrency=19107`
- that payment write closed the invoice with `remainingOutstanding=0`
- the resulting payment voucher `608897955` auto-booked the FX loss on account `8160` with amount `1000`; no manual `/ledger/voucher` write was needed
- 2026-03-21 sandbox re-proof with EUR invoice `2147608960` (`amountCurrency=1000 EUR`, `amount=10001.3 NOK`): payment at settlement rate 10.01 auto-booked FX gain on account 8060 with amount 8.7 NOK in voucher `609029215`; the voucher structure was: row 1 bank 1920 debit +10010, row 1 AR 1500 credit -10010/-1000 EUR, row 2 AR 1500 debit +8.7/0 EUR, row 2 agio 8060 credit -8.7
- 2026-03-21 sandbox NOK-mismatch proof with NOK invoice `2147609133` (`amount=amountCurrency=2565`): sending `paidAmount=25675.65` + `paidAmountCurrency=2565` still closed the invoice; the payment voucher `609030030` debited bank 1920 by only 2565 (not 25675.65) and credited AR 1500 by 2565; zero FX posting was created
