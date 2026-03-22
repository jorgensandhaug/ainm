# Register Travel Expense

## Trust Level
- Trusted standard — use directly, skip `./openapi.json` re-checking

## Exact Match
- Register one new travel expense for one existing employee (identified by email)
- Prompt provides cost lines (flight, taxi, etc.) and mentions per-diem allowance
- No attachment, approval, mileage, accommodation allowance, project linking, update, or delete

## Critical Per-Diem Rule — COST-LINE APPROACH (PRIMARY)

**STATUS: perDiemCompensations approach DISPROVEN.** 26 production runs (24 count=days + 1 count=overnights + 1 no-perDiem) ALL scored 1.125/4. The root cause is structural: `perDiemCompensations` with auto-rate 1012 is the wrong approach entirely.

The prompt says "Diett: dagssats 800 kr" — this means: register the per-diem as a **cost line** at the prompt-specified rate (800 kr/day), NOT via the `perDiemCompensations` array.

**NEW APPROACH (untested in production, sandbox-verified 2026-03-22):**
1. Set `isCompensationFromRates: false`
2. Do NOT include `perDiemCompensations` array at all (422 "Kun kostnader kan registreres uten kompensasjon etter satser" if you do)
3. Add diett as a **cost line** using the `"Mat"` cost category (account 7160 "Diettkostnad, ikke oppgavepliktig")
4. Amount = prompt daily rate × travel days (e.g., 800 × 4 = 3200)
5. `vatType: { id: 0 }` (Mat category has vatType=0, isVatLocked=true)

**Why cost-line, not perDiemCompensations:**
- `perDiemCompensations` auto-fills rate=1012 (government rate) — CANNOT be set to 800
- `isCompensationFromRates: false` + `perDiemCompensations` → 422 error (API rejects this combination)
- The ONLY way to honor the prompt's "dagssats 800 kr" is as an explicit cost line
- "Mat" category posts to account 7160 "Diettkostnad, ikke oppgavepliktig" (correct diet account)
- Sandbox-verified 2026-03-22: full E2E with Mat cost line → isCompleted=true, voucher with 7160 posting

**DISPROVEN APPROACHES (do NOT use):**
- `perDiemCompensations` with count=days (24 runs, all 1.125/4)
- `perDiemCompensations` with count=overnights (1 run, still 1.125/4)
- No perDiemCompensations, no diett cost (1 run, unscored)
- `isCompensationFromRates: false` + perDiemCompensations (422 error)
- Explicit rate=800 on perDiemCompensations (422 error)

## Standard Flow (0 errors expected)

GETs do not count against efficiency — use readback GETs freely to verify and log data.

### Round 1 — parallel (3 calls)
```
GET /employee?email=<email>&count=10&fields=*
GET /travelExpense/costCategory?count=1000&fields=*
GET /travelExpense/paymentType?count=1000&fields=*
```
- Filter employee by exact email match; prefer `allowInformationRegistration=true` if multiple
- Filter categories/payTypes locally on `showOnTravelExpenses=true`
- Match cost categories by exact `description` to the prompt's "Utlegg:" items (e.g., `Fly` for flight, `Taxi` for taxi, `Ferge` for ferry, `Hotell` for hotel, `Tog` for train)
- Also find the `"Mat"` category for the diett cost line
- **No rate lookup needed** — we use cost-line approach, not perDiemCompensations
- **Log**: employee id, name, email, address city; matched cost category ids + vatType.ids; payType id; Mat category id

### Round 2 — conditional (0 or 1 call)
Only if employee has `address=null` AND prompt omits `departureFrom`:
```
GET /company/{employee.companyId}?fields=*,address(*)
```
Use `company.address.city` as `departureFrom`. If both employee and company lack a city, the run is **blocked** — do NOT invent placeholders.

### Round 3 — create (1 call)
```
POST /travelExpense
```
With the exact payload shape below.

### Round 4 — readback verification (1 call)
```
GET /travelExpense/<id>?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*,costCategory(*),vatType(*)),travelDetails(*)
```
**Log ALL of these**:
- `travelDetails`: departureDate, returnDate, departureTime, returnTime, departureFrom, destination, isForeignTravel, isDayTrip, isCompensationFromRates, purpose
- `perDiemCompensations[0]`: count, rate, amount, rateType.id, rateType.rate, overnightAccommodation, location
- Each cost: costCategory.description, amountCurrencyIncVat, amountNOKInclVAT, vatType.id, vatType.percentage, comments, date, isPaidByEmployee
- Top-level: amount, paymentAmount, state, title

### Round 5 — deliver (1 call)
```
PUT /travelExpense/:deliver?id=<travelExpenseId>
```
Response is `ListResponseTravelExpense` — read delivered object from `values[]`.

### Round 6 — approve (1 call)
```
PUT /travelExpense/:approve?id=<travelExpenseId>
```
- Do NOT use `overrideApprovalFlow=true` (returns 403)
- Verify `state=APPROVED` and `isApproved=true` from response
- Approval is a PREREQUISITE for createVouchers (422 "Reiseregningen er ikke godkjent" if skipped)

### Round 7 — createVouchers (1 call)
```
PUT /travelExpense/:createVouchers?id=<travelExpenseId>&date=<returnDate>
```
- `date` parameter = return date of the trip (YYYY-MM-DD)
- Creates the accounting voucher with ledger postings
- After this call, `voucher.id` is populated and `isCompleted=true`

### Round 8 — final readback with voucher (1 call)
```
GET /travelExpense/<id>?fields=*,perDiemCompensations(*),costs(*),voucher(*)
```
**Log**: isCompleted, state, amount, voucher.id, perDiemCompensations[0].count/rate/amount

### Round 9 — voucher postings (1 call)
```
GET /ledger/voucher/<voucher.id>?fields=*,postings(*,account(*))
```
**Log every posting**: account number, account name, amount. Expected postings (cost-line approach):
- 2910 (debt to employee, negative total)
- 7140 (expense net, one per Fly/Taxi cost line)
- 2712 (input VAT 12%, one per Fly/Taxi cost line)
- 7160 (Diettkostnad, ikke oppgavepliktig — diett cost line, no VAT)

### Done — stop.

## Exact Payload Shape

```json
{
  "employee": { "id": "<from step 1>" },
  "title": "<prompt title/purpose>",
  "travelDetails": {
    "isForeignTravel": false,
    "isDayTrip": false,
    "isCompensationFromRates": false,
    "departureDate": "<YYYY-MM-DD>",
    "returnDate": "<YYYY-MM-DD>",
    "departureTime": "08:00",
    "returnTime": "18:00",
    "departureFrom": "<employee city or company city>",
    "destination": "<trip destination city>",
    "detailedJourneyDescription": "<prompt title/purpose>",
    "purpose": "<prompt title/purpose>"
  },
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
    },
    {
      "costCategory": { "id": "<Mat category id>" },
      "paymentType": { "id": "<payType id>" },
      "comments": "Diett <N> dagar x <rate> kr",
      "amountCurrencyIncVat": "<rate × days>",
      "amountNOKInclVAT": "<rate × days>",
      "vatType": { "id": 0 },
      "date": "<returnDate>"
    }
  ]
}
```

**Key points:**
- `isCompensationFromRates: false` — we are NOT using government per-diem rates
- **NO `perDiemCompensations` array** — diett goes as a cost line on "Mat" category
- Mat category → account 7160 "Diettkostnad, ikke oppgavepliktig"
- Diett amount = prompt daily rate × travel days (e.g., 800 × 4 = 3200)
- `vatType: { id: 0 }` on diett cost (Mat category has vatType=0, isVatLocked=true)

## Three Rules That Matter Most

### 1. Diett as cost line on "Mat" category ← ROOT CAUSE FIX
The prompt's "dagssats 800 kr" is the ACTUAL rate to use. Register it as a cost line on the "Mat" category with `amountCurrencyIncVat = rate × days`. Do NOT use `perDiemCompensations` (auto-fills to government rate 1012, ignoring the prompt rate).

**26 production runs with perDiemCompensations ALL scored 1.125/4.** The perDiemCompensations approach is DISPROVEN — the issue is structural, not parametric.

**API constraint proven 2026-03-22:** `isCompensationFromRates: false` + `perDiemCompensations` → 422 "Kun kostnader kan registreres uten kompensasjon etter satser". The cost-line approach is the ONLY way to honor the prompt rate.

### 2. CREATE VOUCHERS after approval ← NEVER SKIP
After deliver and approve, call `PUT /travelExpense/:createVouchers?id=<id>&date=<returnDate>`. Without this step, no accounting voucher is created and `isCompleted=false`. The full chain is: deliver → approve → createVouchers.

### 3. vatType on costs = category default (not hardcoded 0)
Each cost category from the lookup has a `vatType` field (e.g., `{ id: 12 }` for Fly/Taxi = 12% input VAT).
Set `costs[].vatType` to `{ id: costCategory.vatType.id }` from the matching category.
Exception: Mat category has `vatType: { id: 0 }`, `isVatLocked: true` — always use `{ id: 0 }`.

**Recovery**: if POST fails with `VAT_NOT_REGISTERED`, retry with `vatType: { id: 0 }` on all costs.

## Proven Optimization Traps (DO NOT attempt)

| Tempting shortcut | What happens | Why it fails |
|---|---|---|
| `costCategory: { description: "Fly" }` | POST 201, deliver 422 | Resolves to null — category not found by description |
| `paymentType: { description: "Privat utlegg" }` | POST 201, deliver 422 | Resolves to null — payType not found by description |
| Omit `paymentType` from costs | 422 at POST | "Kan ikke være null" — paymentType is mandatory |
| Omit `vatType` from costs | POST 201, deliver 422 | System does not auto-fill vatType correctly for deliver |
| Omit `costCategory` from costs | POST 201, deliver 422 | costCategory.id required for deliver validation |
| `perDiemCompensations` with auto-rate | 1.125/4 score | 26 production runs ALL scored 1.125/4 — approach is structurally wrong |
| `isCompensationFromRates=false` + perDiemCompensations | 422 error | "Kun kostnader kan registreres uten kompensasjon etter satser" |
| Explicit rate=800 on perDiemCompensations | 422 error | Cannot set custom rate with rate-based compensation |

**Conclusion:** All 3 round-1 lookups (employee, costCategory, paymentType) are mandatory. GETs do not count against efficiency.

## Fields That DO NOT Exist (422 if sent)
| Wrong field | Causes | Use instead |
|---|---|---|
| `costs[].description` | 422 "field does not exist" | `costs[].comments` |
| `costs[].currency` | 422 "factor minimum 1" | Omit entirely (NOK default) |

## Required Fields (422 if missing)
| Field | Required at | Error if missing |
|---|---|---|
| `travelDetails.destination` | deliver | 422 "Feltet må fylles ut" |
| `costs[].amountCurrencyIncVat` | POST | 422 |
| `travelDetails.departureFrom` | deliver | 422 |

## Duration-Only Prompts (no explicit dates)
If the prompt gives only "N days" without specific dates, pick a deterministic date range (e.g., recent past dates spanning N days). The API accepts any valid range.

## Recovery Branches
- `VAT_NOT_REGISTERED` → retry with `vatType: { id: 0 }` on all costs
- `travelDetails.destination: Feltet må fylles ut` → recreate with `destination` set
- `Feltet eksisterer ikke i objektet` → check for wrong field names (see table above)
- `costs.currency.factor: Må være minimum 1` → remove `currency` from all costs

## Sandbox Verification (2026-03-22)

### Cost-line approach (PRIMARY — untested in production):
1. 4-day trip (Apr 15-18), Mat cost 3200 (800×4), Fly 3600, Taxi 250 → total=7050
2. create → deliver → approve → createVouchers: 0 errors, isCompleted=true
3. Voucher postings: 2910 (-7050), 7140+2712 (fly 3214.29+385.71), 7160 (diett 3200), 7140+2712 (taxi 223.21+26.79)
4. Account 7160 = "Diettkostnad, ikke oppgavepliktig" — correct diet expense account

### API constraint verified:
- `isCompensationFromRates: false` + `perDiemCompensations` → 422 "Kun kostnader kan registreres uten kompensasjon etter satser"
- This proves: you CANNOT set rate=800 via perDiemCompensations. Cost-line is the ONLY path.

### perDiemCompensations approach (DISPROVEN — do not use):
- count=overnights (days-1): works E2E, but scored 1.125/4 in production
- count=days: works E2E, but scored 1.125/4 in 24 production runs
- Auto-rate always fills 1012, ignoring prompt's 800

## Production History
- 24 runs with perDiemCompensations + count=days: ALL scored 1.125/4 — checks 2,3,6 always fail
- **25th run (7f72daa6, 2026-03-22):** No-perDiem approach. 0 errors, 4 writes, isCompleted=true. Scoring pipeline failed (no_change_detected). Unscored.
- **26th run (07918ee7, 2026-03-22):** FIRST with count=overnights. 0 errors, 4 writes. Score: **1.125/4 (UNCHANGED)**. count=overnights hypothesis **DISPROVEN**.
- **ROOT CAUSE IDENTIFIED 2026-03-22:** All 26 runs used `perDiemCompensations` (or no diett at all). The prompt's "dagssats 800 kr" cannot be expressed via perDiemCompensations (API constraint: isCompensationFromRates=false + perDiemCompensations → 422). Cost-line on "Mat" category is the only way to honor the prompt rate.
- **Next run MUST use:** `isCompensationFromRates: false`, NO perDiemCompensations, diett as cost line on "Mat" category with amount = rate × days.
- **Every run MUST include: deliver → approve → createVouchers. All three steps required.**
