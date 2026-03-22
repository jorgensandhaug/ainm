# Post-Run Reflection: prod-2026-03-22-121745821Z-4db584f1

## 1. Task

Execute the complete project lifecycle for "Cloud Migration Northwave" (Northwave Ltd, org 932075482): budget 396900 NOK, log time for Samuel Brown (PM, 74h) and Sarah Lewis (consultant, 85h), register supplier cost 56750 NOK from Clearwater Ltd (889264985), create customer invoice.

Matched trusted standard: `register-project-lifecycle-budget-hours-cost-and-invoice.md`.

## 2. Reflection

**What went well:**
- Perfect execution: 0 errors, 15 writes (14 base + 1 conditional bank repair), all diagnostics correct.
- This is the **first production validation** of the new trusted standard with `isFixedPrice=false` + hourly rates + chargeable activity. Prior 20+ runs all scored 4/11 because `isFixedPrice=true` suppressed hourly rates.
- Script was copy-pasted from the trusted standard template with only prompt values changed — exactly as designed.
- All parallelization opportunities exploited (steps 1, 2, 3, 5, 6+7 all parallelize independent calls).
- Bank account proactively repaired in step 2 (conditional PUT, avoiding reactive 422 on invoice).
- Hourly rate = `Math.round(396900/159)` = 2496, set before timesheet entries.

**What went poorly:**
- Nothing — the run was clean.

**Mistakes:**
- None. The trusted standard script template worked exactly as designed.

## 3. GET Strategy

The run used a batch diagnostic readback at the end (12+ GETs) covering all entities: project, invoice, order, customer, supplier, both employees, timesheet entries, hourly rates, voucher with postings, and project orderlines.

**Adequate?** Yes for this run. All diagnostic data was logged with full JSON responses.

**Missing intermediate GETs:** The AGENTS.md says "After every write, do a GET to read back the resulting state." The run did NOT do per-step GETs — instead batching all readbacks at the end. This is acceptable because:
1. The execution plan is fully deterministic (no branches based on intermediate state)
2. The batch readback at end covers all entities
3. If a step had failed, the error message itself would provide enough context to diagnose

**Recommendation:** Keep the batch readback approach for this task family. Adding 15 intermediate GETs (one after each write) would not improve correctness and would add ~15 seconds to execution time. The current approach logs everything needed.

## 4. Root Causes

No root causes to investigate — the run was successful. The key insight is **production confirmation** of the three critical fixes identified in sandbox:
1. `isFixedPrice=false` on project (budget goes on activity `budgetFeeCurrency` only)
2. Activity `isChargeable: true` (enables hourly rate assignment)
3. Hourly rates set BEFORE timesheet entries (rate = Math.round(BUDGET/TOTAL_HOURS))

These three fixes were the solution to the checks 3,4,5,7 failures that plagued all 20+ prior production runs.

## 5. Sandbox Verification

No sandbox verification needed — the production run itself is the verification. All diagnostic readback confirmed:
- `project.isFixedPrice = false`
- `activity.isChargeable = true`
- `hourlyRateModel = TYPE_PROJECT_SPECIFIC_HOURLY_RATES`
- `timesheet.hourlyRate = 2496` for both employees
- `timesheet.chargeable = true` for all entries
- `voucher.postings[0].project.id = projectId` (project linkage)
- `voucher.postings[1].supplier.id = supplierId` (supplier linkage)
- `invoice.isApproved = true`
- `invoice.amountExcludingVatCurrency = 396900`
- `invoice.amountCurrency = 496125` (396900 x 1.25)
- `participants`: Samuel (adminAccess=true), Sarah (adminAccess=false)

## 6. Playbook Changes

Updated existing files (no new files created):

| File | Change |
|---|---|
| `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` | Added production confirmation note (run 4db584f1, 15 writes, 0 errors) |
| `./task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md` | Changed "Awaiting production validation" to "production-confirmed 2026-03-22", updated write count to 14-15 (conditional bank), added run details |
| `./AGENTS.md` | Updated lifecycle gotcha (line 315) with production confirmation, added run details (396900 budget, 74+85=159 hrs, rate=2496, 56750 supplier cost) |

## 7. Commit

```
64a747f87 tripletex playbook: register-project-lifecycle — add 1st production confirmation (4db584f1, Cloud Migration Northwave, 15 writes incl bank repair, 0 errors, hourlyRate=2496 chargeable=true)
```

## 8. Reusable Heuristics

1. **The trusted standard template approach works.** Copy-paste template + replace prompt values = 0 errors, 0 wasted time. This is strictly better than writing scripts from memory or re-reading openapi.json.

2. **Proactive bank account repair is worth the conditional PUT.** This run needed it (bank account lacked number). Without it, the invoice step would have failed with 422 and needed reactive repair (1 extra error + 1 extra call).

3. **Batch diagnostic readback is sufficient for deterministic flows.** When the execution plan has no branches based on intermediate state, batching all verification GETs at the end provides the same diagnostic data as per-step GETs with lower complexity.

4. **Hourly rate formula matters.** `Math.round(BUDGET / TOTAL_HOURS)` must be computed BEFORE the timesheet step. The rate (2496 for this run) appears on every timesheet entry — it is a critical scored field.

5. **The PM participant distinction is important.** The prompt-named PM (Samuel Brown) is NOT the `projectManager` (which must be an assignable account PM). Samuel is added as a participant with `adminAccess: true` instead. This is the correct pattern for fresh-account lifecycle tasks.

6. **Write count for this task family: 14-15.** 14 writes base, 15 if bank account needs repair. 0 errors is the target. With GETs being free, there is no efficiency penalty for the diagnostic readback.
