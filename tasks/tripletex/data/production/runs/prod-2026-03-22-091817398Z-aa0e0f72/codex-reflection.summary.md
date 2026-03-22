# Reflection Summary — prod-2026-03-22-091817398Z-aa0e0f72

## 1. Task

Create employee Bjørn Neset (DOB 1996-02-21, email bjrn.neset@example.org, start date 2026-06-16). Nynorsk prompt. Task ID: T01. Score: 8/8 (7/7 checks passed).

## 2. Reflection

**What went well:**
- Correctly identified the task as a create-employee exact match and read the trusted standard before writing the script.
- Used the pre-read department strategy correctly (GET /department first).
- Correctly placed `department` at top level (not inside employment), avoiding the code 16000 trap documented from the André Almeida run.
- Date normalization from Nynorsk prompt was correct (21. February 1996 → 1996-02-21, 16. June 2026 → 2026-06-16).
- Final state was correct: 8/8 score, all 7 checks passed.

**What went poorly:**
- Agent added three invented fields to the employment object: `employmentType: "ORDINARY"`, `percentageOfFullTimeEquivalent: 100`, `employmentDetails: []`.
- These fields do not exist on the employment model for the simple create-employee shape, causing a 422 code 16000 ("Feltet eksisterer ikke i objektet.").
- The script had to be fixed and re-run, doubling the API calls against production.

**Why it happened:**
- The agent likely confused the simple create-employee employment shape (which only accepts `startDate` + optional `division`) with the richer onboard-employee shape (which uses `employmentType`, `workingHoursScheme`, etc. inside `employmentDetails`).
- Despite reading the trusted standard which has an example payload showing only `startDate` in the employment object, the agent added extra fields not present in the example.

## 3. Call Efficiency

**Not minimal.** The run used 4 API calls and 1 error against production. The optimal path is 2 calls, 0 errors.

| Call | Endpoint | Status | Necessary? |
|------|----------|--------|------------|
| 1 | GET /department?isInactive=false&count=1&fields=id | 200 | Yes (pre-read) |
| 2 | POST /employee?fields=*,employments(*) | 422 | **WASTED** — invented fields |
| 3 | GET /department?isInactive=false&count=1&fields=id | 200 | **WASTED** — script re-run |
| 4 | POST /employee?fields=*,employments(*) | 201 | Yes (correct payload) |

**Wasted calls:** 2 (the failed POST + the redundant GET on re-run)

**Lower-call path for next agent:**
1. `GET /department?isInactive=false&count=1&fields=id` → 200
2. `POST /employee?fields=*,employments(*)` with employment containing ONLY `{ startDate: "YYYY-MM-DD" }` → 201

Total: 2 calls, 0 errors.

## 4. Root Causes

1. **Invented employment fields:** The agent added `employmentType`, `percentageOfFullTimeEquivalent`, and `employmentDetails` to the employment object. These fields belong to the richer onboard-employee shape's `employmentDetails` nested structure, not to the base employment object used by `POST /employee`. The trusted standard's example payload explicitly shows only `startDate` in the employment but the agent deviated from it.

2. **Insufficient adherence to trusted standard example:** The trusted standard says "send only prompt-required employee fields" and the example payload shows `employments: [{ "startDate": "2026-10-25" }]` with no other fields. The agent should have copied this shape verbatim.

## 5. Sandbox Verification

Sandbox re-verification on 2026-03-22 confirmed:
- Minimal payload `employments: [{ startDate }]` succeeds (with division in sandbox only).
- Adding `employmentType: "ORDINARY"` to the employment object → 422 code 16000 "Feltet eksisterer ikke i objektet." — the field does not exist on the model.
- The employment object for the simple create-employee shape accepts ONLY `startDate` and `division`.

## 6. Playbook Changes

**Updated existing files (no new files created):**

1. **`./trusted-standards/create-employee.md`:**
   - Added Payload Rule: employment object accepts ONLY `startDate` + `division` for repair; do NOT add `employmentType`, `percentageOfFullTimeEquivalent`, `employmentDetails`, or any other invented fields.
   - Updated OpenAPI/Sandbox Status: added aa0e0f72 run details, updated production run count from 13 to 14, noted that `employmentType` in employment → code 16000.

2. **`./task-playbooks/create-employee.md`:**
   - Added production run history entry for this run (aa0e0f72, 4 calls, 1 error, root cause: invented employment fields).
   - Added Avoidable Mistake: employment object accepts ONLY `startDate` + `division` for repair; do NOT invent extra fields.

3. **`./AGENTS.md`:**
   - Updated line 302 (create-employee canonical path): added explicit warning against adding `employmentType`, `percentageOfFullTimeEquivalent`, `employmentDetails` to employment; updated dept-required rate from 7/11 to 8/14; replaced old examples with reference to aa0e0f72 run.

## 7. Commit

- **Hash:** `eff12e8b`
- **Message:** `tripletex playbook: warn against invented employment fields (employmentType etc.)`

## 8. Reusable Heuristics

1. **Copy the trusted standard's example payload verbatim.** Do not add fields that are not in the example, even if they seem reasonable from general API knowledge. The Tripletex employment model for simple create-employee only accepts `startDate` (+ `division` for repair). Fields like `employmentType` belong to the richer onboard-employee shape's `employmentDetails` sub-object.

2. **The employment object ≠ employmentDetails.** The simple create-employee shape creates a bare employment record with just `startDate`. The onboard-employee shape adds `employmentDetails` as a nested array inside the employment, which is where `employmentType`, `workingHoursScheme`, `remunerationType`, etc. live. Never cross-pollinate fields between these two shapes.

3. **A script re-run doubles your API call count.** When you fix a script and re-run it, every call in the script executes again — including previously-successful calls. This means a 1-field mistake in a 2-call script costs 4 total calls instead of 2. Get the payload right on the first attempt by strictly following the trusted standard.

4. **Code 16000 means an unmappable field.** Unlike validation errors (code 18000), code 16000 "Request mapping failed" means the field literally does not exist on the API model. The fix is always to remove the field, never to change its value.
