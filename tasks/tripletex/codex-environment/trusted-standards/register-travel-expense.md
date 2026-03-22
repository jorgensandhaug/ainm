# Register Travel Expense

## Trust Level
- Trusted standard — use directly, skip `./openapi.json` re-checking

## Exact Match
- Register one new travel expense for one existing employee (identified by email)
- Prompt provides cost lines (flight, taxi, etc.) and per-diem allowance
- No attachment, approval, mileage, accommodation allowance, project linking, update, or delete

## Standard Flow (6 calls max, 0 errors)

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

### Done — stop
Verify `state=DELIVERED` from deliver response. Do NOT add extra readback calls.

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
      "rate": "<rate from prompt (e.g. 800)>",
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

## Three Rules That Matter Most

### 1. Per-diem: USE the prompt's rate and day count directly
Set `rate` to the prompt's stated per-diem rate (e.g., 800). Set `count` to the prompt's stated number of days (e.g., 5 for "5 days"). Do NOT set `amount` — it is auto-computed as `count × rate`.

| Prompt says | count | rate | amount (auto) |
|---|---|---|---|
| "5 days, daily rate 800" | 5 | 800 | 4000 |
| "3 days, dagssats 800" | 3 | 800 | 2400 |
| "2 days, tarifa diaria 800" | 2 | 800 | 1600 |

**CRITICAL — disproven hypotheses:**
- **Rate omission (system rate 1012)**: 22 production runs tried count=4 — 21 with rate=800 and 1 with rate omitted (system fills 1012). ALL scored 4.5/8 with the same 3 checks failing. Rate was never the discriminator.
- **count = days minus 1 (overnights)**: ALL 22 runs used count=days-1. This was constant across every run that scored 4.5/8. count=days (from prompt) is the strongest untested hypothesis. Sandbox-verified 2026-03-22: count=5 + rate=800 → DELIVERED, amount=4000.

### 2. Per-diem count = DAYS from prompt (NOT overnights)
- 5-day trip → `count: 5`
- 3-day trip → `count: 3`
- 2-day trip → `count: 2`

Use the prompt's day count DIRECTLY. Do NOT subtract 1.

### 3. vatType on costs = category default (not hardcoded 0)
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

**Conclusion:** All 3 round-1 lookups (employee, costCategory, paymentType) are mandatory. The 5–6 call path is the proven floor. Sandbox-verified 2026-03-22.

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
Two clean E2E sandbox tests:
1. count=4, no rate (system fills 1012): DELIVERED, amount=4048 — proves API mechanics
2. count=5, rate=800: DELIVERED, amount=4000 — proves the new hypothesis is API-valid

Optimization traps verified: costCategory/paymentType by description → null, deliver 422. See "Proven Optimization Traps" section.
DELETE /travelExpense/{id} works on both OPEN and DELIVERED for sandbox reset.

## Production History (all scored 4.5/8 with count=4)
- 21 prior runs: count=4, rate=800 → 4.5/8 (checks 2,3,6 fail)
- prod-2026-03-22-022922296Z-b1317762 (Spanish): count=4, no rate (system fills 1012) → 4.5/8 (same 3 checks fail)
- **Conclusion**: rate was never the root cause. count=4 (constant across all 22 runs) is the strongest suspect. count=5 + rate=800 is the untested fix.
