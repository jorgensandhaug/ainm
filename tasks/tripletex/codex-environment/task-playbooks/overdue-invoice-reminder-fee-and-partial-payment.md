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

- The downstream exact-match path is `6` calls when no same-run ids are cached:
  1. locate the overdue invoice
  2. resolve incoming payment type
  3. resolve ledger accounts `1500` and `3400`
  4. post the manual voucher
  5. create/send the fee invoice (omit vatType on order line)
  6. register the fixed `5000` partial payment
- The prompt wording `purregebyr` is a trap if you jump straight to `/invoice/{id}/:createReminder`
- Persistent sandbox on `2026-03-21` showed:
  - `PUT /invoice/{id}/:createReminder` without send type failed `422 Minst én sendetype må oppgis.`
  - `PUT /invoice/{id}/:createReminder?type=REMINDER...` failed `422 type: Ugyldig verdi.`
  - `PUT /invoice/{id}/:createReminder?type=SOFT_REMINDER&dispatchTypes=EMAIL&includeCharge=true` succeeded but charged `38`, not the prompt-required exact fee amount
- Therefore `/invoice/{id}/:createReminder` is not the exact-fee solution path for this task family unless the prompt explicitly wants the company-configured reminder charge rather than an exact manual amount
- The successful voucher payload needed:
  - `voucherType=null`
  - `account: { id }` refs, not `account.number` (number-based postings fail with `422 postings.account.name: Kan ikke være null`)
  - `customer: { id }` on the `1500` posting
  - balanced prompt-fee and negative prompt-fee values across `amount`, `amountCurrency`, `amountGross`, and `amountGrossCurrency`
- The fee invoice itself is an ordinary direct-line no-VAT customer invoice:
  - same customer id as the overdue invoice
  - one prompt-fee line
  - omit `vatType` on the order line; the API defaults to vatType id=0 ("Ingen avgiftsbehandling", 0%) which is correct for a no-VAT reminder fee
  - the previous `7`-call path explicitly resolved outgoing `0%` vatType via `GET /ledger/vatType`; this is unnecessary because omitting vatType produces the correct 0% result
  - default `sendToCustomer=true`
- The payment write for this task family is not the ordinary full-payment rule from the standalone payment playbook
- Here the prompt fixes the partial-payment amount, so `PUT /invoice/{id}/:payment` must use `paidAmount=5000`, not the invoice's full outstanding balance
- The payment-type heuristic from the ordinary payment playbook still applies:
  - prefer a `19xx` debit account
  - accept `name=null`
  - accept `creditAccount=null`
- Production and sandbox payment-type ids differed (`27178699` vs `32813748` vs `36380804`), so never hardcode or cargo-cult a prior id across environments

## Minimal Safe Flow

1. Locate the overdue invoice in one decisive read
   - `GET /invoice?invoiceDateFrom=<wide-from>&invoiceDateTo=<wide-to>&count=1000&sorting=-invoiceDate&fields=*,customer(*)`
   - local filter:
     - `invoiceDueDate < run-date`
     - positive outstanding amount
     - exactly one surviving overdue row
2. Resolve one usable incoming payment type
   - `GET /invoice/paymentType?count=1000&fields=*,debitAccount(*),creditAccount(*)`
3. Resolve the explicit ledger accounts
   - `GET /ledger/account?number=1500,3400&fields=*`
   - choose the exact numeric account rows
4. Post the manual exact-fee voucher
   - debit `1500` with `customer.id`
   - credit `3400`
   - prompt fee amount / negative prompt fee amount
5. Create and send the separate fee invoice
   - one prompt-fee direct order line
   - omit `vatType` on the order line (API defaults to 0%)
   - default `sendToCustomer=true`
6. Register the fixed partial payment
   - `PUT /invoice/{id}/:payment?paymentDate=<date>&paymentTypeId=<id>&paidAmount=5000`
7. Verify from the write responses and stop

## Canonical Call Count

- exact standalone task with no cached same-run ids: `6` calls
- same task shape with cached same-run incoming `paymentTypeId`: `5` calls
- no public lower-call standalone shortcut was proven for the exact task shape

## Response Parsing

- Tripletex list endpoints return `{ values: [...] }`, single-object endpoints return `{ value: {...} }`
- always handle both shapes from the very first script write
- the `prod-2026-03-21-124240715Z-4117f590` run crashed on the first GET /invoice call because `(await r.json()).value` returned undefined for a list endpoint; the correct pattern:
  ```typescript
  const json = JSON.parse(txt);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
  ```

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
      "amount": 35,
      "amountCurrency": 35,
      "amountGross": 35,
      "amountGrossCurrency": 35
    },
    {
      "row": 2,
      "date": "2026-03-21",
      "description": "Manual reminder fee 180",
      "account": { "id": 424191002 },
      "currency": { "id": 1 },
      "amount": -35,
      "amountCurrency": -35,
      "amountGross": -35,
      "amountGrossCurrency": -35
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
          "unitPriceExcludingVatCurrency": 35
        }
      ]
    }
  ]
}
```

Replace ids with the current account's resolved ids. The structure is the key: exact account ids on the voucher, exact customer id on the `1500` posting, and no `vatType` on the fee invoice order line (API defaults to 0%).
Replace the literal `35` values with the prompt's exact reminder-fee amount.

## Pitfalls

- Do not use `/invoice/{id}/:createReminder` for exact prompt-fee reminder-fee tasks on `1500` / `3400`
- Do not assume the reminder endpoint's configured charge equals the prompt amount; the sandbox charged `38`
- Do not omit the reminder fee's separate manual voucher just because the prompt also asks for a fee invoice
- Do not try to infer the explicit prompt account from the account name; in sandbox the required account `3400` had an unrelated name and `isInactive=true`, yet still worked when referenced by id
- Do not use `account.number` directly on voucher postings; the id-based path is the only one that works (number-based fails `422`)
- Do not omit `customer` on the `1500` voucher posting
- Do not add a `GET /ledger/vatType` call; omitting `vatType` on the fee invoice order line defaults to 0% and saves 1 API call
- Do not overpay the overdue invoice; for this task shape the payment amount comes from the prompt (`5000`), not from the live outstanding balance
- Do not add a proactive `/ledger/account?isBankAccount=true` hedge before the fee invoice; the presence of an existing overdue outgoing invoice already weakens that branch enough that it is not the default winning path
- Do not add a `GET /customer`; the overdue-invoice locate read already gives the needed `customer.id`
- Do not add a follow-up invoice read after the payment if the payment write response already proves the new remaining outstanding amount
- Do not use `(await r.json()).value` for list endpoints; always handle both `values` (list) and `value` (single object) response shapes to avoid crashing and wasting a retry API call

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

- `prod-2026-03-21-124240715Z-4117f590` scored 6/6 (normalized_score=6, matching best) using the `7`-call path with explicit vatType GET
- sandbox verification on `2026-03-21` proved the `6`-call path (omitting vatType GET) works end-to-end:
  - `POST /invoice` without `orderLines[].vatType` created invoice with correct `amountCurrency=35`
  - API defaulted to vatType id=0 ("Ingen avgiftsbehandling", 0%) — correct for no-VAT reminder fees
  - full 6-call sandbox proof: all writes succeeded, all amounts correct
- the production run also wasted 1 API call due to a response-parsing bug (`value` vs `values`), making the actual production call count 8 instead of 7
- the `6`-call path is now the standard; next runs should achieve the same correctness with 1 fewer call
