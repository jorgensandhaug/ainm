# Codex Reflection Summary — Run e103a5b5

## 1. Task

Register a travel expense for Torbjørn Brekke (torbjrn.brekke@example.org) for "Kundebesøk Trondheim". 4-day trip with per-diem (daily rate 800 kr). Expenses: flight 6150 kr and taxi 750 kr. Nynorsk prompt, duration-only (no explicit dates).

## 2. Reflection

**What went well:**
- Correctly read the trusted standard before writing any script
- Used the hardcoded rateType 25888/740 (overnight) — correct for multi-day trips
- Used per-diem count=3 (overnights = days-1) — the key scoring fix from prior reflections
- Parallelized the 3 initial GETs (employee + costCategory + paymentType)
- Used company-address fallback for departureFrom when employee had no address
- Final expense delivered correctly: state=DELIVERED, 2 costs, 1 per-diem

**What went poorly:**
- 4 avoidable 422 errors from unknown payload fields
- Created an orphan OPEN expense (11150550) before getting the correct payload

**Mistakes:**
1. Used `costs[].description` — field doesn't exist; should use `comments` only
2. Used `perDiemCompensations[].isDayTrip` — field doesn't exist; `isDayTrip` belongs on `travelDetails`
3. Omitted `perDiemCompensations[].location` — now required at POST time (422 without)
4. Omitted `travelDetails.destination` — now required at deliver time (POST accepts, deliver 422s)

## 3. Call Efficiency

**Actual run:** 11 calls, 4 errors
- Round 1: 3 parallel GETs (employee + costCategory + paymentType)
- Round 2: 1 GET company/{companyId}
- Failed POST #1: 422 on `costs[].description` (doesn't exist) — **wasted**
- Failed POST #2: 422 on `perDiemCompensations[].isDayTrip` (doesn't exist) — **wasted**
- Failed POST #3: 422 on `perDiemCompensations[].location` (required) — **wasted**
- POST #4: succeeded (created 11150550, OPEN), PUT deliver: 422 on `travelDetails.destination` — **wasted** (2 calls)
- POST #5 + PUT deliver: succeeded (11150554, DELIVERED) — correct

**Optimal path:** 6 calls, 0 errors
1. **Round 1 (parallel):** GET /employee + GET /travelExpense/costCategory + GET /travelExpense/paymentType
2. **Round 2:** GET /company/{companyId}?fields=*,address(*)
3. **Round 3:** POST /travelExpense (with destination, location, comments, correct travelDetails)
4. **Round 4:** PUT /travelExpense/:deliver

**Wasted calls:** 5 (3 failed POSTs + 1 POST that succeeded but couldn't deliver + its failed deliver)

## 4. Root Causes

1. **Trusted standard gap — newly required fields:** `perDiemCompensations[].location` and `travelDetails.destination` were not documented as required in the trusted standard. These appear to be new API validation requirements added by Tripletex between 2026-03-21 and 2026-03-22, since all prior production runs (1ca00562, 6de5cfc0, etc.) delivered successfully without them.

2. **Agent-side field name errors:** The agent used `description` (instead of `comments`) on cost objects and `isDayTrip` (instead of keeping it on `travelDetails`) on perDiemCompensation objects. The trusted standard already documented `comments` as the correct field, but the agent wrote from partial memory rather than strictly following the standard's payload structure.

3. **No pre-flight schema validation:** The agent did not cross-reference the payload fields against the trusted standard's documented payload shape before the first POST attempt. Had it done so, `description` and `isDayTrip` errors would have been caught before wasting API calls.

## 5. Sandbox Verification

Verified on 2026-03-22 using persistent sandbox credentials:

- **Test 1:** POST without `destination` and without `location` → 422 `perDiemCompensations.location: Kan ikke være null`
- **Test 2:** POST with `destination` but without `location` → 422 `perDiemCompensations.location: Kan ikke være null`
- **Test 3:** POST with both `destination` and `location` → 201 (created 11150570), deliver → 200 `state=DELIVERED`
- **Test 4:** POST without `destination` but with `location` → 201 (created 11150574), deliver → 422 `travelDetails.destination: Feltet må fylles ut`

**Conclusions:**
- `perDiemCompensations[].location` is required at POST time
- `travelDetails.destination` is required at deliver time (POST accepts without, deliver rejects)
- Both should always be included at POST time for safety
- `location` should be set to the trip destination city
- `destination` should be set to the trip destination city

## 6. Playbook Changes

Updated existing files (no new files created):

| File | Changes |
|------|---------|
| `./trusted-standards/register-travel-expense.md` | Added `destination` and `location` as required fields in Payload Rules; added non-existent field warnings (description, isDayTrip); added recovery branches for location/destination/mapping errors; added production confirmation for run e103a5b5; added sandbox verification for 2026-03-22 |
| `./task-playbooks/register-travel-expense.md` | Added `destination` and `location` to Lowest-Call Scored Flow step 4; added 4 new validation traps (destination, location, description, isDayTrip); added production confirmation for run e103a5b5 |
| `./AGENTS.md` | Added required travel-expense fields note (as of 2026-03-22); updated canonical delivery path to include destination and location; updated deliver failure list to include destination and location |

## 7. Commit

- **Hash:** `c6a7dc1e`
- **Message:** `tripletex playbook: register-travel-expense — add destination+location as required fields; document non-existent field traps (description, isDayTrip, currency); production run e103a5b5 (Torbjørn Brekke / Kundebesøk Trondheim / 4-day per-diem 800/day + flight 6150 + taxi 750, 11 calls 4 errors) discovered two new API requirements: perDiemCompensations[].location required at POST (422 without), travelDetails.destination required at deliver (422 without); also hit agent-side bugs: costs[].description (doesn't exist, use comments) and perDiemCompensations[].isDayTrip (doesn't exist, belongs on travelDetails); optimal was 6 calls 0 errors; sandbox-verified on 2026-03-22 (IDs 11150570, 11150574); correctly used per-diem count=3 (overnights) and rateType 25888/740 (overnight)`

## 8. Reusable Heuristics

1. **Always include `travelDetails.destination` and `perDiemCompensations[].location`** in the POST payload. Both are now required — `location` at POST time, `destination` at deliver time. Set both to the trip destination city (inferred from prompt title/purpose).

2. **`costs[]` has `comments`, NOT `description`.** The `description` field does not exist on cost objects and causes a 422 mapping error. Always use `comments` for cost text.

3. **`isDayTrip` belongs on `travelDetails`, NOT on `perDiemCompensations[]`.** The `isDayTrip` field does not exist on perDiemCompensation objects. It is a travelDetails-level flag.

4. **Cross-reference the trusted standard's payload shape before writing POST payloads.** The trusted standard already documented the correct field names — the errors came from the agent writing from memory instead of strictly following the standard.

5. **Tripletex API validation requirements can change.** Fields that were optional in prior runs (location, destination) can become required. Always include all known required fields even if prior runs succeeded without them.

6. **The optimal 6-call path for no-address employees remains:** employee+costCat+payType (parallel) → company → POST → deliver. This run would have achieved 6 calls, 0 errors with the correct payload.

7. **Per-diem count = overnights (days - 1)** continues to be the correct formula. This run correctly used count=3 for a 4-day trip.

8. **Infer destination from the prompt title/purpose** when not explicitly stated. "Kundebesøk Trondheim" → destination = "Trondheim", location = "Trondheim".
