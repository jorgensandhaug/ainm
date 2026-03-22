# Score-Aware Reflection — prod-2026-03-21-234011317Z-e9e115f1

## 1. Task Attribution

- **tx_task_id**: 01 (T1 — create employee)
- **Tier**: T1, max score = 2
- **Prompt**: Portuguese — create André Almeida, born 1992-05-30, email andre.almeida@example.org, start 2026-02-04
- **Attempt**: 24th attempt on task 01

## 2. Correctness Verdict

**Perfect correctness.** 7/7 checks passed, correctness = 1.0, score_raw = 8/8.

All employee fields were set correctly in the final Tripletex state: name, date of birth, email, userType, department, and employment start date.

## 3. Efficiency Verdict

**Inefficient.** normalized_score = 1.2222 out of max 2.0. The leaderboard best for task 01 was already 2.0 before this run, and remained 2.0 after — this run did not improve the best score.

- **This run**: 4 API calls, 2 errors (two 422s from unmappable-field mistake)
- **Optimal path**: 2 API calls, 0 errors (GET /department + POST /employee)
- **Score gap**: 2.0 − 1.2222 = 0.7778 points lost to inefficiency
- **Root cause of gap**: 2 wasted POST attempts with `department` misplaced inside the `employments[]` array, each returning code 16000 "Request mapping failed"

The Bjørn Neset run (8e8e2e86) achieved the full 2.0 with the optimal 2-call / 0-error path.

## 4. Likely Root Cause

The agent placed `department: { id: deptId }` inside the `employments[]` array instead of at the top level of the employee object. The employment schema does not have a `department` field — only `division`. This caused:

1. **Call 2** (wasted): POST with `department` at both top level and inside employment → 422 code 16000
2. **Call 3** (wasted): Agent removed `department` from the top level but kept it inside employment → 422 code 16000 again
3. **Call 4** (correct): Agent finally placed `department` only at the top level → 201 success

The agent confused `department` (employee-level) with `division` (employment-level). The trusted standard's payload section said `department: { id: ... }` but did not explicitly warn against placing it inside employment. The playbook's example payload showed `department` at the top level only, but the agent did not follow the example exactly.

## 5. What Went Right

- **Correct pre-read strategy**: Agent correctly followed the department pre-read flow (GET /department first), avoiding the dept-repair 422 that plagued earlier runs
- **Correct field expansion**: Used `?fields=*,employments(*)` on POST, avoiding the need for a verification GET
- **Correct identity fields**: All employee data was correct — name preserved with Unicode (André), ISO dates normalized from mixed-language prompt (30. May 1992 → 1992-05-30, 4. February 2026 → 2026-02-04)
- **Perfect correctness**: 7/7 checks passed despite the inefficiency
- **Self-correction**: Agent identified and fixed the placement error within the run, reaching correct final state

## 6. What To Change Next Time

1. **Never put `department` inside `employments[]`** — `department` is a top-level employee field; `division` is the employment-level field. This distinction is now documented in both the trusted standard and playbook with CRITICAL warnings and sandbox verification.

2. **Follow the example payload exactly** — the playbook's recommended payload shape shows the correct field placement. Copy its structure rather than improvising field locations.

3. **Distinguish code 16000 from code 18000** — code 16000 ("Request mapping failed") means an unmappable field was sent; code 18000 ("Validering feilet") means a mappable field has an invalid value. The fix for 16000 is removing or relocating the field, not retrying with a different value.

4. **Target**: 2 calls, 0 errors for every create-employee run. The pre-read + correct payload path is proven both in sandbox and production. No remaining unknowns.
