# Codex Reflection Summary

## 1. Task

Execute full project lifecycle for 'Migração Cloud Horizonte' (Horizonte Lda, org 857400526):
- Budget 229500 NOK
- Register hours: Catarina Martins 37h, João Martins 62h
- Supplier cost 56300 NOK from Oceano Lda (org 941830420)
- Create unsent customer invoice

This is an exact match for the trusted standard `register-project-lifecycle-budget-hours-cost-and-invoice.md`.

## 2. Reflection

**What went well:**
- Correctly identified the exact trusted standard match and followed the 9-step flow
- Division was correctly omitted (no division in account) — learned from prior `Cloud-Migration Eichenhof` run
- Bank account repair used the correct MOD11-valid number `"12345678903"` — also learned from prior run
- Timesheet batch correctly split hours across dates (37h → [24,13], 62h → [24,24,14])
- All parallel steps were correctly parallelized
- The resume script successfully completed all remaining steps after the 422

**What went poorly:**
- `POST /project/projectActivity` failed with `422 activity.activityType: Kan ikke være null.` because the agent sent `name: "PROJECT_SPECIFIC_ACTIVITY"` without the `activityType` field
- This required a second script execution, wasting 1 API call

**Why the mistake happened:**
- The trusted standard line 61 said: `inline activity should be PROJECT_SPECIFIC_ACTIVITY and currently proven with isChargeable=false`
- This was ambiguous — it didn't specify whether `PROJECT_SPECIFIC_ACTIVITY` goes in `name` or `activityType`
- The agent interpreted it as the `name` field; the correct usage is `activityType: "PROJECT_SPECIFIC_ACTIVITY"` plus a separate descriptive `name` like `"Prosjektaktivitet"`
- The companion standard `create-project-activity-with-budget.md` already had the correct payload example (lines 36-39 and 43-55) but the lifecycle standard's inline description was ambiguous and the agent didn't cross-reference

## 3. Call Efficiency

**Not minimal.** The run used 16 calls; the ideal was 15 (14 base + 1 bank repair).

| # | Call | Status | Notes |
|---|------|--------|-------|
| 1 | GET /department | 200 | Parallel step 1 |
| 2 | GET /division | 200 | Parallel step 1 |
| 3 | POST /customer | 201 | Parallel step 1 |
| 4 | POST /employee (Catarina) | 201 | |
| 5 | GET /employee?assignableProjectManagers | 200 | Parallel step 3 |
| 6 | POST /employee (João) | 201 | Parallel step 3 |
| 7 | POST /project | 201 | |
| 8 | POST /project/projectActivity | **422** | **WASTED** — missing `activityType` |
| 9 | POST /project/projectActivity | 201 | Fixed with both `name` + `activityType` |
| 10 | POST /timesheet/entry/list | 201 | Parallel step 6 |
| 11 | POST /supplier | 201 | Parallel step 6 |
| 12 | POST /project/orderline | 201 | Parallel step 7 |
| 13 | GET /ledger/vatType | 200 | Parallel step 7 |
| 14 | GET /ledger/account | 200 | Parallel step 7 |
| 15 | PUT /ledger/account (bank repair) | 200 | Conditional |
| 16 | POST /invoice | 201 | |

**Wasted calls:** 1 (the failed `POST /project/projectActivity` at call #8)

**Lower-call path for next agent:** Follow the same 9-step flow but use the correct activity payload:
```json
{
  "project": { "id": projectId },
  "startDate": "2026-03-21",
  "budgetFeeCurrency": 229500,
  "activity": {
    "name": "Prosjektaktivitet",
    "activityType": "PROJECT_SPECIFIC_ACTIVITY",
    "isChargeable": false
  }
}
```
This yields 14 calls (or 15 with bank repair), 0 errors.

## 4. Root Causes

1. **Ambiguous trusted standard**: Line 61 of `register-project-lifecycle-budget-hours-cost-and-invoice.md` said `inline activity should be PROJECT_SPECIFIC_ACTIVITY` without specifying it goes in the `activityType` field alongside a separate `name` field. The agent read `PROJECT_SPECIFIC_ACTIVITY` as a name value rather than an enum for `activityType`.

2. **No cross-reference to companion standard**: The `create-project-activity-with-budget.md` standard already had the correct example payload with both `name` and `activityType`, but the lifecycle standard didn't cross-reference it and the agent didn't look there.

## 5. Sandbox Verification

Sandbox re-proof on 2026-03-21 confirmed:

- **Test A** (`activityType` only, no `name`): `422 name: Aktivitetsnavn må fylles ut.`
- **Test B** (`name` only, no `activityType`): `422 activity.activityType: Kan ikke være null.`
- **Test C** (both `name` + `activityType`): `201` — success

Full lifecycle re-proof with corrected payload: **14 calls, 0 errors** (bank account already had number in sandbox).

Invoice created with `amountExcludingVatCurrency=229500` and `projectInvoiceDetails.length=1`.

## 6. Playbook Changes

**Updated existing trusted standard:**
- `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md`
  - Fixed ambiguous line 61: replaced `inline activity should be PROJECT_SPECIFIC_ACTIVITY and currently proven with isChargeable=false` with explicit requirement for both `name` and `activityType` fields
  - Added production run `Migração Cloud Horizonte` findings to OpenAPI / Sandbox Status section

**Updated existing playbook:**
- `./task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md`
  - Added production run `Migração Cloud Horizonte` findings to Verified Findings section

**No new files created. No AGENTS.md table changes needed** (the trusted standard entry already existed).

## 7. Commit

- **Hash:** `705c979f`
- **Message:** `tripletex playbook: project-lifecycle — fix ambiguous activityType payload, both name and activityType mandatory`

## 8. Reusable Heuristics

1. **Both `name` and `activityType` are mandatory** on the inline `activity` object for `POST /project/projectActivity`. The `activityType` field must be `"PROJECT_SPECIFIC_ACTIVITY"` and the `name` field can be any descriptive string (e.g. `"Prosjektaktivitet"`). Omitting either causes a `422`.

2. **When a trusted standard describes a field value ambiguously**, cross-reference the companion standards — the `create-project-activity-with-budget.md` standard had the correct payload example all along.

3. **If a script fails mid-execution**, resume from the failed step with hardcoded IDs from successful responses rather than re-running the entire script. This minimizes wasted calls.

4. **Bank account repair** remains a conditional step in production accounts — not all fresh accounts have bank account numbers pre-populated. Always check and repair with `"12345678903"` (MOD11-valid).
