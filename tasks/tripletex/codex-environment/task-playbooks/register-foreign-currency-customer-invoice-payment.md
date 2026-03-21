# Register Foreign Currency Customer Invoice Payment

## Scope

Use for tasks like:
- register full payment on an existing outgoing customer invoice in a non-company currency
- prompt gives the customer plus the exact invoice-currency amount
- prompt also gives the settlement exchange rate or the exact company-currency paid amount
- prompt explicitly wants the realized FX loss booked on payment

Do not use for:
- creating the invoice itself
- ordinary company-currency invoice payments
- supplier-invoice payments
- prompts where the decisive invoice read returns only company-currency invoices or only an ex-VAT coincidence

## Key Findings

- The payment write is still `PUT /invoice/{id}/:payment`
- For this foreign-currency branch, `paidAmount` must be in the payment type currency, while `paidAmountCurrency` must be the live invoice-currency outstanding amount
- A manual `POST /ledger/voucher` is not part of the optimal path for realized FX loss on an existing outgoing invoice
- One decisive invoice read can still locate the exact invoice without a separate `GET /customer` when the prompt gives enough identifiers
- If the prompt gives the original invoicing exchange rate, invoice `amount` / `amountOutstanding` becomes a useful tie-break after matching on customer + foreign currency + exact `amountCurrencyOutstanding`
- If the decisive invoice read exposes only company-currency invoices, this is not the exact foreign-currency payment shape; do not keep retrying the same invoice search with looser assumptions

Verified in persistent sandbox on 2026-03-21:
- a disposable EUR invoice for `FX Reflection 532193 GmbH` / `999532193` was readable as invoice `2147581286` with `currency.code=EUR`, `amountCurrencyOutstanding=19107`, and company-currency `amount=215823.12`
- `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)` returned usable incoming bank payment type `32813748` with `currencyCode=NOK` and debit account `1920`
- `PUT /invoice/2147581286/:payment?paymentDate=2026-03-21&paymentTypeId=32813748&paidAmount=214823.12&paidAmountCurrency=19107` reduced the remaining outstanding amount to `0`
- the payment voucher `608897955` auto-posted the FX loss on account `8160` with amount `1000`
- no manual `/ledger/voucher` write was needed to book that realized FX loss

## Minimal Flow

1. Confirm these operations in `./openapi.json`
   - `GET /invoice`
   - `GET /invoice/paymentType`
   - `PUT /invoice/{id}/:payment`
2. Locate the exact foreign-currency invoice with one decisive read
   - usually `GET /invoice?invoiceDateFrom=<wide-from>&invoiceDateTo=<wide-to>&count=1000&sorting=-invoiceDate&fields=*,customer(*),currency(*),orderLines(*),orders(*,orderLines(*))`
3. Filter locally to one exact invoice
   - exact customer organization number if provided
   - exact foreign invoice currency, for example `currency.code=EUR`
   - positive `amountCurrencyOutstanding`
   - exact prompt invoice-currency amount against `amountCurrencyOutstanding` and/or `amountCurrency`
   - if needed, prompt original-rate tie-break against company-currency `amount` / `amountOutstanding`
4. Reuse a previously resolved same-run incoming company-currency payment type if available
5. Otherwise resolve one usable company-currency bank payment type
   - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
   - prefer a bank-style incoming payment type in the company/payment currency, typically debit account `19xx`
   - if available, prefer `isBankAccount=true` or `isInvoiceAccount=true` on that debit account
   - do not choose a payment type in the same foreign currency when the prompt explicitly requires realized FX-loss booking on settlement
6. Register the payment
   - `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<company-currency-paid-amount>&paidAmountCurrency=<invoice-currency-outstanding>`
7. Verify from the write response
   - prefer `amountCurrencyOutstanding`
   - otherwise `amountOutstanding`
   - stop if it is `0`

## Canonical Call Count

- standalone exact-match foreign-currency payment task with no cached same-run `paymentTypeId`: `3` calls
- if the same run already holds a proven valid incoming company-currency `paymentTypeId`: `2` calls

## Payment Rules

- Do not reuse the ordinary customer-invoice-payment rule `paidAmount=<live outstanding>` for this shape
- `paidAmount` is the settlement amount in the payment-type currency
- `paidAmountCurrency` is the live outstanding amount in the invoice currency
- When the prompt gives the settlement exchange rate, derive `paidAmount` from that rate and the prompt invoice-currency amount
- When the prompt instead gives the paid company-currency amount directly, use that directly
- Do not add a manual `POST /ledger/voucher` for the realized FX loss; the payment write already books it

## Payment Type Rules

- Do not guess the payment type ID
- Read from `GET /invoice/paymentType` unless the same run already resolved a valid reusable incoming company-currency payment type
- Prefer an ordinary company-currency bank payment type over a foreign-currency payment type when the prompt explicitly requires realized FX-loss booking
- Prefer a `19xx` debit account with `isBankAccount=true` or `isInvoiceAccount=true` when present
- Do not require `paymentType.name`; usable incoming bank payment types can have `name=null`
- Do not require a non-null `creditAccount`

## Pitfalls

- Do not reinterpret a prompt foreign-currency amount as proof of a foreign-currency invoice if the decisive invoice read returns only company-currency invoices
- Do not treat a company-currency invoice whose `amountExcludingVatCurrency` coincidentally matches the prompt amount as this exact task shape
- Do not spend repeated `GET /invoice` calls after one decisive locate read already disproves the foreign-currency assumption
- Do not choose a EUR payment type and then expect Tripletex to book a NOK FX loss automatically; that defeats the prompt’s realized-FX branch
- Do not add a separate manual voucher write once the correct `:payment` call succeeds
