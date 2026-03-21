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
1. `GET /invoice?...&fields=*` to identify the exact unpaid foreign-currency invoice
2. Reuse a previously resolved same-run incoming `paymentTypeId` if one is already known for the same company and payment currency
3. Otherwise `GET /invoice/paymentType?fields=*` once to resolve a valid incoming company-currency bank payment type
4. `PUT /invoice/{id}/:payment` with both `paidAmount` and `paidAmountCurrency`
5. verify from payment write response
6. stop

## Canonical Call Count
- standalone exact-match foreign-currency payment task with no cached same-run payment type: `3` calls
- same task shape with a cached same-run incoming company-currency `paymentTypeId`: `2` calls
- do not treat cross-run or cross-account cached ids as reusable

## Payload Rules
- identify the invoice by prompt identifiers, not by guessing
- for foreign-currency payment tasks, `paidAmount` is the settlement amount in the payment type currency, not the original booked company-currency invoice amount
- for foreign-currency payment tasks, `paidAmountCurrency` is the live outstanding amount in the invoice currency
- when the prompt gives a settlement exchange rate, derive `paidAmount` from `prompt-invoice-currency-amount * settlement-rate`
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

## OpenAPI / Sandbox Status
- `/invoice`, `/invoice/{id}/:payment`, and `/invoice/paymentType` verified in `./openapi.json`
- persistent sandbox proof on 2026-03-21 created a disposable EUR invoice for `FX Reflection 532193 GmbH` / `999532193`, then located invoice `2147581286` with `currency.code=EUR`, `amountCurrencyOutstanding=19107`, and `amount=215823.12`
- the same proof used incoming bank payment type `32813748` (`currencyCode=NOK`, debit account `1920`) and `PUT /invoice/2147581286/:payment?paymentDate=2026-03-21&paymentTypeId=32813748&paidAmount=214823.12&paidAmountCurrency=19107`
- that payment write closed the invoice with `remainingOutstanding=0`
- the resulting payment voucher `608897955` auto-booked the FX loss on account `8160` with amount `1000`; no manual `/ledger/voucher` write was needed
