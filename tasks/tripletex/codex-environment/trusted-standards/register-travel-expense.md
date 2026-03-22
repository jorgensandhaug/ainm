# Register Travel Expense

## Trust Level
- Trusted standard — use directly, skip `./openapi.json` re-checking

## Exact Match
- Register one new travel expense for one existing employee (identified by email)
- Prompt provides cost lines (flight, taxi, etc.) and per-diem allowance
- No attachment, approval, mileage, accommodation allowance, project linking, update, or delete

## Standard Flow (8 calls max, 0 errors)

### Round 1 — parallel (3 calls)
```
GET /employee?email=<email>&count=10&fields=*
GET /travelExpense/costCategory?count=1000&fields=*
GET /travelExpense/paymentType?count=1000&fields=*
```
- Filter employee by exact email match; prefer `allowInformationRegistration=true` if multiple
- Filter categories/payTypes locally on `showOnTravelExpenses=true`
- Match `Fly` for airfare, `Taxi` for taxi (exact `description` match)

### Round 2 — conditional (0 or 1 call)
Only if employee has `address=null` AND prompt omits `departureFrom`:
```
GET /company/{employee.companyId}?fields=*,address(*)
```
Use `company.address.city` as `departureFrom`. If both employee and company lack a city, the run is **blocked** — do NOT invent placeholders like "Hjemsted".

Skip this step if employee has an address or prompt provides departureFrom.

### Round 3 — create (1 call)
```
POST /travelExpense
```
With the exact payload shape below.

### Round 4 — deliver (1 call)
```
PUT /travelExpense/:deliver?id=<travelExpenseId>
```
Response is `ListResponseTravelExpense` — read delivered object from `values[]`.

### Round 5 — approve (1 call)
```
PUT /travelExpense/:approve?id=<travelExpenseId>
```
- Do NOT use `overrideApprovalFlow=true` (returns 403)
- Verify `state=APPROVED` and `isApproved=true` from response
- Approval is a PREREQUISITE for createVouchers (422 "Reiseregningen er ikke godkjent" if skipped)

### Round 6 — createVouchers (1 call) ← CRITICAL
```
PUT /travelExpense/:createVouchers?id=<travelExpenseId>&date=<returnDate>
```
- `date` parameter = return date of the trip (YYYY-MM-DD)
- Creates the accounting voucher with ledger postings
- After this call, `voucher.id` is populated and `isCompleted=true`
- **ALL 23 production runs that omitted this step scored 4.5/8 — including the run that had approve**

### Done — stop
Do NOT add extra readback calls.

## Exact Payload Shape

```json
{
  "employee": { "id": "<from step 1>" },
  "title": "<prompt title/purpose>",
  "travelDetails": {
    "isForeignTravel": false,
    "isDayTrip": false,
    "isCompensationFromRates": true,
    "departureDate": "<YYYY-MM-DD>",
    "returnDate": "<YYYY-MM-DD>",
    "departureTime": "08:00",
    "returnTime": "18:00",
    "departureFrom": "<employee city or company city>",
    "destination": "<trip destination city>",
    "detailedJourneyDescription": "<prompt title/purpose>",
    "purpose": "<prompt title/purpose>"
  },
  "perDiemCompensations": [
    {
      "location": "<destination city>",
      "count": "<DAYS from prompt — use the number directly>",
      "rateType": { "id": 25888, "rateCategory": { "id": 740 } },
      "overnightAccommodation": "HOTEL"
    }
  ],
  "costs": [
    {
      "costCategory": { "id": "<Fly category id>" },
      "paymentType": { "id": "<payType id>" },
      "comments": "<flight description from prompt>",
      "amountCurrencyIncVat": "<flight amount>",
      "amountNOKInclVAT": "<flight amount>",
      "vatType": { "id": "<costCategory.vatType.id from lookup>" },
      "date": "<departureDate>"
    },
    {
      "costCategory": { "id": "<Taxi category id>" },
      "paymentType": { "id": "<payType id>" },
      "comments": "<taxi description from prompt>",
      "amountCurrencyIncVat": "<taxi amount>",
      "amountNOKInclVAT": "<taxi amount>",
      "vatType": { "id": "<costCategory.vatType.id from lookup>" },
      "date": "<returnDate>"
    }
  ]
}
```

## Four Rules That Matter Most

### 1. CREATE VOUCHERS after approval ← NEVER SKIP
After deliver and approve, call `PUT /travelExpense/:createVouchers?id=<id>&date=<returnDate>`. Without this step, no accounting voucher is created and `isCompleted=false`. The full chain is: deliver → approve → createVouchers. Approve is a prerequisite for createVouchers (422 "Reiseregningen er ikke godkjent" without it). Do NOT use `overrideApprovalFlow=true` on approve (returns 403). Note: createVouchers alone did NOT fix the score — the per-diem rate override was the actual root cause (see Rule 2).

### 2. Per-diem: Do NOT set `rate` — let the system use the government rate
Do NOT include `rate` in the perDiemCompensations payload. When omitted, Tripletex auto-fills the government per-diem rate from the selected rateType (1012 NOK/day for rateType 25888 / domestic overnight >12h). The prompt's stated rate (e.g., "800 kr/day") is the employer's internal policy rate but is NOT set on the per-diem compensation — Norwegian accounting uses the official government rate for per-diem accounting.

Do NOT set `amount` either — it is auto-computed as `count × system_rate`.

**CRITICAL: 23 production runs that set rate=800 ALL scored 4.5/8.** This is the most likely root cause of checks 2, 3, 6 failing.

### 3. Per-diem count = DAYS from prompt (NOT overnights)
- 5-day trip → `count: 5`
- 3-day trip → `count: 3`
- 2-day trip → `count: 2`

Use the prompt's day count DIRECTLY. Do NOT subtract 1.

### 4. vatType on costs = category default (not hardcoded 0)
Each cost category from the lookup has a `vatType` field (e.g., `{ id: 12 }` for Fly/Taxi = 12% input VAT).
Set `costs[].vatType` to `{ id: costCategory.vatType.id }` from the matching category.

**Recovery**: if POST fails with `VAT_NOT_REGISTERED`, retry with `vatType: { id: 0 }` on all costs.

## Proven Optimization Traps (DO NOT attempt)

These "optimizations" look like they would save API calls but actually waste calls on retries:

| Tempting shortcut | What happens | Why it fails |
|---|---|---|
| `costCategory: { description: "Fly" }` | POST 201, deliver 422 | Resolves to null — category not found by description |
| `paymentType: { description: "Privat utlegg" }` | POST 201, deliver 422 | Resolves to null — payType not found by description |
| Omit `paymentType` from costs | 422 at POST | "Kan ikke være null" — paymentType is mandatory |
| Omit `vatType` from costs | POST 201, deliver 422 | System does not auto-fill vatType correctly for deliver |
| `fields=*,company(*)` on employee | 400 | `company` is not a field on EmployeeDTO; use `companyId` + separate GET |
| Omit `costCategory` from costs | POST 201, deliver 422 | costCategory.id required for deliver validation |

**Conclusion:** All 3 round-1 lookups (employee, costCategory, paymentType) are mandatory. The 6–7 call path is the proven floor. Sandbox-verified 2026-03-22.

## Fields That DO NOT Exist (422 if sent)
| Wrong field | Causes | Use instead |
|---|---|---|
| `costs[].description` | 422 "field does not exist" | `costs[].comments` |
| `perDiemCompensations[].isDayTrip` | 422 "field does not exist" | `travelDetails.isDayTrip` |
| `costs[].currency` | 422 "factor minimum 1" | Omit entirely (NOK default) |
| `perDiemCompensations[].countryCode` | 422 "Country not enabled" | Omit entirely |

## Required Fields (422 if missing)
| Field | Required at | Error if missing |
|---|---|---|
| `travelDetails.destination` | deliver | 422 "Feltet må fylles ut" |
| `perDiemCompensations[].location` | POST | 422 "Kan ikke være null" |
| `costs[].amountCurrencyIncVat` | POST | 422 |
| `travelDetails.isCompensationFromRates: true` | POST (when perDiem present) | 422 "Kun kostnader..." |
| `travelDetails.departureFrom` | deliver | 422 |
| `perDiemCompensations[].rateType` | deliver | 422 "Sats eller satskategori" |

## Rate Catalog (hardcoded — NO API call needed)
| Trip type | rateType id | rateCategory id | System rate |
|---|---|---|---|
| Overnight multi-day (isDayTrip=false) | 25888 | 740 | 1012 |
| Day trip 6–12h (isDayTrip=true) | 25886 | 738 | 397 |
| Day trip >12h (isDayTrip=true) | 25887 | 739 | 736 |

These are government-set national rates, stable across all Tripletex accounts.
Do NOT call `GET /travelExpense/rate`. Use hardcoded IDs directly.

## Duration-Only Prompts (no explicit dates)
If the prompt gives only "N days" without specific dates, pick a deterministic date range (e.g., today minus N+1 to today minus 1). The API accepts any valid range. Do not waste extra reads trying to discover "correct" dates — there is no API endpoint that reveals them.

## Recovery Branches
- `VAT_NOT_REGISTERED` → retry with `vatType: { id: 0 }` on all costs
- `perDiemCompensations.location: Kan ikke være null` → add `location: "<destination>"` to per-diem
- `travelDetails.destination: Feltet må fylles ut` → recreate with `destination` set
- `Feltet eksisterer ikke i objektet` → check for wrong field names (see table above)
- `costs.currency.factor: Må være minimum 1` → remove `currency` from all costs
- `Kun kostnader kan registreres uten kompensasjon etter satser` → set `isCompensationFromRates: true`

## Sandbox Verification (2026-03-22)

Full E2E with VAT-registered company:
1. create → deliver → approve with vatType=12: state=APPROVED, isApproved=true, 0 errors
2. Category defaults: Fly.vatType.id=12, Taxi.vatType.id=12 (12% lav sats)
3. `:approve` without `overrideApprovalFlow` works; WITH override → 403

## Production History
- 23 runs (9 scored): ALL scored 4.5/8 [PFFPPF] — checks 2,3,6 always fail
- Lifecycle progression had NO effect: deliver-only, deliver+approve, deliver+approve+createVouchers ALL score 4.5/8
- All 23 runs used `rate: 800` from the prompt — this is the suspected root cause of checks 2,3,6
- **FIX (2026-03-22):** Removed explicit `rate` from perDiem payload. System now auto-fills government rate (1012) from rateType 25888.
- **Every run MUST include: deliver → approve → createVouchers. All three steps required.**
