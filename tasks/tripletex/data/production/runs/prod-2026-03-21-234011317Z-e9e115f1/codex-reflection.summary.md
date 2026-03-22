# Codex Reflection Summary

## Task

Create employee André Almeida (born 1992-05-30, email andre.almeida@example.org, start date 2026-02-04). Portuguese prompt. Task shape: name + birth date + email + start date — exact match for `create-employee` trusted standard.

## Reflection

**What went well:**
- Correctly identified the task as an exact match for the `create-employee` trusted standard
- Read the trusted standard before writing any script
- Used the correct pre-read strategy (GET /department first)
- Used `?fields=*,employments(*)` on POST
- Used `userType: "NO_ACCESS"`
- Preserved Unicode name (André) correctly
- Normalized Portuguese date formats to ISO correctly

**What went poorly:**
- The first POST placed `department: { id: deptId }` inside the `employments[]` array in addition to the top level — this caused a 422 with code 16000 ("Request mapping failed", "Feltet eksisterer ikke i objektet.")
- On the second attempt, the agent removed `department` from the top level but kept it inside employment — same error
- Only on the third attempt did the agent place `department` at the top level only — success
- Total: 4 calls, 2 errors instead of the optimal 2 calls, 0 errors

**Why the mistake happened:**
- The trusted standard said `department: { id: ... }` but the agent confused `department` (employee-level) with `division` (employment-level) and added department inside the employment too
- The playbook's example payload showed department at top level only, but the agent didn't follow the example precisely
- The documentation didn't have an explicit warning about NOT putting department inside employment

## Call Efficiency

**Not minimal-call.** The run used 4 calls with 2 errors. Optimal is 2 calls with 0 errors.

| Call | Endpoint | Status | Necessary? |
|------|----------|--------|------------|
| 1 | `GET /department?isInactive=false&count=1&fields=id` | 200 | Yes — pre-read |
| 2 | `POST /employee?fields=*,employments(*)` (dept in employee + employment) | 422 | **Wasted** — dept inside employment caused code 16000 |
| 3 | `POST /employee?fields=*,employments(*)` (dept only in employment) | 422 | **Wasted** — dept still inside employment |
| 4 | `POST /employee?fields=*,employments(*)` (dept at top level only) | 201 | Yes — correct placement |

**Lower-call path for next agent:**
1. `GET /department?isInactive=false&count=1&fields=id` → get dept id
2. `POST /employee?fields=*,employments(*)` with `department: { id }` at **top level**, `employments: [{ startDate }]` without department → 201

## Root Causes

1. **Field placement confusion**: `department` is a top-level employee field; `division` is an employment-level field. The agent placed `department` in both locations. The employment schema does not accept a `department` field at all — it triggers error code 16000 (unmappable-field error), which is distinct from validation errors (code 18000).

2. **Insufficient documentation**: The trusted standard and playbook showed the correct payload shape but didn't explicitly warn against the incorrect placement. The playbook example payload was correct (department at top level only), but without an explicit warning, the agent added department to the employment too.

## Sandbox Verification

Three sandbox test cases verified on 2026-03-22:

| Test | Payload | Result |
|------|---------|--------|
| A | `department` at top level + inside employment | 422 code 16000 — "department: Feltet eksisterer ikke i objektet." |
| B | `department` at top level only | 201 (after division repair in sandbox) |
| C | `department` only inside employment | 422 code 16000 — same error |

Confirmed: `department` is exclusively a top-level employee field. The employment object does not recognize it. Placing it inside employment always triggers code 16000.

Full correct sandbox flow verified: GET /department → GET /division (sandbox-only) → POST /employee with dept at top level + division in employment → 201.

## Playbook Changes

Updated existing files (no new files created):

- `./trusted-standards/create-employee.md`:
  - Added CRITICAL warning in Payload Rules: `department` is top-level employee field ONLY, not an employment field
  - Added rule: `department` → employee, `division` → employment
  - Added code 16000 error pattern to Validation Rules
  - Updated production run count to 13 and division stat to 0/13
  - Added André Almeida run details and sandbox verification note

- `./task-playbooks/create-employee.md`:
  - Added code 16000 error pattern to Observed Validation Messages
  - Added CRITICAL warning to Recommended Payload Shape section
  - Added André Almeida run to Production Run History
  - Added explicit department-placement pitfall to Avoidable Mistakes
  - Updated department-required rate to 8/13 and division stat to 0/13

## Commit

- **Hash**: `c7967bba`
- **Message**: `tripletex playbook: create-employee — add 13th production confirmation (e9e115f1, Portuguese prompt, André Almeida / andre.almeida@example.org / 1992-05-30 / start 2026-02-04, 4 calls 2 errors); document critical department-placement pitfall: department is a top-level employee field ONLY, NOT an employment field; placing department inside employments[] causes code 16000 "Request mapping failed" (unmappable-field error); sandbox-verified on 2026-03-22 with 3 test cases; update division-never-needed stat to 0/13; optimal path remains 2 calls 0 errors`

## Reusable Heuristics

1. **`department` → employee, `division` → employment**: These are the two hierarchy fields and they belong at different nesting levels. Never put `department` inside `employments[]` and never put `division` at the top level.

2. **Code 16000 vs 18000**: Code 16000 ("Request mapping failed") means a field doesn't exist on the object schema — this is a structural error, not a data validation error. Code 18000 ("Validering feilet.") is the standard validation error (missing required field, invalid value). Different diagnosis: 16000 = wrong field placement/name; 18000 = right field, wrong value.

3. **Follow the example payload exactly**: When the trusted standard or playbook provides a recommended payload shape with an example, replicate that structure exactly. Don't add fields to nested objects that aren't shown in the example.

4. **Pre-read strategy stats**: 13 production create-employee runs; department required in 8/13 (62%+); division required in 0/13 (0%). Pre-read department, repair-only division.
