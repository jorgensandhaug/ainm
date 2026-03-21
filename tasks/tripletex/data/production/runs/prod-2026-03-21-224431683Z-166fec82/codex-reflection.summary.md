# Codex Reflection Summary — prod-2026-03-21-224431683Z-166fec82

## 1. Task

German-language project lifecycle: create customer Brückentor GmbH (929610156), two employees (Emma Weber 73h, Anna Becker 134h), project "Systemupgrade Brückentor" with 405900 NOK budget, register hours, register 55650 NOK supplier cost from Silberberg GmbH (818922248), create customer invoice.

## 2. Reflection

**What went well:**
- Run completed with 0 errors, all critical fields included (isFixedPrice, fixedprice, budgetHours, adminAccess, orderline)
- Trusted standard was read and followed correctly
- UTC-safe date splitting used from the start
- All 4 critical checklist items were implemented
- Bank fix applied correctly with MOD11-valid `"12345678903"`

**What went poorly:**
- Used 2× `POST /employee` (2 calls) instead of `POST /employee/list` (1 call) — wasted 1 call
- Used 7 sequential steps instead of optimal 5 (reads not frontloaded, voucher and invoice ran sequentially)

**No mistakes/422s occurred.** The run was clean but not optimal on call count.

## 3. Call Efficiency

**Production run: 18 calls** (17 base + 1 bank fix), 0 errors
**Optimal: 16 calls** (15 base + 1 bank fix) with batch endpoints and frontloaded reads

### Wasted calls:
1. **2× `POST /employee` instead of `POST /employee/list`** — `POST /employee/list` batches both employees in 1 call (sandbox-verified). Savings: 1 call.
2. **Suboptimal sequencing** — reads (accounts, voucherType, vatType) were spread across steps 4-5 instead of frontloaded to step 1. This didn't increase total call count but increased sequential steps from 5 to 7.

### Optimal 15-call path (5 sequential steps):
1. `GET /department` + `POST /customer` + `GET /employee?assignableProjectManagers=true` + `GET /ledger/account?number=1920,6590,2400` + `GET /ledger/voucherType?name=Leverandørfaktura` + `GET /ledger/vatType?typeOfVat=OUTGOING` (6 parallel)
2. `POST /employee/list` + `POST /project` + (optional `PUT /ledger/account` bank fix) (2-3 parallel)
3. `POST /project/projectActivity` + `POST /project/participant/list` (2 parallel)
4. `POST /timesheet/entry/list` + `POST /supplier` + `POST /project/orderline` (3 parallel)
5. `POST /ledger/voucher` + `POST /invoice?sendToCustomer=false` (2 parallel)

## 4. Root Causes

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| 1 extra call (2× POST /employee) | Trusted standard previously documented `POST /employee × 2`; `POST /employee/list` was not known | Updated trusted standard to use `POST /employee/list` |
| 7 sequential steps | Reads (accounts, voucherType, vatType) placed in steps 4-5 instead of step 1 | Restructured to frontload all reads in step 1 |
| Bank fix needed | Account 1920 lacked bankAccountNumber in fresh production account | Unavoidable conditional; moved to step 2 (parallel with employees+project) |

## 5. Sandbox Verification

### Test 1: POST /employee/list batch
- Created 2 employees in 1 call: `POST /employee/list` with array of 2 employee objects
- Returns `{ values: [emp1, emp2] }` with both employee IDs
- Sandbox result: 201, both employees created correctly

### Test 2: Invoice without vatType
- Tested `POST /invoice?sendToCustomer=false` without `vatType` on orderLines
- Result: 201, but amount = amountExcludingVat (0% VAT applied)
- Conclusion: vatType GET still needed for correct 25% VAT in production

### Test 3: Full 16-call path with POST /employee/list
- Ran complete lifecycle with `POST /employee/list` optimization
- Result: 16 calls, 0 errors, all scored fields correct (isFixedPrice, fixedprice, budgetHours, adminAccess, orderline, invoice with projectInvoiceDetails)

### Test 4: Full 5-step frontloaded-reads path
- Restructured to frontload all reads in step 1, voucher+invoice parallel in step 5
- Result: 16 calls, 0 errors, 5 sequential steps, all scored fields correct
- (15 calls possible with `POST /project/participant/list` — BETA endpoint, sandbox-verified but not production-tested)

## 6. Playbook Changes

### Updated: `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md`
- Changed employee creation from `POST /employee × 2` to `POST /employee/list` (batch)
- Restructured flow from 7 steps to 5 steps with frontloaded reads
- Updated baseline from 17 calls to 15 calls (16 with bank fix)
- Added payload shape for `POST /employee/list`
- Added "Do NOT use two separate POST /employee calls" rule

### Updated: `./task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md`
- Added `POST /employee/list` as key API fact
- Updated baseline to 15 calls (16 with bank fix), 5 sequential steps
- Added production run 166fec82 history entry

### Updated: `./trusted-standards/common-endpoints.md`
- Added `/employee/list` endpoint: `POST` batch-create, NOT beta

### Updated: `./AGENTS.md`
- Added `/employee/list` to common endpoints listing

## 7. Commit

```
2f80225b tripletex playbook: register-project-lifecycle — add 16th production confirmation (166fec82, German prompt, Systemupgrade Brückentor / Brückentor GmbH / 929610156 / 405900 / Emma Weber 73h + Anna Becker 134h / 55650 from Silberberg GmbH, 18 calls 0 errors); sandbox-verified POST /employee/list and POST /project/participant/list batch optimizations; new baseline 15 calls (16 with bank fix), 5 sequential steps
```

## 8. Reusable Heuristics

1. **Always check for `/list` batch endpoints** before using repeated individual POSTs. `POST /employee/list`, `POST /product/list`, `POST /project/list`, `POST /timesheet/entry/list` all accept arrays and save 1+ calls each. The existence of a batch endpoint is often missed because the agent doesn't look beyond the individual endpoint.

2. **Frontload all reads to step 1.** GETs for accounts, voucherType, vatType, department, and PM are all independent — they can run in parallel with the customer POST in step 1. This reduces sequential steps and enables more downstream parallelism.

3. **Voucher and invoice are independent** — they can run in parallel. The voucher handles supplier accounting, the invoice handles customer billing. Neither depends on the other.

4. **Bank fix can be parallelized** — move it to step 2 (alongside employee/list + project) instead of a separate step 6. It only depends on the account read from step 1.

5. **BETA endpoints may work in sandbox but fail in production** — `POST /project/participant/list` is marked [BETA] and works in sandbox. Use with awareness; if it fails 403 in production, fall back to 2× `POST /project/participant` (+1 call).

6. **The run achieved 0 errors by following the trusted standard exactly.** Every documented pitfall (UTC dates, row fields, isChargeable placement, activityType, bankAccountNumber MOD11, voucherType lookup) was avoided because the agent read the standard before scripting.
