# Codex Reflection Summary

## Task
Onboard employee from employment contract (PDF). Create William Johnson in Tripletex with: national identity number 20029047368, DOB 1990-02-20, department Markedsføring, STYRK 3323 occupation code, 920000 kr annual salary, 80% employment, start date 2026-11-11, email william.johnson@example.org, bank account 64387484939.

## Reflection
**What went well:**
- Correctly identified the task as an exact match for `onboard-employee.md` trusted standard (not the simpler `create-employee.md`)
- Read the trusted standard before writing any script
- Used the hardcoded STYRK 3323 → id 2503 (INNKJØPER) mapping, saving 1 occupation-code lookup call
- Correctly detected fresh account (GET /division returned 0 rows) and omitted division from payload
- Parallelized GET /division + POST /department for latency savings
- All 3 calls succeeded with 0 errors
- No standard worktime was needed (contract did not mention hours/day) — correctly skipped POST /employee/standardTime

**What could have been better:**
- Nothing. The run matched the proven minimum-call floor exactly.

## Call Efficiency
**The run was minimal-call.** 3 calls, 0 errors — the proven minimum for the "hardcoded-occupation-code + no-standard-worktime" shape.

| # | Call | Status | Purpose |
|---|------|--------|---------|
| 1 | GET /division?count=1&fields=id | 200 | Check if division exists (returned 0 rows) |
| 2 | POST /department | 201 | Create "Markedsføring" department (parallel with #1) |
| 3 | POST /employee?fields=*,employments(*) | 201 | Create employee with all nested details |

**Wasted calls:** None.

**Lower-call path investigation:** Tested whether skipping GET /division (2-call path) is safe. Sandbox confirmed that accounts with existing divisions reject POST /employee without division.id with 422. Since production uses fresh accounts (always 0 divisions), the GET is technically always wasted there, but it serves as insurance against the 2-call penalty of a 422 + retry. The 1-call insurance cost is justified.

## Root Causes
No errors or failures in this run. The task shape was a perfect match for the well-documented onboard-employee trusted standard with the hardcoded STYRK 3323 mapping.

## Sandbox Verification
- Replicated the exact 3-call flow in persistent sandbox
- All fields persisted correctly:
  - occupationCode.id=2503, nameNO=INNKJØPER, code=3416102
  - percentageOfFullTimeEquivalent=80
  - annualSalary=920000
  - employmentForm=PERMANENT
  - remunerationType=MONTHLY_WAGE
  - startDate=2026-11-11
  - nationalIdentityNumber and bankAccountNumber preserved
- Also re-confirmed: POST /employee WITHOUT division on accounts that HAVE divisions triggers 422 (employments.division.id), justifying the GET /division pre-read

## Playbook Changes
- **Updated** `./trusted-standards/onboard-employee.md`: added 14th production run confirmation (ba22f7db, STYRK 3323, 3 calls, 0 errors); added sandbox re-verification of division pre-read justification
- **Updated** `./task-playbooks/onboard-employee.md`: added 14th run entry with same details

No new files created. No AGENTS.md changes needed (task shape and endpoints already documented).

## Commit
- Hash: `6307016b`
- Message: `tripletex playbook: onboard-employee — add 14th production run (ba22f7db, William Johnson / 20029047368 / Markedsføring / STYRK 3323 / 80% / 920000 / 2026-11-11, 3 calls 0 errors); 3rd confirmation of hardcoded STYRK 3323 → id 2503 mapping; sandbox re-verified division pre-read justification (422 without division on accounts that have divisions)`

## Reusable Heuristics
1. **STYRK 3323 → id 2503 (INNKJØPER)** is now production-confirmed 3 times. Always use the hardcoded mapping; never spend a GET /employee/employment/occupationCode call for this STYRK code.
2. **GET /division pre-read is justified** even though every fresh production account returns 0 rows. Accounts with divisions reject POST /employee without division.id with 422, which would cost 2 extra calls + 1 error to repair.
3. **Parallel GET /division + POST /department** is the optimal step 1 for onboard-employee tasks. Both are independent prerequisites.
4. **`fields=*,employments(*)`** on POST /employee returns the full response including expanded employment objects with startDate — no verification GET needed.
5. **No standard worktime call** when the contract/offer letter does not mention hours per day. The POST /employee/standardTime call should only be made when hours/day is explicitly stated.
6. **14 total onboard-employee production runs; 12 of the last 13 used 3-5 calls with 0 errors.** The standard is stable and battle-tested.
