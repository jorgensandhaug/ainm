# 1. Task

Reflect on the failed production payroll run, prove the correct API path in sandbox, update the Tripletex playbook system, commit only the learning artifacts, and write this summary.

# 2. Reflection

What went well:
- I found the relevant public write family quickly: `POST /salary/transaction`.
- I confirmed the correct salary types from `GET /salary/type`: `Fastlønn` and `Bonus`.
- I extracted the exact employee state from one decisive `GET /employee?email=...&fields=*`, which already showed the real blocker: `dateOfBirth=null` and `employments=[]`.

What went poorly:
- I still pushed a salary write after that prerequisite read instead of stopping on the missing payroll setup.
- I then kept trying to repair production data without prompt-supplied personal data, which was the wrong boundary.
- I added `department` into the salary payload without knowing whether department accounting was active.
- I spent extra production calls on a path that was already blocked by missing employee payroll prerequisites.

Mistakes and why they happened:
- I treated the problem as a payload-shape problem instead of a payroll-readiness problem.
- I assumed an existing employee was likely payroll-ready just because the employee existed.
- I assumed creating an employment might be enough, but the production validation chain showed missing `dateOfBirth` first, which meant I was already outside the prompt facts.
- I did not explicitly recognize that inventing `dateOfBirth` or business/sub-entity registration data would be worse than stopping.

Correct production approach:
- `GET /employee?email=...&count=10&fields=*`
- Exact-match the employee locally.
- If `dateOfBirth` is missing or no employment covers the payroll period, do not continue unless the prompt also supplies the missing repair data.
- Only if the employee is payroll-ready:
  - `GET /salary/type?count=1000&fields=*`
  - `POST /salary/transaction`

# 3. Root Causes

- Weak assumption: existing employee implied payroll-ready employee.
- Weak assumption: employment creation could be repaired safely without prompt-supplied PII.
- Missed prerequisite check: payroll needs more than just employee existence.
- Missed account-config branch: `department` must be omitted when department accounting is inactive.
- Efficiency failure: after the decisive employee read, the later production `POST /salary/transaction` and `POST /employee/employment` were wasted because the run was already blocked.

# 4. Sandbox Verification

I used only the provided sandbox credentials and TypeScript+`bun` scripts under the run scripts directory.

Key verified failure branches:
- `POST /salary/transaction` on a non-payroll-ready employee failed with:
  - `employee: Ansatt nr.  er ikke registrert med et arbeidsforhold i perioden.`
- `POST /employee/employment` for an employee without DOB failed with:
  - `employee.dateOfBirth: Feltet må fylles ut.`
- `POST /salary/transaction` with `department` present in an account without department accounting failed with:
  - `department: Selskapet har ikke aktivert avdelingsregnskap.`

Successful sandbox proof:
- I created a real sandbox sub-entity with `POST /division` using a generated valid org number and municipality `Oslo`.
- I created a temp employee with:
  - `dateOfBirth`
  - `userType: "NO_ACCESS"`
  - existing department id
- I created:
  - `POST /employee/employment`
  - `POST /employee/employment/details`
- I then ran payroll successfully with embedded manual salary lines:
  - base salary `42350`
  - bonus `12850`
- Verified success path:
  - `POST /salary/transaction`
  - `GET /salary/transaction/{id}?fields=*`
  - `GET /salary/payslip/{id}?fields=*`

Verified persisted sandbox result from the final proof:
- `salaryTransactionId=6956456`
- `payslipId=32627474`
- `grossAmount=55200`
- `amount=55200`
- `specifications.length=2`

Important sandbox-only note:
- The sandbox needed an explicit `division` create to become payroll-capable.
- I did not encode that as a default production playbook step, because production payroll tasks should already have the company/business setup in place. The reusable production lesson is the prerequisite check, not a blanket instruction to create divisions.

# 5. Playbook Changes

Created new playbook:
- `./task-playbooks/run-employee-payroll.md`

Updated existing instruction file:
- `./AGENTS.md`

What changed:
- Added a dedicated payroll playbook for existing-employee monthly payroll runs with manual salary lines.
- Added AGENTS guidance that payroll requires a payroll-ready employee and that missing `dateOfBirth` / employment should stop the run unless the prompt provides the missing repair data.
- Added AGENTS guidance to omit `department` from salary payloads unless the account clearly supports department accounting.
- Added AGENTS guidance for the sparse-response verification branch:
  - `GET /salary/transaction/{id}?fields=*`
  - `GET /salary/payslip/{id}?fields=*`

# 6. Commit

- Commit hash: `fd1e844`
- Commit message: `tripletex playbook: add employee payroll run flow`

# 7. Reusable Heuristics

- For payroll tasks, first prove payroll readiness, not payload shape.
- One decisive `GET /employee?email=...&fields=*` should answer whether the run is even legal to continue.
- Never invent missing personal data like `dateOfBirth` in production just to satisfy payroll validation.
- For manual payroll lines, the correct write is `POST /salary/transaction` with embedded `payslips[].specifications[]`.
- Resolve payroll salary types once from `GET /salary/type?count=1000&fields=*` and exact-match locally.
- Do not automatically mirror employee `department` into the salary payload.
- When a payroll write response is sparse, verify via transaction id first, then direct payslip id.
