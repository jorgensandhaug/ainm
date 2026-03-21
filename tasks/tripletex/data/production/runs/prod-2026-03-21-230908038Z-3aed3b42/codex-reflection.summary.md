# Codex Reflection — Run 3aed3b42

## Task

Register a travel expense for Astrid Larsen (astrid.larsen@example.org) for "Konferanse Ålesund". 4-day trip with per-diem (daily rate 800 kr). Expenses: flight 6750 kr and taxi 500 kr. Duration-only prompt (no explicit dates), Norwegian language.

## Reflection

### What went well
- Correctly identified as a trusted-standard match and read the standard first
- Used correct per-diem count formula: 4 days → 3 overnights (count=3, rate=800, amount=2400) — this was the #1 scoring issue in prior runs
- Used correct hardcoded rateType 25888/740 (overnight)
- Used company address fallback correctly (employee had `address=null`, companyId exposed → `departureFrom=Oslo`)
- Final state was correct: `DELIVERED`, 2 costs, 1 per-diem, rateType 25888/740

### What went poorly
- **3 avoidable 422 errors** before successful POST:
  1. `perDiemCompensations[].isDayTrip` — field doesn't exist on that object; belongs on `travelDetails` only
  2. `costs[].currency: { code: "NOK" }` without `factor` — causes 422 `currency.factor: Må være minimum 1`; NOK is default, should omit entirely
  3. `perDiemCompensations[].location` missing — required at POST time (422 `Kan ikke være null`)
- Each retry re-executed all 4 GET calls, massively inflating total call count
- The winning payload example in the playbook already showed the correct fields (including `location`, without `isDayTrip` on perDiem, without `currency`), but the agent wrote the script from partial memory instead of following the example

## Call Efficiency

**The run was NOT minimal-call.**

| Metric | Actual | Optimal |
|--------|--------|---------|
| Total API calls | ~17 (4 runs × ~4 GETs + POSTs + deliver) | 6 |
| Errors | 3 | 0 |
| Successful calls | 6 | 6 |

### Wasted calls
- **~11 extra calls**: Each of the 3 failed POST attempts re-ran the 3 parallel GETs + 1 company GET before trying again = 3 × 4 = 12 wasted GETs + 3 wasted POSTs = 15 wasted calls total

### Optimal 6-call path (no-address employee)
1. **Round 1 (parallel, 3 calls):** `GET /employee?email=...&fields=*` + `GET /travelExpense/costCategory?count=1000&fields=*` + `GET /travelExpense/paymentType?count=1000&fields=*`
2. **Round 2 (1 call):** `GET /company/{companyId}?fields=*,address(*)` (only if employee has no address)
3. **Round 3 (1 call):** `POST /travelExpense` with embedded costs + perDiemCompensations
4. **Round 4 (1 call):** `PUT /travelExpense/:deliver?id=...`

## Root Causes

1. **`isDayTrip` on perDiemCompensations**: Agent hallucinated this field onto the wrong object. The trusted standard's winning payload example clearly shows `isDayTrip` only on `travelDetails`. This was already a known trap (documented in the e103a5b5 run reflection) but the agent didn't follow the example payload.

2. **`currency` on costs**: Agent added `currency: { code: "NOK" }` thinking it was helpful, but the Tripletex API requires `currency.factor` to be ≥ 1 when currency is present. Since NOK is the default currency, the field should simply be omitted. The winning payload example doesn't include `currency`.

3. **`location` on perDiemCompensations**: Required field that was already in the winning payload example (`"location": "Bergen"`) but the agent omitted it. This was also discovered in the e103a5b5 run but the agent didn't follow the documented fix.

**Common root cause**: The agent wrote the POST payload from a mix of general knowledge and partial memory of the trusted standard, instead of closely following the winning payload example that already had all these fields correct. The trusted standard's "Payload Rules" section didn't explicitly list `location` as required (it was in the example but not in the rules), and `currency` wasn't mentioned at all as a trap.

## Sandbox Verification

- **Expense 11150595**: Clean 6-call path (3 parallel GETs + company + POST + deliver), 0 errors, `state=DELIVERED`
  - Confirmed `location: "Ålesund"` on perDiemCompensations
  - Confirmed no `isDayTrip` on perDiemCompensations
  - Confirmed no `currency` on costs
  - Per-diem readback: count=3, rate=800, amount=2400, rateType=25888, rateCategory=740, location=Ålesund
- **Expense 11150599**: Confirmed `costs[].category` string field is unnecessary (silently ignored); `costCategory` object ref is what matters
- **Expense 11150599**: Confirmed `costs[].currency` can be safely omitted (NOK default)

## Playbook Changes

### Updated existing files:
1. **`./trusted-standards/register-travel-expense.md`**:
   - Added `costs[].currency` and `costs[].category` to NON-EXISTENT/DANGEROUS FIELDS section
   - Added recovery branch for `currency.factor` error
   - Added production confirmation for run 3aed3b42 (Astrid Larsen)

2. **`./task-playbooks/register-travel-expense.md`**:
   - Added `costs[].currency` trap (422 without `factor`)
   - Added `costs[].category` as unnecessary
   - Added production confirmation for run 3aed3b42

3. **`./AGENTS.md`**:
   - Added `costs[].currency` trap to REQUIRED travel-expense fields section

## Commit

- Hash: `3433e64c`
- Message: `tripletex playbook: register-travel-expense — add 8th production confirmation (3aed3b42, Norwegian prompt, Astrid Larsen / astrid.larsen@example.org / Konferanse Ålesund / 4-day 800kr + flight 6750 + taxi 500, 6 calls 3 errors); discovered currency.factor trap: costs[].currency without factor causes 422; also hit isDayTrip on perDiemCompensations (non-existent) and missing location; add currency/category non-existent field documentation to trusted standard, playbook, and AGENTS.md; sandbox-verified clean 6-call 0-error path with all required fields (expense 11150595)`

## Reusable Heuristics

1. **Follow the winning payload example exactly** — the trusted standard and playbook both contain a proven payload shape. Do not add fields not in the example (like `isDayTrip` on perDiem, `currency` on costs). Do not omit fields that are in the example (like `location`).

2. **NOK costs need no `currency` field** — Tripletex defaults to NOK. Including `currency: { code: "NOK" }` without `factor: 1` causes 422. Safest to omit entirely.

3. **`perDiemCompensations[].location` is mandatory at POST time** — not just at deliver. Set to the destination city (same as `travelDetails.destination`).

4. **`isDayTrip` belongs ONLY on `travelDetails`** — never on perDiemCompensations. The API rejects unknown fields with 422.

5. **Per-diem count = overnights = days - 1** — this run correctly used count=3 for a 4-day trip, consistent with the trusted standard. This was the #1 historical scoring issue.

6. **When retrying after a POST 422, the GETs don't need to re-run** — the agent re-ran the entire script (including all GETs) on each retry, wasting ~12 calls. A future optimization would be to structure the script to cache GET results and only retry the POST.

7. **Minimum required cost fields for NOK**: `costCategory`, `paymentType`, `comments`, `amountCurrencyIncVat`, `amountNOKInclVAT`, `vatType: { id: 0 }`, `date`. Nothing else needed.

8. **Minimum required perDiemCompensation fields for overnight**: `location`, `count`, `rate`, `amount`, `rateType: { id: 25888, rateCategory: { id: 740 } }`, `overnightAccommodation: "HOTEL"`. Nothing else needed.
