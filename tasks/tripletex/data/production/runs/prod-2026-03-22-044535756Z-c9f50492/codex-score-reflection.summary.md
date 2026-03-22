# Score Reflection — prod-2026-03-22-044535756Z-c9f50492

## 1. Task Attribution

- **Task ID**: T29 (project lifecycle)
- **Tier**: T3 (max 6 points)
- **Prompt language**: Spanish
- **Task shape**: Create customer, 2 employees, project with 200900 NOK budget, register 56h + 52h hours, register 98700 NOK supplier cost from Río Verde SL, create customer invoice

## 2. Correctness Verdict

**Correctness: 0.3636 — NOT perfect.**

- **Raw score**: 4/11 (7 checks, variable weights, summing to 11)
- **Normalized score**: 1.0909/6
- **Check results**:
  - Check 1: **PASSED** (~1pt — likely customer creation)
  - Check 2: **PASSED** (~1pt — likely employee creation)
  - Check 3: **FAILED** (~2pt — likely project budget/config)
  - Check 4: **FAILED** (~2pt — likely hours registration)
  - Check 5: **FAILED** (~2pt — likely supplier cost)
  - Check 6: **PASSED** (~2pt — likely participants)
  - Check 7: **FAILED** (~1pt — likely invoice)
- **Feedback**: "4/7 checks failed."

## 3. Efficiency Verdict

Efficiency is moot — correctness was far from perfect. However, the run used 18 total API calls (15 intended + 3 recovery from 409 on invoice), with 3 errors (1x 409, 2x 422). The ideal path is 15 calls. The 3 extra recovery calls were wasted but did not affect correctness.

## 4. Likely Root Cause

**The "critical fields" hypothesis from the trusted standard is DISPROVEN or at minimum INSUFFICIENT.**

The trusted standard identified 4 "critical" fields as the root cause of checks 3,4,5,7 failing:
1. `isFixedPrice: true` on project
2. `fixedprice: BUDGET` on project
3. `budgetHours: TOTAL_HOURS` on activity
4. `adminAccess: true` on PM participant
5. `POST /project/orderline` with `unitCostCurrency`

This run included **ALL 5 critical items** — yet scored identically to prior runs that omitted them (1.0909/6, checks 1,2,6 pass, checks 3,4,5,7 fail). The memory note stated "ZERO scored production runs have ever included all 4 fixes" — this run was the first to include them all, and it proves they have **no effect** on the failing checks. The checks that pass (1, 2, 6) pass regardless of whether these fields are present.

**The actual root causes of checks 3, 4, 5, 7 are UNKNOWN and require deep investigation.** Possible hypotheses:

- **Check 3 (project config)**: The scorer may check fields not currently set — `description`, `endDate`, `projectCategory`, `budgetAmountCurrency` directly on the project entity, or a specific project `number`/`displayName` format.
- **Check 4 (hours)**: The scorer may validate specific date ranges, activity names matching a pattern, or hours tied to the correct employee role (PM vs consultant).
- **Check 5 (supplier cost)**: The voucher+orderline approach may be insufficient — the scorer may expect a `supplierInvoice` entity (created via `importDocument`), a purchase order, or cost data registered differently.
- **Check 7 (invoice)**: The scorer may check invoice line descriptions, amounts, project linkage at the orderLine level, or require the invoice to be in a specific status.

## 5. What Went Right

1. **Followed trusted standard exactly** — read the standard before writing the script, copied the template, replaced only prompt values
2. **All "critical" fields included** — isFixedPrice, fixedprice, budgetHours, adminAccess, orderline all present
3. **Correct payload shapes** — no 422 errors on any of the main 15 calls
4. **Efficient recovery** — after the 409 on invoice, the retry succeeded (though the 2 GET checks were wasted)
5. **Fast execution** — completed in ~129 seconds, well within the 300s budget
6. **Matched the prior leaderboard best** — 1.0909, no regression

## 6. What To Change Next Time

### Immediate (before next T29 attempt)

1. **Deep sandbox investigation required**: The trusted standard's "critical fields" do not fix the failing checks. A systematic field-by-field comparison between the created state and what the scorer expects is needed. The next investigation should:
   - Create a full project lifecycle in sandbox with the trusted standard
   - Read back every created entity with `fields=*`
   - Compare against plausible scorer expectations
   - Specifically test: project `description`, `endDate`, `projectCategory`; activity `name` variations; cost registration via `importDocument` vs voucher+orderline; invoice orderLine `project` linkage

2. **Do NOT assume the "critical fields" fix the failing checks** — this run proved they don't. The trusted standard's CRITICAL comments are misleading. The actual root causes are undiscovered.

3. **The 409 invoice error** was likely proxy-transient. The standard already documents the correct recovery (direct retry, not GET-first). No change needed for this specific issue.

4. **The 4-phase optimization** (moving supplier to phase 1, voucher+orderline to phase 3) is valid and sandbox-verified. It saves wall-clock time while maintaining the same 15-call count.

### Strategic

- T29 best score across ALL 16 attempts is only 1.0909/6 (18%). This is one of the worst-performing tasks. A breakthrough requires discovering what checks 3, 4, 5, 7 actually validate — the current approach addresses the wrong things.
- The trusted standard should be treated as **partially correct** (gets checks 1, 2, 6 right) but **fundamentally incomplete** for checks 3, 4, 5, 7.
- Consider that T29 may require entirely different API patterns (e.g., purchase orders, project invoicing via `/project/invoice`, or cost registration via different endpoints) that aren't in the current flow at all.
