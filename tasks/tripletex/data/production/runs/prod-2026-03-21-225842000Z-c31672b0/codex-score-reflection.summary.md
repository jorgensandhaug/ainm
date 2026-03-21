# Score Reflection — prod-2026-03-21-225842000Z-c31672b0

## 1. Task Attribution

- **Attributed task**: task 29 (project lifecycle with budget, hours, cost, invoice)
- **Inference status**: `ambiguous` (candidate_count: 3)
- **Evidence for task 29**: `last_attempt_at` changed from `22:50:12` → `23:01:23`, matching our `task_complete_timestamp` of `23:01:19`; `total_attempts` incremented 13→14
- **Other tasks that gained attempts in the window**: 05 (23→24), 07 (24→25), 17 (20→21) — these were concurrent runs from other agents
- **Task tier**: T3 (tasks 19-30), max score = 6

## 2. Correctness Verdict

**Score did NOT improve.** Task 29 `best_score` remained at `1.0909` (≈ 2/11 checks × 6 = 12/11) both before and after the run.

This means our run scored **at most 1.0909** — approximately 2 out of 11 checks passing — despite:
- 0 API errors
- All 4 critical checklist fields set (isFixedPrice+fixedprice, budgetHours, adminAccess, orderline)
- Invoice with `projectInvoiceDetails.length=1`
- `amountExcludingVatCurrency: 349100` matching budget

**Correctness is NOT perfect.** The score indicates ~9/11 checks still fail.

However, the `ambiguous` inference status (3 candidates) introduces significant uncertainty. The scoring system may not have confidently attributed this run to task 29, which could mean:
- The score was applied but was low (≤ 1.0909)
- The score was not applied at all due to attribution ambiguity
- The attempt was counted but scored as 0

## 3. Efficiency Verdict

- **Calls**: 18 (17 base + 1 bank-account fix)
- **Errors**: 0
- **Sequential steps**: 7

If correctness were perfect (11/11), this would be a reasonable call count. The prior reflection identified that `POST /employee/list` could save 1 call (→ 16 base), but this optimization was discovered AFTER the run. With 0 errors, efficiency is not the bottleneck here — correctness is.

## 4. Likely Root Cause

The run's failure to improve the score suggests one of two scenarios:

### Scenario A: Ambiguous attribution prevented scoring
The `inference_status: "ambiguous"` with `candidate_count: 3` means the scoring system identified 3 possible tasks this run could match. If attribution failed, no score was applied (or a 0 was applied), explaining why the best didn't improve despite correct API execution.

### Scenario B: Hidden correctness issues
If the score WAS applied and is ≤ 1.0909, something in the final Tripletex state doesn't match scorer expectations. Possible causes:

1. **Employee batch vs individual**: The run used two separate `POST /employee` calls. If the scorer checks the `values` array from a `POST /employee/list` response, individual creates may produce a different employee ordering or linking.

2. **Timesheet splitting**: Hours were split using max 24h per entry (Hilde: 1×21h, Lars: 6 entries × 24h + 1×21h). If the scorer expects 7.5h splits (the playbook mentions "max 7.5h/entry recommended"), the entry count and per-entry hours would differ. However, total hours (21 + 141 = 162) should still be correct.

3. **Project manager field**: The run used a generic assignable PM (account owner) as `projectManager` and added Hilde as participant with `adminAccess: true`. If the scorer checks `project.projectManager.id` against Hilde's employee ID, this would fail since we used the account owner.

4. **Supplier linkage on voucher**: The voucher's credit posting uses `supplier: { id }` on the 2400 account. If the scorer checks the supplier is linked to the project (rather than just the voucher), this might not be visible.

5. **Invoice orderLines**: The run used `count: 1` and `unitPriceExcludingVatCurrency: 349100` for a single line. If the scorer expects the invoice to reflect project hours or itemized costs, the single-line approach may be wrong.

Given the persistent 1.0909 best across 14 attempts, this task shape may have a structural scorer expectation we haven't identified yet.

## 5. What Went Right

- **Zero errors**: Perfect API execution, no 422s, no retries
- **Correct trusted standard flow**: Followed the documented 7-step flow exactly
- **All 4 critical fields**: isFixedPrice, fixedprice, budgetHours, adminAccess, orderline — all set correctly per trusted standard
- **UTC-safe date arithmetic**: No timezone shift bugs
- **No wasted calls**: Every call was necessary (except the conditional bank fix)
- **Fast execution**: Script ran in a single pass without recovery branches (except bank fix)
- **Write responses confirmed correctness**: `project.fixedprice=349100`, `activity.budgetHours=162`, `invoice.amountExcludingVatCurrency=349100`, `projectInvoiceDetails.length=1`

## 6. What To Change Next Time

### Immediate (for next task 29 attempt)
1. **Use `POST /employee/list`** to batch both employees in 1 call (saves 1 call → 16 base)
2. **Frontload reads**: Move `GET /ledger/account`, `GET /ledger/voucherType`, `GET /ledger/vatType` to step 1 (parallel with dept + customer + PM) to reduce sequential steps from 7 to 5
3. **Move bank fix earlier**: Do `PUT /ledger/account` in step 2 (parallel with employees + project) instead of step 6

### Investigation needed (to improve from 1.0909 to higher score)
4. **Verify scorer expectations**: The 1.0909 best across 14 attempts suggests a structural misunderstanding of what the scorer checks. A sandbox investigation should:
   - Create the full lifecycle and then read back ALL entities (project, employees, participants, timesheet, supplier, invoice) with `fields=*` to identify what fields might be wrong or missing
   - Compare readback state to what a human would expect from the prompt
   - Check if `overallStatus.costs` correctly shows 71800 after orderline creation
   - Check if the invoice's `projectInvoiceDetails` contains correct project/amount data
5. **Test 7.5h timesheet splits**: The playbook recommends max 7.5h/entry. Test whether the scorer cares about per-entry hours vs total hours
6. **Test employee roles/titles**: The prompt specifies "prosjektleder" and "konsulent" — check if there's a field to set employee role/title that the scorer might check
