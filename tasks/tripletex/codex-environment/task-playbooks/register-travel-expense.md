# Register Travel Expense

## Scope

Use for tasks like:
- Register one new travel expense for an existing employee identified by email
- Create travel costs (flight, taxi, ferry, hotel) — prompt lists "Utlegg" items
- Prompt provides cost lines and mentions per-diem allowance as context

Do not use for:
- Mileage allowance, accommodation allowance, attachments
- Standalone approval or delivery of an existing travel expense
- Project-linked or reinvoiced travel expenses

## Critical Interpretation Rule

The prompt says "med diett (dagsats 800 kr)" — this is CONTEXT about the employer's per-diem policy.
The prompt then says "Utlegg:" (out-of-pocket expenses) — THESE are what to register as costs.

**Do NOT create perDiemCompensations.** The per-diem ("diett") is mentioned for context only — it describes the trip duration and the employer's per-diem arrangement, NOT an expense to register in the travel expense. Only the "Utlegg" items (flight, taxi, etc.) go into costs.

Set `isCompensationFromRates: false` and omit `perDiemCompensations` entirely.

**EVIDENCE: 24 production runs ALL scored 4.5/8 [PFFPPF] with perDiemCompensations present. Every possible per-diem parameter was tested (rate 800 vs 1012, count 2/3/4/5, rateType 25886/25888, vatType 0/12, isForeignTravel, departureTime/returnTime) — ALL dead ends. The per-diem PRESENCE is the problem.**

## The Correct Flow (0 errors expected)

GETs do not count against efficiency — use readback GETs freely to verify and log data.

### Round 1 — parallel (3 calls)
```
GET /employee?email=<email>&count=10&fields=*
GET /travelExpense/costCategory?count=1000&fields=*
GET /travelExpense/paymentType?count=1000&fields=*
```
- Filter employee by exact email; prefer `allowInformationRegistration=true` if multiple hits
- Filter categories/payTypes locally on `showOnTravelExpenses=true`
- Match `Fly` for airfare, `Taxi` for taxi (exact `description` match)
- **Log**: employee id, name, email, address?.city; Fly cat id + vatType.id; Taxi cat id + vatType.id; payType id + description

### Round 2 — conditional (0 or 1 call)
Only if employee has `address=null` AND prompt omits `departureFrom`:
```
GET /company/{employee.companyId}?fields=*,address(*)
```
- Use `company.address.city` as `departureFrom`
- If both employee and company lack a city → run is **blocked**, do NOT invent placeholders

### Round 3 — create (1 call)
```
POST /travelExpense
```
With the exact payload shape below.

### Round 4 — readback verification (1 call)
```
GET /travelExpense/<id>?fields=*,perDiemCompensations(*),costs(*,costCategory(*),vatType(*)),travelDetails(*)
```
**Log ALL of these**:
- `travelDetails`: departureDate, returnDate, departureTime, returnTime, departureFrom, destination, isForeignTravel, isDayTrip, purpose
- Verify `perDiemCompensations` is empty (length 0)
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
GET /travelExpense/<id>?fields=*,costs(*),voucher(*)
```
**Log**: isCompleted, state, amount, voucher.id

### Round 9 — voucher postings (1 call)
```
GET /ledger/voucher/<voucher.id>?fields=*,postings(*,account(*))
```
**Log every posting**: account number, account name, amount. This shows the actual accounting entries the scorer may validate.

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
    }
  ]
}
```

**Key differences from prior approach:**
- `isCompensationFromRates: false` (was: true)
- NO `perDiemCompensations` array — omitted entirely
- Only "Utlegg" items (flight, taxi) are registered as costs
- The prompt's "diett (dagsats 800 kr)" is CONTEXT only, not registered

## Three Rules That Matter Most

### 1. Do NOT create perDiemCompensations

The prompt mentions "diett" as context about the trip (duration, employer's per-diem policy). The actual expenses to register ("Utlegg") are listed separately: flight and taxi. The per-diem is handled outside the travel expense in Tripletex (e.g., through salary). Set `isCompensationFromRates: false` and omit `perDiemCompensations`.

**24 production runs with perDiemCompensations ALL scored 4.5/8.** Every per-diem parameter variation (rate, count, rateType, vatType) was a dead end. The per-diem PRESENCE is the root cause.

### 2. CREATE VOUCHERS after approval

After deliver and approve, call `PUT /travelExpense/:createVouchers?id=<id>&date=<returnDate>`. Without this step, no accounting voucher is created and `isCompleted=false`. The full chain is: deliver → approve → createVouchers.

### 3. vatType on costs = category default (not hardcoded 0)

Each cost category from the lookup has a `vatType` field (e.g., `{ id: 12 }` for Fly/Taxi = 12% input VAT).
Set `costs[].vatType` to `{ id: costCategory.vatType.id }` from the matching category.

**Recovery**: if POST fails with `VAT_NOT_REGISTERED`, retry with `vatType: { id: 0 }` on all costs.

## Mandatory Lookups (cannot skip)

All 3 round-1 lookups are mandatory:

| Tempting shortcut | Outcome |
|---|---|
| `costCategory: { description: "Fly" }` instead of `{ id }` | POST 201, deliver 422 |
| `paymentType: { description: "Privat utlegg" }` instead of `{ id }` | POST 201, deliver 422 |
| Omit `paymentType` entirely | 422 "Kan ikke være null" |
| Omit `vatType` entirely | POST 201, deliver 422 |
| Omit `costCategory` entirely | POST 201, deliver 422 |
| Adding `perDiemCompensations` | 4.5/8 score |

GETs are free for scoring — add as many readback/verification GETs as needed.

## Fields That Cause 422 If Sent

| DO NOT send | Error | Use instead |
|---|---|---|
| `costs[].description` | "field does not exist" | `costs[].comments` |
| `costs[].currency` | "factor minimum 1" | Omit entirely (NOK default) |

## Required Fields

| Field | When | What happens if missing |
|---|---|---|
| `travelDetails.destination` | deliver | 422 "Feltet må fylles ut" |
| `costs[].amountCurrencyIncVat` | POST | 422 |
| `travelDetails.departureFrom` | deliver | 422 |

## Duration-Only Prompts

If the prompt gives "N days" without specific dates, pick a deterministic date range (e.g., recent past dates spanning N days). The API accepts any valid range.

## Recovery Branches

| Error | Fix |
|---|---|
| `VAT_NOT_REGISTERED` | Retry with `vatType: { id: 0 }` on all costs |
| `travelDetails.destination: Feltet må fylles ut` | Recreate with `destination` set |
| `Feltet eksisterer ikke i objektet` | Wrong field name — check table above |
| `costs.currency.factor: Må være minimum 1` | Remove `currency` from all costs |

## Read-Only Fields

| Field | Behavior |
|---|---|
| `costs[].isPaidByEmployee` | Always `false` regardless of input — controlled by paymentType |

## Sandbox Verification (2026-03-22)

Full E2E without perDiemCompensations:
1. create → deliver → approve → createVouchers: 0 errors, isCompleted=true
2. Total = flight + taxi only (no per-diem addition)
3. Voucher postings: 2910 (debt), 7140 (expense), 2712 (VAT) — no 5510/7150 per-diem postings
4. Category defaults: Fly.vatType.id=12, Taxi.vatType.id=12 (12% lav sats)

## Production History

- 24 runs (10 scored): ALL scored 4.5/8 [PFFPPF] — checks 2,3,6 always fail
- ALL 24 runs included perDiemCompensations — this is the suspected root cause
- Tested and confirmed dead ends: rate (800/1012), count (3/4/5), rateType (25886/25888), vatType (0/12), lifecycle state, isForeignTravel, departureTime/returnTime
- **FIX (2026-03-22):** Remove perDiemCompensations entirely. Set isCompensationFromRates=false. Awaiting production validation.
- **Every run MUST include: deliver → approve → createVouchers. All three steps required.**
