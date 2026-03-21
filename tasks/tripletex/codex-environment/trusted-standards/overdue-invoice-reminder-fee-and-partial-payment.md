# Book Reminder Fee, Invoice It, And Register Partial Payment On Overdue Invoice

## Trust Level
- Trusted standard
- Use directly for exact matches
- Skip `./openapi.json` re-checking for exact matches

## Exact Match
- exactly one existing overdue outgoing customer invoice is implied by the prompt
- prompt requires an exact manual reminder fee booking of `65` to ledger accounts `1500` and `3400`
- prompt also requires a separate outgoing fee invoice for the same customer and wants it sent
- prompt also requires a partial payment of exactly `5000` on the overdue invoice
- prompt does not give the overdue invoice id directly

## Do Not Use This Standard If
- several overdue invoices remain after one decisive invoice read
- the prompt explicitly says to use Tripletex reminder/remittance/debt-collection functionality instead of a manual fee booking
- the prompt requires a different fee amount, different ledger accounts, or a different payment amount
- the located overdue invoice has outstanding amount below `5000`
- the prompt requires a specific send-channel override for the fee invoice

## Standard Flow
1. `GET /invoice?invoiceDateFrom=<wide-from>&invoiceDateTo=<wide-to>&count=1000&sorting=-invoiceDate&fields=*,customer(*)`
2. `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
3. `GET /ledger/account?number=1500,3400&fields=*`
4. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<fee-invoice-date>&fields=*`
5. `POST /ledger/voucher`
6. `POST /invoice`
7. `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=5000`
8. stop

## Payload Rules
- on the locate read, treat the winning invoice as:
  - `invoiceDueDate < run-date`
  - positive `amountCurrencyOutstanding` or `amountOutstanding`
  - the only overdue row left after local filtering
- reuse the located `customer.id` for both the manual voucher and the fee invoice
- on `GET /invoice/paymentType`, prefer an incoming bank-style payment type whose debit account is `19xx`, `isBankAccount=true`, or `isInvoiceAccount=true`
- do not reject a usable payment type just because `name=null` or `creditAccount=null`
- on `GET /ledger/account?number=1500,3400&fields=*`, choose by exact numeric `account.number`, not by account name
- do not reject prompt-required account `3400` only because the returned row is marked `isInactive=true`; the id-based voucher write is the decisive test
- on `POST /ledger/voucher`, send:
  - `voucherType: null`
  - one positive posting on account `1500`
  - `customer: { "id": ... }` on that `1500` posting
  - one negative posting on account `3400`
  - `currency: { "id": 1 }`
  - `amount`, `amountCurrency`, `amountGross`, and `amountGrossCurrency` all set to `65` / `-65`
- on the fee-invoice `POST /invoice`, create one direct order line for `65`
- because the fee is exact no-VAT, still resolve and send the filtered outgoing `0%` VAT row on the line; do not rely on omission
- do not use `/invoice/{id}/:createReminder` for this exact task shape:
  - the fee amount there is account-configured, not prompt-controlled
  - sandbox on `2026-03-21` required an explicit send type
  - sandbox rejected `type=REMINDER`
  - sandbox accepted `type=SOFT_REMINDER&dispatchTypes=EMAIL` but charged `38`, not the prompt-required `65`
- on the partial-payment write, use the prompt-fixed `paidAmount=5000`, not the full outstanding amount
- because the task already proves an existing charged outgoing invoice, do not add a proactive company-bank-account hedge before the fee-invoice write

## Reuse From Write Response
- from the locate read:
  - overdue invoice id
  - overdue invoice number
  - overdue invoice outstanding amount before payment
  - customer id
- from `POST /ledger/voucher`:
  - voucher id and number
  - returned postings proving `1500` / `3400` and `65` / `-65`
- from `POST /invoice`:
  - fee invoice id
  - fee invoice number
  - `amountCurrency=65`
- from `PUT /invoice/{id}/:payment`:
  - remaining outstanding amount after the partial payment

## Verification
- default verification is zero extra calls after the payment write
- trust the voucher write response when it already proves:
  - voucher id and number
  - one `1500` posting with `customer.id`
  - one `3400` posting
  - `65` / `-65`
- trust the fee-invoice write response when it already proves `amountCurrency=65` and a new fee invoice number
- trust the payment write response when it reduces outstanding by exactly `5000` from the locate-read amount

## Known Recovery Branches
- if the first invoice read returns zero overdue invoices or more than one overdue invoice, stop treating the task as an exact-match standard
- if the same run already holds a proven incoming `paymentTypeId` for the same company and currency, reuse it instead of reading `/invoice/paymentType` again
- if the same run already holds a proven outgoing `0%` `vatType.id` for the exact fee-invoice date, reuse it instead of reading `/ledger/vatType` again
- if the fee-invoice write fails only on the missing-company-bank-account validation, use the normal repair branch:
  - `GET /ledger/account?isBankAccount=true&fields=*`
  - `PUT /ledger/account/{id}` on the existing invoice account with minimal payload `{ "bankAccountNumber": "12345678903" }`
  - retry the same fee-invoice write once
- if that repair branch was already forced, do not restart from the voucher write or payment-type read

## OpenAPI / Sandbox Status
- `/invoice`, `/invoice/{id}/:payment`, `/invoice/paymentType`, `/ledger/account`, `/ledger/vatType`, and `/ledger/voucher` verified in `./openapi.json`
- persistent sandbox proof on `2026-03-21` first disproved the tempting reminder shortcut:
  - `PUT /invoice/{id}/:createReminder` without a send type failed `422 Minst én sendetype må oppgis.`
  - `PUT /invoice/{id}/:createReminder?type=REMINDER...` failed `422 type: Ugyldig verdi.`
  - `PUT /invoice/{id}/:createReminder?type=SOFT_REMINDER&dispatchTypes=EMAIL&includeCharge=true` succeeded but created reminder charge `38`, not `65`
  - that reminder branch therefore is not a correct exact-match replacement for prompt-controlled `65` reminder-fee tasks
- persistent sandbox proof on `2026-03-21` then confirmed the manual exact-fee branch on disposable fixture customer `995205756` / invoice `180`:
  - one decisive overdue-invoice locate read found the fixture invoice with `amountCurrencyOutstanding=10000` and `invoiceDueDate=2026-03-01`
  - `GET /invoice/paymentType` returned usable incoming bank payment type `32813748`
  - `GET /ledger/account?number=1500,3400&fields=*` returned both required account rows; account `3400` came back `isInactive=true` with an unrelated display name, and the later id-based voucher write still succeeded
  - `POST /ledger/voucher` succeeded with voucher `608897119` and returned the exact `1500` + customer debit posting for `65` plus the exact `3400` credit posting for `-65`
  - `POST /invoice` created fee invoice `181` with `amountCurrency=65`
  - `PUT /invoice/2147580713/:payment?paymentDate=2026-03-21&paymentTypeId=32813748&paidAmount=5000` reduced the overdue invoice outstanding from `10000` to `5000`
- for the exact standalone task shape with no same-run cached ids, that downstream action path remains `7` Tripletex calls; no lower-call fully correct replacement was proven
