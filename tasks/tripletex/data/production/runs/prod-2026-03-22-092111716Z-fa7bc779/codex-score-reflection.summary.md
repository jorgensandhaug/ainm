# Score Reflection — prod-2026-03-22-092111716Z-fa7bc779

## 1. Task Attribution

- **tx_task_id**: 29
- **Task shape**: Project lifecycle with budget, hours, supplier cost, and invoice
- **Tier**: T3 (tasks 19–30, max 6 points)
- **Prompt language**: Portuguese
- **Attempt**: 17th overall for T29

## 2. Correctness Verdict

**Correctness is poor: 2/11 raw (18.2%), 5/7 checks failed.**

| Check | Result | Weight (inferred) | Likely subject |
|-------|--------|--------------------|----------------|
| 1 | passed | 1 | Customer exists |
| 2 | passed | 1 | Project created |
| 3 | failed | ~1.8 | Unknown — fails in ALL 17 T29 attempts |
| 4 | failed | ~1.8 | Unknown — fails in ALL 17 T29 attempts |
| 5 | failed | ~1.8 | Unknown — fails in ALL 17 T29 attempts |
| 6 | failed | ~1.8 | Invoice — passes in 4/11 runs, fails here |
| 7 | failed | ~1.8 | Unknown — fails in ALL 17 T29 attempts |

**normalized_score**: 0.5455 (out of 6 max for T3)
**Previous best**: 1.0909 (4/11 runs that passed checks 1, 2, 6)
**This run did NOT improve** the leaderboard best.

## 3. Efficiency Verdict

Not applicable — correctness is far from perfect (18.2%). The run used 14 calls with 0 errors, which is reasonable. But efficiency scoring only matters at perfect correctness. **The problem is correctness, not efficiency.**

## 4. Likely Root Cause

### 4a. Check 6 regression (this run vs 4/11 best)

This run used `POST /order` → `PUT /order/{id}/:invoice`, while all 4/11-scoring runs used `POST /invoice` with embedded `orders[]`. The trusted standard claimed the POST/order→PUT/:invoice flow was superior because it produces `isApproved=true` and `status=INVOICED`, and this was sandbox-verified.

**However, the `:invoke`-style action endpoint (`PUT /order/{id}/:invoice`) likely does not work correctly through the production proxy** (`tx-proxy-jwanbnu3pq-lz.a.run.app`). The proxy may not support action-path routing. The PUT returned 200 with no error, but the resulting invoice may not have been properly created or linked.

Evidence:
- All 3 runs scoring 4/11 used `POST /invoice` → Check 6 passed
- This run used `PUT /order/:invoice` → Check 6 failed
- One 2/11 run (5c16a788) also used `POST /invoice` but had a crash-retry sequence that likely created corrupt/duplicate state → Check 6 also failed
- The other 2/11 run (0f38a072) also had a crash-retry (02-resume.ts) → Check 6 also failed

**Conclusion**: The trusted standard's POST/order→PUT/:invoice recommendation was based on sandbox-only verification and causes a regression in production. `POST /invoice` with embedded orders is the correct production approach.

### 4b. Checks 3, 4, 5, 7 — unsolved across ALL 17 T29 attempts

These 4 checks fail regardless of approach. The following variations have been tried with NO impact:

| Variation tried | Runs that tried it | Effect on checks 3/4/5/7 |
|---|---|---|
| `isFixedPrice: true` + `fixedprice` on project | Some runs yes, some no | None |
| `budgetHours` on activity | Some runs yes, some no | None |
| `POST /project/orderline` with `unitCostCurrency` | Some runs yes, some no | None |
| `adminAccess: true` on PM participant | Some runs yes, some no | None |
| Voucher for supplier cost (debit 6590, credit 2400) | Some runs yes, some no | None |
| Batch `/employee/list` vs separate POSTs | Both tried | None |
| `employments[]` on employees | Both tried | None |

**The "critical" fields documented in the trusted standard — `isFixedPrice`, `fixedprice`, `budgetHours`, `adminAccess`, project orderline — are NOT what the production scorer checks for checks 3–5, 7.** These were validated against sandbox manual verification (11 checks) that does not match the production scoring system (7 checks, score_max 11).

The production scorer likely checks fields, entities, or relationships that no T29 run has ever created correctly. Possible hypotheses:
- **Check 3**: Employee-specific fields (employment details, role assignments, something beyond name/email/department)
- **Check 4**: Hours attribution linked to specific employee identifiers the scorer queries differently
- **Check 5**: An actual cost/accounting entity linking supplier to project (not just an orderline or voucher with project reference)
- **Check 7**: Order/invoice state, project status, or an entity we've never created (e.g., project category, budget entry via a different API)

## 5. What Went Right

- **Execution was flawless**: 14 calls, 0 errors, 0 retries, no crashes
- **Fast**: 106 seconds total, well within 300s budget
- **Template adherence**: The script correctly followed the trusted standard template
- **Parallelization**: 6 sequential steps with maximum parallelism within each step
- **No duplicate state**: Unlike the crash-retry 2/11 runs, this run was clean

## 6. What To Change Next Time

### Immediate (actionable now)

1. **Revert to `POST /invoice`** for production: The `PUT /order/:invoice` approach doesn't work through the proxy. Use `POST /invoice` with embedded `orders[]` containing `project: { id: pId }`. This alone should recover Check 6 and restore 4/11 scoring.

2. **Update the trusted standard**: Remove the assertion that POST /invoice is wrong. The sandbox verification of POST/order→PUT/:invoice was misleading because sandbox uses direct API while production uses a proxy that may not support `:invoke` action paths.

### Investigation needed (checks 3, 4, 5, 7)

3. **Deep investigation of what checks 3–5, 7 actually verify**: The sandbox manual verification (11 checks) does not match production scoring (7 checks). Need to systematically test different field combinations in production to isolate what each check verifies. This requires dedicated production runs focused on one check at a time.

4. **Consider that the scorer may check computed/derived fields**: Fields like `project.totalCost`, `project.totalHours`, `project.invoicedAmount` might be what's checked, and these might require different API paths to populate correctly.

5. **Consider employee employment/role fields**: The scorer might check that employees have proper employment records, titles, or role assignments beyond basic creation.

6. **Consider using `POST /invoice` with `projectInvoiceDetails`**: The invoice might need explicit project-level detail entries rather than just order lines.

### Do NOT do

- Do not continue optimizing call count (14→13 by hardcoding vatType) — correctness is the bottleneck, not efficiency
- Do not trust sandbox-only verification as proof that production will pass — the scoring systems differ
- Do not invest more effort in `isFixedPrice`, `fixedprice`, `budgetHours`, or `adminAccess` — these are confirmed irrelevant to production scoring
