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

1. Locate the exact foreign-currency invoice with one decisive read
   - `GET /invoice?invoiceDateFrom=2000-01-01&invoiceDateTo=<run-date-plus-one-day>&fields=*,currency(*)`
   - `invoiceDateFrom` and `invoiceDateTo` are REQUIRED; omitting them returns `422`
   - `currency(*)` expansion is REQUIRED; plain `fields=*` returns currency as a sparse link stub without `code`
   - **`customerOrganizationNumber`, `customerOrgNumber`, and `currency` are NOT valid query params** for GET /invoice — they are silently ignored; the only valid customer filter is `customerId` (internal ID); always filter locally
   - in a fresh production account there are typically very few invoices, so fetching all and filtering locally is cheap
2. **Validate the invoice is actually in a foreign currency**
   - check `currency.code` — must NOT be `NOK` (company currency)
   - quick-check: if `amount === amountCurrency`, the invoice is in the company currency → fall back to simple payment
   - a real EUR invoice has `amount ≠ amountCurrency` (e.g., `amount=23178.37` NOK vs `amountCurrency=2052` EUR)
   - the prompt ex-VAT amount matching `amountExcludingVatCurrency` on a NOK invoice is NOT proof of a foreign-currency invoice
3. Filter locally to one exact invoice
   - exact foreign invoice currency, for example `currency.code=EUR` (filtered locally, NOT as a query param)
   - positive `amountCurrencyOutstanding`
   - exact prompt invoice-currency amount against `amountCurrencyOutstanding` and/or `amountCurrency`
   - for the prompt amount: match against `amountCurrencyOutstanding` (total incl. VAT), NOT `amountExcludingVatCurrency` (ex-VAT); the prompt amount "11660 EUR" refers to the ex-VAT amount, so look for `amountCurrencyOutstanding` = `11660 * 1.25 = 14575` if 25% VAT applies; also check `amountExcludingVatCurrency === 11660` to confirm
   - if needed, prompt original-rate tie-break against company-currency `amount` / `amountOutstanding`
4. Reuse a previously resolved same-run incoming company-currency payment type if available
5. Otherwise resolve one usable company-currency bank payment type
   - `GET /invoice/paymentType?fields=*,debitAccount(*)`
   - `debitAccount(*)` expansion is REQUIRED; without it, debit account comes back as a link stub without `number` or `isBankAccount`
   - **`isIncoming` and `isBankAccount` are NOT top-level fields on the payment type object** — they exist only on the expanded `debitAccount` subobject; do not filter by `paymentType.isIncoming` or `paymentType.isBankAccount`
   - select: `debitAccount.number >= 1900 && < 2000` with `debitAccount.isBankAccount === true`
   - if `isBankAccount` is not present, match on `debitAccount.number` alone
   - description-based fallback: "Betalt til bank" is the standard Norwegian bank payment type; match `description.toLowerCase().includes("bank")` as a last resort
   - do not choose a payment type in the same foreign currency when the prompt explicitly requires realized FX-loss booking on settlement
6. Register the payment
   - `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=<company-currency-paid-amount>&paidAmountCurrency=<invoice-currency-outstanding>`
   - `paidAmountCurrency` = full `amountCurrencyOutstanding` (foreign currency)
   - `paidAmount` = `amountCurrencyOutstanding * settlementRate` (company currency at new rate)
7. Verify from the write response
   - prefer `amountCurrencyOutstanding`
   - otherwise `amountOutstanding`
   - stop if it is `0`

## Company-Currency Fallback

If the invoice is in NOK (company currency), do NOT apply FX logic:
- register a simple payment: `paidAmount = amountOutstanding`
- omit `paidAmountCurrency` or set it equal to `paidAmount`
- Tripletex ignores mismatched `paidAmount` on NOK invoices and uses `paidAmountCurrency` for the settlement amount, but the bank debit will be the company-currency outstanding, NOT the `paidAmount` value
- no disagio or agio posting is created on a NOK invoice regardless of parameters sent

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

- `GET /invoice` REQUIRES `invoiceDateFrom` and `invoiceDateTo`; omitting them returns `422`; use wide bounds like `invoiceDateFrom=2000-01-01&invoiceDateTo=<run-date+1>`
- `fields=*` without `currency(*)` returns currency as a sparse link without `code`; ALWAYS use `fields=*,currency(*)`
- `GET /invoice/paymentType?fields=*` without `debitAccount(*)` returns debit account as a sparse link; ALWAYS use `fields=*,debitAccount(*)`
- **`customerOrganizationNumber`, `customerOrgNumber`, and `currency` are silently ignored** by GET /invoice; sandbox proof 2026-03-21 confirmed `currency=DOESNOTEXIST` returns the same results as no filter; always filter locally after `currency(*)` expansion
- **`isIncoming` and `isBankAccount` do NOT exist as top-level fields** on `/invoice/paymentType` response; they only exist on expanded `debitAccount` subobject; filtering by `paymentType.isIncoming` always fails
- The prompt amount is typically ex-VAT; "facture de 11660 EUR" means `amountExcludingVatCurrency=11660` and `amountCurrencyOutstanding=14575` (25% MVA); match against `amountCurrencyOutstanding` for the payment, not the ex-VAT amount
- Do not reinterpret a prompt foreign-currency amount as proof of a foreign-currency invoice if the decisive invoice read returns only company-currency invoices
- Do not treat a company-currency invoice whose `amountExcludingVatCurrency` coincidentally matches the prompt amount as this exact task shape
- Quick company-currency check: if `amount === amountCurrency`, the invoice is in company currency (NOK); a real EUR invoice has `amount != amountCurrency`
- Do not spend repeated `GET /invoice` calls after one decisive locate read already disproves the foreign-currency assumption
- Do not choose a EUR payment type and then expect Tripletex to book a NOK FX loss automatically; that defeats the prompt’s realized-FX branch
- Do not add a separate manual voucher write once the correct `:payment` call succeeds
- The `:payment` endpoint auto-books FX gain (account 8060) or loss (account 8160); no manual voucher needed
- For company-currency invoices, Tripletex ignores a mismatched `paidAmount` and uses `paidAmountCurrency` for the settlement; the bank debit matches the outstanding, not the `paidAmount` parameter
