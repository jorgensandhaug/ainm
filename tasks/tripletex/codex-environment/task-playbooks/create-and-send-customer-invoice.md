# Create and Send Customer Invoice

## Scope

Use for tasks like:
- create an invoice for an existing or new customer
- send the invoice after creation
- invoice has one or more simple order lines

For create-only invoice tasks that should stop before sending, use `./task-playbooks/create-customer-invoice.md`.

## Key Finding: The Winning Send Path Is Usually The Invoice Create Itself

For this task shape, do not default to:

`POST /invoice?sendToCustomer=false`

followed by:

`PUT /invoice/{id}/:send?sendType=...`

Persistent sandbox re-verification on 2026-03-20 showed a lower-call and safer path:

1. create or resolve the customer
2. resolve outgoing VAT
3. `POST /invoice` with the default `sendToCustomer=true`
4. stop

The same sandbox session also showed:
- explicit later `PUT /invoice/{id}/:send?sendType=MANUAL` returned `500`
- explicit later `PUT /invoice/{id}/:send?sendType=PAPER` returned `422 Faktura kan ikke sendes via PAPER`

For the common "new customer, no email/address in prompt" variant, the invoice create itself is the trusted send step.

## Key Finding: Fresh-Account Customer Identity Is Not The Same As Existing-Customer Proof

For exact create-and-send prompts that only give customer business identity such as:

- exact `name`
- exact `organizationNumber`
- no email
- no postal address
- no explicit wording that the customer already exists

do not spend a speculative:

`GET /customer?organizationNumber=...&fields=*`

first.

Persistent sandbox re-verification on 2026-03-20 showed the lower-call path for that fresh-account shape is:

1. `POST /customer` with:
   - `name`
   - `organizationNumber`
   - `invoiceSendMethod: "MANUAL"`
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
3. `POST /invoice`

The same sandbox account then re-verified the existing-customer branch with:

1. `GET /customer?organizationNumber=...&fields=*`
2. `GET /ledger/vatType?...`
3. `POST /invoice`

So the pre-read is only part of the trusted path when the prompt explicitly implies an already-existing customer or the run context is not the normal fresh-account shape.

The same rule is language-agnostic for explicit no-VAT prompts. The 2026-03-20 production run for Portuguese `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` / `sem IVA` also succeeded in the same `3` calls:

1. `POST /customer` with `invoiceSendMethod: "MANUAL"`
2. `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*`
3. `POST /invoice`

So do not let prompt language push this shape onto an unnecessary existing-customer lookup branch.

## Key Finding: Company Bank Account Registration Is A Repair Branch

If `POST /invoice` fails with:

`Faktura kan ikke opprettes før selskapet har registrert et bankkontonummer.`

then the practical fix is:

1. Find the company bank ledger account with:
   `GET /ledger/account?isBankAccount=true&fields=*`
2. Pick the existing invoice account:
   usually account `1920`
   must have `isInvoiceAccount=true`
3. Register the bank account number on that account:

```http
PUT /ledger/account/{id}
{
  "bankAccountNumber": "12345678903"
}
```

This was verified in sandbox:
- invoice creation failed before this update
- invoice creation succeeded after this update
- not every 11-digit string is accepted in practice; use a checksum-valid unique 11-digit number

## Key Finding: Resolve VAT Type Dynamically

Do not hardcode invoice line `vatType.id = 3`.

Use:

`GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`

and choose from the filtered result for the actual invoice date.

This was re-verified in sandbox on 2026-03-19:
- `POST /invoice` failed with `Ugyldig mva-kode.` when line VAT was hardcoded to `3`
- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-19&fields=*` returned only VAT code `6`
- invoice creation succeeded after using the dynamically resolved VAT type from that filtered result

## Key Finding: Omitting Line VAT Is A Fake Optimization

Do not try to save the `GET /ledger/vatType` call for a simple direct service line by omitting `orderLines[].vatType`.

Persistent sandbox re-verification on 2026-03-20 showed:
- `POST /invoice` without line `vatType` still succeeded
- the resulting invoice had `amountExcludingVatCurrency=28500` and `amountCurrency=28500`
- in that sandbox account, the filtered outgoing VAT result for the same date only exposed VAT code `6` (`0%`)
- hardcoding `vatType.id = 3` still failed with `422 ... Ugyldig mva-kode.`

So the lower-call omission path can silently create a no-VAT invoice instead of the intended taxable-service invoice. For this task shape, the dynamic filtered VAT lookup remains the minimum safe path.

For exact direct-line no-VAT prompts, the same rule still applies:

- do not omit `orderLines[].vatType`
- resolve the filtered outgoing `0%` VAT row that actually exists in the current account

Persistent sandbox re-verification on 2026-03-20 for `Porto Alegre Lda` / `826870192` / `Design web` / `22700` showed:

- `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6`
- `POST /invoice` with that resolved `vatType.id=6` succeeded
- the write response already proved the intended no-VAT outcome with `amountExcludingVatCurrency=22700` and `amountCurrency=22700`

The 2026-03-20 production run for Portuguese `Porto Alegre Lda` / `842889154` / `Consultoria de dados` / `11200` / `sem IVA` and the same-day persistent sandbox re-check on analogous org `842889155` reconfirmed the same branch:

- direct `POST /customer`
- filtered outgoing VAT read returning code `6` (`0%`)
- direct `POST /invoice`
- no customer pre-read
- no explicit `PUT /invoice/{id}/:send`

For ordinary direct-line service prompts that are explicitly priced excluding VAT / MVA, the same dynamic rule becomes an exact `25%` selector:

- use the filtered outgoing VAT read
- choose an exact `25%` row, not the first returned row
- if the filtered result exposes only `0%`, treat the run as blocked in that account instead of downgrading the invoice to `0%`

This was re-confirmed on 2026-03-20 across production plus persistent sandbox:

- the production run for `Snøhetta AS` / `871844062` / `Webdesign` / `20100` succeeded in `3` calls: direct `POST /customer`, filtered outgoing VAT read, then `POST /invoice`
- the production invoice write already proved the taxed outcome with `amountExcludingVatCurrency=20100` and `amountCurrency=25125`
- the persistent sandbox on the same date still exposed only VAT code `6` (`0%`)
- on that sandbox account, omitting `vatType` for the same `20100` / `Webdesign` line silently created `amountCurrency=20100`
- on that sandbox account, hardcoded `vatType.id=3` still failed with `422 ... Ugyldig mva-kode.`

## Important Constraints

- Do not assume there is a separate public company-level bank-account endpoint in `openapi.json`
- The public/spec-confirmed path that solved this was `PUT /ledger/account/{id}`
- Do not create a second invoice bank account with the same `bankAccountNumber`
- Duplicate bank account numbers trigger validation errors
- Prefer updating existing `1920` over creating a new invoice account
- Do not hardcode invoice/order-line VAT code `3`
- The authoritative candidate set for invoice lines is the filtered `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=...&fields=*` result on the invoice date

## Minimal Flow

1. Find or create the customer
   - for the normal fresh-account new-customer variant, skip the pre-read and `POST /customer` directly
   - if creating a new customer and the prompt gives no email or postal address, prefer `invoiceSendMethod: "MANUAL"`
   - only use `GET /customer?organizationNumber=...&fields=*` when the prompt or environment actually implies an existing customer lookup
   - prompt wording like `invoice customer <name> (<organizationNumber>)` is not, by itself, enough reason to spend that pre-read in a fresh-account run
2. Resolve a valid outgoing VAT type for the invoice date when the line VAT is not already safely implied by the resolved product/account setup
   - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<invoice-date>&fields=*`
   - use a VAT type that actually exists in that filtered response
   - do not omit direct-line `vatType` just because the write may still succeed; that can silently produce a no-VAT invoice
   - this also applies to explicit no-VAT direct-line prompts; resolve the filtered outgoing `0%` row instead of assuming omission is equivalent
   - for ordinary service prompts priced excluding VAT / MVA, require an exact `25%` row from that filtered result; if `25%` is absent, stop as blocked for that account
3. Create invoice and let the default `sendToCustomer=true` perform the send in the same write
   - include required dates
   - include `orders`
   - include `orderLines` inside the order, not directly on invoice input
4. If `POST /invoice` fails with the company-bank-account validation, repair that prerequisite once
   - `GET /ledger/account?isBankAccount=true&fields=*`
   - update the existing invoice account with `PUT /ledger/account/{id}`
   - retry the invoice write once
5. If you need exact line-level proof and the invoice write response is sparse, do one immediate `GET /invoice/{id}` with expanded `fields`

## Invoice Payload Notes

- `invoiceDueDate` is required
- `orders[].deliveryDate` is required
- `invoice.orderLines` is read-only in the schema
- create lines under `orders[].orderLines`

Example shape:

```json
{
  "invoiceDate": "2026-03-19",
  "invoiceDueDate": "2026-04-02",
  "customer": { "id": 123 },
  "orders": [
    {
      "customer": { "id": 123 },
      "orderDate": "2026-03-19",
      "deliveryDate": "2026-03-19",
      "orderLines": [
        {
          "description": "Analyserapport",
          "count": 1,
          "unitPriceExcludingVatCurrency": 7850,
          "vatType": { "id": 6 }
        }
      ]
    }
  ]
}
```

In real tasks, replace `6` with the VAT type resolved from the filtered `GET /ledger/vatType` response for the invoice date. Do not assume the same code is valid across accounts.

For create-and-send tasks, omit `sendToCustomer=false` unless the prompt explicitly requires a separate later send step or send-channel override.

## Sparse Response Trap

- `POST /invoice` can succeed while returning `orderLines` only as link objects with `id` and `url`
- do not treat that as a failed line create
- if the task requires exact line-level proof before sending, do one immediate:
  - `GET /invoice/{id}?fields=*,customer(*),orders(*,orderLines(*,product(*),vatType(*))),orderLines(*,product(*),vatType(*))`

## If You Still Need to Probe

- First test in sandbox if available
- Reproduce with one simple zero-VAT or standard-VAT line
- If invoice fails after bank-account registration, use the new validation message as the next branch
- Reuse returned IDs from write responses

## Proven Send-Channel Pitfalls

- Do not assume `PUT /invoice/{id}/:send?sendType=MANUAL` is the safe fallback for customers created without email/address; persistent sandbox reproduced `500` on 2026-03-20
- Do not assume sparse customer address links mean `PAPER` send is available; persistent sandbox reproduced `422 Faktura kan ikke sendes via PAPER`
- Do not assume organization number alone makes EHF available; the production run for this task shape reproduced `422 Faktura kan ikke sendes via EHF`
- Do not assume a successful direct-line invoice write without explicit `vatType` means the VAT is correct; persistent sandbox on 2026-03-20 accepted that shape and produced a no-VAT invoice (`28500` total on a `28500` ex-VAT line)
- Do not spend `GET /customer` first on the exact fresh-account shape that only gives `name + organizationNumber` for a new customer; the 2026-03-20 sandbox re-verification proved the lower-call path is direct `POST /customer`, then filtered `GET /ledger/vatType`, then `POST /invoice`
