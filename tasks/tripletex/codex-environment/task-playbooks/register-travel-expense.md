# Register Travel Expense

## Scope

Use for tasks like:
- Register one new travel expense for an existing employee identified by email
- Create travel costs (flight, taxi, ferry, hotel) with per-diem compensation
- Prompt gives explicit or inferable travel dates

Do not use for:
- Mileage allowance, accommodation allowance, attachments
- Standalone approval or delivery of an existing travel expense
- Project-linked or reinvoiced travel expenses

## The Correct Flow (6 calls, 0 errors)

### Round 1 — parallel (3 calls)
```
GET /employee?email=<email>&count=10&fields=*
GET /travelExpense/costCategory?count=1000&fields=*
GET /travelExpense/paymentType?count=1000&fields=*
```
- Filter employee by exact email; prefer `allowInformationRegistration=true` if multiple hits
- Filter categories/payTypes locally on `showOnTravelExpenses=true`
- Match `Fly` for airfare, `Taxi` for taxi (exact `description` match)

### Round 2 — conditional (0 or 1 call)
Only if employee has `address=null` AND prompt omits `departureFrom`:
```
GET /company/{employee.companyId}?fields=*,address(*)
```
- Use `company.address.city` as `departureFrom`
- `fields=*` alone leaves address as link-only — you MUST use `fields=*,address(*)`
- If both employee and company lack a city → run is **blocked**, do NOT invent placeholders

### Round 3 — create (1 call)
```
POST /travelExpense
```

### Round 4 — deliver (1 call)
```
PUT /travelExpense/:deliver?id=<id>
```
- Response: `ListResponseTravelExpense` — read from `values[]`
- Verify `state=DELIVERED`

### Done — stop. No extra readback calls needed.

**Call counts:**
- 6 calls when employee has no address
- 5 calls when employee has address
- 4 calls when employee has address AND prompt provides departureFrom

## Exact Payload Shape

```json
{
  "employee": { "id": "<from lookup>" },
  "title": "<prompt title>",
  "travelDetails": {
    "isForeignTravel": false,
    "isDayTrip": false,
    "isCompensationFromRates": true,
    "departureDate": "2026-03-17",
    "returnDate": "2026-03-21",
    "departureTime": "08:00",
    "returnTime": "18:00",
    "departureFrom": "Oslo",
    "destination": "Trondheim",
    "detailedJourneyDescription": "<prompt title>",
    "purpose": "<prompt title>"
  },
  "perDiemCompensations": [
    {
      "location": "Trondheim",
      "count": 4,
      "rateType": { "id": 25888, "rateCategory": { "id": 740 } },
      "overnightAccommodation": "HOTEL"
    }
  ],
  "costs": [
    {
      "costCategory": { "id": "<Fly cat id>" },
      "paymentType": { "id": "<payType id>" },
      "comments": "flight",
      "amountCurrencyIncVat": 2850,
      "amountNOKInclVAT": 2850,
      "vatType": { "id": "<costCategory.vatType.id>" },
      "date": "2026-03-17"
    },
    {
      "costCategory": { "id": "<Taxi cat id>" },
      "paymentType": { "id": "<payType id>" },
      "comments": "taxi",
      "amountCurrencyIncVat": 200,
      "amountNOKInclVAT": 200,
      "vatType": { "id": "<costCategory.vatType.id>" },
      "date": "2026-03-21"
    }
  ]
}
```

**This example is for a 5-day trip (Mar 17–21) to Trondheim.**
- `count: 4` = overnights (5 days minus 1)
- NO `rate` or `amount` on per-diem — system fills rate=1012, amount=4048
- `vatType` from category lookup (typically id=12 for Fly/Taxi on production companies)

## Three Critical Rules

### Rule 1: DO NOT set `rate` or `amount` on perDiemCompensations

The prompt says "dagssats 800 kr" or "daily rate 800 NOK". **IGNORE THIS NUMBER.**

Leave `rate` and `amount` completely off the per-diem object. Tripletex auto-fills:
- rate = 1012 (government rate for overnight domestic, rateType 25888)
- amount = count × 1012

**Why this matters:** 21 production runs all used rate=800 and ALL scored 4.5/8 (checks 2,3,6 failed). The prompt's "800" is the employer's internal budget number, NOT the Tripletex per-diem rate.

### Rule 2: count = overnights = days minus 1

| Prompt says | count value |
|---|---|
| "5-day trip" | 4 |
| "4-day trip" | 3 |
| "3-day trip" | 2 |
| "2-day trip" | 1 |

Never use the prompt's day number directly. Always subtract 1.

### Rule 3: vatType on costs from category lookup

```javascript
// After GET /travelExpense/costCategory
const flyCat = categories.find(c => c.description === "Fly");
// Use flyCat.vatType.id (typically 12) on the cost row
cost.vatType = { id: flyCat.vatType.id };
```

If POST fails with `VAT_NOT_REGISTERED` → retry with `vatType: { id: 0 }`.

## Why You Cannot Reduce Below 5–6 Calls

All 3 round-1 lookups are mandatory. Sandbox-verified 2026-03-22:

| Tempting shortcut | Outcome |
|---|---|
| `costCategory: { description: "Fly" }` instead of `{ id }` | POST 201 but resolves to null → deliver 422 |
| `paymentType: { description: "Privat utlegg" }` instead of `{ id }` | POST 201 but resolves to null → deliver 422 |
| Omit `paymentType` entirely | 422 "Kan ikke være null" |
| Omit `vatType` entirely | POST 201 but deliver 422 |
| `fields=*,company(*)` on employee | 400 — `company` is not an expandable field |
| Omit `costCategory` entirely | POST 201 but deliver 422 |

**The 5–6 call path is the proven floor.** Do not try to optimize further.

## Fields That Cause 422 If Sent

| DO NOT send | Error | Use instead |
|---|---|---|
| `costs[].description` | "field does not exist" | `costs[].comments` |
| `perDiemCompensations[].isDayTrip` | "field does not exist" | `travelDetails.isDayTrip` |
| `costs[].currency` | "factor minimum 1" | Omit entirely (NOK is default) |
| `perDiemCompensations[].countryCode` | "Country not enabled" | Omit entirely |
| `perDiemCompensations[].rate` | Causes wrong score | Omit entirely |
| `perDiemCompensations[].amount` | Causes wrong score | Omit entirely |
| `costs[].category` | Silently ignored | Use `costCategory` (object ref) |
| `department` | Usually unnecessary | Tripletex inherits from employee |

## Required Fields

| Field | When | What happens if missing |
|---|---|---|
| `travelDetails.destination` | POST (for deliver) | deliver 422 "Feltet må fylles ut" |
| `perDiemCompensations[].location` | POST | 422 "Kan ikke være null" |
| `costs[].amountCurrencyIncVat` | POST | 422 |
| `travelDetails.isCompensationFromRates` | POST (when perDiem) | 422 "Kun kostnader..." |
| `travelDetails.departureFrom` | POST (for deliver) | deliver 422 |
| `perDiemCompensations[].rateType` | POST (for deliver) | deliver 422 |
| `perDiemCompensations[].overnightAccommodation` | POST (for deliver) | Set to "HOTEL" |
| `travelDetails.isForeignTravel` | POST | Set to false (domestic) |

## Rate Catalog (hardcoded — never call GET /travelExpense/rate)

| Trip type | rateType | rateCategory | System rate (auto-filled) |
|---|---|---|---|
| **Overnight multi-day** | 25888 | 740 | 1012 |
| Day trip 6–12h | 25886 | 738 | 397 |
| Day trip >12h | 25887 | 739 | 736 |

Government-set national rates, stable across all accounts. Verified sandbox + production 2026-03-21/22.

**Selection rule:** If trip is >= 2 days → use 25888/740 (overnight). Always.

## Duration-Only Prompts

If the prompt gives "N days" without specific dates:
1. Pick a deterministic date range (e.g., recent past dates spanning N days)
2. Continue with the normal 6-call flow
3. Do NOT waste extra reads trying to find "correct" dates — the API accepts any valid range

## Recovery Branches

| Error | Fix |
|---|---|
| `VAT_NOT_REGISTERED` | Retry with `vatType: { id: 0 }` on all costs |
| `perDiemCompensations.location: Kan ikke være null` | Add `location: "<destination>"` |
| `travelDetails.destination: Feltet må fylles ut` | Recreate with `destination` set |
| `Feltet eksisterer ikke i objektet` | Wrong field name — check table above |
| `costs.currency.factor: Må være minimum 1` | Remove `currency` from all costs |
| `Kun kostnader kan registreres uten kompensasjon etter satser` | Set `isCompensationFromRates: true` |

## Sandbox Verification (2026-03-22)

Clean end-to-end test: 6-call path, 0 errors, all assertions pass, state=DELIVERED.
- Per-diem readback: count=4, rate=1012 (system-filled), amount=4048
- Costs: flight=2850, taxi=200, both with correct categories
- DELETE /travelExpense/{id} works on both OPEN and DELIVERED for sandbox reset

## Production Confirmation (2026-03-22, Spanish prompt)
Run prod-2026-03-22-022922296Z-b1317762: 6 calls, 0 errors, state=DELIVERED.
Employee had no address → company city (Oslo) used as departureFrom.
vatType=12 from category lookup worked (production accounts are VAT-registered).
Per-diem: count=4, no rate/amount set. Costs: flight=4700, taxi=550.
