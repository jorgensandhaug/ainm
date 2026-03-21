# Reflection: prod-2026-03-21-183954363Z-e20f4354

## Task

Register a travel expense for Pablo Sánchez (`pablo.sanchez@example.org`) for "Conferencia Drammen". 3-day trip with per diem (800 NOK/day). Costs: flight 7050 NOK, taxi 550 NOK. Duration-only prompt (no explicit dates).

## Reflection

**What went well:**
- Correctly identified this as a `register-travel-expense` trusted standard match
- Read the trusted standard before writing the script
- Correctly used the 7-call forced-action branch: employee → company → costCategory+paymentType+rate (parallel) → POST → PUT :deliver
- Company-address fallback correctly resolved `departureFrom=Oslo`
- Final delivery succeeded with `state=DELIVERED`, 2 costs, 1 per-diem

**What went poorly:**
- The first script attempt failed with a 422 error because the `/travelExpense/rate` response structure was misunderstood
- The script accessed `chosenRate.rateType?.id` on rate response values, but those values ARE the rate objects themselves — they don't have a nested `.rateType` property
- This returned `undefined`, which sent `rateType: { id: undefined }` to the POST, triggering `rateCategory: Kan ikke være null` and `zone: Kan ikke være null` validation errors
- The entire first script execution (5 GETs + 1 failed POST) was wasted, doubling the total call count

## Call Efficiency

**Not minimal-call.** 13 calls, 1 error. Optimal: 7 calls, 0 errors.

**Wasted calls (6):**
1. `GET /employee` (duplicate from first attempt)
2. `GET /company/{companyId}` (duplicate from first attempt)
3. `GET /travelExpense/costCategory` (duplicate from first attempt)
4. `GET /travelExpense/paymentType` (duplicate from first attempt)
5. `GET /travelExpense/rate` (duplicate from first attempt)
6. `POST /travelExpense` (failed 422 from first attempt — rateType structure wrong)

**Optimal 7-call path the next agent should follow:**
1. `GET /employee?email=pablo.sanchez@example.org&count=10&fields=*`
2. `GET /company/{companyId}?fields=*,address(*)` (conditional: only if employee address is null)
3. `GET /travelExpense/costCategory?count=1000&fields=*` (parallel with 4 and 5)
4. `GET /travelExpense/paymentType?count=1000&fields=*` (parallel with 3 and 5)
5. `GET /travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=...&dateTo=...&count=1000&fields=*` (parallel with 3 and 4)
6. `POST /travelExpense` with embedded costs[] and perDiemCompensations[]
7. `PUT /travelExpense/:deliver?id=...`

## Root Causes

**Primary:** The `/travelExpense/rate` response values are rate objects with properties `{ id, rateCategory, zone, rate, ... }`. The value's own `.id` is the rateType id. There is no nested `.rateType` property on these objects.

The trusted standard used ambiguous language like "returned five usable `rateType` rows" and "using one of those returned sparse `rateType.id` values" — which could be read as the values having a `.rateType.id` path. The agent interpreted it that way and accessed `chosenRate.rateType?.id` which returned `undefined`.

The correct mapping is:
```typescript
perDiemCompensations[].rateType = {
  id: rateValue.id,
  rateCategory: { id: rateValue.rateCategory.id }
}
```

Zone can be omitted when `rateValue.zone` is null.

## Sandbox Verification

- Sandbox probe confirmed the exact rate response structure: 5 rate values, each with `{ id, version, url, rateCategory: { id, url }, zone: null, rate, ... }`
- No `.rateType` property exists on these values
- Sandbox delivery test with correct mapping `rateType: { id: 25886, rateCategory: { id: 738 } }` succeeded: expense `11149376`, `state=DELIVERED`, 2 costs, 1 per-diem
- Zone omission confirmed safe (null in all 5 sandbox rate values)

## Playbook Changes

Updated existing playbook `./task-playbooks/register-travel-expense.md`:
- **Key Findings**: Clarified rate response structure — values ARE rate objects, `.id` IS the rateType id
- **Winning Payload Shape**: Added `rateType` with `rateCategory` and `overnightAccommodation` to per-diem example; added `vatType: { "id": 0 }` to cost examples
- **Validation Traps**: Added trap for accessing `.rateType` on rate response values
- **Per-Diem Resolution**: Added critical note about rate value structure and correct mapping
- **Production Confirmations**: Added Pablo Sánchez confirmation with error analysis

Updated existing trusted standard `./trusted-standards/register-travel-expense.md` (committed in prior concurrent run):
- **Payload Rules**: Added critical note about rate response structure and correct mapping
- **Known Recovery Branches**: Added recovery for `rateType.rateCategory: Kan ikke være null` error
- **OpenAPI/Sandbox Status**: Clarified "rateType rows" language; added production confirmation

## Commit

```
ac690450 tripletex playbook: register-travel-expense — clarify /travelExpense/rate response structure, add rateType+vatType to winning payload, add 2nd production confirmation (e20f4354, Pablo Sánchez, 13 calls 1 error, optimal 7)
```

Files changed:
- `./task-playbooks/register-travel-expense.md` (16 insertions, 3 deletions)
- `./trusted-standards/register-travel-expense.md` (committed in concurrent `a4f93f90` run)

## Reusable Heuristics

1. **`/travelExpense/rate` response values ARE the rate objects.** Their `.id` is the rateType id. Do NOT access `.rateType` on them — that property does not exist and returns `undefined`.
2. **To build `perDiemCompensations[].rateType`:** map `{ id: rateValue.id, rateCategory: { id: rateValue.rateCategory.id } }`. Omit `zone` when null.
3. **The winning payload shape must include `rateType`, `overnightAccommodation`, and `vatType`.** All three were required for delivery in production and sandbox. The old playbook example omitted all three.
4. **When a trusted standard uses ambiguous naming conventions for API response properties**, log the first response value's keys and full JSON to confirm the structure before building the payload. One `console.log(JSON.stringify(rateValues[0]))` would have prevented the wasted 422.
5. **Duration-only prompts still work with the forced-action branch**: deterministic dates + company-address fallback + correct rateType mapping = deliverable travel expense in 7 calls.
