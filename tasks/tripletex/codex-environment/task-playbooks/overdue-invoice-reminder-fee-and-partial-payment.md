# Overdue Invoice Reminder Fee And Partial Payment

## Scope

Use for tasks like:
- find the one overdue outgoing customer invoice in the account
- book an exact manual reminder fee to specific ledger accounts
- create and send a separate fee invoice to that same customer
- register a fixed partial payment on the overdue invoice

Do not use for:
- tasks that explicitly say to use Tripletex reminder/debt-collection functionality
- tasks that only need a reminder document without a separate manual fee booking
- tasks with several overdue invoices that stay ambiguous after one decisive invoice read
- full-payment, payment-reversal, credit-note, or delete flows

## Key Findings

- The downstream exact-match path is `7` calls when no same-run ids are cached:
  1. locate the overdue invoice
  2. resolve incoming payment type
  3. resolve ledger accounts `1500` and `3400`
  4. resolve outgoing `0%` VAT
  5. post the manual voucher
  6. create/send the fee invoice
  7. register the fixed `5000` partial payment
- The prompt wording `purregebyr` is a trap if you jump straight to `/invoice/{id}/:createReminder`
- Persistent sandbox on `2026-03-21` showed:
  - `PUT /invoice/{id}/:createReminder` without send type failed `422 Minst én sendetype må oppgis.`
  - `PUT /invoice/{id}/:createReminder?type=REMINDER...` failed `422 type: Ugyldig verdi.`
  - `PUT /invoice/{id}/:createReminder?type=SOFT_REMINDER&dispatchTypes=EMAIL&includeCharge=true` succeeded but charged `38`, not the prompt-required exact fee amount
- Therefore `/invoice/{id}/:createReminder` is not the exact-fee solution path for this task family unless the prompt explicitly wants the company-configured reminder charge rather than an exact manual amount
- The exact-fee manual branch was re-proven in persistent sandbox on `2026-03-21` with disposable fixture customer `995205756` and overdue invoice `180`
- `GET /ledger/account?number=1500,3400&fields=*` returned the requested `3400` row even though its sandbox display name was unrelated to reminder fees and `isInactive=true`
- The later id-based voucher write still succeeded on that exact `3400` row, so do not second-guess explicit prompt account numbers by semantic account-name filtering
- The same `7`-call production branch was re-confirmed on `2026-03-21` for a German prompt using exact fee amount `50`, so the fee literal is not the branch selector; the prompt-controlled amount is
- The successful voucher payload needed:
  - `voucherType=null`
  - `account: { id }` refs, not `account.number`
  - `customer: { id }` on the `1500` posting
  - balanced prompt-fee and negative prompt-fee values across `amount`, `amountCurrency`, `amountGross`, and `amountGrossCurrency`
- The fee invoice itself is an ordinary direct-line no-VAT customer invoice:
  - same customer id as the overdue invoice
  - one prompt-fee line
  - filtered outgoing `0%` `vatType.id`
  - default `sendToCustomer=true`
- The payment write for this task family is not the ordinary full-payment rule from the standalone payment playbook
- Here the prompt fixes the partial-payment amount, so `PUT /invoice/{id}/:payment` must use `paidAmount=5000`, not the invoice's full outstanding balance
- The payment-type heuristic from the ordinary payment playbook still applies:
  - prefer a `19xx` debit account
  - accept `name=null`
  - accept `creditAccount=null`
- Production and sandbox payment-type ids differed (`27178699` vs `32813748`), so never hardcode or cargo-cult a prior id across environments
- Because the account already contains an overdue outgoing invoice, a proactive company-bank-account hedge before the fee-invoice write is not part of the winning path
- Persistent sandbox also accepted an unsent `POST /invoice` without `orderLines[].vatType` and created untaxed invoice `185` for `50`, but that write response left `orderLines[].vatType=null`; keep the explicit outgoing `0%` VAT read in the production playbook until a fresh-account production proof shows the omission path is safe

## Minimal Safe Flow

1. Confirm these exact endpoint shapes in `./openapi.json`
   - `GET /invoice`
   - `GET /invoice/paymentType`
   - `GET /ledger/account`
   - `GET /ledger/vatType`
   - `POST /ledger/voucher`
   - `POST /invoice`
   - `PUT /invoice/{id}/:payment`
2. Locate the overdue invoice in one decisive read
   - `GET /invoice?invoiceDateFrom=<wide-from>&invoiceDateTo=<wide-to>&count=1000&sorting=-invoiceDate&fields=*,customer(*)`
   - local filter:
     - `invoiceDueDate < run-date`
     - positive outstanding amount
     - exactly one surviving overdue row
3. Resolve one usable incoming payment type
   - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
4. Resolve the explicit ledger accounts
   - `GET /ledger/account?number=1500,3400&fields=*`
   - choose the exact numeric account rows
5. Resolve outgoing `0%` VAT for the fee invoice
   - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<fee-invoice-date>&fields=*`
6. Post the manual exact-fee voucher
   - debit `1500` with `customer.id`
   - credit `3400`
   - prompt fee amount / negative prompt fee amount
7. Create and send the separate fee invoice
   - one prompt-fee direct order line
   - resolved outgoing `0%` `vatType.id`
8. Register the fixed partial payment
   - `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=5000`
9. Verify from the write responses and stop

## Canonical Call Count

- exact standalone task with no cached same-run ids: `7` calls
- same task shape with cached same-run incoming `paymentTypeId`: `6` calls
- same task shape with cached same-run incoming `paymentTypeId` plus cached same-run outgoing `0%` `vatType.id` for the same date: `5` calls
- no public lower-call standalone shortcut was proven for the exact task shape

## Winning Payload Shapes

Voucher:

```json
{
  "date": "2026-03-21",
  "description": "Manual reminder fee 180",
  "voucherType": null,
  "postings": [
    {
      "row": 1,
      "date": "2026-03-21",
      "description": "Manual reminder fee 180",
      "account": { "id": 424190806 },
      "customer": { "id": 108334046 },
      "currency": { "id": 1 },
      "amount": 65,
      "amountCurrency": 65,
      "amountGross": 65,
      "amountGrossCurrency": 65
    },
    {
      "row": 2,
      "date": "2026-03-21",
      "description": "Manual reminder fee 180",
      "account": { "id": 424191002 },
      "currency": { "id": 1 },
      "amount": -65,
      "amountCurrency": -65,
      "amountGross": -65,
      "amountGrossCurrency": -65
    }
  ]
}
```

Fee invoice:

```json
{
  "invoiceDate": "2026-03-21",
  "invoiceDueDate": "2026-03-21",
  "customer": { "id": 108334046 },
  "orders": [
    {
      "customer": { "id": 108334046 },
      "orderDate": "2026-03-21",
      "deliveryDate": "2026-03-21",
      "orderLines": [
        {
          "description": "Purregebyr",
          "count": 1,
          "unitPriceExcludingVatCurrency": 65,
          "vatType": { "id": 6 }
        }
      ]
    }
  ]
}
```

Replace ids with the current account's resolved ids. The structure is the key: exact account ids on the voucher, exact customer id on the `1500` posting, and an explicit outgoing `0%` VAT row on the fee invoice.
Replace the literal `65` values with the prompt's exact reminder-fee amount.

## Pitfalls

- Do not use `/invoice/{id}/:createReminder` for exact prompt-fee reminder-fee tasks on `1500` / `3400`
- Do not assume the reminder endpoint's configured charge equals the prompt amount; the sandbox charged `38`
- Do not omit the reminder fee's separate manual voucher just because the prompt also asks for a fee invoice
- Do not try to infer the explicit prompt account from the account name; in sandbox the required account `3400` had an unrelated name and `isInactive=true`, yet still worked when referenced by id
- Do not use `account.number` directly on voucher postings; the id-based path is the trusted one
- Do not omit `customer` on the `1500` voucher posting
- Do not promote the sandbox-only omitted-`vatType` shortcut to production yet; the unsent probe invoice had `amountCurrency=50` but still returned `orderLines[].vatType=null`
- Do not overpay the overdue invoice; for this task shape the payment amount comes from the prompt (`5000`), not from the live outstanding balance
- Do not add a proactive `/ledger/account?isBankAccount=true` hedge before the fee invoice; the presence of an existing overdue outgoing invoice already weakens that branch enough that it is not the default winning path
- Do not add a `GET /customer`; the overdue-invoice locate read already gives the needed `customer.id`
- Do not add a follow-up invoice read after the payment if the payment write response already proves the new remaining outstanding amount

## Verification Shape

- locate read proves:
  - overdue invoice id
  - overdue invoice number
  - customer id
  - outstanding amount before payment
- voucher write proves:
  - exact `1500` / `3400` postings
  - exact prompt fee amount / negative prompt fee amount
  - `customer.id` on the debit posting
- fee-invoice write proves:
  - new invoice id and invoice number
  - `amountCurrency=<prompt-fee>`
- payment write proves:
  - remaining outstanding decreased by exactly `5000`

## Reflection Delta

- The blocked production run itself used the correct one-call credential check and stopped immediately after the proxy-token `403`
- The real missing knowledge was not credential handling but task-shape handling
- The important correction for the next agent is:
  - do not map `purregebyr` directly to `/invoice/{id}/:createReminder`
  - do map it to an exact manual voucher plus a separate no-VAT fee invoice when the prompt scores a fixed manual amount and explicit ledger accounts
