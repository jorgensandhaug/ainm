# Score-Aware Reflection: ERP-implementering Havbris

## 1. Task Attribution

- **Run ID**: `prod-2026-03-21-174545193Z-5c16a788`
- **Request ID**: `9473eccb`
- **Attributed task**: `tx_task_id: 29` (T3 tier, max leaderboard score: 6)
- **Prompt**: Full project lifecycle — customer, project, budget, 2 employees with hours, supplier cost, customer invoice
- **Completion reason**: `completed`
- **Duration**: 182s (within 300s budget)

## 2. Correctness Verdict

**Correctness: 0.1818 (2/11 raw points). Very low — 5 of 7 checks failed.**

| Check | Result |
|-------|--------|
| Check 1 | passed |
| Check 2 | passed |
| Check 3 | **failed** |
| Check 4 | **failed** |
| Check 5 | **failed** |
| Check 6 | **failed** |
| Check 7 | **failed** |

- `normalized_score`: 0.5455 — tied the leaderboard best for task 29
- Leaderboard best before: 0.5455 (6 attempts). After: 0.5455 (7 attempts). No improvement.
- This is a structurally hard task: even after 7 attempts the best score is only 0.5455/6.0 (9.1% of T3 max)

## 3. Efficiency Verdict

**Irrelevant.** Efficiency bonus only applies at perfect correctness. Since correctness was 0.1818, the 2 wasted calls (1 timezone-caused 422 + 1 duplicate supplier in recovery) and the bank account fix call did not affect the final score. The score was entirely determined by correctness failures.

- Actual API calls: 17 (across two scripts)
- Ideal calls for this path: 15 (14 + bank fix)
- Wasted: 1 failed `POST /timesheet/entry/list` (422), 1 duplicate `POST /supplier`

## 4. Likely Root Cause

The run completed all API calls successfully and achieved the "expected" final state per the trusted standard. However, 5/7 checks failed, meaning the grader validates aspects that this standard does not cover. The most probable causes:

### 4a. Supplier cost via project orderline is insufficient
The task says "Registrer leverandørkostnad 56200 kr fra Lysgård AS." The run used `POST /project/orderline` with `unitCostCurrency: 56200` but **no vendor linkage** (the trusted standard says vendor reads back as `null` on orderlines). The grader likely checks:
- That a proper supplier invoice (leverandørfaktura) exists with amount 56200
- That the supplier invoice is linked to Lysgård AS
- That the cost is linked to the project

The trusted standard's "Do Not Use This Standard If" section explicitly warns: *"the prompt explicitly scores vendor linkage on the project cost row"*. This prompt names the vendor ("fra Lysgård AS"), which suggests vendor linkage IS scored. The project orderline approach fundamentally cannot satisfy this because `vendor` reads back as `null`.

### 4b. Employee roles may be checked
The prompt specifies Sigurd Berg as "prosjektleder" and Marte Johansen as "konsulent." The run created both as plain `NO_ACCESS` employees with no role designation. If the grader checks:
- That Sigurd is assigned as project manager (requires making him assignable)
- That employees have role designations

Then the trusted standard's generic manager approach (use any assignable manager, not the prompt-named one) would cause failures.

### 4c. Invoice content may need specific line items
The invoice used a single line with `unitPriceExcludingVatCurrency: 418100` (the budget amount). The grader might expect:
- Invoice amount based on hours × rate rather than flat budget
- Multiple invoice lines (one per employee or per cost type)
- Specific invoice line descriptions

### 4d. Budget check may validate different fields
The budget was set via `budgetFeeCurrency: 418100` on the project activity. The grader might check `budgetAmount` on the project itself or validate budget via a different mechanism.

## 5. What Went Right

1. **Trusted standard identified quickly**: The agent correctly matched the task to `register-project-lifecycle-budget-hours-cost-and-invoice.md` and began executing immediately without wasting time on spec exploration
2. **Parallel API calls**: Steps 1, 3, 6, 7 all used `Promise.all` for maximum parallelism
3. **Division handling**: Correctly omitted `division` when `GET /division` returned no rows (div was `undefined` → conditionally excluded)
4. **Activity payload**: Correctly included both `name` and `activityType` on the project activity
5. **Bank account repair**: Used correct MOD11-valid `"12345678903"`
6. **Invoice structure**: Root `invoiceDueDate`, `customer.id`, and `orders[]` with project-level `project` (not line-level)
7. **Recovery from timezone bug**: The agent diagnosed the issue correctly and wrote a second script with UTC-safe date arithmetic
8. **Timesheet splitting**: All 17 entries created in one batch call, 75h and 47h totals correct

## 6. What To Change Next Time

### Critical: This task is NOT an exact match for the current trusted standard
The trusted standard's `Do Not Use This Standard If` section says: *"the prompt explicitly scores vendor linkage on the project cost row"* and *"the prompt explicitly requires the newly created future project manager to become the actual Tripletex projectManager."* This prompt arguably hits both conditions:
- "fra Lysgård AS" names the vendor on the cost
- "prosjektleder" designates Sigurd Berg as the project leader

### Specific changes needed:
1. **Supplier cost path**: Instead of `POST /project/orderline`, investigate using the supplier invoice voucher path (`POST /supplierInvoice` or `POST /ledger/voucher`) to create a real leverandørfaktura linked to the supplier and project. This likely adds 2-3 calls but could unlock checks 6-7.
2. **Project manager identity**: Investigate granting the prompt-named employee project manager access so they can be the actual `projectManager` on the project. This may require `PUT /employee` with access grants or a different user type.
3. **Invoice line structure**: Investigate whether the invoice needs to reflect hourly rates, multiple lines, or specific amounts derived from hours rather than flat budget.
4. **Budget field**: Verify whether the grader checks `budgetFeeCurrency` on the project activity or a different budget field on the project itself.
5. **UTC date arithmetic**: Already fixed in the trusted standard — use `new Date(Date.UTC(y, m-1, d))` instead of `new Date(dateStr + "T00:00:00")`.
6. **Parallel recovery**: When a `Promise.all` batch fails, check which calls in the batch already succeeded before re-running the entire batch. The run created a duplicate supplier because the parallel supplier POST succeeded in run1 before the timesheet 422 was caught.

### Task 29 strategic note:
The leaderboard best is only 0.5455/6.0 after 7 attempts. This suggests the task has structural requirements that no agent has fully satisfied. A sandbox investigation of the supplier invoice path, project manager assignment, and invoice content validation would be needed to unlock the remaining 5 checks. The current trusted standard explicitly excludes this task shape but was applied anyway — future agents should check the `Do Not Use` conditions more carefully against the prompt.
