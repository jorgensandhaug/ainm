## 1. Task

Analyze why the production payroll run for `marie.becker@example.org` scored `0/8`, verify the correct payroll path in sandbox, update the payroll learning artifacts, and commit those documentation changes.

## 2. Reflection

What went well:
- I followed the existing payroll trusted standard exactly.
- I used the minimum blocked-path diagnostic: one decisive `GET /employee?email=...&count=10&fields=*`.
- I avoided wasting production calls after the first live blocker.

What went poorly:
- The run still scored `0/8` because I produced no payroll side effect.
- I treated `dateOfBirth=null` as a hard terminal blocker and stopped, which is correct under the current standard but still loses all correctness if the benchmark expected a repaired prerequisite path.
- I did not explicitly document during the run that no evidence pointed to a salary-feature/module problem.

Correct interpretation now:
- The live production evidence showed an employee-prerequisite blocker, not a feature-access blocker.
- The sandbox proof shows the canonical successful payroll path does not need a salary-feature enable step when the employee is already payroll-ready.
- So the zero score was not caused by missing a proven feature-enablement step. It was caused by taking a blocked path that created no scored side effect.

## 3. Call Efficiency

Production call efficiency:
- The run was minimal-call for the blocked diagnosis.
- Calls used: `1`
- Wasted calls: `0`

Exact production call:
1. `GET /employee?email=marie.becker@example.org&count=10&fields=*`

Why this still lost:
- Minimal-call efficiency does not help if the task is judged by final side effects and the blocked assumption is wrong for the benchmark.

Lower-call path the next agent should use:
- If the first employee read already shows `dateOfBirth=null` and the prompt gives no repair data, stop after that one read.
- If the employee is payroll-ready, use:
1. `GET /employee?email=...&count=10&fields=*`
2. `GET /employee/employment?employeeId=...&count=20&fields=*` only if the employee read is too sparse
3. `GET /salary/type?count=1000&fields=*`
4. `POST /salary/transaction`

Do not add:
- `GET /salary/settings`
- company-module activation reads
- speculative feature-enable writes

unless a live `403` permission response proves that branch.

## 4. Root Causes

- I over-trusted the existing blocked-path heuristic: missing `dateOfBirth` on the first employee read.
- I optimized for low-call safety instead of questioning whether the benchmark might expect prerequisite repair despite the prompt not providing repair data.
- I did not separate two different failure classes clearly enough:
  - missing employee prerequisites
  - missing feature/module access
- After sandbox verification, the feature/module hypothesis looks unsupported for this task shape. The proven successful path works without any activation step.

## 5. Sandbox Verification

Persistent sandbox proof succeeded.

Verified successful path:
1. `GET /employee?id=18564428&count=10&fields=*`
2. `GET /employee/employment?employeeId=18564428&count=20&fields=*`
3. `GET /salary/type?count=1000&fields=*`
4. `POST /salary/transaction`
5. `GET /salary/transaction/6956592?fields=*`
6. `GET /salary/payslip/32627610?fields=*,specifications(*,salaryType(*))`

Verified results:
- employee `18564428` had `dateOfBirth=1990-01-01`
- conditional employment read proved `startDate=2026-03-01` and `division.id=108244568`
- salary types resolved:
  - `Fastlønn id=69031179`
  - `Bonus id=69031348`
- created `salaryTransaction.id=6956592`
- created `payslip.id=32627610`
- proved exact lines:
  - `Fastlønn` `44150`
  - `Bonus` `16200`
- proved totals:
  - `grossAmount=60350`
  - `amount=60350`

Key conclusion:
- No salary-feature activation or `/salary/settings` preflight was needed for the successful payroll flow.

## 6. Playbook Changes

Updated existing artifacts. No new files created.

Changed paths:
- [AGENTS.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/AGENTS.md)
- [trusted-standards/common-endpoints.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/common-endpoints.md)
- [trusted-standards/run-employee-payroll.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/trusted-standards/run-employee-payroll.md)
- [task-playbooks/run-employee-payroll.md](/home/jorge/repos/ainm/tasks/tripletex/codex-environment/task-playbooks/run-employee-payroll.md)

What changed:
- replaced the older production example with the exact `marie.becker@example.org` blocked run
- added explicit guidance that `dateOfBirth=null` on the first employee read is a decisive blocker
- added explicit guidance not to spend `/employee/employment`, `/salary/type`, `/salary/settings`, or company-module calls after that blocker
- added sandbox proof that the successful payroll path works directly without salary-feature activation
- tightened the payroll/common-endpoint guidance to only investigate feature state after a live `403`

## 7. Commit

- Commit: `27fb481`
- Message: `tripletex playbook: tighten payroll blocked-path guidance`

## 8. Reusable Heuristics

- For exact payroll tasks, separate prerequisite failure from feature-access failure. They are not the same branch.
- If `GET /employee?...fields=*` already shows `dateOfBirth=null`, that is stronger evidence than any speculative module theory.
- Do not preflight `/salary/settings` or module endpoints on payroll tasks just because payroll sometimes needs features. Only do that after a live `403` proves it.
- Conditional `GET /employee/employment` is only for sparse employment data, not for fixing a missing birth date.
- A run can be perfectly call-efficient and still score zero if the feasibility judgment is wrong. Here, that was the real failure mode.