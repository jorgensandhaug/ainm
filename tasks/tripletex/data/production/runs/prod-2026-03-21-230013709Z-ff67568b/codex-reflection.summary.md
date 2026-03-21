# Codex Reflection: Cloud-Migration Eichenhof (ff67568b)

## Task

German-language full project lifecycle for "Cloud-Migration Eichenhof" (Eichenhof GmbH, Org. 986645888):
- Budget: 253000 NOK
- Hours: Hannah Weber (Projektleiter, 34h) + Marie Fischer (Berater, 118h) = 152h total
- Supplier cost: 47050 NOK from Silberberg GmbH (Org. 823323948)
- Create unsent customer invoice for the project

## Reflection

**What went well:**
- 0 API errors — perfect execution, no 422s or retries
- All 4 critical checklist items correctly implemented: `isFixedPrice: true` + `fixedprice: 253000`, `budgetHours: 152`, `adminAccess: true` for Hannah (PM), `POST /project/orderline` with `unitCostCurrency: 47050`
- UTC-safe date arithmetic using `Date.UTC()` — no timezone-shift issues
- Bank fix used correct MOD11-valid number `"12345678903"`
- All entities created correctly: customer, 2 employees, project, activity, 2 participants, 21 timesheet entries, supplier, orderline, voucher, invoice with `projectInvoiceDetails.length=1`

**What could be improved:**
- Used 2 individual `POST /employee` calls instead of `POST /employee/list` batch — wasted 1 call
- Used 2 individual `POST /project/participant` calls instead of `POST /project/participant/list` batch — wasted 1 call
- Used 7 sequential steps instead of 5 — frontloading reads and parallelizing voucher+invoice would reduce latency
- Ledger reads (accounts, voucherType, vatType) were sequenced after step 3 instead of frontloaded to step 1

## Call Efficiency

**Run was NOT minimal-call.** Used 18 calls (17 base + 1 bank fix). Optimal is 16 (15 base + 1 bank fix).

### Wasted calls:
1. **2× `POST /employee` instead of 1× `POST /employee/list`** — the batch endpoint accepts an array and returns `{ values: [emp1, emp2] }`. Saves 1 call.
2. **2× `POST /project/participant` instead of 1× `POST /project/participant/list`** — the batch endpoint accepts an array with per-participant `adminAccess`. Saves 1 call.

### Suboptimal sequencing (same call count, more sequential steps):
- Ledger reads (account, voucherType, vatType) could be in step 1 (no deps), enabling voucher+invoice to run parallel in final step
- Orderline could be in step 4 with timesheet/supplier (only needs projectId from step 2)
- Voucher + invoice are independent and can be parallel when no bank fix is needed

### Optimal path (15 calls without bank fix, 16 with):
```
Step 1: GET /department + POST /customer + GET /employee?assignableProjectManagers + GET /ledger/account + GET /ledger/voucherType + GET /ledger/vatType  (6 parallel)
Step 2: POST /employee/list + POST /project + [optional PUT /ledger/account bank fix]  (2-3 parallel)
Step 3: POST /project/projectActivity + POST /project/participant/list  (2 parallel)
Step 4: POST /timesheet/entry/list + POST /supplier + POST /project/orderline  (3 parallel)
Step 5: POST /ledger/voucher + POST /invoice?sendToCustomer=false  (2 parallel)
```
Total: 15 calls, 5 sequential steps (16 with bank fix in step 2, then invoice moves to step 6)

## Root Causes

1. **Agent used individual POST endpoints instead of batch endpoints** — `POST /employee/list` and `POST /project/participant/list` both exist and work (despite the participant endpoint being marked [BETA] in spec, it functions in both sandbox and production). The trusted standard at the time of this run did not yet document these batch endpoints.

2. **Ledger reads not frontloaded** — the 3 GET calls for accounts, voucherType, and vatType have no dependencies on any other step. Placing them in step 4 (after employee/project/activity creation) adds unnecessary sequential depth.

## Sandbox Verification

All optimizations verified on persistent sandbox (`kkpqfuj-amager.tripletex.dev`):

1. **`POST /employee/list`**: Created 2 employees in 1 call → `201`, returned `{ values: [emp1, emp2] }` with correct IDs ✓
2. **`POST /project/participant/list`**: Created 2 participants in 1 call → `201`, returned correct `adminAccess` per participant (`true` for PM, `false` for other) ✓
3. **Voucher + invoice parallel**: Both `POST /ledger/voucher` and `POST /invoice?sendToCustomer=false` completed in parallel → both `201`, no conflicts ✓
4. **Full optimized lifecycle**: 15 calls, 0 errors, all scored fields correct:
   - `project.fixedprice=253000`, `project.isFixedPrice=true`
   - `projectActivity.budgetHours=152`
   - 21 timesheet entries created
   - `orderline.unitCostCurrency=47050`
   - `invoice.amountExcludingVatCurrency=253000`, `projectInvoiceDetails.length=1`

## Playbook Changes

**Updated existing files (2 files):**

1. `./trusted-standards/common-endpoints.md` — added `## Project Participant` section documenting `/project/participant` and `/project/participant/list` batch endpoint, with note that [BETA] label doesn't block functionality
2. `./AGENTS.md` — added `/project/participant` and `/project/participant/list` to the common endpoints list

**Previously updated by concurrent session (already committed):**

3. `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` — updated standard flow from 16 to 15 calls, added `POST /project/participant/list` batch shape
4. `./task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md` — updated baseline to 15 calls, added participant batch to key API facts and production history

## Commit

- Hash: `293cdd9d`
- Message: `tripletex playbook: register-project-lifecycle — add POST /project/participant/list to common-endpoints and AGENTS.md; sandbox-verified batch participant creation (2 participants in 1 call, adminAccess correctly set); reduces lifecycle baseline from 16 to 15 calls (or 17→16 with bank fix)`

## Reusable Heuristics

1. **Always check for `/list` batch endpoints** before using individual POST calls. `POST /employee/list`, `POST /project/participant/list`, `POST /product/list`, and `POST /timesheet/entry/list` all batch-create in 1 call. Each saves 1 call per additional entity.

2. **Frontload all dependency-free reads to step 1.** Ledger account reads, voucherType reads, vatType reads, and department reads have no dependencies on created entities. Running them parallel with the customer POST and PM read maximizes parallelism and reduces sequential depth.

3. **Voucher and invoice are independent.** The Leverandørfaktura voucher and the customer invoice operate on different subsystems. When no bank-account fix is needed, they can run in parallel as the final step.

4. **[BETA] labels don't always block functionality.** Both `/project/participant` (single) and `/project/participant/list` (batch) are marked `[BETA]` in the OpenAPI spec, but both work in production and sandbox. Test before assuming a beta endpoint is blocked — the `403` rule applies to endpoints like `/incomingInvoice*`, not universally.

5. **Bank-account fix is conditional.** Account 1920 sometimes has `bankAccountNumber` already set (sandbox after first fix), sometimes not (fresh production accounts). The script must check and conditionally apply the fix, affecting the step structure (voucher+invoice parallel when no fix needed, or voucher+fix parallel then invoice sequential).
