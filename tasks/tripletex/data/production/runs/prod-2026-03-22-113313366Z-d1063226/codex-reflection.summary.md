# Post-Run Reflection: prod-2026-03-22-113313366Z-d1063226

## 1. Task

Register 11 hours for Inês Rodrigues (ines.rodrigues@example.org) on activity "Design" of project "Redesign do site" for Estrela Lda (org. nº 930325325). Hourly rate: 1000 NOK/h. Generate a project invoice to the client based on the registered hours. Portuguese prompt; existing entities.

## 2. Reflection

**What went well:**
- Correctly identified as an exact match for the existing-entity "register project hours and create project invoice" trusted standard
- Read the trusted standard before writing any script (as required by AGENTS.md)
- Used the optimized 3-step layout with maximum parallelism at each step
- Proactive bank account check avoided a reactive 4xx error (bank account had empty `bankAccountNumber`)
- Activity was correctly resolved as non-chargeable (`isChargeable=false`); skipped hourly rate management
- Invoice used `POST /invoice?sendToCustomer=false` with embedded `orders[]` (saves 1 call vs old `POST /order` + `PUT /order/:invoice`)
- Timesheet and invoice ran in parallel at step 3 (invoice does NOT depend on timesheet)
- 0 errors, correct final state

**What went poorly:**
- Nothing. The run was optimal.

**Mistakes:**
- None. All API calls succeeded on the first attempt.

## 3. Call Efficiency

**The run was minimal-call.** 8 API calls total (3 writes + 5 GETs), 0 errors.

| Step | Call | Type | Purpose |
|------|------|------|---------|
| 1 | GET /employee | free | Resolve employee by email |
| 1 | GET /project | free | Resolve project + customer |
| 1 | GET /ledger/vatType | free | Get outgoing VAT type |
| 1 | GET /ledger/account | free | Proactive bank account check |
| 2 | GET /activity/>forTimeSheet | free | Resolve activity ID + chargeability |
| 2 | PUT /ledger/account | write | Fix missing bankAccountNumber |
| 3 | POST /timesheet/entry | write | Register 11 hours |
| 3 | POST /invoice | write | Create project invoice |

Plus 2 free verification GETs (timesheet + invoice readback).

**Wasted calls:** 0. The 8-call path (unconfigured bank) is the proven floor for this task shape.

**Lower-call path for next agent:** Same — 7 calls if bank is already configured, 8 if not. No lower path exists:
- Cannot skip activity GET (no project expansion for activities — confirmed 400/405 in sandbox)
- Cannot skip vatType GET (wrong VAT on taxable accounts without it)
- Cannot skip bank GET (invoice fails on unconfigured accounts)
- Cannot merge any remaining calls

## 4. Root Causes

No issues to root-cause. The run executed the trusted standard perfectly:
- Correct task shape identification (existing-entity, non-chargeable, ≤24h)
- Correct 3-step layout (4 parallel GETs → activity + bank fix → parallel timesheet + invoice)
- Correct invoice payload (customer in both root and orders[0], explicit invoiceDueDate, vatType from lookup)
- Correct verification (dateTo = dateFrom + 1 day, not same day)

## 5. Sandbox Verification

Sandbox re-proof on 2026-03-22 confirmed:
1. `GET /project?...&fields=*,customer(*),activities(*)` returns **400** — `activities` is not a valid expansion field on ProjectDTO
2. `GET /project/projectActivity?projectId=...` returns **405** (Method Not Allowed) — this endpoint is POST-only (for creating project activities)
3. `GET /activity/>forTimeSheet` remains the **only valid way** to resolve activity IDs for timesheet purposes
4. The full 3-step flow (employee + project + vatType + bank → activity → parallel timesheet + invoice) succeeds with correct amounts: `amountExcludingVatCurrency=11000`, `amountCurrencyOutstanding=13750`
5. No lower-call alternative exists for the existing-entity non-chargeable ≤24h shape

## 6. Playbook Changes

**Updated existing files** (no new files created):
- `trusted-standards/register-project-hours-and-create-project-invoice.md`:
  - Added 2026-03-22 Portuguese production confirmation (Estrela Lda, d1063226)
  - Added sandbox finding: `activities` expansion on project GET returns 400, `GET /project/projectActivity` returns 405
  - Added payload rule: do not try to skip activity GET by expanding from project GET
- `task-playbooks/register-project-hours-and-create-project-invoice.md`:
  - Added same production confirmation
  - Added same avoidable mistake about activity-fetching dead ends

## 7. Commit

- Hash: `7962ead9`
- Message: `tripletex playbook: project-hours-invoice — add 2nd consecutive optimal run (d1063226, Estrela Lda/930325325, Portuguese, Design 11h×1000)`

## 8. Reusable Heuristics

1. **Activity GET is mandatory**: There is no way to skip `GET /activity/>forTimeSheet` — the project GET cannot expand activities (`activities` field returns 400), and `GET /project/projectActivity` is POST-only (405). Any agent attempting to save a call by skipping the activity GET will waste time on 400/405 errors.

2. **Proactive bank check pays off consistently**: 4 out of 10+ production runs on this task shape hit unconfigured bank accounts. The proactive `GET /ledger/account` in step 1 costs 0 extra wall-clock time (parallel with other GETs) and avoids the 4xx error + retry path that costs 3 extra calls.

3. **3-step layout is stable across languages**: This run confirms the optimized 3-step layout works for Portuguese prompts, matching prior confirmations for Norwegian, German, and French. The same 8 API calls, same 0 errors, same correct amounts.

4. **Invoice does NOT depend on timesheet**: Running `POST /timesheet/entry` and `POST /invoice` in parallel at step 3 saves one sequential step with zero correctness risk. This has been confirmed across 5+ production runs and multiple sandbox proofs.

5. **The 7/8 call floor is real**: After exhaustive sandbox investigation of alternative paths (project expansion, projectActivity endpoint, different query patterns), the existing 3-step layout remains the lowest-call path for existing-entity non-chargeable ≤24h project hours + invoice tasks.
