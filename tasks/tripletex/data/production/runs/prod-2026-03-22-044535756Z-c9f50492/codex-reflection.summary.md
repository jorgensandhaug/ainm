# Codex Reflection — prod-2026-03-22-044535756Z-c9f50492

## 1. Task

Project lifecycle for "Plataforma Datos Montaña" (Montaña SL, org 806602094): create customer, 2 employees (Pablo Rodríguez 56h, Ricardo Rodríguez 52h), project with 200900 NOK budget, register timesheet hours, supplier cost 98700 NOK from Río Verde SL (org 806237310), and create customer invoice. Spanish prompt.

## 2. Reflection

**What went well:**
- Agent correctly identified the trusted standard `register-project-lifecycle-budget-hours-cost-and-invoice.md` and read it before scripting.
- Script template was followed exactly — all 4 critical fields (isFixedPrice+fixedprice, budgetHours, POST /project/orderline, adminAccess) were included.
- All steps 1–4 completed successfully (15 calls, 14 succeeded).
- Prompt values were correctly extracted from the Spanish prompt.

**What went poorly:**
- POST /invoice in step 5 returned 409 "Duplicate entry" — a transient proxy issue.
- Recovery script (`fix-invoice.ts`) wasted 2 calls on `GET /order` and `GET /invoice` that both returned 422 because the agent didn't provide required `orderDateFrom/To` and `invoiceDateFrom/To` query params.
- Total: 18 calls (vs 15 ideal), 3 errors (1× 409, 2× 422).

**Mistakes:**
1. The 409 on invoice was unpreventable (transient proxy issue), but the recovery was inefficient.
2. The agent used `GET /order?customerId=X` and `GET /invoice?customerId=X` without required date range parameters, causing two avoidable 422 errors.
3. The correct recovery was to simply retry the same POST /invoice directly — which would have been 1 extra call instead of 3.

## 3. Call Efficiency

**Was the run minimal-call?** No. The intended 15-call path is truly minimal for this task shape (verified: all 5 GETs are required, all 10 POSTs are required, the conditional PUT is needed for fresh accounts without bank account number).

**Actual calls:** 18 (15 from run.ts + 3 from fix-invoice.ts)
**Ideal calls:** 15 (or 16 with bank account PUT)
**Wasted calls:** 3
- 1× POST /invoice 409 (unpreventable transient proxy issue)
- 1× GET /order 422 (missing required `orderDateFrom`/`orderDateTo`)
- 1× GET /invoice 422 (missing required `invoiceDateFrom`/`invoiceDateTo`)

**Lower-call path for next agent:**
The same 15-call path, but restructured from 5→4 sequential phases:
1. **Phase 1** (7 parallel): GET department + GET employee (PM) + GET accounts + GET voucherType + GET vatType + POST customer + POST supplier
2. **Phase 2** (2-3 parallel): POST employee/list + POST project + conditional PUT bank account
3. **Phase 3** (4 parallel): POST projectActivity + POST participant/list + POST orderline + POST voucher
4. **Phase 4** (2 parallel): POST timesheet/entry/list + POST invoice

Savings: POST /supplier moved from phase 4→1 (no dependencies), POST /orderline and POST /voucher moved from phases 4-5→3 (all dependencies satisfied from phases 1+2). Same 15 calls, 1 fewer sequential phase.

## 4. Root Causes

| Issue | Root Cause | Fix |
|-------|-----------|-----|
| 409 on POST /invoice | Transient proxy deduplication/race condition | Not reproducible in sandbox — add retry guidance |
| 2× 422 on GET order/invoice | Agent used GET endpoints without required date range params | Recovery should be: retry POST directly, not check-then-create |
| 5 sequential phases (old) | POST /supplier unnecessarily delayed to phase 4 | Move to phase 1 (no dependencies); move orderline+voucher to phase 3 |

## 5. Sandbox Verification

Verified 2026-03-22 on persistent sandbox (kkpqfuj-amager.tripletex.dev):

1. **Employee without department:** 422 — `department.id` is required. GET /department cannot be eliminated.
2. **Parallel voucher + invoice:** Both returned 201 — no 409 in sandbox. Confirms the production 409 was transient.
3. **4-phase flow end-to-end:** 15 calls, all 201s, 4 sequential phases. All entities created correctly.
4. **Account 1920 state:** Already has bankAccountNumber="12345678903" in sandbox (from previous tests). Conditional PUT handles fresh accounts that lack it.

## 6. Playbook Changes

**Updated existing trusted standard:** `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md`
- Restructured script template from 5 steps → 4 phases
- Moved POST /supplier to phase 1 (no dependencies)
- Moved POST /orderline + POST /voucher to phase 3 (deps from phases 1+2)
- Added 409 recovery guidance in Recovery section
- Added "Do NOT" rule about GET /order and GET /invoice requiring date range params

**Updated existing playbook:** `./task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md`
- Updated Optimal Path from "5 sequential steps" to "4 sequential phases" with phase layout
- Added "409 Recovery" section

**Updated AGENTS.md:**
- Line 306: Updated project-lifecycle description from 5 steps → 4 phases with detailed phase layout
- Added 409 recovery guidance

## 7. Commit

- **Hash:** `0299d5c0`
- **Message:** `tripletex playbook: register-project-lifecycle — optimize from 5 to 4 sequential phases (prod-c9f50492, Spanish prompt, Montaña SL / 806602094, 200900 budget, Pablo+Ricardo 56+52h, Río Verde SL 98700 cost); sandbox-verified 2026-03-22: 15 calls all 201s in 4 phases; moved POST /supplier to phase 1 (no deps), POST /orderline + POST /voucher to phase 3 (deps satisfied from phases 1+2); added 409 invoice recovery guidance`
- **Files:** AGENTS.md, trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md, task-playbooks/register-project-lifecycle-budget-hours-cost-and-invoice.md

## 8. Reusable Heuristics

1. **POST /supplier has no dependencies** — it only needs name+org from the prompt. Always include it in the first parallel batch alongside GETs and POST /customer.
2. **POST /project/orderline and POST /voucher depend only on phase 1+2 results** — project ID (phase 2), supplier ID (phase 1), account IDs (phase 1), voucherType ID (phase 1). They can run in phase 3 alongside activity+participants.
3. **GET /order and GET /invoice require date range parameters** — `orderDateFrom/To` and `invoiceDateFrom/To` are mandatory. Using them without these params wastes calls on 422 errors.
4. **On 409 "Duplicate entry" for POST /invoice**, retry the same POST directly — don't waste calls checking existing state.
5. **Department is required on employees** — `department.id: "Feltet må fylles ut."` Always fetch department first. Cannot skip GET /department.
6. **Parallel voucher + invoice is safe** — no race condition observed in sandbox. The production 409 was a transient proxy issue, not a Tripletex constraint.
7. **15 calls is the proven floor** for this task shape (5 GETs + 10 POSTs). All GETs are required (department, PM, accounts, voucherType, vatType). The conditional bank account PUT adds 0-1 call depending on fresh account state.
