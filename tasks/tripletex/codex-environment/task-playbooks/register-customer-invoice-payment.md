# Register Full Payment on Customer Invoice

## Scope

Use for tasks like:
- register full payment on an existing customer invoice
- prompt identifies the invoice by customer, organization number, line description, invoice number, KID, or amount
- no credit-note, reminder, remit, or reversal flow is requested

## Verified Findings

Persistent-sandbox verification on 2026-03-19 showed:
- the payment write endpoint is `PUT /invoice/{id}/:payment`
- required query parameters are `paymentDate`, `paymentTypeId`, and `paidAmount`
- `GET /invoice/paymentType?fields=*` returned valid invoice payment types such as `Kontant` and `Betalt til bank`
- `PUT /invoice/{id}/:payment` succeeded when using a general payment type with matching currency and `paidAmount` equal to the invoice's current outstanding balance
- the `200` write response returned the updated invoice, and `amountOutstanding=0` plus `amountOutstandingTotal=0` already proved full payment without any follow-up `GET`

Sandbox proof run:
- open invoice `2147515695` / invoice number `2`
- before payment: `amountOutstanding=101`, `amountOutstandingTotal=101`
- payment type: `Kontant` (`id=32813747`)
- write: `PUT /invoice/2147515695/:payment?paymentDate=2026-03-19&paymentTypeId=32813747&paidAmount=101`
- after payment from the same response: `amountOutstanding=0`, `amountOutstandingTotal=0`

## Minimal Safe Flow

1. Confirm `GET /customer`, `GET /invoice`, `GET /invoice/paymentType`, and `PUT /invoice/{id}/:payment` in `./openapi.json`
2. Resolve the customer only if the prompt does not already give a decisive invoice identifier
   - usually `GET /customer?organizationNumber=...&count=10&fields=*`
3. Resolve the target invoice with one decisive read
   - usually `GET /invoice?customerId=...&invoiceDateFrom=2000-01-01&invoiceDateTo=2100-01-01&count=1000&fields=*,customer(*),orderLines(*),currency(*)`
   - exact-match locally on the prompt identifiers such as:
     - `customer.organizationNumber`
     - customer name
     - `invoiceNumber`
     - `amountExcludingVat`
     - `orderLines[].description`
   - require a positive remaining balance using `amountOutstandingTotal` or `amountOutstanding`
4. Resolve a valid payment type with one decisive read
   - `GET /invoice/paymentType?count=1000&fields=*`
   - prefer a general type with no `customer.id` and matching invoice currency
5. Register payment with:
   - `PUT /invoice/{id}/:payment?paymentDate=<ISO-date>&paymentTypeId=<id>&paidAmount=<current-outstanding-balance>`
6. Verify directly from the write response that the remaining outstanding balance is zero
7. Stop

## Exact-Match Fast Path

- If the prompt identifies one customer invoice by customer plus a line description and excluding-VAT amount, the winning flow is usually:
  1. `GET /customer?organizationNumber=...&count=10&fields=*`
  2. `GET /invoice?customerId=...&invoiceDateFrom=2000-01-01&invoiceDateTo=2100-01-01&count=1000&fields=*,customer(*),orderLines(*),currency(*)`
  3. locally select the single open invoice matching the prompt identifiers
  4. `GET /invoice/paymentType?count=1000&fields=*`
  5. `PUT /invoice/{id}/:payment` with `paidAmount` equal to the invoice's current outstanding balance
- Do not add a follow-up invoice `GET` if the payment response already shows zero remaining balance

## Payment Amount Trap

- Do not assume the prompt's amount is the payment amount
- The prompt often uses an excluding-VAT amount only to identify the invoice
- For full payment, use the invoice's current outstanding balance from the decisive invoice read:
  - prefer `amountOutstandingTotal`
  - fall back to `amountOutstanding` if `amountOutstandingTotal` is absent
- This avoids underpaying invoices where VAT, reminders, or remittances make the total balance different from the prompt's lookup amount

## Payment Type Resolution

- Do not guess a raw ledger account or voucher flow first if the task only asks to register invoice payment
- Use `GET /invoice/paymentType?fields=*`
- Prefer a payment type that:
  - has no customer-specific binding
  - matches the invoice currency when `currencyCode` is populated
- In the verified sandbox account, `Kontant` worked directly for invoice payment
- If several general types fit, prefer the simplest valid one already returned by `/invoice/paymentType` rather than inventing a ledger-voucher workaround

## Verification Shape

- Expect `200 OK`
- Expect a wrapper of shape `{"value": {...}}`
- The write response can already prove:
  - invoice `id`
  - payment was accepted
  - `amountOutstanding`
  - `amountOutstandingTotal`
- For a full-payment task, stop when the response shows remaining outstanding balance `0`

## Avoidable Mistakes

- Do not pay the prompt's excluding-VAT lookup amount unless it exactly equals the current outstanding balance
- Do not open ledger/voucher flows first when `/invoice/{id}/:payment` already matches the task
- Do not choose a customer-specific payment type for another customer
- Do not spend a verification `GET` if the payment write response already proves zero remaining balance
- Do not keep broad-searching invoices after you already have a unique open match
