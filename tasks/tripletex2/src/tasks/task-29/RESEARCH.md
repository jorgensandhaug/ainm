# Task 29 — Full project lifecycle Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `29`
- Active strategy pin: `29.full-project-lifecycle.v1`
- Challenger: `29.full-project-lifecycle.v2` (enhanced sandbox-verified branch; promotion deferred pending explicit production confirmation)
- Task implementation: `task.ts`
- Stable task summary: _No task-local README.md yet_

## Current Research Queue Snapshot

- Priority: `4`
- Band: `focus`
- Queue eligibility: `ready`
- Research lane: `implemented-unproven`
- Best known score: `0.5455` / `6` (2/11 raw, checks 1-2 pass, checks 3-7 fail)

## Current State

### Production Evidence (2026-03-21)

Four legacy Tripletex1 production runs exist for task 29. Key runs:

1. **ERP-implementering Havbris** (Norwegian): completed, 167s, 17 API calls, score 0.5455 (2/11)
2. **Cloud Migration Northwave** (English): completed, 128s, 16 API calls, score 0.5455 (2/11)
3. Two others: timed out

Both completed runs show the **identical failure pattern**: checks 1-2 pass, checks 3-7 fail.
Score raw = 2, score max = 11, 7 checks total. This is a **correctness failure**, not efficiency.

Production run evidence paths:
- `../tripletex/data/production/runs/prod-2026-03-21-174545193Z-5c16a788/` (Norwegian)
- `../tripletex/data/production/runs/prod-2026-03-21-181150994Z-0f38a072/` (English)

### Score Reflection Analysis

Both production score reflections independently identify three root causes:

1. **Project manager identity**: The prompt names one employee as "project manager" (e.g., Samuel Brown). The strategy uses a generic assignable manager instead. The evaluator likely checks `project.projectManager`.
2. **Supplier cost via project orderline**: POST /project/orderline doesn't persist vendor linkage — `vendor` reads back as `null` even when explicitly set. The evaluator likely checks supplier linkage.
3. **Possible invoice/budget field mismatches**: Less certain, but the budget is set on the project activity (`budgetFeeCurrency`), not the project itself.

## Frontier Memory

### Strongest known branch
- `29.full-project-lifecycle.v2` — enhanced sandbox-verified challenger
- `29.full-project-lifecycle.v1` — current runtime baseline with a proven 0.5455/6 ceiling across 8 attempts

### Score / correctness ceiling
- 2/11 raw (0.18 correctness), normalized 0.5455/6
- Ceiling is structural — all 8 historical attempts hit the same 2/11

### Call-budget frontier
- v1 targets 13 calls, max 22
- Legacy scripts used 15-17 calls
- Call count is irrelevant until correctness improves

## Sandbox Verification Results (2026-03-22)

### v2 strategy: Project manager identity fix

**Hypothesis**: Use the prompt-named employee directly as `projectManager` on POST /project instead of querying `assignableProjectManagers`.

**Findings**:
1. **NO_ACCESS employees can't be project managers**: POST /project with a NO_ACCESS employee as projectManager → 422 "Validering feilet."
2. **STANDARD userType doesn't help**: Created employee with STANDARD — still rejected as project manager. Only the company admin (simen.sandhaug@gmail.com, id 18441996) is assignable.
3. **Tripletex enforces PM assignability server-side**: The `assignableProjectManagers` filter is not just a UI convenience — it reflects a hard API constraint.
4. **Conclusion**: Cannot assign a newly created employee as project manager without full admin-level access setup. This check will likely always fail with the current approach.

### Vendor linkage on project orderlines

**Confirmed**: POST /project/orderline with `vendor: { id: supplierId }` → 201 success, BUT `vendor` reads back as `null`. The API accepts but does NOT persist the vendor field on project orderlines. This means the evaluator will never see vendor linkage through the orderline path.

### Voucher-based supplier cost

**Tested**: POST /ledger/voucher creates a voucher with:
- Proper supplier linkage (both postings reference supplier ID)
- Proper project linkage (debit posting references project ID)
- Correct amounts (42000 debit / -42000 credit)
- Correct accounts (4300 expense debit / 2400 AP credit)

**Important**: Voucher creation requires `supplier.id` on ALL postings (not just the AP posting) — validation error "Leverandør mangler" otherwise. Also requires both `amount`/`amountCurrency` AND `amountGross`/`amountGrossCurrency`.

**Limitation**: Raw POST /ledger/voucher does NOT create a `supplierInvoice` record. GET /supplierInvoice returns 0 results after voucher creation. Supplier invoices are only created through the XML import path (POST /ledger/voucher/importDocument).

### Sandbox account IDs (for this sandbox instance)
- Expense account 4300 (Innkjøp av varer for videresalg): id `424191035`, isApplicableForSupplierInvoice=true
- AP account 2400 (Leverandørgjeld): id `424190921`
- Supplier invoice voucher type (Leverandørfaktura): id `9744845`

## Dead Ends / Anti-Patterns

1. **Don't rely on `vendor` field in POST /project/orderline** — it does not persist (NULL readback). This is a confirmed Tripletex API limitation, not a code bug.
2. **Don't try userType "STANDARD" or "EXTENDED" to make employees PM-assignable** — newly created employees with any userType are still NOT assignable as project managers. Only pre-existing admin-level employees are assignable.
3. **Don't create vouchers without `supplier.id` on ALL postings** — Tripletex requires it even on the expense (debit) posting.
4. **Don't expect POST /ledger/voucher to create supplier invoice records** — it creates voucher/posting records only. Use /ledger/voucher/importDocument for formal supplier invoices.
5. **Don't make `pickExactPartyByOrganizationNumber` throw on multiple matches** — sandbox residual state creates duplicates. Use first-match or name-match fallback.

## Next Hypotheses (Prioritized)

### Hypothesis A: XML import for supplier invoice (high priority)
Use POST /ledger/voucher/importDocument with a minimal EHF/UBL XML invoice (like task-16 does) to create a formal supplier invoice record. Then PUT /ledger/voucher/{id} to set the accounting postings with project linkage. This should create a supplier invoice that the evaluator can verify.

**Calls added**: ~3 (GET /ledger/account + POST /ledger/voucher/importDocument + PUT /ledger/voucher/{id})
**Calls removed**: 1 (POST /project/orderline)
**Net**: ~2 extra calls

### Hypothesis B: Investigate project budget field (medium priority)
Check if the Project schema has a direct budget field separate from `budgetFeeCurrency` on the project activity. If the evaluator checks a project-level budget, we need to set it explicitly.

### Hypothesis C: Investigate invoice structure (medium priority)
Check if the evaluator expects specific invoice fields beyond `amountExcludingVatCurrency` and `customer`. Fields like `invoiceDueDate`, `currency`, `invoicesDueIn`, or specific order line descriptions might matter.

### Hypothesis D: Project participants (low priority)
Check if the evaluator verifies that employees are registered as project participants, not just timesheet entry creators.

### Hypothesis E: Hourly rates on project (low priority)
Check if the evaluator verifies project hourly rate configuration.

## Enhanced v2 — Sandbox Verification (2026-03-22 09:04)

**Run ID**: `sandbox-29-29.full-project-lifecycle.v2-2026-03-22T09-04-41-418Z`
**Status**: completed, 17 API calls, all succeeded.

### What the enhanced v2 does differently from v1:
1. **Frontloaded parallel reads** (department, assignable managers, ledger accounts, voucher types, VAT types)
2. **isFixedPrice=true + fixedprice=budget** on POST /project
3. **budgetHours** on POST /project/projectActivity (total employee hours)
4. **POST /project/participant/list** — registers employees as project participants
5. **POST /ledger/voucher** for supplier cost — supplier/project linkage in accounting
6. **POST /invoice?sendToCustomer=false** with inline orders — creates `projectInvoiceDetails`
7. **Batch employee creation** via POST /employee/list
8. **Duplicate-tolerant entity lookups**

### Verified sandbox state:
- Project: `isFixedPrice: true`, `fixedprice: 250000` ✓
- Invoice: `amountExcludingVatCurrency: 250000`, `projectInvoiceDetails` present ✓
- Voucher: debit=42000 w/ project, credit=-42000 w/ supplier ✓
- Timesheet entries: 5 entries for 60+45 hours ✓

### Remaining unknowns:
- PM still falls back to admin — can't fix without admin-level employee setup
- Competition scoring not available in sandbox — need live run

### Promotion decision (2026-03-22)

Promotion is intentionally deferred for now. Repo evidence shows `29.full-project-lifecycle.v2` is the serious sandbox-verified challenger and that `v1` is ceiling-limited, but RESEARCH does not yet contain an explicit promotion call or production confirmation. Keep `v1` pinned in runtime until that gate is cleared, and use `v2` as the active challenger for the next verification cycle.

## Research Artifacts

### Strategy files
- `strategies/full-project-lifecycle-v2.ts` — enhanced v2 challenger (isFixedPrice + budgetHours + participants + supplier voucher + direct invoice)
- `strategies/full-project-lifecycle.ts` — v1 current active baseline (score 0.5455)

### Proof inputs
- `research/proofs/task-29/task-29-proof-input-fresh.json` — fresh-email proof input

### Key sandbox runs
- `sandbox-29-29.full-project-lifecycle.v2-2026-03-22T09-04-41-418Z` — enhanced v2, 17 calls, completed ✓
