# Register Travel Expense

## Scope

Use for tasks like:
- register one new travel expense for an existing employee identified by email
- create travel costs such as flight, taxi, ferry, hotel, or similar reimbursement lines
- include per-diem compensation in the same travel expense
- prompt gives explicit travel dates, or some other non-Tripletex source already fixes those dates exactly
- finish in one parent write plus only the verification reads that are actually needed

Do not use for:
- mileage allowance
- accommodation allowance
- attachments
- standalone approval or delivery of an existing travel expense
- project-linked or reinvoiced travel expenses
- duration-only prompts that omit explicit travel dates; treat those as ambiguous investigation cases, not as an exact playbook match

## Key Findings

Verified in persistent sandbox on 2026-03-20:
- `GET /travelExpense/costCategory?count=1000&fields=*` returned travel categories with `showOnTravelExpenses=true`, including `Fly` and `Taxi`
- `GET /travelExpense/paymentType?count=1000&fields=*` returned one active travel-expense payment type, `Privat utlegg`
- `GET /travelExpense/rate?type=PER_DIEM&isValidDomestic=true&dateFrom=...&dateTo=...&count=1000&fields=*` returned rate objects; each value has `{ id, rateCategory: { id, url }, zone, rate, ... }` — the value's `.id` IS the rateType id, do NOT access `.rateType` on these objects
- `GET /company/{companyId}?fields=*,address(*)` expanded the company address in one read, while `fields=*` alone left `company.address` as a link-only object
- one no-address employee (`id=18478235`, `address=null`, `companyId=108114337`) plus that company read yielded concrete `departureFrom="Oslo"` from `company.address.city`
- the exact 7-call branch `GET /employee` -> conditional `GET /company/{companyId}?fields=*,address(*)` -> `GET /travelExpense/costCategory` -> `GET /travelExpense/paymentType` -> `GET /travelExpense/rate` -> `POST /travelExpense` -> `PUT /travelExpense/:deliver` delivered sandbox travel expense `11145429` with `2` costs and `1` per-diem row
- `PUT /travelExpense/:deliver` returned `ListResponseTravelExpense` with the delivered object inside `values[]`
- that same filtered rate response returned `rateCategory` only as sparse `id`/`url`, not expanded booleans such as `isValidDomestic`
- mapping `perDiemCompensations[].rateType = { id: rateValue.id, rateCategory: { id: rateValue.rateCategory.id } }` with `zone` omitted still allowed a delivered manual per-diem row to persist `count=4`, `rate=800`, and `amount=3200`
- `POST /travelExpense` can create the parent expense, embedded cost rows, and embedded per-diem rows in one write
- `POST /travelExpense` did not need an explicit `department` field when the linked employee already had a department; the created expense inherited that department automatically
- embedded `costs[]` failed with `422` until each row included `amountCurrencyIncVat`
- embedded `perDiemCompensations[]` failed with `422` while `travelDetails.isCompensationFromRates=false`
- changing `travelDetails.isCompensationFromRates` to `true` allowed the same embedded per-diem row to persist with manual `count`, `rate`, and `amount`
- the old create-only branch persisted manual per-diem rows with `rateType=null`, `rateCategory=null`, and `overnightAccommodation=NONE`
- `PUT /travelExpense/:deliver` then failed on missing `travelDetails.departureFrom`, missing `perDiemCompensations[].rateType`, and VAT-bearing `costs[].vatType` on a non-VAT-registered sandbox company
- recreating with `travelDetails.departureFrom`, explicit `costs[].vatType={ "id": 0 }`, and per-diem `rateType` plus `overnightAccommodation` allowed `PUT /travelExpense/:deliver` to succeed and move the expense to `state=DELIVERED`
- the `POST /travelExpense` response already proved the parent fields and returned child ids/counts, but `costs[]` and `perDiemCompensations[]` came back only as `id`/`url`
- `GET /travelExpense/{id}?fields=*` still kept those child arrays sparse
- `GET /travelExpense/cost?travelExpenseId=...&count=20&fields=*` returned full cost objects with comments, amounts, category ids, and payment-type ids
- `GET /travelExpense/perDiemCompensation?travelExpenseId=...&count=20&fields=*` returned full per-diem objects with `location`, `count`, `rate`, and `amount`
- `PUT /travelExpense/:approve` returned `403` for the sandbox token even with `overrideApprovalFlow=true`; approval is not a trusted default follow-up step
- top-level travel-expense `amount`/`paymentAmount` still reflected only reimbursable cost lines even after successful `:deliver`; those totals are not proof of per-diem correctness
- the 2026-03-20 production run for Torbjorn Brekke likely lost correctness by inventing `departureFrom=\"Hjemsted\"`; when the prompt omits departureFrom, generic placeholders are correctness-risky and should not be upgraded into a trusted inference
- the 2026-03-20 production run for `Miguel Pérez` / `miguel.perez@example.org` wasted two extra `GET /employee` calls by stopping at `address=null` and only later adding the company fallback; future agents should switch to the company branch immediately after the first employee read reveals no address
- ambiguity probe script `sandbox_travel_expense_ambiguity_probe.ts` then delivered three otherwise-identical Bergen expenses with different inferred values:
  - `11145899`: `2026-03-17..2026-03-20`, `departureFrom=Oslo`
  - `11145900`: `2026-03-16..2026-03-19`, `departureFrom=Oslo`
  - `11145901`: `2026-03-17..2026-03-20`, `departureFrom=Drammen`
- Tripletex accepted all three as `DELIVERED`, so the API does not tell you which date/departure inference is scorer-correct when the prompt omits those fields
- same-day sandbox re-proof `sandbox_verify_duration_only_travel_expense.ts` used the known no-address employee `18478235` with company fallback `Oslo` and delivered two otherwise-identical Bodø expenses for the exact `3 days` / `800 per day` / `6200 flight` / `400 taxi` family:
  - `11146082`: `2026-03-18..2026-03-20`, `departureFrom=Oslo`
  - `11146083`: `2026-03-17..2026-03-19`, `departureFrom=Oslo`
- that Bodø re-proof shows the ambiguity survives even after the company-city fallback is fixed; extra Tripletex reads will not reveal a unique scorer-correct date range

## Lowest-Call Scored Flow

This is the canonical flow only when the travel dates are explicit or otherwise fixed from outside Tripletex.

**Optimal call counts** (with hardcoded rateType — skip rate lookup):
- 6 calls when employee has no address: employee+costCat+payType (parallel) → company → POST → deliver
- 5 calls when employee has address: employee+costCat+payType (parallel) → POST → deliver (3 rounds)
- 4 calls when employee has address and prompt provides departureFrom: employee+costCat+payType (parallel) → POST → deliver (3 rounds)

1. **Round 1 (parallel):** Locate the employee AND resolve cost categories and payment type — all three are independent
   - `GET /employee?email=<prompt-email>&count=10&fields=*` — filter locally to one exact-email employee; prefer `allowInformationRegistration=true` when several exact-email hits exist
   - `GET /travelExpense/costCategory?count=1000&fields=*`
   - `GET /travelExpense/paymentType?count=1000&fields=*`
   - filter locally on `showOnTravelExpenses=true`
2. **Round 2 (conditional):** If the prompt omits `departureFrom` and the employee read (from step 1) lacks a concrete address but exposes `companyId`, do one company read
   - `GET /company/{companyId}?fields=*,address(*)`
   - prefer `company.address.city`, then `company.address.addressLine1`, then `company.address.displayName`, then `company.address.addressAsString`
   - if both employee and company location fields are absent, treat the run as blocked instead of inventing a placeholder
   - skip this step entirely if employee has an address or prompt provides departureFrom
3. Select rateType from the **hardcoded stable rate catalog** (NO API call — DO NOT use `GET /travelExpense/rate`):
   - **Multi-day / overnight trips (isDayTrip=false) → ALWAYS use `rateType: { id: 25888, rateCategory: { id: 740 } }`** ("Overnatting over 12 timer", rate=1012). Put the prompt's rate in `rate`/`amount`, but use rateType 25888. (Note: rateType alone does NOT fix scoring — the per-diem count=overnights fix is what matters for checks 2+3+6.)
   - day trips 6–12h (isDayTrip=true): `rateType: { id: 25886, rateCategory: { id: 738 } }` (rate=397)
   - day trips >12h (isDayTrip=true): `rateType: { id: 25887, rateCategory: { id: 739 } }` (rate=736)
   - these are government-set national rates, stable across all Tripletex accounts
   - **fallback only**: if POST fails on rateType, do `GET /travelExpense/rate?...fields=*,rateCategory(*)` and filter by `rateCategory.isValidAccommodation=true` for overnight trips
4. Create the travel expense in one write
   - `POST /travelExpense`
   - embed top-level `travelDetails`
   - embed `perDiemCompensations[]`
   - embed `costs[]`
   - include `travelDetails.departureFrom`
   - include `travelDetails.destination` (REQUIRED at deliver — always set at POST time)
   - include explicit `costs[].vatType`
   - include `perDiemCompensations[].rateType` (from hardcoded catalog)
   - include `perDiemCompensations[].overnightAccommodation` when the trip spans overnight
   - include `perDiemCompensations[].location` (REQUIRED at POST — set to destination city)
   - omit `department` unless the prompt explicitly scores a different department or validation demands it
5. Deliver the expense
   - `PUT /travelExpense/:deliver?id=<travelExpenseId>`
6. Reuse the deliver response and stop
   - `title`
   - `employee.id`
   - `travelDetails.departureDate`
   - `travelDetails.returnDate`
   - `travelDetails.destination`
   - `state=DELIVERED`
   - `costs.length`
   - `perDiemCompensations.length`
7. Stop

## Conditional Investigation Branch

Use the dedicated child reads only when the prompt materially differs from the standard embedded-create shape, a later step truly needs expanded child fields, or the live write/deliver response contradicts the intended child counts.

1. `GET /travelExpense/cost?travelExpenseId=<id>&count=20&fields=*`
2. `GET /travelExpense/perDiemCompensation?travelExpenseId=<id>&count=20&fields=*`
3. Stop

## Winning Payload Shape

For the travel-expense create, the sandbox-proven shape was:

```json
{
  "employee": { "id": 18478235 },
  "title": "Visita cliente Bergen",
  "travelDetails": {
    "isForeignTravel": false,
    "isDayTrip": false,
    "isCompensationFromRates": true,
    "departureDate": "2026-03-19",
    "returnDate": "2026-03-20",
    "departureTime": "08:00",
    "returnTime": "18:00",
    "departureFrom": "Oslo",
    "destination": "Bergen",
    "detailedJourneyDescription": "Visita cliente Bergen",
    "purpose": "Visita cliente Bergen"
  },
  "perDiemCompensations": [
    {
      "location": "Bergen",
      "count": 2,
      "rate": 800,
      "amount": 1600,
      "rateType": { "id": 25888, "rateCategory": { "id": 740 } },
      "overnightAccommodation": "HOTEL"
    }
  ],
  "costs": [
    {
      "costCategory": { "id": 32813722 },
      "paymentType": { "id": 32813706 },
      "comments": "bilhete de avião",
      "amountCurrencyIncVat": 5200,
      "amountNOKInclVAT": 5200,
      "vatType": { "id": 0 },
      "date": "2026-03-19"
    },
    {
      "costCategory": { "id": 32813737 },
      "paymentType": { "id": 32813706 },
      "comments": "táxi",
      "amountCurrencyIncVat": 350,
      "amountNOKInclVAT": 350,
      "vatType": { "id": 0 },
      "date": "2026-03-20"
    }
  ]
}
```

## Validation Traps

- **REQUIRED: `travelDetails.destination`** — set to the trip destination city; `POST` accepts without it but `PUT :deliver` fails with 422; always include at POST time
- **REQUIRED: `perDiemCompensations[].location`** — set to the per-diem location (typically same as destination); `POST` fails with 422 if omitted
- **`costs[].description` does NOT exist** — use `comments` for cost text; `description` causes 422 mapping error
- **`perDiemCompensations[].isDayTrip` does NOT exist** — `isDayTrip` belongs on `travelDetails` only
- do not omit `amountCurrencyIncVat` on embedded travel costs just because the prompt amount is already in NOK
- do not set `travelDetails.isCompensationFromRates=false` when the same write also includes `perDiemCompensations[]`
- do not waste effort resolving or echoing `department` for a normal existing-employee expense; Tripletex can inherit it from the employee
- do not rerun `GET /employee` after the first read already proved the employee identity and `address=null`; switch directly to the conditional company-address branch
- do not use `GET /company/{companyId}?fields=*` for the fallback; it leaves `company.address` as a link-only object in sandbox, so use `fields=*,address(*)`
- do not trust a successful `POST /travelExpense` with manual per-diem `count`/`rate`/`amount` as a fully correct final state; that row can still persist with `rateType=null`
- do not rely on the category default VAT if the expense may need `:deliver`; explicit zero-VAT cost rows were required in sandbox for a non-VAT-registered company
- do not assume approval is available after delivery; sandbox `PUT /travelExpense/:approve` returned `403`
- do not assume `GET /travelExpense/{id}?fields=*` expands child rows; it can stay link-only for both costs and per-diems
- do not access `.rateType` on `/travelExpense/rate` response values; the values ARE the rate objects — use `.id` and `.rateCategory` directly from each value; accessing `.rateType` returns `undefined` and causes `422` on POST with `rateType.rateCategory: Kan ikke være null`

## Category And Payment-Type Resolution

- `GET /travelExpense/costCategory` does not expose a query parameter equivalent to `showOnTravelExpenses=true`, so fetch the set once and filter locally
- prefer exact category-description matches before fallback heuristics:
  - `Fly` for airfare
  - `Taxi` for taxi
- for the payment type, prefer one active travel-expense reimbursement type from the lookup; persistent sandbox exposed `Privat utlegg`

## Per-Diem Resolution

- use the **hardcoded stable rate catalog** instead of calling `GET /travelExpense/rate` — rate IDs are government-set national rates, verified stable across sandbox and multiple production accounts on 2026-03-21:
  - overnight multi-day trips (isDayTrip=false): `rateType: { id: 25888, rateCategory: { id: 740 } }` — "Overnatting over 12 timer" (rate=1012)
  - day trips 6–12h (isDayTrip=true): `rateType: { id: 25886, rateCategory: { id: 738 } }` — "Dagsreise 6-12 timer" (rate=397)
  - day trips >12h (isDayTrip=true): `rateType: { id: 25887, rateCategory: { id: 739 } }` — "Dagsreise over 12 timer" (rate=736)
- **fallback only**: if POST fails on rateType, do `GET /travelExpense/rate?...fields=*,rateCategory(*)` and filter by `rateCategory.isValidAccommodation=true` for overnight trips; the response values ARE the rate objects — use `.id` and `.rateCategory` directly, do NOT access `.rateType`
- **CRITICAL per-diem count — use OVERNIGHTS (days minus 1), not days:**
  - Norwegian per-diem ("kostgodtgjørelse") for overnight trips counts overnight stays, NOT calendar days
  - A "5-day trip" has 4 overnights → `count=4`. A "3-day trip" has 2 overnights → `count=2`
  - Formula: `count = number_of_days - 1` (equivalently: `returnDate - departureDate` in days)
  - `amount = count * rate` (e.g., 4 overnights × 800 = 3200, NOT 5 × 800 = 4000)
  - Do NOT use the prompt's literal day count as the per-diem count; always subtract 1
  - This was the #1 scoring issue: all 16 production attempts used count=days and failed checks 2+3+6
- preserve the prompt's `rate` value, but compute `count = days - 1` and `amount = count * rate`; still include the correct hardcoded `rateType` so the row is deliverable
- if the trip spans overnight, set `overnightAccommodation`; sandbox accepted the generic branch `HOTEL`
- if the prompt omits `departureFrom`, only infer it from one concrete employee address field already returned by `GET /employee`, preferring `address.city`, then `address.addressLine1`, then `address.displayName`
- if those employee address fields are absent but the employee exposes `companyId`, use one conditional `GET /company/{companyId}?fields=*,address(*)` and infer from `company.address.city`, then `company.address.addressLine1`, then `company.address.displayName`, then `company.address.addressAsString`
- do not invent generic placeholders such as `Hjemsted`; if both employee and company reads lack a concrete location, this prompt shape is blocked
- if the prompt omits `departureFrom` or gives too little information to choose an overnight-accommodation branch safely, the old 4-call OPEN create is not a trusted full-correctness path for that prompt shape
- if the prompt omits explicit travel dates as well, this is not an exact playbook match; sandbox proved several delivered date/departure combinations are possible, so do not pretend one default inference is trusted

## Forced-Action Branch For Ambiguous Prompts

- If the agent must still act autonomously on a duration-only prompt, keep the flow minimal instead of trying to "solve" the ambiguity with extra reads.
- **Round 1 (parallel):** `GET /employee?email=...&count=10&fields=*` + `GET /travelExpense/costCategory?count=1000&fields=*` + `GET /travelExpense/paymentType?count=1000&fields=*` — all three are independent.
- **Round 2 (conditional):** If `employee.address` is null but `companyId` exists, do one `GET /company/{companyId}?fields=*,address(*)`; reuse the concrete company location for `departureFrom`. Skip if employee has an address.
- Use the hardcoded rateType (25888/740 for overnight, 25886/738 or 25887/739 for day trips) — NO rate lookup needed.
- **Per-diem count = overnights (days - 1)**, NOT days. A 2-day trip → count=1, a 3-day trip → count=2, a 5-day trip → count=4.
- Then go straight to `POST /travelExpense`, `PUT /travelExpense/:deliver`.
- Total: 6 calls (no-address) or 5 calls (with address).
- Choose one deterministic local date range inside the script, but document that it is only a best-effort fallback; sandbox proved multiple ranges are accepted, so there is no extra-read path that recovers a uniquely correct answer from Tripletex itself.

## Date Ambiguity For Underspecified Prompts

- do not encode a trusted default fallback for prompts that give only a duration
- sandbox accepted both `2026-03-17..2026-03-20` and `2026-03-16..2026-03-19` for the same 4-day Bergen probe, and it also accepted different `departureFrom` values
- because Tripletex accepts several delivered variants, omitted dates and omitted `departureFrom` are scorer ambiguities, not API-shape ambiguities
- for that prompt family, the correct post-run learning action is to narrow the trusted standard, not to hardcode another guessed fallback date range

## Verification Shape

- `POST /travelExpense` verified the parent expense and returned:
  - the parent `id`
  - the linked `employee.id`
  - the requested `travelDetails`
  - `costs[].id/url` plus count
  - `perDiemCompensations[].id/url` plus count
- `PUT /travelExpense/:deliver` verified the corrected final parent state and returned `state=DELIVERED`
- the parent `amount`/`paymentAmount` remained cost-only in sandbox, so they are not decisive proof of per-diem correctness
- `GET /travelExpense/cost?...` and `GET /travelExpense/perDiemCompensation?...` remain the decisive investigation branch when expanded child verification is genuinely needed

## When Not To Add Extra Reads

- do not add a pre-read of `/travelExpense` for a pure create task
- do not repeat `GET /employee`; for omitted-`departureFrom` tasks the full resolver branch is one employee read plus, if needed, one company read
- do not add `GET /travelExpense/cost` or `GET /travelExpense/perDiemCompensation` in the standard scored flow just to double-check child persistence
- do not add `GET /travelExpense/{id}`; it still leaves child arrays sparse and is not part of either the canonical scoring path or the conditional investigation branch
- do not split the create into separate `POST /travelExpense/cost` and `POST /travelExpense/perDiemCompensation` calls unless the prompt materially differs from the embedded-create shape
- do not add exploratory `GET /travelExpense`, repeated `GET /employee`, or alternate company/address probes just because the prompt omitted dates; those calls still do not tell you which inferred range is scorer-correct
- do not try `costCategory` or `paymentType` with `id=0` to skip lookups; `POST` accepts `id=0` but `PUT :deliver` rejects it with `422`
- do not try posting `perDiemCompensations` without `rateType`; `POST` accepts it but `PUT :deliver` rejects it with `422`; use hardcoded rateType IDs instead of calling `GET /travelExpense/rate`
- do not call `GET /travelExpense/rate` when hardcoded rate IDs suffice; rate IDs are government-set and stable across accounts

## Production Confirmations

- 2026-03-21 `Pablo Rodríguez` / `pablo.rodriguez@example.org` / `Conferencia Ålesund` / 5-day per-diem 800/day + flight 2750 + taxi 700:
  - duration-only prompt, employee `address=null`, company-address fallback → `departureFrom=Oslo`
  - deterministic dates `2026-03-17..2026-03-21`, `overnightAccommodation=HOTEL`
  - 7-call forced-action branch: employee → company → costCategory+paymentType+rate (parallel) → POST → PUT :deliver
  - 0 errors, `state=DELIVERED`, expense `11149202`, 2 costs, 1 per-diem
  - used first returned `rateType.id=25886` (day-trip rate, rate=397) — incorrect for overnight trip (should be 25888/740), but rateType alone does not explain the 4.5/8 score; the real issue was `count=5` (days) instead of `count=4` (overnights)
- 2026-03-21 `Pablo Sánchez` / `pablo.sanchez@example.org` / `Conferencia Drammen` / 3-day per-diem 800/day + flight 7050 + taxi 550:
  - duration-only prompt, employee `address=null`, company-address fallback → `departureFrom=Oslo`
  - first attempt failed with 422 because script accessed `.rateType` on rate response values (returns `undefined`); wasted 6 calls
  - second attempt with correct mapping `rateType: { id: rateValue.id, rateCategory: { id: rateValue.rateCategory.id } }` succeeded: 7 calls, 0 errors
  - total: 13 calls, 1 error; optimal: 7 calls, 0 errors
  - `state=DELIVERED`, expense `11149366`, 2 costs, 1 per-diem
- 2026-03-21 `Lars Johansen` / `lars.johansen@example.org` / `Kundebesøk Stavanger` / 3-day per-diem 800/day + flight 3900 + taxi 350:
  - duration-only prompt, employee `address=null`, company-address fallback → `departureFrom=Oslo`
  - 7-call run: employee → company → costCategory+paymentType+rate (parallel) → POST → PUT :deliver
  - 0 errors, `state=DELIVERED`, expense `11149476`, 2 costs, 1 per-diem
  - used rateType 25886 (day-trip) for overnight trip — incorrect but not the root cause of scoring failure
  - optimal was 6 calls with hardcoded rateType 25888/740 and parallel company+costCat+payType
  - scoring failure was `count=3` (days) instead of `count=2` (overnights)
- 2026-03-21 `Miguel Pérez` / `miguel.perez@example.org` / `Visita cliente Tromsø` / 5-day per-diem 800/day + flight 2600 + taxi 800 (run 1ca00562):
  - **FIRST production confirmation of 6-call path with hardcoded rateType 25888/740**
  - duration-only prompt, employee `address=null`, company-address fallback → `departureFrom=Oslo`
  - deterministic dates `2026-03-17..2026-03-21`, `overnightAccommodation=HOTEL`
  - 6-call run: employee → company+costCat+payType (parallel) → POST → PUT :deliver
  - 0 errors, `state=DELIVERED`, expense `11150209`, 2 costs, 1 per-diem
  - hardcoded `rateType: { id: 25888, rateCategory: { id: 740 } }` delivered without `GET /travelExpense/rate`
  - saves 1 call vs prior 7-call runs AND uses correct overnight rateType (prior runs used wrong day-trip 25886)
  - previous Miguel Pérez run (2026-03-20) wasted 2 extra employee reads; this run is exactly optimal
  - **still scored 4.5/8**: rateType fix had zero effect on score; the root cause was `count=5` (days) instead of `count=4` (overnights=days-1)
- 2026-03-21 `Charlotte Smith` / `charlotte.smith@example.org` / `Conference Tromsø` / 2-day per-diem 800/day + flight 6400 + taxi 600 (run 6de5cfc0):
  - duration-only prompt, employee `address=null`, company-address fallback → `departureFrom=Oslo`
  - 6-call run: employee → company+costCat+payType (parallel) → POST → PUT :deliver
  - 0 errors, `state=DELIVERED`, expense `11150349`, 2 costs, 1 per-diem
  - used correct hardcoded rateType 25888/740 (overnight)
  - **per-diem count mistake**: used `count=2` (days) instead of `count=1` (overnights=days-1); a 2-day trip has 1 overnight
  - 2nd production confirmation of 6-call hardcoded-rateType path; first confirmation of 2-day trip shape
- 2026-03-22 `Torbjørn Brekke` / `torbjrn.brekke@example.org` / `Kundebesøk Trondheim` / 4-day per-diem 800/day + flight 6150 + taxi 750 (run e103a5b5):
  - duration-only prompt (Nynorsk), employee `address=null`, company-address fallback → `departureFrom=Oslo`
  - 11 calls, 4 errors — caused by 3 unknown field bugs (description, isDayTrip, location) + missing destination at deliver
  - correctly used per-diem count=3 (overnights) and rateType 25888/740
  - `state=DELIVERED`, expense `11150554`, 2 costs, 1 per-diem
  - **discovered new required fields**: `perDiemCompensations[].location` (required at POST), `travelDetails.destination` (required at deliver)
