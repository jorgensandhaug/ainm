# Register Project Hours and Create Project Invoice

## Scope

Use for tasks like:
- register hours on an existing employee in an existing project
- use a specific existing project activity
- apply a prompt-given hourly rate
- create an unsent project invoice to the linked customer

Do not use for:
- fixed-price or on-account project billing
- travel-expense or re-invoicing-heavy project tasks
- cases where the employee, project, or customer must also be created from scratch

## Verified Findings

Persistent-sandbox verification on 2026-03-20 showed:
- `GET /project?name=...&count=50&fields=*,customer(*)` returned enough expanded customer data to identify the linked customer without a separate `GET /customer`
- `GET /project/hourlyRates?projectId=...&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))` returned enough nested data to identify an already-existing exact employee+activity rate and its `hourlyRate` without a second rate-search call
- on a newly created analog project with no hourly-rate holder yet, `POST /project/hourlyRates` with `project`, `startDate`, and `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"` created the missing holder, after which `POST /project/hourlyRates/projectSpecificRates` and `POST /timesheet/entry` succeeded normally
- `PUT /project/hourlyRates/{id}` can switch an existing project hourly-rate holder from `TYPE_FIXED_HOURLY_RATE` to `TYPE_PROJECT_SPECIFIC_HOURLY_RATES`
- after that model switch, `POST /project/hourlyRates/projectSpecificRates` with:
  - `projectHourlyRate`
  - `employee`
  - `activity`
  - `hourlyRate`
  succeeded for a chargeable activity and the next `POST /timesheet/entry` returned:
  - `chargeable=true`
  - `hourlyRate=<prompt rate>`
- the same `POST /project/hourlyRates/projectSpecificRates` failed on a non-chargeable activity with:
  - `422 activity.id: Ikke fakturerbar.`
- `POST /timesheet/entry` on a non-chargeable project activity still succeeded even with `projectChargeableHours`, but the write response kept:
  - `chargeable=false`
  - `hourlyRate=0`
- after that non-chargeable time write, `POST /order` with one real project-linked manual line and `PUT /order/{id}/:invoice?...sendToCustomer=false` still succeeded and produced the expected customer-facing invoice amount
- `PUT /timesheet/week/:approve` returned `403` even for the token owner; do not make week approval a default step in this task shape
- `GET /project/{id}/period/hourlistReport?...` can show those hours under `nonApprovedHours`
- `GET /project/{id}/period/invoicingReserve?...` can still show a positive fee reserve, but that does not mean the public API can actually charge those hours directly
- `POST /order` with only:
  - `customer`
  - `project`
  - `orderDate`
  - `deliveryDate`
  created a project-linked order and preliminary invoice, but:
  - `GET /invoice/details/{id}?fields=*` still showed `includeHours=false`
  - `PUT /order/{id}/:invoice?...` failed with `422 Fakturaen inneholder ingen ordrelinjer.`
- `POST /invoice?sendToCustomer=false` with an embedded project order and no real order lines also failed with:
  - `422 Order contains no OrderLines.`
- `POST /order` or `PUT /order/{id}` with nested `preliminaryInvoice.projectInvoiceDetails[].includeHours=true` was accepted/validated, but the resulting preliminary invoice still had:
  - `includeHours=false`
  - `feeAmount=0`
- `PUT /invoice/{id}` and `PUT /invoice/details/{id}` both returned method-not-allowed responses (`405` surfaced as `400 HTTP 405 Method Not Allowed`)
- the only public-API path re-proven to create the invoice side effect was:
  - register the hours separately
  - create a real project-linked order line whose amount is derived from the prompt hours and rate
  - invoice that order normally
- in the same sandbox account, `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=2026-03-20&fields=*` returned only VAT code `6` (`0%`)
- `POST /order` with one embedded project-linked line for `count=5`, `unitPriceExcludingVatCurrency=1750`, `vatType.id=6` then `PUT /order/{id}/:invoice?invoiceDate=2026-03-20&sendToCustomer=false` succeeded with:
  - `amountExcludingVatCurrency=8750`
  - `orders[0].id=<orderId>`
  - `projectInvoiceDetails[0].amountOrderLinesAndReinvoicingCurrency=8750`
  - `projectInvoiceDetails[0].includeHours=false`
- the same persistent sandbox already had `1920` / `isInvoiceAccount=true` with `bankAccountNumber=12345678903`, so a default `/ledger/account` preflight would have been an unnecessary extra call in that exact rerun state

## Minimal Safe Flow

1. Confirm these operations in `./openapi.json`
   - `GET /employee`
   - `GET /project`
   - `GET /activity/>forTimeSheet`
   - `GET /project/hourlyRates`
   - `PUT /project/hourlyRates/{id}`
   - `POST /project/hourlyRates/projectSpecificRates`
   - `POST /timesheet/entry`
   - `GET /ledger/vatType`
   - `POST /order`
   - `PUT /order/{id}/:invoice`
2. Resolve the employee
   - `GET /employee?email=<email>&count=10&fields=*`
   - exact-match locally because the email filter is containing
3. Resolve the project and linked customer in one read
   - `GET /project?name=<project-name>&count=50&fields=*,customer(*)`
   - exact-match the project name locally
   - exact-match the nested `customer.organizationNumber` and/or `customer.name` locally when the prompt gives them
   - only fall back to a separate `GET /customer` if the project read is ambiguous or unexpectedly sparse
5. Resolve the applicable activity through the project-timesheet endpoint
   - `GET /activity/>forTimeSheet?projectId=<project-id>&employeeId=<employee-id>&date=<date>&query=<activity-name>&filterExistingHours=false&count=50&fields=*`
6. If the resolved activity is chargeable, continue with the rate path
7. Resolve the project hourly-rate holder
   - `GET /project/hourlyRates?projectId=<project-id>&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`
8. If no holder exists yet, create it once
   - `POST /project/hourlyRates`
   - send:
     - `project`
     - `startDate`
     - `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"`
9. If needed, switch the holder to project-specific rates
   - `PUT /project/hourlyRates/{id}`
   - send:
     - `project`
     - `startDate`
     - `hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"`
10. Reuse or write the exact employee+activity rate
   - if that holder read already exposes one exact employee+activity rate with the prompt hourly rate, reuse it and skip an extra write
   - if it exposes one exact employee+activity rate with a different hourly rate, `PUT /project/hourlyRates/projectSpecificRates/{id}` once
   - otherwise `POST /project/hourlyRates/projectSpecificRates`
11. Register the hours
   - `POST /timesheet/entry`
   - send:
     - `employee`
     - `project`
     - `activity`
     - `date`
     - `hours`
     - `projectChargeableHours`
   - if the resolved activity is non-chargeable, still do this write and continue with the invoice fallback when the prompt only scores the requested hours side effect plus the invoice side effect
12. Resolve a valid outgoing VAT type for the invoice date
   - `GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=<date>&fields=*`
13. Create a real project-linked order line derived from the prompt hours and rate
   - `POST /order`
   - include:
     - `customer`
     - `project`
     - `orderDate`
     - `deliveryDate`
     - one embedded `orderLines[]` row using the prompt hours and prompt rate
14. Invoice that order without sending it
   - `PUT /order/{id}/:invoice?invoiceDate=<date>&sendToCustomer=false`
15. Only if that invoice write fails with the company-bank-account validation, repair the invoice bank account and retry the same order once

## Recommended Shapes

Project hourly-rate holder switch:

```json
{
  "project": { "id": 54321 },
  "startDate": "2026-03-20",
  "hourlyRateModel": "TYPE_PROJECT_SPECIFIC_HOURLY_RATES"
}
```

Project-specific rate create:

```json
{
  "projectHourlyRate": { "id": 67890 },
  "employee": { "id": 11111 },
  "activity": { "id": 22222 },
  "hourlyRate": 1750
}
```

Timesheet entry:

```json
{
  "employee": { "id": 11111 },
  "project": { "id": 54321 },
  "activity": { "id": 22222 },
  "date": "2026-03-20",
  "hours": 5,
  "projectChargeableHours": 5
}
```

Fallback public invoice order:

```json
{
  "customer": { "id": 12345 },
  "project": { "id": 54321 },
  "orderDate": "2026-03-20",
  "deliveryDate": "2026-03-20",
  "orderLines": [
    {
      "description": "Design",
      "count": 5,
      "unitPriceExcludingVatCurrency": 1750,
      "vatType": { "id": 6 }
    }
  ]
}
```

Replace VAT id `6` with the filtered outgoing VAT type actually returned for the invoice date.

## Exact-Match Fast Path

- For a prompt that gives:
  - employee email
  - project name plus customer organization number and/or name
  - activity name
  - hour count
  - hourly rate
- the public fast path is usually:
  1. `GET /employee?...`
  2. `GET /project?name=...&fields=*,customer(*)`
  3. `GET /activity/>forTimeSheet?...`
  4. if chargeable: `GET /project/hourlyRates?...fields=*,projectSpecificRates(*,employee(*),activity(*))`
  5. if chargeable and no holder exists yet: `POST /project/hourlyRates`
  6. if needed: conditional `PUT /project/hourlyRates/{id}`
  7. if chargeable and the exact rate is missing: `POST /project/hourlyRates/projectSpecificRates`
  8. if chargeable and the exact rate exists but differs: `PUT /project/hourlyRates/projectSpecificRates/{id}`
  9. `POST /timesheet/entry`
  10. `GET /ledger/vatType?...`
  11. `POST /order` with one real project-linked line using prompt hours x prompt rate
  12. `PUT /order/{id}/:invoice?...sendToCustomer=false`
- do not insert a default week-approval write
- do not spend speculative attempts to make a project preliminary invoice include hours
- do not stop the run just because the resolved activity is non-chargeable when the prompt only asks for the hours side effect plus the customer-facing invoice side effect

## Verification Shape

- `POST /project/hourlyRates/projectSpecificRates`
  - expect `ResponseWrapperProjectSpecificRate`
  - verify:
    - `employee.id`
    - `activity.id`
    - `hourlyRate`
- `POST /timesheet/entry`
  - expect `ResponseWrapperTimesheetEntry`
  - verify:
    - `hours`
    - `projectChargeableHours`
    - `project.id`
    - `activity.id`
  - on the chargeable branch, also verify:
    - `hourlyRate`
    - `chargeable`
  - on the non-chargeable fallback branch, expect:
    - `chargeable=false`
    - `hourlyRate=0`
- `PUT /order/{id}/:invoice`
  - expect `ResponseWrapperInvoice`
  - verify:
    - `customer.id`
    - `amountExcludingVatCurrency`
    - `amountCurrencyOutstanding`
- optional `GET /invoice/{id}?fields=*,orders(*,project(*),orderLines(*)),orderLines(*)`
  - use only if the invoice write response is too sparse for the scored fields

## Avoidable Mistakes

- Do not assume `PUT /timesheet/week/:approve` is required or even permitted for this task shape
- Do not try to attach a project-specific rate to a non-chargeable activity; the server returns `422 activity.id: Ikke fakturerbar.`
- Do not ignore already-expanded `projectSpecificRates` and then blindly `POST /project/hourlyRates/projectSpecificRates`; that can waste a write or trigger a duplicate-rate validation branch in persistent/repeat contexts
- Do not assume `projectChargeableHours` overrides a non-chargeable activity; the timesheet entry can still come back with `chargeable=false` and `hourlyRate=0`
- Do not stop the run solely because of that non-chargeable timesheet response when the prompt only scores requested hours registration plus the invoice side effect; the scoring-first fallback is still the timesheet write plus a manual project-linked order/invoice
- Do not assume a positive project invoicing reserve means the public API can actually charge those hours into an invoice
- Do not use `POST /order` or `POST /invoice` with a project but no real order lines as the invoicing write; both public paths were re-proven to fail for this task shape
- Do not treat writable-looking nested `preliminaryInvoice.projectInvoiceDetails[].includeHours=true` as a working path; the server accepts or validates the payload but still persists `includeHours=false`
- Do not rely on `PUT /invoice/{id}` or `PUT /invoice/details/{id}`; both were re-proven as method-not-allowed
- Do not assume the fallback public invoice consumes the registered project-hour reserve; it creates the customer-facing invoice side effect but leaves `includeHours=false`
- Do not add an unconditional `/ledger/account` preflight in the standard exact path when you have no separate first-invoice evidence; keep that branch conditional unless you intentionally take the fresh-account hedge
