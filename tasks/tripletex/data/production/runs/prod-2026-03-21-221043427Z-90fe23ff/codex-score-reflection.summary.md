# Score Reflection: prod-2026-03-21-221043427Z-90fe23ff

## Task Attribution

Task 21 (T3, max score 6). Confirmed by leaderboard diff: task 21 attempt_delta=+1, last_attempt_after=2026-03-21T22:11:36.192737 matching submission completed_at exactly.

Prompt: Norwegian onboarding task — create employee Olav Ødegård as Salgssjef in Økonomi department, 80% position, 550000 kr salary, 6.0h/day standard worktime, DOB 2000-03-18, start 2026-07-24. Offer letter PDF attached.

## Correctness Verdict

**Not perfect.** Score: 12/14 raw, correctness 0.8571, normalized 2.5714/6. Check 5 failed (1 of 10 checks).

- 9 checks passed: employee identity (name, DOB), department, employment relationship (startDate, employmentForm, percentage, salary), occupation code, and standard worktime all verified.
- Check 5 failed: worth 2 raw points. Unknown what this check verifies.

Key observation: task 21 best_score was already 2.5714 BEFORE this run (8 prior attempts). No run across 9 total attempts has ever passed check 5 for this task. This is a persistent, unsolved failure.

## Efficiency Verdict

**Optimal for the task shape.** 4 calls, 0 errors, 0 wasted reads.

1. `GET /division?count=1&fields=id` — prerequisite check (required by trusted standard)
2. `POST /department` — create Økonomi department
3. `POST /employee` — employee with nested employment + employmentDetails + occupationCode
4. `POST /employee/standardTime` — per-employee 6.0h/day

This is the proven minimum-call floor for the hardcoded-occupation-code + standard-worktime shape. No call was unnecessary. No 4xx errors.

## Likely Root Cause

The PDF contains only: name, DOB, title (Salgssjef), department (Økonomi), start date, employment form (Fast stilling), percentage (80%), annual salary (550000), and working hours (6.0h/day). No email, personnummer, bank account, or address.

All PDF fields were correctly extracted and set. Sandbox readback confirmed every field persists: occupationCode.id=4930 (SALGSSJEF), percentageOfFullTimeEquivalent=80, annualSalary=550000, hoursPerDay=6.

Since check 5 has failed across ALL 9 attempts for task 21, the root cause is likely one of:

1. **Missing field not derivable from the PDF** — the scoring may expect a field we never set (e.g., `employeeCategory`, a probation-related field, or something from the "Vilkår" section about the 6-month probation period).
2. **Division linkage** — if fresh accounts expect division creation before employee, and GET /division returns 0 rows, we omit division from the employment. But this same pattern works for other onboarding tasks, so this is unlikely.
3. **A different interpretation of a PDF field** — e.g., if "Arbeidstid: 6.0 timer per dag" should be set differently (as percentage of 7.5h = 80%, which we already set as percentage, not as hours).
4. **Structural scoring issue** — the check may require a side effect we're not aware of.

The Employee, Employment, and EmploymentDetails schemas in openapi.json have no `title`, `jobTitle`, or `probationEndDate` fields. The `employeeCategory` field exists on Employee but the PDF doesn't indicate a category.

**Investigation priority**: Focus on what check 5 verifies. Try setting `employeeCategory` or test whether the "Vilkår" probation clause maps to an API field. Also check if there's a per-employee `holidayAllowanceEarned` or related field that the scoring expects.

## What Went Right

- **Correct trusted-standard match**: identified onboard-employee standard immediately, read it before writing script.
- **Correct occupation code**: used hardcoded Salgssjef → id 4930, saving a lookup call.
- **Correct standard-time endpoint**: used `POST /employee/standardTime` (per-employee), not the company-wide endpoint that caused the first Salgssjef run to fail.
- **Correct non-7.5h value**: 6.0h/day persisted correctly (sandbox-verified).
- **Optimal call count**: 4 calls, 0 errors — minimum for this shape.
- **Correct field handling**: 80% percentage sent as 80 (not 0.8), Norwegian characters preserved (Ødegård, Økonomi).
- **Fast execution**: 58.9s total duration.

## What To Change Next Time

1. **Investigate check 5**: This is the only unsolved check for task 21 across all attempts. The next agent should investigate what field or side effect check 5 verifies. Candidates:
   - `employeeCategory` on the employee payload
   - Probation period fields (if any exist beyond the documented schema)
   - `holidayAllowanceEarned` configuration
   - Whether the division must be created (not just read) even on fresh accounts

2. **Do NOT change the existing flow**: The 4-call path is optimal and all other checks pass. Any fix for check 5 should add to, not replace, the current approach.

3. **Do NOT add extra calls speculatively**: The efficiency is already optimal. Only add a call if investigation proves a specific field fixes check 5.

4. **Sandbox investigation approach**: Create an employee with the exact same shape, then use `GET /employee/{id}?fields=*` to inspect ALL fields on the created employee. Compare against what the scoring might expect. Look for `null` fields that could be populated from the offer letter context.
