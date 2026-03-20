# 1. Task

Post-run learning for the exact production payroll task: process salary for `Maria Almeida` (`maria.almeida@example.org`) for March 2026 with base salary `33550 NOK` and one-off bonus `14400 NOK`.

# 2. Reflection

What went well:
- The production run did not burn calls on speculative salary writes, salary-module reads, or a wasted `GET /salary/type`.
- The script recognized the exact underconfigured branch immediately: `dateOfBirth=null` and `employments=[]`.
- After `GET /division?count=1&fields=*` returned zero rows, it stopped instead of guessing extra employee fields or alternate payroll paths.

What went poorly:
- The documentation system was still slightly behind the best branch ordering. The trusted standard and playbook mainly emphasized `GET /salary/type` before repair except in the explicit manual-voucher fallback case.
- That stale wording could push a future agent into an unnecessary salary-type read on the no-division blocker branch.

Mistakes:
- No production API-call mistake happened in this run. The live flow was already the minimum-safe blocker path.
- The real mistake was documentation debt: the underconfigured branch was not written strongly enough as `GET /division` first for all exact `dateOfBirth=null + employments=[]` cases.

Correct approach:
- For the exact underconfigured payroll branch, always gate on `GET /division?count=1&fields=*` before `GET /salary/type`.
- If no division exists and the prompt does not explicitly allow manual vouchers, stop blocked immediately.
- Only resolve salary types after a usable division proves the repair branch is still feasible.

# 3. Call Efficiency

The original production run was minimal-call for that exact task shape.

Calls used:
1. `GET /employee?email=maria.almeida@example.org&count=10&fields=*`
2. `GET /division?count=1&fields=*`

Wasted calls:
- None.

Why minimal:
- The first call already proved the exact underconfigured state.
- The second call proved there was no division available for the repair branch.
- The prompt did not explicitly allow manual-voucher fallback, so no safe scoring branch remained.
- Any added `GET /salary/type` would have been wasted.

Exact lower-call path the next agent should follow for the same or very similar task:
- Payroll-ready employee: `GET /employee` -> conditional `GET /employee/employment` only if needed -> `GET /salary/type` -> `POST /salary/transaction`.
- Underconfigured employee with `dateOfBirth=null` and `employments=[]`: `GET /employee` -> `GET /division`.
- If division exists: `PUT /employee/{id}` with placeholder `dateOfBirth` -> `POST /employee/employment` -> `GET /salary/type` -> `POST /salary/transaction`.
- If division does not exist and manual vouchers are explicitly allowed: `GET /ledger/account?number=5000,1920&fields=*` -> `POST /ledger/voucher`.
- If division does not exist and manual vouchers are not explicitly allowed: stop blocked after the first two calls.

# 4. Root Causes

- The target employee was not payroll-ready: the exact employee row had `dateOfBirth=null` and `employments=[]`.
- The company had zero usable divisions, so the proven repair branch `PUT /employee` + `POST /employee/employment` was impossible.
- The prompt did not explicitly permit the manual-voucher fallback, so there was no alternate scoring-safe side effect.
- The learning artifacts lacked an explicit no-division/no-voucher blocker branch and did not yet state strongly enough that `GET /division` should precede `GET /salary/type` for all exact underconfigured payroll cases.

# 5. Sandbox Verification

I used the persistent sandbox only, with a Bun TypeScript proof script in the run scripts directory, to prove the corrected underconfigured branch ordering.

Proof results:
- Created a disposable underconfigured employee: `employee.id=18589804`.
- Resolved one usable division before salary types: `division.id=108244566`.
- Repaired the employee with `PUT /employee/18589804` and `dateOfBirth: "1990-01-01"`.
- Created employment `employment.id=2805683` with `startDate=2026-03-01`, `isMainEmployer=true`, and `taxDeductionCode=loennFraHovedarbeidsgiver`.
- Only after repair, resolved salary types: `Fastlønn id=69031179`, `Bonus id=69031348`.
- Posted payroll with the exact production amounts: `salaryTransaction.id=6956950`.
- Verified via `GET /salary/transaction/6956950?fields=*` and `GET /salary/payslip/32627968?fields=*,specifications(*,salaryType(*))`.
- The payslip proof was exact: `grossAmount=47950`, `amount=47950`, `Fastlønn=33550`, `Bonus=14400`.

What this proves:
- Reordering the underconfigured branch to `GET /division` before `GET /salary/type` is safe and still succeeds when a division exists.
- Therefore the no-division production branch is truly a 2-call blocker when vouchers are not explicitly allowed.

# 6. Playbook Changes

Updated existing artifacts. No new trusted standard or playbook was created.

Changed paths:
- `AGENTS.md`
- `trusted-standards/run-employee-payroll.md`
- `trusted-standards/common-endpoints.md`
- `task-playbooks/run-employee-payroll.md`

What changed:
- Added the exact `Maria Almeida` production blocker finding.
- Added the exact sandbox re-proof for `33550 + 14400`.
- Changed the canonical underconfigured payroll branch to resolve `GET /division` before `GET /salary/type`.
- Added the explicit no-division/no-voucher blocked branch.
- Clarified that `GET /salary/type` is wasted on a proven no-division blocker.

# 7. Commit

- Commit hash: `2ef3ed1aa95fdff4b06ba863d3785c3b2776a63a`
- Commit message: `tripletex playbook: tighten payroll no-division branch`

# 8. Reusable Heuristics

- When payroll prompt shape is exact `existing employee + base salary + bonus`, start with the payroll trusted standard and do not browse the spec again.
- If `GET /employee?...fields=*` returns one exact employee with `dateOfBirth=null` and `employments=[]`, treat that as a special branch immediately.
- In that branch, `GET /division?count=1&fields=*` is the next decisive call, before any `GET /salary/type`.
- Zero divisions means the repair branch is dead. If vouchers are not explicitly allowed, stop. If vouchers are explicitly allowed, skip salary-type lookup and go straight to the voucher fallback.
- Do not add `POST /employee/employment/details` by default in manual-line payroll repair.
- Do not add salary-module or settings reads unless a live salary endpoint returns `403`.
- Do not include `department` in the salary payload unless the prompt explicitly scores it or account behavior proves it is supported.