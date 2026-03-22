# Reflection: prod-2026-03-22-113739345Z-dcf3ce59

## 1. Task

Register 5 hours for Silje Strand (silje.strand@example.org) on activity "Design" in project "Skytjeneste-oppsett" for Nordhav AS (org.nr 912074005). Hourly rate: 1750 kr/t. Create a project invoice based on the registered hours.

## 2. Reflection

**What went well:**
- Correctly identified this as an exact match for the trusted standard `register-project-hours-and-create-project-invoice.md` (existing entities, ≤24h, non-chargeable)
- Read the trusted standard before writing the script
- Used the optimized 3-step layout: parallel GETs → activity GET + bank fix → parallel timesheet + invoice
- Proactive bank account check eliminated any 4xx risk from unconfigured bank
- Activity resolved as non-chargeable (isChargeable=false) → correctly skipped hourly rate management
- Verification GETs used `dateTo=dateFrom+1` to avoid the known exclusive-dateTo 422
- All amounts correct: amountExVat=8750 (5×1750), amountOutstanding=10937.5 (25% VAT)

**What went poorly:**
- Nothing. The run was clean: 0 errors, 0 wasted calls, correct final state.

**Mistakes:**
- None. The run followed the documented optimal path exactly.

## 3. Call Efficiency

**The run was minimal-call.** 8 calls total (3 writes + 5 free reads), 0 errors, 3 sequential steps.

| Step | Calls | Type |
|------|-------|------|
| Step 1 | GET /employee, GET /project, GET /ledger/vatType, GET /ledger/account | 4 parallel free GETs |
| Step 2 | GET /activity/>forTimeSheet, PUT /ledger/account (bank fix) | 1 free GET + 1 write (parallel) |
| Step 3 | POST /timesheet/entry, POST /invoice?sendToCustomer=false | 2 writes (parallel) |
| Verification | GET /timesheet/entry, GET /invoice/{id} | 2 free GETs |

**Wasted calls:** None.

**Mathematical minimum for this task shape:**
- 5 reads to resolve IDs: employee, project, vatType, bankAccount, activity
- 2-3 writes: timesheet + invoice + optional bank fix
- Total: 7 configured / 8 unconfigured
- This run achieved exactly the unconfigured minimum.

**Lower-call path investigation:**
- Sandbox re-proof confirmed `employeeId` is optional on `GET /activity/>forTimeSheet` (same results without it), but `projectId` is still required, so the activity GET cannot move to step 1. No call reduction possible.
- Activities cannot be expanded from the project GET (`activities(*)` returns 400).
- `GET /project/projectActivity` returns 405 (POST-only).
- The 7/8 call floor is confirmed as the mathematical minimum. No lower-call path exists for this task shape.

## 4. Root Causes

No errors or suboptimalities to diagnose. The run executed the documented optimal path perfectly.

## 5. Sandbox Verification

- **Test: `GET /activity/>forTimeSheet` without `employeeId`** — returns the same 3 activities as with `employeeId` on the sandbox project. Confirmed `employeeId` is optional. However, `projectId` remains required, so the activity GET still depends on step 1 and cannot be parallelized with it. No call reduction enabled by this finding.

## 6. Playbook Changes

**Updated (not created) existing files:**

- `./trusted-standards/register-project-hours-and-create-project-invoice.md`
  - Added sandbox finding: `employeeId` optional on activity GET, but `projectId` still required → no call reduction
  - Added production confirmation: dcf3ce59 (Nordhav AS, 3rd consecutive optimal run, 8 calls, 0 errors)

- `./task-playbooks/register-project-hours-and-create-project-invoice.md`
  - Added same sandbox finding and production confirmation

No AGENTS.md changes needed — task pattern table and trusted standard references are already correct.

## 7. Commit

- **Hash:** `c5b139cc6`
- **Message:** `tripletex playbook: register-project-hours — add 3rd consecutive optimal run (dcf3ce59, Norwegian prompt, Nordhav AS/912074005/Silje Strand/Design/5h/1750)`

## 8. Reusable Heuristics

1. **The 3-step layout for existing-entity project hours + invoice is proven stable.** 3 consecutive runs (5e5e2c8c, d1063226, dcf3ce59) across Norwegian, Portuguese, and Norwegian prompts all completed with 0 errors and optimal call count.

2. **Bank account fix is needed on most fresh production accounts.** This run (like the previous 2) needed the proactive PUT. Always include `GET /ledger/account?isBankAccount=true` in step 1 and conditional PUT in step 2.

3. **`employeeId` is optional on `GET /activity/>forTimeSheet`.** Useful to know, but doesn't reduce calls since `projectId` is still required (comes from step 1). Don't waste time trying to eliminate the step-2 dependency.

4. **All production "Design" activities have been non-chargeable.** Every production run where the prompt activity was "Design" returned `isChargeable=false`. The chargeable branch code is still needed for correctness but hasn't been triggered in production on this task shape.

5. **25% VAT (id=3, "Utgående avgift, høy sats") is consistent across all production accounts.** Never hardcode it — always GET — but expect it.

6. **The mathematical call floor is proven: 7 configured / 8 unconfigured, no lower path exists.** Future optimization effort on this task shape should focus elsewhere (e.g., ensuring the chargeable branch also uses minimal calls if triggered).
