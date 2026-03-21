# Codex Reflection Summary

## Task

Complete project lifecycle for "ERP-implementering Havbris" (Havbris AS, org.nr 851704027):
- Create customer, 2 employees, project with budget 418100 kr
- Register timesheet hours: Sigurd Berg 75h, Marte Johansen 47h
- Register supplier cost 56200 kr from Lysgård AS (org.nr 964716188)
- Create unsent customer invoice for the project

Exact match for trusted standard `register-project-lifecycle-budget-hours-cost-and-invoice.md`.

## Reflection

**What went well:**
- Correctly identified the trusted standard as exact match
- Followed the standard flow steps 1-9 correctly
- Division conditionally omitted (no division in account)
- All payload rules followed: `userType`, `dateOfBirth`, `employments[].startDate`, `isChargeable`, both `name` + `activityType` on activity
- Bank account repair used correct MOD11-valid `"12345678903"`
- Invoice created successfully with `projectInvoiceDetails.length=1`

**What went poorly:**
- `POST /timesheet/entry/list` failed `422` on first attempt due to JavaScript timezone bug in `splitHours` function
- The function used `new Date(start + "T00:00:00")` (local time) then `.toISOString().slice(0, 10)` (UTC conversion), which shifted dates back 1 day in CET/CEST
- First timesheet date became `2026-03-20` instead of `2026-03-21`, violating the project startDate constraint
- Recovery script (run2) re-created the supplier (already created in run1's parallel batch), wasting another call

## Call Efficiency

**Not minimal-call.** Ideal was 15 calls (14 base + 1 bank fix), 0 errors.

**Actual: 17 calls, 1 error (422)**

| Call # | Step | Endpoint | Status |
|--------|------|----------|--------|
| 1-3 | 1 | GET /department + GET /division + POST /customer | 200, 200, 201 |
| 4 | 2 | POST /employee (Sigurd) | 201 |
| 5-6 | 3 | GET /employee?assignableProjectManagers + POST /employee (Marte) | 200, 201 |
| 7 | 4 | POST /project | 201 |
| 8 | 5 | POST /project/projectActivity | 201 |
| 9 | 6 | POST /timesheet/entry/list | **422** (timezone bug) |
| 10 | 6 | POST /supplier (parallel with #9, succeeded) | 201 |
| 11 | 6 | POST /timesheet/entry/list (retry, UTC-safe) | 201 |
| 12 | 6 | POST /supplier (duplicate, already created in #10) | 201 |
| 13-15 | 7 | POST /project/orderline + GET /ledger/vatType + GET /ledger/account | 201, 200, 200 |
| 16 | 8 | PUT /ledger/account (bank fix) | 200 |
| 17 | 9 | POST /invoice?sendToCustomer=false | 201 |

**Wasted calls:**
1. Call #9: `POST /timesheet/entry/list` — 422 due to timezone-shifted dates (avoidable)
2. Call #12: `POST /supplier` — duplicate, supplier already created in parallel call #10 (avoidable)

**Lower-call path for next agent (15 calls with bank fix, 14 without):**
Same standard flow, but use UTC-safe date arithmetic:
```typescript
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
```

## Root Causes

1. **JavaScript timezone trap**: `new Date("2026-03-21T00:00:00")` in CET = `2026-03-20T23:00:00Z`. Calling `.toISOString().slice(0, 10)` then returns `"2026-03-20"` — one day before the intended date. This is a well-known JavaScript pitfall but the trusted standard did not warn about it.

2. **Parallel batch recovery**: When `Promise.all([timesheet, supplier])` fails because one promise rejects, the other promise may have already completed. The recovery script re-ran both, creating a duplicate supplier. The correct recovery would be to only re-run the failed call.

## Sandbox Verification

Sandbox re-proof on 2026-03-21 with the same task shape (customer, 2 employees, project, budget 418100, 75h + 47h timesheet split, supplier, orderline 56200, invoice):
- **14 API calls, 0 errors** (bank already had number in sandbox)
- UTC-safe `addDays` function produced correct first date `2026-03-21` (not `2026-03-20`)
- All 17 timesheet entries created in 1 batch call
- Invoice returned `amountExcludingVatCurrency=418100` and `projectInvoiceDetails.length=1`
- Confirms the trusted standard's 14-call floor is achievable with correct date handling

## Playbook Changes

Updated existing files (no new files created):

1. **`./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md`**
   - Added UTC-safe date arithmetic warning to Payload Rules > timesheet batch section
   - Added `ERP-implementering Havbris` production run details to OpenAPI / Sandbox Status section

2. **`./trusted-standards/common-endpoints.md`**
   - Added UTC-safe date arithmetic warning to Standard time-registration note (applies to all timesheet splitting)

3. **`./task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md`**
   - Added Timesheet date arithmetic critical rule to Critical Rules section
   - Added `ERP-implementering Havbris` production run findings to Verified Findings section
   - Added timezone trap to Avoidable Mistakes section

## Commit

- **Hash**: `cd8038a0`
- **Message**: `tripletex playbook: project-lifecycle — add UTC-safe timesheet date splitting pitfall from ERP-implementering Havbris production run`
- **Files**: 3 files changed, 21 insertions

## Reusable Heuristics

1. **Always use `Date.UTC()` for date arithmetic in TypeScript/JavaScript**: Never use `new Date(dateStr + "T00:00:00")` followed by `.toISOString()` for date-only values. The local-time-to-UTC conversion silently shifts dates in non-UTC timezones. Use `new Date(Date.UTC(y, m-1, d))` instead.

2. **When recovering from a failed `Promise.all`, check which parallel calls already succeeded**: If a supplier was created in a parallel batch that partially failed, do not re-create the supplier in the recovery script. Only re-run the calls that actually failed.

3. **Test date arithmetic edge cases mentally before execution**: For any function that generates dates from string inputs, verify the first and last output dates match expectations before sending them to the API.

4. **The trusted standard's 14-call floor is correct and proven**: For the exact lifecycle shape (customer + 2 employees + project + budget + timesheet + supplier + cost + invoice), 14 calls with 0 errors is achievable. Bank account repair adds 1 conditional call. No further reduction is possible without API changes.
