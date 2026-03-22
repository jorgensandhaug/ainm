# Post-Run Reflection: prod-2026-03-22-110112100Z-5e5e2c8c

## 1. Task

Register 5 hours for Ingrid Nilsen (ingrid.nilsen@example.org) on activity "Analyse" in project "Plattformintegrasjon" for Bergvik AS (org.nr 989231898). Hourly rate: 1400 kr/t. Create a project invoice to the customer based on the registered hours.

This is the **existing-entity variant** of `register-project-hours-and-create-project-invoice` — exact same prompt as a 2026-03-20 production run.

## 2. Reflection

### What went well
- Correctly identified exact task match and read the trusted standard before scripting
- Activity "Analyse" correctly identified as non-chargeable (skipped hourly rate management)
- Used proactive bank check (parallel free GETs) — avoided reactive 422
- Used `POST /invoice` with embedded `orders[]` (saves 1 call vs old `POST /order` + `PUT /order/:invoice`)
- Parallelized employee + project lookups
- 0 avoidable 4xx errors on writes
- Correct final state: amountExcludingVat=7000, amountCurrency=8750 (25% VAT)

### What went poorly
- **Verification GET bug**: `GET /timesheet/entry?dateFrom=2026-03-22&dateTo=2026-03-22` returned 422 because `dateTo` is exclusive. Fix: use `dateTo=2026-03-23`.
- **Sequential layout**: Used 6 sequential steps instead of the optimal 3. Missed opportunity to parallelize vatType+bank GETs in step 1, and timesheet+invoice in step 3.

## 3. Call Efficiency

| # | Call | Status | Type |
|---|------|--------|------|
| 1 | GET /employee | 200 | Resolution (free) |
| 2 | GET /project | 200 | Resolution (free) |
| 3 | GET /activity/>forTimeSheet | 200 | Resolution (free) |
| 4 | POST /timesheet/entry | 201 | **Write (scored)** |
| 5 | GET /ledger/vatType | 200 | VAT lookup (free) |
| 6 | GET /ledger/account | 200 | Bank check (free) |
| 7 | PUT /ledger/account | 200 | **Write (scored)** — bank fix |
| 8 | POST /invoice | 201 | **Write (scored)** |
| 9 | GET /timesheet/entry | 422 | Verification (free, BUG) |
| 10 | GET /invoice/{id} | 200 | Verification (free) |

**Writes: 3** (minimum for unconfigured bank). On configured bank: 2 writes.

**Was this minimal-call?** Yes for write count. The 3 writes are all necessary. The verification GET 422 was a bug but doesn't affect scoring (GETs are free).

**Wasted calls:** None scored. The verification GET 422 was the only issue — a free GET with wrong date range.

**Optimal path for next agent (non-chargeable, ≤24h, existing entities):**
- Step 1 (parallel): GET /employee + GET /project + GET /ledger/vatType + GET /ledger/account
- Step 2 (parallel): GET /activity/>forTimeSheet + conditional PUT /ledger/account
- Step 3 (parallel): POST /timesheet/entry + POST /invoice
- Verification: GET /timesheet/entry (dateTo=date+1!) + GET /invoice/{id}
- Total: 7 configured / 8 unconfigured bank, 3 sequential steps, 0 errors

## 4. Root Causes

1. **dateTo verification bug**: The timesheet verification GET used `dateFrom=X&dateTo=X` which fails because dateTo is exclusive ("'From and including' value is greater than or equal 'To and excluding' value"). This is a Tripletex filter convention, not documented in any previous production run or standard.

2. **Sequential layout**: The standard documented vatType + bank GETs as step 6 (after timesheet write) and invoice as step 8 (after bank fix). The optimized layout moves vatType + bank to step 1 (parallel with employee + project — no dependencies) and runs timesheet + invoice in parallel at step 3.

## 5. Sandbox Verification

Three tests run against persistent sandbox on 2026-03-22:

1. **dateTo=dateFrom → 422**: Confirmed. `GET /timesheet/entry?dateFrom=2026-03-20&dateTo=2026-03-20` → 422 with validation message about exclusive upper bound.

2. **dateTo=dateFrom+1 → 200**: Confirmed. `GET /timesheet/entry?dateFrom=2026-03-20&dateTo=2026-03-21` → 200, returned 2 entries.

3. **Invoice before timesheet for existing entities**: Confirmed. `POST /invoice?sendToCustomer=false` succeeded (201, amountExcludingVat=3300) BEFORE `POST /timesheet/entry` (201). This proves invoice does NOT depend on timesheet entries existing — both can run in parallel. Previously only confirmed for create-from-scratch variant.

## 6. Playbook Changes

Updated existing files (no new files created):

- **`./trusted-standards/register-project-hours-and-create-project-invoice.md`**:
  - Replaced Standard Flow with optimized 3-step parallel layout (non-chargeable + chargeable branches)
  - Added dateTo verification bug fix (CRITICAL: use dateTo=X+1)
  - Added 2026-03-22 production confirmation (5e5e2c8c)
  - Added sandbox proof: invoice+timesheet parallelization for existing entities
  - Added sandbox proof: dateTo exclusive upper bound

- **`./task-playbooks/register-project-hours-and-create-project-invoice.md`**:
  - Replaced Minimal Safe Flow with optimized 3-step layout
  - Replaced Exact-Match Fast Path with optimized 3-step layout
  - Added 3 new Avoidable Mistakes: dateTo bug, vatType/bank early placement, timesheet+invoice parallelization
  - Added 2026-03-22 production confirmation and sandbox proofs

## 7. Commit

- **Hash**: `732c443e`
- **Message**: `tripletex playbook: project-hours-invoice — add optimized 3-step parallel layout + dateTo fix (5e5e2c8c)`
- **Files**: trusted-standards/register-project-hours-and-create-project-invoice.md, task-playbooks/register-project-hours-and-create-project-invoice.md

## 8. Reusable Heuristics

1. **dateTo is exclusive in Tripletex filter endpoints**: `dateFrom=X&dateTo=X` always returns 422. Use `dateTo=X+1` for single-day queries. This applies to `/timesheet/entry` and likely all date-range filter endpoints.

2. **Invoice does NOT depend on timesheet for existing entities**: `POST /invoice?sendToCustomer=false` with embedded project orders succeeds regardless of whether timesheet entries exist. This enables parallelizing timesheet + invoice writes, reducing sequential steps from 6 to 3.

3. **Move dependency-free GETs to step 1**: `GET /ledger/vatType` and `GET /ledger/account` have NO dependencies on employee, project, or activity. They can run in parallel with the initial resolution GETs, saving 2 sequential steps.

4. **Bank fix can parallelize with activity lookup**: `PUT /ledger/account` depends only on the bank account GET (step 1), not on the activity lookup. Both can run in step 2 together.

5. **Repeat prompts confirm path stability**: This exact prompt (Bergvik AS / Plattformintegrasjon / Analyse / 5h / 1400) ran identically on 2026-03-20 and 2026-03-22. Same non-chargeable activity, same totals (7000/8750). The path is confirmed stable across runs.
