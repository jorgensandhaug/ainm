# Codex Reflection Summary — prod-2026-03-21-211402061Z-a81782be

## 1. Task

Project lifecycle for "Dataplattform Elvdal" (Elvdal AS, org.nr 894208848):
- Budget: 331100 kr
- Hours: Knut Brekke 43h (project leader), Svein Aasen 100h (consultant)
- Supplier cost: 61650 kr from Fossekraft AS (979871783)
- Create unsent customer invoice

Nynorsk prompt. Exact match for `register-project-lifecycle-budget-hours-cost-and-invoice` trusted standard.

## 2. Reflection

**What went well:**
- Task completed with 0 errors — no 4xx failures, all payloads correct on first attempt
- All scored fields verified correct: budget 331100, hours 43+100=143, supplier cost 61650 linked to Fossekraft AS, invoice with projectInvoiceDetails
- Correctly applied all known pitfalls: `userType: "NO_ACCESS"`, UTC-safe date arithmetic, explicit `row: 1`/`row: 2` on voucher postings, dynamic voucherType lookup, `isChargeable` inside `activity` object, `activityType` + `name` both present

**What went poorly:**
- Used the OLD flow (18-call baseline) instead of the newly established 16-call optimized flow
- Included `GET /division` and `employments[]` on employee payloads — unnecessary, wasting 1 call
- Used two separate `GET /ledger/account` reads instead of the combined `number=1920,6590,2400` read — wasting 1 call
- Suboptimal sequencing: emp1 serial → PM+emp2 parallel → project serial (3 sequential steps) instead of PM in step 1 → emp1+emp2+project all parallel (2 sequential steps)

**Root cause:** The agent read the trusted standard BEFORE the linter updated it with the 16-call optimization. The run followed the pre-optimization flow faithfully.

## 3. Call Efficiency

**Not minimal.** 19 calls used vs 17 optimal (with bank fix).

| Step | What the run did | Optimal | Delta |
|------|-----------------|---------|-------|
| 1 | GET dept + GET div + POST customer (3) | GET dept + POST customer + GET PM (3) | 0 |
| 2 | POST emp1 (1) | POST emp1 + POST emp2 + POST project (3) | — |
| 3 | GET PM + POST emp2 (2) | — | — |
| 4 | POST project (1) | — | — |
| 2-4 total | 4 calls, 3 sequential steps | 3 calls, 1 sequential step | -1 |
| 5 | POST activity + POST participant x2 (3) | same (3) | 0 |
| 6 | POST timesheet + POST supplier + GET acct(6590,2400) + GET voucherType (4) | same but combined acct (4) | 0 |
| 7 | POST voucher + GET vatType + GET acct(isBankAccount) (3) | POST voucher + GET vatType (2) | -1 |
| 8 | PUT bank fix (1) | same (1) | 0 |
| 9 | POST invoice (1) | same (1) | 0 |
| **Total** | **19** | **17** | **-2** |

**Wasted calls:**
1. `GET /division?count=1&fields=*` — unnecessary; employees work without `employments[]`
2. `GET /ledger/account?isBankAccount=true&fields=*` — replaced by combined `GET /ledger/account?number=1920,6590,2400`

**Lower-call path for next agent (7 sequential steps, 16-17 calls):**
1. `GET /department` + `POST /customer` + `GET /employee?assignableProjectManagers=true` (parallel, 3 calls)
2. `POST /employee` (emp1) + `POST /employee` (emp2) + `POST /project` (parallel, 3 calls)
3. `POST /project/projectActivity` + `POST /project/participant` x2 (parallel, 3 calls)
4. `POST /timesheet/entry/list` + `POST /supplier` + `GET /ledger/account?number=1920,6590,2400` + `GET /ledger/voucherType?name=Leverandørfaktura` (parallel, 4 calls)
5. `POST /ledger/voucher` + `GET /ledger/vatType?typeOfVat=OUTGOING` (parallel, 2 calls)
6. (conditional) `PUT /ledger/account/{id}` if 1920 lacks bankAccountNumber (0-1 calls)
7. `POST /invoice?sendToCustomer=false` (1 call)

**Total: 16 calls (17 with bank fix), 0 errors.**

## 4. Root Causes

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| Wasted `GET /division` | Agent followed old trusted standard that included division read | Updated standard: omit `employments[]` entirely, eliminating need for division |
| Wasted separate bank-account read | Agent used two separate account reads | Updated standard: combined `GET /ledger/account?number=1920,6590,2400` replaces both |
| Suboptimal sequencing | Agent put PM read in step 3, forcing emp1 and project to be serial | Updated standard: PM read in step 1, emp1+emp2+project all parallel in step 2 |

## 5. Sandbox Verification

Sandbox re-proof script `sandbox-verify.ts` confirmed the full optimized 16-call path:
- Employees created without `employments[]` → successful (empty `employments` array in response)
- Timesheet entries registered for employees without employment records → 7 entries created successfully
- Combined `GET /ledger/account?number=1920,6590,2400` → returned all 3 accounts (1920 with `bankAccountNumber=12345678903`, 6590 and 2400)
- Full lifecycle completed: customer, 2 employees, project, activity (budget 331100), 2 participants, timesheet (7 entries), supplier, voucher (61650), invoice (#367, amountExcludingVat=331100, projectInvoiceDetails.length=1)
- **Total: 16 calls, 0 errors**

## 6. Playbook Changes

Updated existing files (no new files created):

| File | Change |
|------|--------|
| `trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` | Added 11th production confirmation (a81782be, Dataplattform Elvdal, 19 calls 0 errors, 2 wasted vs new 16-call baseline); documented specific wasted calls and sandbox re-proof of optimized path |
| `task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md` | Replaced old `Dataplattform Elvdal` reconstruction with actual production run results; updated division guidance to note employees work without `employments[]`; added sandbox re-proof confirmation |
| `trusted-standards/common-endpoints.md` | Updated lifecycle invoice note to recommend combined `GET /ledger/account?number=1920,6590,2400` instead of separate `GET ?isBankAccount=true` |

## 7. Commit

```
Hash: 77fc72bc
Message: tripletex playbook: register-project-lifecycle — add 11th production confirmation (a81782be, Nynorsk prompt, Dataplattform Elvdal / Elvdal AS 894208848 / budget 331100 / 43+100h / Fossekraft AS 979871783 / cost 61650, 19 calls 0 errors with old flow), document 2 wasted calls vs new 16-call baseline: (1) GET /division unnecessary since employees work without employments[], (2) separate GET /ledger/account?isBankAccount=true replaced by combined number=1920,6590,2400 read; update common-endpoints.md lifecycle note to recommend combined account read; sandbox re-proof of optimized 16-call path confirmed 0 errors
```

## 8. Reusable Heuristics

1. **Employees without `employments[]` are fully functional** for timesheet registration, project participation, and all scored lifecycle actions. Omitting `employments[]` saves 1 call (`GET /division`) and eliminates the division/startDate/employmentType trap surface entirely.

2. **Combined account reads save calls.** `GET /ledger/account?number=1920,6590,2400` returns voucher accounts (6590, 2400) AND the bank account (1920) in a single call, replacing two separate reads. Account 1920 ("Bankinnskudd") is the standard Norwegian bank account present in all standard chart-of-accounts setups.

3. **Maximize step-1 parallelism.** Move all reads that don't depend on writes into step 1. The PM read (`GET /employee?assignableProjectManagers=true`) depends only on the existing account state, not on any previous write, so it belongs in step 1 parallel with the department read and customer create. This unlocks emp1+emp2+project as a single parallel step 2.

4. **Timing matters for trusted standard updates.** This run followed the old 18-call baseline because the agent read the standard before the concurrent linter updated it. For future runs, the updated standard is canonical.

5. **0 errors is achievable** for this task family. All 11 production runs that followed the trusted standard payloads correctly had 0 errors. The pitfalls (voucherType hardcoding, voucher row omission, employmentType, isChargeable placement, date timezone) are all payload-shape errors that the trusted standard now explicitly warns against.
