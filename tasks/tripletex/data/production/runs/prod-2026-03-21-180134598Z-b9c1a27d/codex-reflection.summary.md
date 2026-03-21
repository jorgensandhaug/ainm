# Post-Run Reflection: Register Travel Expense — Pablo Rodríguez / Conferencia Ålesund

## Task

Register a travel expense for Pablo Rodríguez (pablo.rodriguez@example.org) for "Conferencia Ålesund". 5-day trip with per diem (800 NOK/day). Costs: flight 2750 NOK, taxi 700 NOK. Duration-only prompt — no explicit dates or departureFrom.

## Reflection

**What went well:**
- Recognized the task as a travel expense matching the trusted standard's forced-action branch for duration-only prompts
- Read only the trusted standard and playbook, then immediately wrote and executed a single comprehensive script
- All 7 API calls succeeded on the first attempt with 0 errors
- Correctly handled the company-address fallback (`employee.address=null` → `GET /company/{id}?fields=*,address(*)` → `departureFrom=Oslo`)
- Correctly included all delivery-critical fields: `vatType={id:0}`, `rateType`, `overnightAccommodation=HOTEL`, `departureFrom`
- Ran costCategory + paymentType + rate lookups in parallel to minimize wall-clock time
- Travel expense `11149202` delivered successfully with 2 costs and 1 per-diem compensation

**What went poorly:**
- Nothing. The run was clean and followed the trusted standard precisely.

**Mistakes:**
- None. 0 errors, 0 wasted calls.

## Call Efficiency

**The run was minimal-call.** 7 API calls with 0 errors:

| # | Call | Purpose |
|---|------|---------|
| 1 | `GET /employee?email=pablo.rodriguez@example.org&count=10&fields=*` | Find employee (address=null) |
| 2 | `GET /company/107910771?fields=*,address(*)` | Company-address fallback → departureFrom=Oslo |
| 3 | `GET /travelExpense/costCategory?count=1000&fields=*` | Resolve Fly + Taxi IDs (parallel) |
| 4 | `GET /travelExpense/paymentType?count=1000&fields=*` | Resolve payment type ID (parallel) |
| 5 | `GET /travelExpense/rate?type=PER_DIEM&isValidDomestic=true&...&fields=*` | Resolve rateType ID (parallel) |
| 6 | `POST /travelExpense` | Create with embedded costs + perDiemCompensations |
| 7 | `PUT /travelExpense/:deliver?id=11149202` | Deliver |

**Wasted calls:** None.

**Lower-call path:** None exists for this task shape (employee without address + multi-day per-diem). The 7-call path is the proven minimum. If the employee had a concrete address, call 2 (company read) would be skipped → 6 calls.

## Root Causes

No errors or inefficiencies to root-cause. The run executed the trusted standard's forced-action branch exactly as designed.

## Sandbox Verification

Sandbox re-verified two potential shortcuts on 2026-03-21:

1. **costCategory/paymentType with id=0**: `POST /travelExpense` accepts id=0 for both fields, but `PUT /travelExpense/:deliver` rejects with 422. Real lookup IDs are required for delivery. The costCategory and paymentType lookups cannot be skipped.

2. **perDiemCompensations without rateType**: `POST /travelExpense` accepts per-diem rows without rateType, but `PUT /travelExpense/:deliver` rejects with `422 Sats eller satskategori må spesifiseres`. The rate lookup cannot be skipped.

Both tests confirm the 7-call path is the minimum for a deliverable travel expense with per-diem and employee without address.

## Playbook Changes

Updated existing files (no new files created):

- **`./trusted-standards/register-travel-expense.md`**: Added sandbox re-verification (id=0 delivery trap, rateType skip trap) and production confirmation (Pablo Rodríguez, 7-call, 0 errors, DELIVERED)
- **`./task-playbooks/register-travel-expense.md`**: Added id=0 and rateType skip pitfalls to "When Not To Add Extra Reads" section; added Production Confirmations section with the clean 7-call run

## Commit

- **Hash:** `331e58ce`
- **Message:** `tripletex playbook: register-travel-expense — add id=0 delivery trap, rateType skip trap, 7-call production confirmation`

## Reusable Heuristics

1. **costCategory/paymentType id=0 is a delivery trap**: POST accepts it but deliver rejects it. Always resolve real IDs from the lookup endpoints.
2. **rateType is mandatory for deliverable per-diem**: POST accepts per-diem without rateType, but deliver requires it. Always do the rate lookup.
3. **Company-address fallback is reliable**: When employee has no address, `GET /company/{id}?fields=*,address(*)` consistently provides `city` for departureFrom.
4. **First available rateType works for manual per-diem**: Even when no returned rateType.rate matches the prompt day rate, using any returned rateType.id with manual count/rate/amount delivers successfully.
5. **Parallel lookups save wall-clock time**: costCategory, paymentType, and rate lookups are independent and should always run in parallel.
6. **Duration-only travel expense prompts use the forced-action branch**: Choose deterministic dates, follow the same 7-call path, accept that the date choice is best-effort.
7. **7 calls is the proven floor** for employee-without-address + multi-day per-diem travel expense with 2+ cost lines.
