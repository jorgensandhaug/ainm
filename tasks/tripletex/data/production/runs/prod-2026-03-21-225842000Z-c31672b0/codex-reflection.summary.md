# Codex Reflection — prod-2026-03-21-225842000Z-c31672b0

## 1. Task

Full project lifecycle for "Dataplattform Brattli" (Brattli AS, org.nr 937190808):
- Budget: 349100 kr
- Employee 1 (prosjektleder): Hilde Ødegård, hilde.degard@example.org, 21 hours
- Employee 2 (konsulent): Lars Johansen, lars.johansen@example.org, 141 hours
- Supplier cost: 71800 kr from Lysgård AS (org.nr 898870936)
- Create customer invoice for the project
- Norwegian prompt

## 2. Reflection

**What went well:**
- 18 API calls, 0 errors — clean execution with no 4xx errors
- All 4 critical fields set correctly: `isFixedPrice: true` + `fixedprice: 349100`, `budgetHours: 162`, `adminAccess: true` for PM participant, `unitCostCurrency: 71800` on project orderline
- UTC-safe date arithmetic for timesheet splitting (avoided the CET/CEST trap)
- Followed the trusted standard exactly as documented at the time of execution
- Both orderline + voucher created for supplier cost (project cost tracking + accounting linkage)
- All scored fields verified from write responses: project fixedprice=349100, budgetHours=162, 7 timesheet entries, invoice amount=349100, projectInvoiceDetails=1

**What was suboptimal:**
- Used 2× `POST /employee` (2 calls) instead of `POST /employee/list` (1 call) — the trusted standard had been updated to batch employees by a concurrent reflection, but this agent used the older standard
- Used 2× `POST /project/participant` (2 calls) instead of `POST /project/participant/list` (1 call) — batch participants weren't yet documented at script time
- Used 7 sequential steps instead of the optimal 5 — reads (accounts, voucherType, vatType) were in steps 4-5 instead of frontloaded to step 1; voucher and invoice were sequential instead of parallel

## 3. Call Efficiency

**Production run: 18 calls (17 base + 1 bank fix), 0 errors, 7 sequential steps**

| Call | Endpoint | Step | Necessary? |
|------|----------|------|------------|
| 1 | GET /department | 1 | Yes — employee requires department.id |
| 2 | POST /customer | 1 | Yes — project requires customer.id |
| 3 | GET /employee?assignableProjectManagers | 1 | Yes — project requires assignable PM |
| 4 | POST /employee (Hilde) | 2 | Yes — but could be batched with #5 |
| 5 | POST /employee (Lars) | 2 | Yes — but could be batched with #4 |
| 6 | POST /project | 2 | Yes |
| 7 | POST /project/projectActivity | 3 | Yes |
| 8 | POST /project/participant (Hilde, admin) | 3 | Yes — but could be batched with #9 |
| 9 | POST /project/participant (Lars) | 3 | Yes — but could be batched with #8 |
| 10 | POST /timesheet/entry/list | 4 | Yes |
| 11 | POST /supplier | 4 | Yes |
| 12 | GET /ledger/account?number=1920,6590,2400 | 4 | Yes — but could be frontloaded to step 1 |
| 13 | GET /ledger/voucherType | 4 | Yes — but could be frontloaded to step 1 |
| 14 | POST /project/orderline | 5 | Yes |
| 15 | POST /ledger/voucher | 5 | Yes |
| 16 | GET /ledger/vatType | 5 | Yes — but could be frontloaded to step 1 |
| 17 | PUT /ledger/account (bank fix) | 6 | Yes (conditional) — but could be in step 2 |
| 18 | POST /invoice | 7 | Yes |

**Wasted calls: 2** (2× employee instead of 1× employee/list = +1; 2× participant instead of 1× participant/list = +1)

**Optimal path (current trusted standard): 15 calls + 0-1 bank fix, 5 sequential steps:**
1. GET dept + POST customer + GET PM + GET accounts + GET voucherType + GET vatType (6 parallel)
2. POST /employee/list + POST /project [+ PUT bank fix] (2-3 parallel)
3. POST /project/projectActivity + POST /project/participant/list (2 parallel)
4. POST /timesheet/entry/list + POST /supplier + POST /project/orderline (3 parallel)
5. POST /ledger/voucher + POST /invoice (2 parallel)

## 4. Root Causes

| Issue | Root Cause | Impact |
|-------|-----------|--------|
| 2 extra employee calls | Script used `POST /employee` ×2 instead of `POST /employee/list` batch | +1 call |
| 2 extra participant calls | Script used `POST /project/participant` ×2 instead of `POST /project/participant/list` batch | +1 call |
| Suboptimal sequencing | Reads (accounts, voucherType, vatType) placed in steps 4-5 instead of step 1; voucher and invoice sequential instead of parallel | +2 sequential steps (no extra calls) |
| Bank fix needed | Account 1920 lacked `bankAccountNumber` — standard conditional branch | +1 call (unavoidable) |

No errors occurred. All 4 critical fields were set correctly. The run was functionally perfect but 2 calls above optimal.

## 5. Sandbox Verification

**Batch participants (POST /project/participant/list):**
- Sandbox-verified 2026-03-22: batch POST with 2 participants (one `adminAccess: true`, one `adminAccess: false`) returned 201 with both participants correctly created
- Despite [BETA] label in OpenAPI spec, the endpoint works (same as individual POST /project/participant which is also [BETA] and works in production)
- Saves 1 call per run

**Frontloaded reads + voucher/invoice parallel:**
- Sandbox-verified 2026-03-22: full lifecycle with all reads frontloaded to step 1, bank fix in step 2, voucher + invoice parallel in step 5
- Result: 17 calls (16 + bank fix), 0 errors, 5 sequential steps (sandbox used individual employees/participants)
- With batch employees + batch participants: would be 15 calls (+ 0-1 bank fix), 5 sequential steps

## 6. Playbook Changes

**Updated (existing):**
- `task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md` — added production confirmation for c31672b0 (Dataplattform Brattli, 18 calls, 0 errors); documented batch participant sandbox verification; updated production history with frontloaded reads optimization

**Already updated by concurrent reflection (ff67568b):**
- `trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` — already updated to 15-call baseline with batch participants + batch employees + 5-step frontloaded flow
- No AGENTS.md table changes needed (entries already existed)

## 7. Commit

```
97c8ff8e tripletex playbook: register-project-lifecycle — add 15th production confirmation (c31672b0, Norwegian prompt, Dataplattform Brattli / Brattli AS / 937190808 / budget 349100 / Hilde Ødegård 21h + Lars Johansen 141h / Lysgård AS 71800 supplier cost, 18 calls 0 errors)
```

Files changed:
- `task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md`

## 8. Reusable Heuristics

1. **Batch employees with POST /employee/list** — always use `POST /employee/list` to create both employees in 1 call instead of 2× `POST /employee`; returns `{ values: [emp1, emp2] }` with both IDs
2. **Batch participants with POST /project/participant/list** — despite [BETA] label, this endpoint works in sandbox and saves 1 call; use `POST /project/participant/list` with array of 2 participants (PM with `adminAccess: true`, other with `adminAccess: false`)
3. **Frontload ALL reads to step 1** — accounts, voucherType, and vatType reads have zero dependencies; moving them from steps 4-5 to step 1 (parallel with dept/customer/PM) enables voucher + invoice to be parallel in the final step, saving 2 sequential steps
4. **Bank fix in step 2, not step 6** — the bank fix only needs acc1920 info (from step 1); doing it in step 2 (parallel with employees + project) avoids a dedicated sequential step before the invoice
5. **Voucher and invoice are independent** — they share no mutual dependencies; parallelize them in the final step (voucher needs supplierId from step 4; invoice needs vatTypeId from step 1)
6. **UTC-safe date arithmetic is non-negotiable** — always use `new Date(Date.UTC(y, m-1, d + offset))` for timesheet date splitting; local-time construction silently shifts dates back 1 day in CET/CEST
7. **All 4 critical fields must be verified against the trusted standard checklist** — previous agents omitted isFixedPrice/fixedprice, budgetHours, adminAccess, and orderline in 10+ runs, causing 4/11 scoring every time
8. **Read ONLY the trusted standard before scripting** — do not read playbook + AGENTS.md + openapi.json for exact matches; a 2026-03-21 run timed out with 0 API calls because the agent consumed 300s reading documentation
