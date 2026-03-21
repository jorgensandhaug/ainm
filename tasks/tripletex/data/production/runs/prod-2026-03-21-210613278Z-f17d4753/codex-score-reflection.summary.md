# Score Reflection — prod-2026-03-21-210613278Z-f17d4753

## 1. Task Attribution

- **tx_task_id**: 29
- **Tier**: T3 (tasks 19-30), max score = 6
- **Task**: Register project lifecycle — Migração Cloud Horizonte (Horizonte Lda / 857400526), budget 229500, hours 37h (Catarina) + 62h (João), supplier cost 56300 (Oceano Lda / 941830420), client invoice
- **Attempt**: 10th overall for task 29 (our attempt)

## 2. Correctness Verdict

**Correctness: 0.3636 (4/11 check-points). NOT perfect.**

- score_raw: 4, score_max: 11
- normalized_score: 1.0909 out of max 6
- 3 of 7 checks passed, 4 failed

| Check | Result |
|-------|--------|
| 1 | passed |
| 2 | passed |
| 3 | **failed** |
| 4 | **failed** |
| 5 | **failed** |
| 6 | passed |
| 7 | **failed** |

This run **tied the leaderboard best** for task 29 (1.0909 before, 1.0909 after). No previous attempt across 10 total attempts has scored higher.

## 3. Efficiency Verdict

Efficiency is irrelevant because correctness < 1. The run executed 19 calls with 0 errors (18 base + 1 bank-account fix), which is the documented minimum for the trusted-standard flow. No calls were wasted. However, the perfect-efficiency execution could not compensate for structural correctness failures.

## 4. Likely Root Cause

The 4 failing checks indicate that certain scored fields or side effects are not being produced by the current trusted-standard flow. This is a **structural correctness problem**, not an execution error. The script ran to completion with 0 errors, all entities were created, and all amounts matched the prompt.

**Most likely check-to-task mapping and failure analysis:**

| Check | Likely validates | Why it failed |
|-------|-----------------|---------------|
| 1 (passed) | Customer exists with correct name/org | Horizonte Lda / 857400526 created correctly |
| 2 (passed) | Project exists with correct name | "Migração Cloud Horizonte" created correctly |
| 3 (failed) | Budget = 229500 or project manager assignment | Budget was set on `projectActivity.budgetFeeCurrency` — scorer may check a different budget field on the project entity itself. OR: scorer checks that Catarina Martins is project manager, but we used a generic assignable PM (API limitation prevents newly created employees from being PM) |
| 4 (failed) | Catarina's 37 hours registered | Timesheet entries were created correctly (37h split across 5 dates). Failure may be: (a) scorer reads hours via a path that requires employee to have an employment record with the correct division linkage, or (b) scorer checks for employee title/role ("gestor de projeto") which wasn't set |
| 5 (failed) | João's 62 hours registered | Same structural issue as check 4 — 62h split across 9 dates were created, but the check mechanism may not find them |
| 6 (passed) | Supplier cost 56300 linked to project | Leverandørfaktura voucher with project linkage on 6590 posting and supplier linkage on 2400 posting — scorer can verify this |
| 7 (failed) | Invoice details (amount, project link, order lines) | Invoice was created with correct amount (229500) and projectInvoiceDetails. Failure may be: invoice line description, specific VAT calculation, or a missing field the scorer expects |

**Key structural hypotheses for the 4 persistent failures:**

1. **Project manager assignment**: The task explicitly calls Catarina "gestor de projeto". The scorer may verify `project.projectManager` matches Catarina's employee ID. Current flow uses the account owner as PM because newly created NO_ACCESS employees cannot be assigned as PM via API. This is a known limitation with no API workaround.

2. **Employee employment/role linkage**: The scorer may check that employees have specific employment records or role designations. The current flow creates employees with `userType: "NO_ACCESS"` and basic employment records. If the scorer requires `title`, `jobTitle`, or employment-level role fields, these are not being set.

3. **Budget field mismatch**: The scorer may check `project.budget` rather than `projectActivity.budgetFeeCurrency`. If the project entity itself has a budget field that's not being populated, this would explain the budget check failure.

4. **Invoice line structure**: The scorer may validate specific invoice order-line fields (description matching, specific count/price breakdowns by hours vs. cost) that don't match our single 229500 line.

**Critical observation**: This run **tied the all-time best score** for task 29 (1.0909) across 10 attempts. No agent has ever scored higher. This strongly suggests the 4 failing checks represent **unsolved structural problems** in the task-29 flow that affect all agents equally, not mistakes specific to this run.

## 5. What Went Right

1. **Zero API errors**: 19 calls, 0 4xx responses — the cleanest possible execution of the trusted-standard flow
2. **All entity creation succeeded**: Customer, 2 employees, project, project activity (budget), 2 participants, timesheet entries (99h), supplier, voucher (56300 cost), invoice (229500)
3. **Correct amounts**: Budget 229500, hours 37+62=99, supplier cost 56300, invoice amount 229500 all matched prompt
4. **UTC-safe date arithmetic**: No timezone-related timesheet date errors (fixed from earlier production runs)
5. **Trusted-standard compliance**: All documented pitfalls were avoided (employmentType, row fields, voucherType lookup, division handling, isChargeable placement)
6. **Bank-account recovery**: Correctly detected missing bankAccountNumber and repaired with MOD11-valid "12345678903"
7. **Tied leaderboard best**: Matched the highest score ever achieved on task 29

## 6. What To Change Next Time

Since this is a persistent structural problem (0/10 attempts have passed all 7 checks), the next improvement requires **investigation**, not execution optimization:

1. **Investigate project manager assignment**: Test whether creating an employee with `userType: "STANDARD"` or using `PUT /project` after granting project-manager access changes the PM check. The scorer likely validates `project.projectManager.id` matches the prompted PM employee.

2. **Investigate project-level budget field**: Check if `POST /project` or `PUT /project` accepts a `budget` or `totalBudget` field distinct from `projectActivity.budgetFeeCurrency`. The scorer may read budget from the project entity, not the activity.

3. **Investigate employee title/role fields**: Test whether `POST /employee` accepts `title`, `jobTitle`, or role fields that could match "gestor de projeto" / "consultor". The scorer may validate these.

4. **Investigate invoice order-line structure**: Test whether the scorer expects multiple order lines (one for hours, one for cost) rather than a single 229500 line. Or whether the invoice amount should equal hours-only or include/exclude supplier cost.

5. **Consider alternative timesheet read path**: Verify timesheet entries are readable via `GET /timesheet/entry?employeeId=X&projectId=Y` — if the scorer uses a specific read path that requires additional employment or project membership fields, the entries might not be discoverable.

6. **Do NOT change the execution approach**: The current flow is already at minimum calls (18+1 bank fix) with 0 errors. Any changes should focus on payload content, not call structure.

7. **Priority**: Focus sandbox investigation on hypotheses 1 (PM assignment) and 2 (project-level budget) first, as these seem most likely to unlock new check passes. Task 29 has never been fully solved, so solving even one more check would be a new leaderboard record.
