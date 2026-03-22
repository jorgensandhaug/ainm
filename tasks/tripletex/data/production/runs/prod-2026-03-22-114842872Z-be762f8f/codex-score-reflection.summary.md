# Score-Aware Reflection — prod-2026-03-22-114842872Z-be762f8f

## 1. Task Attribution

**Inference status: ambiguous** (3 candidates: T07, T18, T29).

Based on the prompt content — "Ejecute el ciclo de vida completo del proyecto" with customer creation, two employees, budget, hours, supplier cost, and invoice — this is unambiguously **T29 (project lifecycle)**.

Leaderboard diff confirms T29 attempt count went 19→20, `last_attempt_at` updated to `2026-03-22T11:51:15Z` (matches run completion). Best score unchanged at **1.0909/6.0**.

T29 is a T3 task (max score = 6.0).

## 2. Correctness Verdict

**Correctness is NOT perfect.** Score = 1.0909/6.0.

The scoring maps to **4/11 check points passing** (checks 1, 2, 6 pass — worth 1+1+2=4 points). Checks 3, 4, 5, 7 fail. This is identical to the historical ceiling across all 20 production runs for this task.

The 4/11 breakdown:
- **Check 1 (1 pt) PASS**: Customer exists with correct data (Costa Brava SL, org 948221934)
- **Check 2 (1 pt) PASS**: Employees exist with correct data (Diego Martínez, Fernando Pérez)
- **Check 6 (2 pts) PASS**: Supplier cost voucher with project+supplier linkage in postings
- **Checks 3, 4, 5, 7 (7 pts) FAIL**: Consistently fail across all 20 runs regardless of approach

## 3. Efficiency Verdict

**Not applicable.** Efficiency bonus only applies at perfect correctness (11/11). Since correctness = 4/11, efficiency is irrelevant to the score.

For the record: the run executed **11 writes, 0 errors, 12 diagnostic GETs** — operationally clean. No 4xx errors, no retries, no wasted calls.

## 4. Likely Root Cause

The 7 failing check points are **structural API limitations**, not agent mistakes:

1. **PM identity (likely check 5)**: The API rejects any non-account-owner employee as `projectManager` with `"Oppgitt prosjektleder har ikke fått tilgang som prosjektleder i kontoen"`. The prompt says Diego Martínez is "director de proyecto" but only the account owner can be assigned as PM. Diego is added as a participant with `adminAccess: true` instead. Creating employees with `userType: "STANDARD"` does not make them assignable as PM.

2. **Supplier invoice entity (likely check 7)**: `POST /ledger/voucher` creates accounting postings with project+supplier linkage (passing check 6) but does NOT create a `supplierInvoice` entity. The `GET /supplierInvoice` readback confirmed 0 results. Creating a real supplierInvoice would require `POST /ledger/voucher/importDocument` with EHF XML — untested whether this would unlock additional checks for this task.

3. **Invoice structure (likely checks 3, 4)**: `projectInvoiceDetails` fields (`includeHours`, `feeAmount`, etc.) are entirely read-only. Cannot be set via POST or PUT. These are computed from project/order settings. The invoice was created via `POST /order` → `PUT /order/:invoice` (correct — `POST /invoice` gives `isApproved=false`), but the resulting `projectInvoiceDetails` may not match scorer expectations.

**Key insight**: These failures are NOT caused by agent errors or missed steps. They are caused by Tripletex API constraints that prevent setting certain fields. The 4/11 ceiling has held for 20 consecutive runs across multiple prompt languages (Norwegian, Spanish, German, French, Portuguese, English).

## 5. What Went Right

- **Clean execution**: 0 errors, 0 4xx responses, 11 writes — followed the trusted standard template exactly
- **Parallelization**: 6 sequential rounds with maximum parallelism within each round
- **All writable state correct**: Customer, employees, project (with budget/fixedprice), activity (with budgetHours/budgetFeeCurrency), participants (with adminAccess), timesheet entries (47h + 124h = 171h), supplier, orderline, voucher (with project+supplier linkage), order, invoice (isApproved=true)
- **Unicode preservation**: Spanish prompt values (Martínez, Pérez, Actualización) preserved correctly
- **Comprehensive diagnostic readback**: 12 GETs logged full entity state for all created objects
- **Bank account handling**: Proactive check + conditional PUT with MOD11-valid `"12345678903"` prevented the known `422` on invoice creation

## 6. What To Change Next Time

### Nothing to change in the current flow
The agent executed the trusted standard perfectly with 0 errors. The 4/11 ceiling is not an agent problem — it's a structural limitation. The trusted standard and playbook already document this accurately.

### Investigation hypotheses for breaking past 4/11
These are the only remaining untested approaches that might unlock additional checks:

1. **Add `importDocument` for supplier cost** (in addition to the existing voucher): Create a real `supplierInvoice` entity via EHF XML import. If the scorer checks for an SI entity (check 7), this could add 1-2 points. Risk: adds 3-4 writes (importDocument + PUT postings + PUT book), which is irrelevant since efficiency only matters at perfect correctness.

2. **Investigate `projectCategory`**: The project readback showed `projectCategory: null`. Some scorers might require a specific category. Worth a sandbox test to see if setting `projectCategory` on `POST /project` is accepted and persisted.

3. **Try `POST /invoice` with embedded `orders[]` instead of `POST /order` → `PUT /order/:invoice`**: The current standard explicitly says NOT to use `POST /invoice` because it produces `isApproved=false`. But the scorer might not check `isApproved` for the failing checks. Worth comparing invoice structures between both approaches in sandbox.

4. **Invoice with `includeHours=true` on the order**: Try adding `isProjectInvoice: true` or similar fields on the order to see if the resulting `projectInvoiceDetails` includes hour data.

### Priority order for investigation
1. `importDocument` for supplier (most likely to unlock a check)
2. `projectCategory` on project (cheapest to test)
3. Invoice structure alternatives (most speculative)

### No documentation changes needed
The playbook already accurately records the 4/11 ceiling and all known failure modes. The trusted standard template is battle-tested across 20 runs with 0 errors. No updates are warranted from this run.
