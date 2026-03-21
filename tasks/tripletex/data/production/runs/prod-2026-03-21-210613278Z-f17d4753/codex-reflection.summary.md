# Codex Reflection Summary

## 1. Task

Execute the full project lifecycle for "Migração Cloud Horizonte" (Horizonte Lda, org. 857400526): create customer, 2 employees, project with 229500 NOK budget, register 37h + 62h timesheet, register 56300 NOK supplier cost from Oceano Lda, create unsent client invoice.

## 2. Reflection

**What went well:**
- Exact trusted-standard match identified immediately — no time wasted on spec exploration
- Script followed the trusted standard flow precisely with all known pitfall avoidances (UTC-safe dates, row fields on voucher postings, activityType + name on project activity, isChargeable inside activity object, conditional division handling, MOD11-valid bank number)
- Zero 4xx errors across all 19 API calls
- All scored fields correct: budget 229500, hours 99 (37+62), supplier cost 56300 linked to project, invoice with projectInvoiceDetails

**What went poorly:**
- Used the old 18-call baseline flow (19 with bank fix) when a 16-call flow (17 with bank fix) was achievable
- Included `GET /division` and `employments[]` on employee payloads unnecessarily — employees work without employment records for this lifecycle task shape
- Used two separate `GET /ledger/account` reads when one combined read suffices
- Sequential emp1 → (PM + emp2) → project when emp1 + emp2 + project can all parallelize in one step

## 3. Call Efficiency

**Production run: 19 calls, 0 errors** (matched old 18-call baseline + 1 bank fix)

| # | Call | Status | Notes |
|---|------|--------|-------|
| 1 | GET /department | 200 | Needed |
| 2 | GET /division | 200 | **UNNECESSARY** — employees work without employments[] |
| 3 | POST /customer | 201 | Needed |
| 4 | POST /employee (Catarina) | 201 | Needed |
| 5 | GET /employee?assignableProjectManagers | 200 | Needed |
| 6 | POST /employee (João) | 201 | Needed |
| 7 | POST /project | 201 | Needed |
| 8 | POST /project/projectActivity | 201 | Needed |
| 9 | POST /project/participant (emp1) | 201 | Needed |
| 10 | POST /project/participant (emp2) | 201 | Needed |
| 11 | GET /ledger/account?number=6590,2400 | 200 | Needed but could be combined |
| 12 | GET /ledger/voucherType | 200 | Needed |
| 13 | POST /supplier | 201 | Needed |
| 14 | POST /timesheet/entry/list | 201 | Needed |
| 15 | GET /ledger/account?isBankAccount=true | 200 | **UNNECESSARY** — combined with #11 |
| 16 | GET /ledger/vatType | 200 | Needed |
| 17 | POST /ledger/voucher | 201 | Needed |
| 18 | PUT /ledger/account (bank fix) | 200 | Conditional — needed here |
| 19 | POST /invoice | 201 | Needed |

**Wasted calls: 2** (GET /division, separate GET /ledger/account?isBankAccount)

**Optimal path: 16 calls (17 with bank fix) in 7 sequential steps:**
1. GET /department + POST /customer + GET /employee?assignableProjectManagers (3 parallel)
2. POST /employee × 2 + POST /project (3 parallel)
3. POST /project/projectActivity + POST /project/participant × 2 (3 parallel)
4. POST /timesheet/entry/list + POST /supplier + GET /ledger/account?number=1920,6590,2400 + GET /ledger/voucherType (4 parallel)
5. POST /ledger/voucher + GET /ledger/vatType (2 parallel)
6. PUT /ledger/account if needed (0-1)
7. POST /invoice (1)

## 4. Root Causes

1. **GET /division was cargo-culted**: The old standard included it because employees historically needed `employments[].division`. But sandbox testing proved employees created without `employments[]` at all can register timesheet entries, project participation, and all other scored actions. The division read existed only to populate a field that isn't needed.

2. **Two separate account reads were unnecessary**: `GET /ledger/account?number=6590,2400` (for voucher) and `GET /ledger/account?isBankAccount=true` (for invoice) both hit the same endpoint. Account 1920 ("Bankinnskudd") is the standard Norwegian bank account. A single `GET /ledger/account?number=1920,6590,2400` returns all three accounts in one call.

3. **Sequential employee creation was suboptimal**: emp1 was in step 2 alone, emp2 was in step 3 (parallel with PM read). Since PM read has no dependencies on dept/div/customer, moving it to step 1 allows both employees AND the project to parallelize in step 2.

## 5. Sandbox Verification

Three sandbox experiments confirmed the optimizations:

1. **Employee without employments[]**: `POST /employee` without `employments` → 201. Then `POST /timesheet/entry/list` for that employee → 201 with correct hours. Employees work without employment records.

2. **Combined account read**: `GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber` → 200, returning all three accounts (1920 with bankAccountNumber, 6590, 2400).

3. **Full optimized flow**: Complete lifecycle (customer, 2 employees without employments, project, activity, 2 participants, batch timesheet, supplier, combined account read, voucherType, voucher, vatType, invoice) → **16 calls, 0 errors**, all scored fields correct (budget 229500, hours 99, invoice with projectInvoiceDetails).

Also confirmed: `POST /employee` without department → 422 (department still required); `POST /employee` without division but WITH employments[] in sandbox where division exists → 422. Omitting `employments[]` entirely is the correct approach to avoid all division-related traps.

## 6. Playbook Changes

**Updated existing files** (no new files created):

- `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md`
  - Standard Flow: 7 steps (was 9), 16 base calls (was 18)
  - Removed GET /division from step 1
  - Combined account reads (number=1920,6590,2400) in step 4
  - Moved PM read to step 1, parallelized emp1+emp2+project in step 2
  - Employee payload rules: removed employments[] requirement, simplified to dept+userType+dateOfBirth only
  - Recovery branches: updated bank-account fallback for combined read
  - Added 10th production confirmation with sandbox re-proof details

- `./task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md`
  - Minimal Safe Flow: updated to 16-call baseline with 7 sequential steps
  - Critical Rules: simplified employee rules, added combined-account-read rule
  - Conditional Branches: replaced division handling with account-1920 fallback
  - Recommended Shapes: employee shape without employments[]
  - Avoidable Mistakes: consolidated and updated for new flow
  - Added production run f17d4753 findings

## 7. Commit

- Hash: `713ac941de33dc96a215b631c3f803f996a8ae3b`
- Message: `tripletex playbook: register-project-lifecycle — reduce baseline from 18 to 16 calls (10th production confirmation, f17d4753, Migração Cloud Horizonte, 19 calls 0 errors with old flow); sandbox-proved: (a) employees work without employments[], eliminating GET /division (-1 call), (b) combined account read number=1920,6590,2400 replaces two separate reads (-1 call), (c) PM read moved to step 1, emp1+emp2+project parallelized in step 2 (fewer sequential steps); sandbox full-path re-proof: 16 calls 0 errors`

## 8. Reusable Heuristics

1. **Employees don't need employment records for timesheet/project work**: In Tripletex, `POST /employee` without `employments[]` creates a valid employee who can register timesheet entries, be added as project participant, and perform all scored lifecycle actions. This eliminates the need for `GET /division` and avoids the entire class of division/startDate/employmentType 422 traps.

2. **Combine account reads with `number=` filter**: When you need accounts from different categories (expense accounts for voucher + bank account for invoice), use `GET /ledger/account?number=1920,6590,2400` instead of separate reads. Account 1920 is the standard Norwegian "Bankinnskudd" and exists in all standard chart-of-accounts setups.

3. **Maximize parallelization by analyzing true dependencies**: PM read has no dependency on department/division/customer — it can move to step 1. Both employees and the project all depend only on step 1 outputs (dept, customer, PM) — they can parallelize in step 2. This reduces sequential steps from 9 to 7 without changing call count.

4. **Question every GET that serves a conditional**: The `GET /division` existed to conditionally populate `employments[].division`. But the real question was: "is division needed at all?" The answer was no — the entire `employments[]` array was unnecessary. Always check whether the data being fetched is truly required for correctness.

5. **Account 1920 as reliable bank account**: In Norwegian accounting, account 1920 ("Bankinnskudd") is the standard bank account. It exists in all standard Tripletex setups and can be reliably fetched by number. If it lacks `bankAccountNumber`, fix it with the proven MOD11-valid value `"12345678903"`.
