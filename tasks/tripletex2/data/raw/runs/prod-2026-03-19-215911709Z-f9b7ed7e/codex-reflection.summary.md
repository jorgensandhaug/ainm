## 1. Task

Run a post-run learning pass for the employee-creation task, verify the corrected solution shape against sandbox credentials, update the playbook system, commit only the learning docs changes, and produce this summary.

## 2. Reflection

What went well:
- I read `openapi.json` before writing API code.
- I reused write responses and only added fallback logic when the response was ambiguous.
- I finished the production task correctly.

What went poorly:
- I missed two employee-specific prerequisites on the first production attempt.
- I assumed the `Employee` schema being light on `required` fields meant `userType` and `department` were likely optional.
- I treated nested `employments` as likely self-verifying in the create response, but `POST /employee` can succeed without echoing nested employment data.

Mistakes and wasted calls:
- Wasted production call 1: `POST /employee` without `userType` -> `422`.
- Wasted production call 2: `POST /employee` with `userType` but without `department.id` -> `422`.
- Correct first-shot shape should have been: resolve department first, then `POST /employee` with explicit `userType` and nested `employments.startDate`.

## 3. Root Causes

- I over-trusted schema shape and underweighted validation behavior. `openapi.json` exposed the `userType` enum and `department` relation, but no `required` list. I should have treated employee creation as a known Tripletex validation hotspot.
- I did not convert the existing AGENTS gotcha about employee departments into a concrete preflight step.
- There was no employee playbook, so I rediscovered behavior live instead of following a hardened flow.
- I assumed successful write responses would fully prove scored employee fields. Sandbox proved `POST /employee` may omit `userType` and nested `employments` even on success.

## 4. Sandbox Verification

I used only the provided sandbox credentials and a TypeScript script in the run scripts directory.

Verified sequence:
- `GET /department?isInactive=false&count=1&fields=*` returned an existing active department: `id=837842`.
- `POST /employee` with department but without `userType` returned `422` with validation message:
  - `Brukertype kan ikke være "0" eller tom.`
- `POST /employee` with `userType` but without `department.id` returned `422` with validation message:
  - `Feltet må fylles ut.`
- `POST /employee` with:
  - `firstName`
  - `lastName`
  - `dateOfBirth`
  - `email`
  - `userType: "NO_ACCESS"`
  - `department: { id: 837842 }`
  - `employments: [{ startDate: "2026-10-25" }]`
  succeeded and created employee `18478321`.
- The success response still showed:
  - `userType: null`
  - `nestedEmploymentStartDate: null`
- One decisive verification read:
  - `GET /employee/employment?employeeId=18478321&fields=*`
  returned one employment with `startDate="2026-10-25"`.

Proved corrected solution path:
1. Resolve department first.
2. Set explicit `userType`.
3. Send start date as nested `employments` on `POST /employee`.
4. If the create response does not prove the start date, verify once via `/employee/employment`.

## 5. Playbook Changes

I created a new playbook and updated AGENTS routing/gotchas.

Created new playbook:
- `./task-playbooks/create-employee.md`

Updated existing file:
- `./AGENTS.md`

What changed:
- Added a `Create employee` row to the Task Playbooks table.
- Added an employee gotcha that `userType` may be required and `POST /employee` may omit writable fields in the success response.
- Added a new employee playbook covering:
  - explicit `userType`
  - department pre-resolution via `/department`
  - nested `employments.startDate`
  - one-read verification via `/employee/employment` when needed

This was a new playbook, not an update to an existing employee playbook.

## 6. Commit

Commit hash:
- `6467519d7c051d77f577a99d7d2441a356d726a0`

Commit message:
- `tripletex playbook: add employee creation guidance`

## 7. Reusable Heuristics

- For Tripletex create flows, absence of `required` in schema is not proof a field is optional.
- When AGENTS already says “may require X”, turn that into a preflight dependency step, not a post-422 recovery.
- For employee creation, default `userType` to `NO_ACCESS` unless the prompt explicitly asks for login access.
- For employee creation, resolve `department.id` before the first create attempt.
- If a prompt scores employment start date, do not assume `POST /employee` will echo nested employment state.
- Prefer one decisive verification read on the employment subresource over trial-and-error write retries.
- When a task pattern appears more than once or causes validation rediscovery, add a dedicated playbook immediately.