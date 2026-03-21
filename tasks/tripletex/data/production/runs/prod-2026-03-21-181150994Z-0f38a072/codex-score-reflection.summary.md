# Score Reflection — Cloud Migration Northwave

## 1. Task Attribution

- **Run ID**: `prod-2026-03-21-181150994Z-0f38a072`
- **Task ID**: `29` (T3, max score 6)
- **Request ID**: `8fb7450b`
- **Completion**: completed at `2026-03-21T18:13:59Z`, duration 144746ms (~2.4 min)
- **Prompt**: Register project lifecycle — customer, project, budget, 2 employees with hours, supplier cost, customer invoice

## 2. Correctness Verdict

**Correctness: 0.1818 (2/11 check points) — MAJOR FAILURE**

- 7 checks total, only 2 passed (checks 1–2), 5 failed (checks 3–7)
- `score_raw = 2`, `score_max = 11`, `normalized_score = 0.5455`
- This is **not an efficiency problem** — this is a **correctness failure**. The final Tripletex state was significantly wrong despite all API calls returning success.

Critically: the leaderboard shows the **best score across all 8 attempts** for task 29 is also 0.5455. This run tied the best but did not improve it. Every attempt has failed the same 5 checks, indicating a **systematic structural problem** with the current approach for this task shape.

## 3. Efficiency Verdict

Efficiency is irrelevant because correctness is far from perfect. The run used 16 API calls (15 successful + 1 wasted 422 on `isChargeable` placement). Ideal would have been 15 (14 + bank fix). But since only 18% correctness was achieved, the 1 wasted call is a minor concern compared to the 5 failing checks.

- **Wasted call**: 1 × `POST /project/projectActivity` with `isChargeable` on root → 422
- **Conditional call**: 1 × `PUT /ledger/account` for bank account fix (necessary)
- **If correctness were perfect**: the 16-call run would have scored adequately but not optimally

## 4. Likely Root Cause

The 5/7 checks that consistently fail across all 8 attempts point to fundamental structural problems with how the task is executed. The most likely causes:

### Hypothesis A: Budget field mismatch
The run set budget via `POST /project/projectActivity` with `budgetFeeCurrency: 396900`. The scoring may check a different field — possibly `project.budget` or another project-level budget property that the project activity write does not set. The trusted standard only sets budget on the activity, not on the project itself.

### Hypothesis B: Employee role/identity not properly linked
The task specifies "Samuel Brown (project manager)" and "Sarah Lewis (consultant)". The run created both as `NO_ACCESS` employees and logged hours, but:
- Samuel Brown was NOT set as the project manager — a generic assignable manager was used instead
- Employee roles/titles were not set — the scoring might check that Samuel Brown is actually the project's `projectManager`
- The trusted standard explicitly says "do not add exact-email project-manager reads" but this task may score the project manager identity

### Hypothesis C: Supplier cost method wrong
The run used `POST /project/orderline` with `unitCostCurrency: 56750`. The scoring may expect a formal supplier invoice (via `POST /supplierInvoice` or voucher machinery) rather than a project cost orderline. The trusted standard explicitly avoids the supplier-invoice path, but the task says "Register supplier cost" which may need an actual supplier invoice.

### Hypothesis D: Invoice content/amount expectations
The invoice was created with `unitPriceExcludingVatCurrency: 396900` (the budget amount). The scoring may expect the invoice amount to be calculated differently — e.g., based on hours × rate, or it may check for specific order line descriptions matching the project work.

### Most likely combination
Given that 5 of 7 checks fail consistently, the root cause is probably **multiple of the above** — the current trusted standard optimizes for minimum API calls by using shortcuts (generic manager, cost orderline instead of supplier invoice, activity budget instead of project budget) that sacrifice correctness fields the scoring system actually checks.

The trusted standard's "Do Not Use" section warns against using it when "the prompt explicitly requires the newly created future project manager to become the actual Tripletex projectManager" — and this task does say Samuel Brown is the "project manager", which likely means the scoring checks that link.

## 5. What Went Right

1. **Fast execution**: Completed in ~2.4 minutes, well within the 300s budget
2. **Trusted standard identified correctly**: The task is a lifecycle task
3. **All API calls succeeded** (except the 1 isChargeable 422): customer, employees, project, activity, timesheet, supplier, cost, invoice all created
4. **UTC-safe date arithmetic**: Timesheet splitting used `Date.UTC()` correctly, avoiding the CET/CEST timezone trap
5. **Division handling**: Correctly omitted division when none existed (divId was undefined, conditionally excluded)
6. **Bank account repair**: Correctly used MOD11-valid `"12345678903"`
7. **Prior reflection** correctly identified and documented the `isChargeable` placement pitfall

## 6. What To Change Next Time

### Critical changes needed for task 29 (and similar lifecycle tasks):

1. **Set Samuel Brown as the actual project manager**: The task says "Samuel Brown (project manager)" — the scoring likely checks `project.projectManager` references the Samuel Brown employee. This means:
   - Create Samuel Brown first
   - Grant project manager access or find a way to make him assignable
   - Use his ID as `projectManager.id` on `POST /project`
   - This conflicts with the trusted standard's "generic assignable manager" shortcut

2. **Investigate supplier invoice vs project orderline**: The scoring may require a formal supplier invoice from Clearwater Ltd, not just a project cost orderline. Test both paths in sandbox and verify which one the scoring checks.

3. **Investigate project-level budget fields**: Check if the project object has a `budget` field separate from the activity's `budgetFeeCurrency`. If so, set it directly on the project.

4. **Re-evaluate the trusted standard's "Do Not Use" criteria**: The task says "Samuel Brown (project manager)" — this matches the "Do Not Use" condition "the prompt explicitly requires the newly created future project manager to become the actual Tripletex projectManager". The agent should have recognized this and NOT used the trusted standard blindly.

5. **The trusted standard needs a structural rethink for this task shape**: The current standard sacrifices correctness for call count. For task 29 specifically, the right approach is likely:
   - Make the prompt-named project manager the actual `projectManager` (even if it costs extra calls)
   - Use a supplier invoice for the supplier cost (even if it costs extra calls)
   - Set budget on the correct field (investigate which field the scoring checks)

### Immediate investigation priorities for next sandbox session:
- Can a newly created employee be made into an assignable project manager? What API calls are needed?
- Does `POST /project` accept a non-assignable employee as `projectManager.id`?
- Does the scoring check `project.projectManager.firstName/lastName` or just `project.projectManager.id`?
- Does `POST /supplierInvoice` or similar create a cost that the scoring verifies differently than `POST /project/orderline`?
- What project-level fields hold budget data vs activity-level fields?
