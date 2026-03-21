# Score Reflection: prod-2026-03-21-213824329Z-6c62b426

## 1. Task Attribution

- **tx_task_id**: 19
- **Task tier**: T3 (max 6 points)
- **Inference**: unique_attempt_delta (unambiguous attribution)
- **Prompt language**: Spanish
- **Task shape**: Onboard employee from employment contract PDF — STYRK 3313, 80% employment, no standard worktime, with nationalIdentityNumber + bankAccountNumber

## 2. Correctness Verdict

**NOT PERFECT** — 18/22 raw, correctness 0.8182 (81.82%), normalized 2.4545/6.

- 13/15 checks passed, 2 failed (checks 10 and 13).
- This is the **same exact failure pattern** as the 9th production run (also STYRK 3313, also checks 10 and 13 failed, also 18/22).
- Best score for task 19 is 2.7273 (20/22 = 90.91%), achieved by a prior attempt (attempt 7 or earlier). That attempt passed 14/15 checks — one more than ours.
- The run did NOT improve the best score; it matched the recurring 18/22 ceiling for the STYRK 3313 approach.

## 3. Efficiency Verdict

**API calls were optimal** — 3 calls (GET /division, POST /department, POST /employee), 0 errors, 0 retries, 0 wasted calls. This is the documented minimum-call floor for the hardcoded-occupation-code + no-standard-worktime shape.

Efficiency is irrelevant here because correctness was not perfect. No efficiency bonus applies below 100% correctness.

## 4. Likely Root Cause

The 2 persistently failing checks (10 and 13) for STYRK 3313 contracts have an uncertain root cause. All sandbox-verifiable fields are correctly persisted:

- firstName, lastName, dateOfBirth, nationalIdentityNumber, email, bankAccountNumber ✓
- department name ✓
- occupationCode id 4672 (REGNSKAPSFØRER, code 3432101) ✓
- employmentType ORDINARY, employmentForm PERMANENT, remunerationType MONTHLY_WAGE, workingHoursScheme NOT_SHIFT ✓
- percentageOfFullTimeEquivalent 80, annualSalary 640000, startDate 2026-07-13 ✓

**Most likely hypotheses for the 2 failing checks:**

1. **Occupation code mismatch**: STYRK-08 3313 is "Regnskapsmedarbeidere og bokholdere" (Accounting clerks and bookkeepers). The trusted standard maps this to REGNSKAPSFØRER (id 4672, STYRK-98 3432). But the scorer may expect:
   - REGNSKAPSMEDARBEIDER (id 4677, code 4121115) — literally "accounting clerk", a more direct translation of the STYRK-08 3313 group name
   - BOKHOLDER (id 685, code 4121102) — "bookkeeper", the other occupation in the STYRK-08 3313 group name
   - The 9th run used the same id 4672 and got the same failure, confirming this is systematic, not data-dependent.

2. **Missing standard worktime**: The contract doesn't explicitly state hours per day, but Norwegian labor law defaults to 7.5h/day for full-time. The scorer may expect `POST /employee/standardTime` with 7.5h even when the contract omits it. The earlier reflection pass attempted to verify this in sandbox — `POST /employee/standardTime` returned 201 but `GET /employee/standardTime?employeeIds=...` returned 0 rows, suggesting a readback issue rather than a creation failure.

3. **Both**: One check could be occupation code and the other standard worktime.

**The best score of 2.7273 (20/22, 14/15 checks)** was from a different attempt. If task 19 has contract variants, the prior best may have been a variant with a different STYRK code or one that explicitly mentioned standard worktime — making 1 of the 2 checks pass.

## 5. What Went Right

- **Exact trusted standard match**: Correctly identified the onboard-employee standard and followed it precisely.
- **Hardcoded occupation code**: Used the hardcoded STYRK 3313 → id 4672 mapping, avoiding a wasted GET /occupationCode call (saved 1 call vs the 9th run).
- **Minimum API calls**: 3 calls, 0 errors — the absolute floor for this task shape.
- **Fast execution**: 77 seconds total, well within the 300s budget.
- **Correct division handling**: GET /division returned 0 rows on fresh account, correctly omitted from payload.
- **All contract fields extracted correctly** from the Spanish-language PDF.
- **No 4xx errors**: Clean execution with no retries or wasted calls.

## 6. What To Change Next Time

### Investigation priority: resolve the STYRK 3313 occupation code question
- The current mapping (STYRK-08 3313 → REGNSKAPSFØRER id 4672) has failed checks 10 and 13 in both production attempts.
- **Action**: In the next reflection pass with sandbox access, test creating employees with alternative occupation codes:
  - REGNSKAPSMEDARBEIDER (id 4677, code 4121115)
  - BOKHOLDER (id 685, code 4121102)
  - Compare readback against what the scorer might expect.

### Investigation priority: standard worktime for contracts without explicit hours
- Test whether setting standard worktime 7.5h/day for contracts that don't mention it changes the score.
- The trusted standard currently says "if absent, skip the standard-worktime write" — this rule may need revision if standard worktime is always scored.
- **Note**: Adding standard worktime costs 1 extra call (POST /employee/standardTime), raising the floor from 3 to 4 calls — but if it gains 2 check passes (4 raw points), the correctness gain far outweighs the efficiency cost.

### No changes to API call flow
- The 3-call path is optimal for efficiency. The only change that could improve the score is fixing the 2 failing checks, which is a correctness issue, not an efficiency issue.

### Score context
- Task 19 best: 2.7273 (20/22). Our run: 2.4545 (18/22). Gap: 0.2728 points.
- Perfect score would be 6.0 (22/22 with efficiency bonus). Current gap to perfect: 3.5455 points.
- The 2 failing checks represent 4 raw points — fixing them would bring raw score from 18 to 22 and enable the efficiency bonus on top.
