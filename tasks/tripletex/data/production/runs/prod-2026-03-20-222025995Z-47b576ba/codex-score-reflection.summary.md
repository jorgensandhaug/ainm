## 1. Task
Post-run learning for the scored payroll run `Jonas Hansen / jonas.hansen@example.org / 40000 + 10600`, including sandbox proof, trusted-standard/playbook updates, one git commit, and a reusable summary.

## 2. Reflection
What went well:
- Matched the task to the existing payroll trusted standard immediately.
- Used only TypeScript + `bun` for Tripletex calls.
- Reached a correct side effect by switching to the prompt-allowed manual voucher fallback.

What went poorly:
- The first script had no explicit empty-division fallback branch, so it crashed after `GET /division`.
- I restarted the workflow instead of continuing from the decisive empty-division result.
- I spent `GET /salary/type` before proving whether payroll repair was even possible in that account.
- The voucher fallback used a broad `GET /ledger/account?count=1000&fields=*` instead of the narrower proven `number=5000,1920` resolver.

Correct approach:
- In fallback-permitted payroll prompts, if the first employee read already shows `dateOfBirth=null` and `employments=[]`, check `GET /division?count=1&fields=*` first.
- If that division read returns zero rows, skip `GET /salary/type` and go straight to `GET /ledger/account?number=5000,1920&fields=*` -> `POST /ledger/voucher`.

## 3. Call Efficiency
The run was not minimal-call.

Actual production run:
- `GET /employee`
- `GET /salary/type`
- `GET /division`
- restart
- `GET /employee`
- `GET /salary/type`
- `GET /division`
- `GET /ledger/account?count=1000&fields=*`
- `POST /ledger/voucher`

Realistic minimum for that exact no-division task state:
- `GET /employee?email=jonas.hansen@example.org&count=10&fields=*`
- `GET /division?count=1&fields=*`
- `GET /ledger/account?number=5000,1920&fields=*`
- `POST /ledger/voucher`

Wasted calls:
- Repeated `GET /employee`
- Repeated `GET /salary/type`
- Repeated `GET /division`
- The initial `GET /salary/type` itself was unnecessary once the decisive empty-division branch became the right fallback discriminator

Lower-call replacement path for next time:
- If underconfigured employee + prompt explicitly allows manual vouchers:
  - `GET /employee`
  - `GET /division`
  - if zero divisions: `GET /ledger/account?number=5000,1920&fields=*` -> `POST /ledger/voucher`
  - if division exists: continue normal payroll repair branch with `GET /salary/type` -> `PUT /employee/{id}` -> `POST /employee/employment` -> `POST /salary/transaction`

## 4. Root Causes
- The trusted standard covered underconfigured employees, but not the exact `no division + explicit manual-voucher fallback` branch.
- I treated `GET /division` zero rows as a generic failure instead of a decisive branch condition.
- I optimized for “prove payroll API works” before “prove payroll repair is even possible”.
- I restarted after failure instead of designing the first script to continue from any decisive branch outcome.

## 5. Sandbox Verification
Persistent sandbox credentials were used, not production credentials.

What I proved:
- `GET /ledger/account?number=5000,1920&fields=*` returned both required accounts:
  - `5000 id=424191048`
  - `1920 id=424190862`
- `POST /ledger/voucher` with balanced `50600` / `-50600` postings on those two accounts succeeded:
  - `voucherId=608864713`
  - `voucherNumber=81`

What sandbox could not mirror exactly:
- `GET /employee?email=jonas.hansen@example.org&count=10&fields=*` returned `0` exact hits
- `GET /division?count=5&fields=*` returned `5` rows
- So sandbox proved the fallback voucher payload and narrow account resolver, but not the production account’s exact `zero divisions` state

Sandbox script used:
- `/home/jorge/repos/ainm/tasks/tripletex/data/production/runs/prod-2026-03-20-222025995Z-47b576ba/scripts/sandbox_payroll_reflection.ts`

## 6. Playbook Changes
Updated existing docs; no new trusted standard or playbook was created.

Changed paths:
- `./trusted-standards/run-employee-payroll.md`
- `./task-playbooks/run-employee-payroll.md`
- `./trusted-standards/common-endpoints.md`

What changed:
- Added the explicit `no division + manual-voucher fallback allowed` payroll branch
- Documented the lower-call branch ordering: check `division` before `salary/type` in that exact fallback-permitted underconfigured case
- Documented the proven narrow resolver `GET /ledger/account?number=5000,1920&fields=*`
- Documented the proven balanced voucher payload on `5000` and `1920`

No `AGENTS.md` change was committed because no new file/table mapping was introduced, and `AGENTS.md` had unrelated in-flight worktree edits.

## 7. Commit
Commit hash:
- `a23d99af021b421a5a7934d913636b5b81536755`

Commit message:
- `tripletex playbook: add payroll no-division fallback`

## 8. Reusable Heuristics
- When a payroll prompt explicitly allows manual-voucher fallback, do not probe salary types before proving the repair prerequisites exist.
- In an underconfigured payroll case, `GET /division?count=1&fields=*` is a decisive branch point.
- If that division read returns zero rows, treat payroll repair as impossible in that account and jump directly to the voucher fallback.
- For payroll-cost fallback vouchers, prefer `GET /ledger/account?number=5000,1920&fields=*` over a broad ledger account read.
- Never restart the whole workflow after a decisive zero-row prerequisite read; continue from that branch outcome.