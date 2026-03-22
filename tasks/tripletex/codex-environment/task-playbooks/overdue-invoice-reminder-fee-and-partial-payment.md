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
- Trying to cut the flow to `5` calls by omitting `paymentTypeId` on `PUT /invoice/{id}/:payment` is invalid; persistent sandbox on `2026-03-21` returned `422 paymentTypeId: Kan ikke være null.` on fixture invoice `206`
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
- Do not omit explicit `row` values on voucher postings; omitting `row` defaults to row 0 which is system-generated and always fails with `422 Posteringene på rad 0 (guiRow 0) er systemgenererte`; use `row: 1` on the first posting and `row: 2` on the second
- Do not omit `customer` on the `1500` voucher posting
- Do not add a `GET /ledger/vatType` call; omitting `vatType` on the fee invoice order line defaults to 0% and saves 1 API call
- Do not overpay the overdue invoice; for this task shape the payment amount comes from the prompt (`5000`), not from the live outstanding balance
- Do not add a proactive `/ledger/account?isBankAccount=true` hedge before the fee invoice; the presence of an existing overdue outgoing invoice already weakens that branch enough that it is not the default winning path
- Do not add a `GET /customer`; the overdue-invoice locate read already gives the needed `customer.id`
- Do not add a follow-up invoice read after the payment if the payment write response already proves the new remaining outstanding amount
- Do not use `(await r.json()).value` for list endpoints; always handle both `values` (list) and `value` (single object) response shapes to avoid crashing and wasting a retry API call
- Do not put order lines at the top level of the invoice payload (`orderLines: [...]` with `orders: []`); this fails `422 orders: Listen kan ikke være tom.`; the correct structure is `orders: [{ customer, orderDate, deliveryDate, orderLines: [...] }]` — the order line goes inside an order object within the `orders` array; this trap was hit in production run `ba977073` (German prompt, fee `40`) and sandbox-verified on `2026-03-21`

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
- later same-day sandbox re-proof used one disposable setup invoice `206` (`id=2147594276`, amount `9000`) for a stricter branch audit:
  - `PUT /invoice/2147594276/:payment?paymentDate=2026-03-21&paidAmount=1` without `paymentTypeId` failed `422 paymentTypeId: Kan ikke være null.`
  - the normal `6`-call branch then succeeded with fee `50`, payment type `32813748`, voucher `608963784`, fee invoice `207`, and remaining outstanding `4000`
- production run `prod-2026-03-21-134955068Z-b244cce3` matched the trusted `6`-call path exactly for a Spanish prompt with fee `50`:
  - overdue invoice `#2` (`id=2147593896`) outstanding `24812.5`
  - voucher `#1` (`id=608962870`)
  - fee invoice `#4` (`id=2147594063`, amount `50`)
  - payment type `36469300`
  - remaining outstanding `19812.5`
- the older production run `prod-2026-03-21-124240715Z-4117f590` still matters as a parser warning because it wasted 1 API call due to a response-shape bug (`value` vs `values`), but that failure mode is now avoidable
- sandbox re-proof on `2026-03-21` tested `account: { number: 1500, name: "Kundefordringer" }` (number+name, no id) to see if GET /ledger/account could be skipped:
  - failed `422 Internt felt (account): Feltet må fylles ut.` — `account.id` is strictly mandatory
  - neither `number` alone nor `number+name` can replace the account id lookup
- production run `prod-2026-03-21-171051701Z-de935656` matched the trusted `6`-call path exactly for a Norwegian prompt with fee `50`, 0 errors:
  - overdue invoice `#1` (`id=2147613724`), customer `108381232`, outstanding `16250`
  - voucher `#1` (`id=609051585`)
  - fee invoice `#4` (`id=2147613830`, amount `50`)
  - payment type `36723119`
  - remaining outstanding `11250`
- the `6`-call path is confirmed optimal across 5 production runs and multiple sandbox proofs; no lower-call path exists
- production run `prod-2026-03-21-184424564Z-d022ee19` hit the `row 0 systemgenererte` trap on voucher POST without explicit `row`, wasting 1 call (7 total):
  - overdue invoice `#1` (`id=2147625691`), customer `108395937`, outstanding `19687.5`
  - voucher POST without `row` failed `422`; retry with `row: 1` and `row: 2` succeeded as voucher `#1` (`id=609094799`)
  - fee invoice `#4` (`id=2147625942`, amount `70`), payment type `36850274`, outstanding reduced to `14687.5`
  - sandbox re-proof confirmed `row` omission always fails — it is not account-specific
  - **critical fix**: always include `row: 1` and `row: 2` on voucher postings
- production run `prod-2026-03-21-203931462Z-00a15d2d` matched the trusted `6`-call path exactly for a French prompt with fee `50`, 0 errors:
  - overdue invoice `#2` (`id=2147635863`), customer `108419715`, outstanding `29375`
  - voucher `#1` (`id=609142150`)
  - fee invoice `#4` (`id=2147635928`, amount `50`)
  - payment type `37216892`
  - remaining outstanding `24375`
- the `6`-call path is now confirmed across 5 production runs (`pt`, `de`, `es`, `nb`, `fr`) and multiple sandbox proofs; no lower-call path exists
- production run `prod-2026-03-21-214826630Z-16c30378` matched the trusted `6`-call path exactly for a French prompt with fee `60`, 0 errors:
  - overdue invoice `#1` (`id=2147641528`), customer `108433770`, outstanding `23562.5`
  - voucher `#1` (`id=609169374`)
  - fee invoice `#4` (`id=2147641603`, amount `60`)
  - payment type `37435187`
  - remaining outstanding `18562.5`
- the `6`-call path is now confirmed across 6 production runs with fee amounts `35`, `50`, `60`, `70` and prompts in `pt`, `de`, `es`, `nb`, `fr`; no lower-call path exists
- production run `prod-2026-03-21-215357856Z-a1e81130` matched the trusted `6`-call path exactly for a Spanish prompt with fee `60`, 0 errors:
  - overdue invoice `#3` (`id=2147642065`), customer `108434854`, outstanding `35000`
  - voucher `#1` (`id=609171478`)
  - fee invoice `#4` (`id=2147642189`, amount `60`)
  - payment type `37451308`
  - remaining outstanding `30000`
- the `6`-call path is now confirmed across 7 production runs; no lower-call path exists
- production run `prod-2026-03-21-222433471Z-ba977073` hit the `orders: []` + top-level `orderLines` trap on fee-invoice POST, requiring 7 calls (1 wasted 422):
  - overdue invoice `#1` (`id=2147645103`), customer `108441398`, outstanding `36875`, due `2026-02-07`
  - voucher `#1` (`id=609186182`), fee `40`
  - first `POST /invoice` with `orders: [], orderLines: [...]` failed `422 orders: Listen kan ikke være tom.`
  - fix-up used correct `orders: [{ customer, orderDate, deliveryDate, orderLines: [...] }]` structure
  - fee invoice `#4` (`id=2147645318`, amount `40`), payment type `37539606`, outstanding reduced to `31875`
  - the `6`-call path would have been achieved if the agent had used the correct invoice payload structure from the start; the trusted standard and playbook now document this pitfall explicitly
- production run `prod-2026-03-21-223053963Z-9109b98e` matched the trusted `6`-call path exactly for an English prompt with fee `40`, 0 errors:
  - overdue invoice `#3` (`id=2147645684`), customer `108442732`, outstanding `26312.5`, due `2026-02-04`
  - voucher `#1` (`id=609188183`)
  - fee invoice `#4` (`id=2147645759`, amount `40`)
  - payment type `37556805`
  - remaining outstanding `21312.5`
- the `6`-call path is now confirmed across 9 production runs with fee amounts `35`, `40`, `50`, `60`, `70` and prompts in `nb`, `en`, `es`, `pt`, `de`, `fr`; no lower-call path exists
- production run `prod-2026-03-22-034304639Z-37825322` was blocked by expired proxy token (403 on first GET); script was correctly structured for the `6`-call path (Spanish prompt, fee `35`); scored `0/10` due to credential expiry, not logic error
- persistent sandbox re-proof on `2026-03-22` confirmed the `6`-call path end-to-end with 0 errors; also investigated whether invoice postings contain enough data to skip `GET /ledger/account`: postings include account `1500` id but NOT `3400`, so the account GET is still required
- production run `prod-2026-03-22-100610606Z-01190bcc` matched the trusted `6`-call path exactly for a German prompt with fee `40`, 0 errors:
  - overdue invoice `#1` (`id=2147692366`), customer `108576903` (Flussgold GmbH), outstanding `36875`, due `2026-02-07`
  - voucher `#1` (`id=609387943`)
  - fee invoice `#4` (`id=2147692474`, amount `40`)
  - payment type `39639943`
  - remaining outstanding `31875`
- sandbox investigation on `2026-03-22` confirmed `isSent` is NOT a valid InvoiceDTO field; trusted standard verification template corrected
- the `6`-call path is confirmed across 10 clean production runs + 1 blocked run; no `5`-call standalone path exists
