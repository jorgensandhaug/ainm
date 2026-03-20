# Register Travel Expense

## Scope

Use for tasks like:
- register one new travel expense for an existing employee identified by email
- create travel costs such as flight, taxi, ferry, hotel, or similar reimbursement lines
- include per-diem compensation in the same travel expense
- finish in one parent write plus only the verification reads that are actually needed

Do not use for:
- mileage allowance
- accommodation allowance
- attachments
- approval or delivery flows
- project-linked or reinvoiced travel expenses

## Key Findings

Verified in persistent sandbox on 2026-03-20:
- `GET /travelExpense/costCategory?count=1000&fields=*` returned travel categories with `showOnTravelExpenses=true`, including `Fly` and `Taxi`
- `GET /travelExpense/paymentType?count=1000&fields=*` returned one active travel-expense payment type, `Privat utlegg`
- `POST /travelExpense` can create the parent expense, embedded cost rows, and embedded per-diem rows in one write
- embedded `costs[]` failed with `422` until each row included `amountCurrencyIncVat`
- embedded `perDiemCompensations[]` failed with `422` while `travelDetails.isCompensationFromRates=false`
- changing `travelDetails.isCompensationFromRates` to `true` allowed the same embedded per-diem row to persist with manual `count`, `rate`, and `amount`
- the `POST /travelExpense` response already proved the parent fields, but `costs[]` and `perDiemCompensations[]` came back only as `id`/`url`
- `GET /travelExpense/{id}?fields=*` still kept those child arrays sparse
- `GET /travelExpense/cost?travelExpenseId=...&count=20&fields=*` returned full cost objects with comments, amounts, category ids, and payment-type ids
- `GET /travelExpense/perDiemCompensation?travelExpenseId=...&count=20&fields=*` returned full per-diem objects with `location`, `count`, `rate`, and `amount`

## Minimal Safe Flow

1. Confirm these operations in `./openapi.json`
   - `GET /employee`
   - `GET /travelExpense/costCategory`
   - `GET /travelExpense/paymentType`
   - `POST /travelExpense`
   - `GET /travelExpense/cost`
   - `GET /travelExpense/perDiemCompensation`
2. Locate the employee with one decisive read
   - usually `GET /employee?email=<prompt-email>&count=10&fields=*`
   - filter locally to one exact-email employee
   - prefer `allowInformationRegistration=true` when several exact-email hits exist
3. Resolve one travel payment type and the required cost categories
   - `GET /travelExpense/costCategory?count=1000&fields=*`
   - `GET /travelExpense/paymentType?count=1000&fields=*`
   - filter locally on `showOnTravelExpenses=true`
4. Create the travel expense in one write
   - `POST /travelExpense`
   - embed top-level `travelDetails`
   - embed `perDiemCompensations[]`
   - embed `costs[]`
5. Verify the parent fields from the write response
   - `title`
   - `employee.id`
   - `travelDetails.departureDate`
   - `travelDetails.returnDate`
   - `travelDetails.destination`
6. Verify child rows with the dedicated child endpoints
   - `GET /travelExpense/cost?travelExpenseId=<id>&count=20&fields=*`
   - `GET /travelExpense/perDiemCompensation?travelExpenseId=<id>&count=20&fields=*`
7. Stop

## Winning Payload Shape

For the travel-expense create, the sandbox-proven shape was:

```json
{
  "employee": { "id": 18478235 },
  "department": { "id": 837842 },
  "title": "Visita cliente Bergen",
  "travelDetails": {
    "isForeignTravel": false,
    "isDayTrip": false,
    "isCompensationFromRates": true,
    "departureDate": "2026-03-19",
    "returnDate": "2026-03-20",
    "departureTime": "08:00",
    "returnTime": "18:00",
    "destination": "Bergen",
    "detailedJourneyDescription": "Visita cliente Bergen",
    "purpose": "Visita cliente Bergen"
  },
  "perDiemCompensations": [
    {
      "location": "Bergen",
      "count": 2,
      "rate": 800,
      "amount": 1600
    }
  ],
  "costs": [
    {
      "costCategory": { "id": 32813722 },
      "paymentType": { "id": 32813706 },
      "comments": "bilhete de avião",
      "amountCurrencyIncVat": 5200,
      "amountNOKInclVAT": 5200,
      "date": "2026-03-19"
    },
    {
      "costCategory": { "id": 32813737 },
      "paymentType": { "id": 32813706 },
      "comments": "táxi",
      "amountCurrencyIncVat": 350,
      "amountNOKInclVAT": 350,
      "date": "2026-03-20"
    }
  ]
}
```

## Validation Traps

- do not omit `amountCurrencyIncVat` on embedded travel costs just because the prompt amount is already in NOK
- do not set `travelDetails.isCompensationFromRates=false` when the same write also includes `perDiemCompensations[]`
- do not assume `GET /travelExpense/{id}?fields=*` expands child rows; it can stay link-only for both costs and per-diems

## Category And Payment-Type Resolution

- `GET /travelExpense/costCategory` does not expose a query parameter equivalent to `showOnTravelExpenses=true`, so fetch the set once and filter locally
- prefer exact category-description matches before fallback heuristics:
  - `Fly` for airfare
  - `Taxi` for taxi
- for the payment type, prefer one active travel-expense reimbursement type from the lookup; persistent sandbox exposed `Privat utlegg`

## Verification Shape

- `POST /travelExpense` verified the parent expense and returned:
  - the parent `id`
  - the linked `employee.id`
  - the requested `travelDetails`
  - `costs[].id/url` only
  - `perDiemCompensations[].id/url` only
- `GET /travelExpense/cost?...` is the decisive cost verification branch
- `GET /travelExpense/perDiemCompensation?...` is the decisive per-diem verification branch
- prefer those two child reads over `GET /travelExpense/{id}` when the task scores nested travel-expense rows

## When Not To Add Extra Reads

- do not add a pre-read of `/travelExpense` for a pure create task
- do not add `GET /travelExpense/{id}` if the write response already proves the parent fields and you are already doing the two child verification reads
- do not split the create into separate `POST /travelExpense/cost` and `POST /travelExpense/perDiemCompensation` calls unless the prompt materially differs from the embedded-create shape
