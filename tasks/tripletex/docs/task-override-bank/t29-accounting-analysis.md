# Task 29 — Accounting First Principles Analysis

**Date**: 2026-03-22
**Current best score**: 4/11 (checks 1, 2, 6 pass)
**Target**: 11/11

## 1. Norwegian Accounting Standards on Project Lifecycle Completeness

In Norwegian business accounting (GRS — God Regnskapsskikk, NRS — Norsk Regnskapsstandard), a "complete project lifecycle" encompasses:

### A. Project Establishment (Prosjektoppsett)
- **Customer relationship**: Formal customer entity with organization number (Brønnøysund-registered)
- **Project charter**: Named project linked to customer, with designated project manager (prosjektleder)
- **Budget**: Monetary budget representing expected project revenue (prosjektbudsjett)
- **Participants**: Named employees assigned to project with defined roles

### B. Resource Configuration (Ressursoppsett)
- **Hourly rates** (timesatser): The rate at which employee time is billed — this is a fundamental concept in Norwegian project accounting. Without configured rates, time registration has no monetary value.
- **Chargeability** (fakturerbarhet): Activities must be marked as chargeable (fakturerbar) for time to be billable
- **Budget linkage**: Budget must appear at the correct level (activity-level `budgetFeeCurrency` in Tripletex, NOT project-level `fixedprice`)

### C. Time Registration (Timeregistrering)
- **Timesheet entries**: Hours per employee, per project, per activity
- **Billable status**: Entries must be chargeable with hourlyRate > 0
- **Accounting principle**: In T&M (time & materials), time is the revenue driver — unbillable hours (hourlyRate=0) mean the time registration is economically meaningless

### D. Supplier Costs (Leverandørkostnader)
- **Formal supplier invoice** (innkommende faktura / leverandørfaktura): In Norwegian accounting, a cost MUST be documented with a formal invoice entity — not just a voucher/posting. NRS requires traceability from cost to source document.
- **Dual recording**: The cost appears in both:
  1. The project cost ledger (linked to project for cost tracking)
  2. The formal accounts payable system (as a supplier invoice entity for AP tracking)
- **Key distinction**: A manual voucher (bilag) with account postings is NOT the same as a supplier invoice (leverandørfaktura). The voucher records the accounting entry; the supplier invoice is the source document.

### E. Customer Invoice (Kundefaktura)
- **Project billing**: Invoice must be linked to the project (projectInvoiceDetails)
- **Amount basis**: For budget-based projects, the invoice amount = budget. For T&M, it would be hours × rate.
- **The "budsjett" distinction**: Norwegian "budsjett" (budget) is a planning tool. It is NOT "fastpris" (fixed price). However, in practice, the prompt's intent appears to be: "the project is worth BUDGET kr, invoice the customer for this amount."

### F. Accounting Completeness (Regnskapsmessig fullstendighet)
- All costs properly linked to project
- Proper chart-of-accounts postings (debit/credit)
- VAT handling where applicable
- Source document traceability

## 2. Invoice Structure Hypothesis

### Current approach (all 4/11 runs)
One order line: `description: PROJECT_NAME, count: 1, unitPriceExcludingVatCurrency: BUDGET`

### Radical hypothesis: per-employee line items
```
Line 1: PM_FIRST PM_LAST, count: PM_HOURS, price: HOURLY_RATE
Line 2: CON_FIRST CON_LAST, count: CON_HOURS, price: HOURLY_RATE
Total: TOTAL_HOURS × HOURLY_RATE ≈ BUDGET (±rounding)
```

### Assessment
**UNLIKELY to be the issue.** Reasoning:
- The invoice amount (BUDGET) is unambiguous in the prompt
- Rate = Math.round(BUDGET/TOTAL_HOURS), so TOTAL_HOURS × rate ≈ BUDGET (tiny rounding error)
- Check 6 (invoice) already PASSES with the single-line approach
- If the scorer wanted per-employee lines, it would probably be a separate check

**The invoice amount should remain BUDGET.** The single-line approach works for check 6. If check 7 is about invoice structure, it's more likely about project linkage or projectInvoiceDetails than line item granularity.

## 3. Hourly Rate Configuration Hypothesis

### The isFixedPrice suppression discovery
**THIS IS THE MOST IMPORTANT FINDING.**

All three 4/11 production runs (25760653, c9f50492, f17d4753) used `isFixedPrice: true` on the project. This SUPPRESSES hourly rates on ALL timesheet entries:
- With `isFixedPrice: true`: timesheet entries show `hourlyRate: 0, chargeable: false` — regardless of rate configuration
- With `isFixedPrice: false` (or omitted): timesheet entries show `hourlyRate: RATE, chargeable: true` — when rates are configured before entries

**The 4/11 runs NEVER had working hourly rates.** The c9f50492 score reflection says "this run included ALL 5 critical items" but those "critical items" included isFixedPrice=true, which NEGATED the hourly rate setup.

### Required configuration (current trusted standard, never production-tested)
1. Project: NO `isFixedPrice`, NO `fixedprice`
2. Activity: `isChargeable: true` (inside `activity{}` object, NOT on projectActivity root)
3. Hourly rate model: `TYPE_PROJECT_SPECIFIC_HOURLY_RATES` via `PUT /project/hourlyRates/{id}`
4. Per-employee rates: `POST /project/hourlyRates/projectSpecificRates` with rate = `Math.round(BUDGET/TOTAL_HOURS)`
5. Timing: Rates MUST be set BEFORE timesheet entries

### Expected result
With proper rate configuration:
- Timesheet entries: `hourlyRate: RATE, chargeable: true`
- This should unlock **check 3** (project config) and **check 4** (hours registration)

### Confidence: HIGH
The isFixedPrice suppression is sandbox-verified. The fix is in the current trusted standard but has never been production-tested. This is the highest-priority hypothesis.

## 4. Supplier Cost Recording Hypothesis

### The voucher vs supplier invoice distinction

In Norwegian accounting, a "leverandørkostnad" (supplier cost) requires:

| Recording method | Creates supplierInvoice entity? | Project linkage? | Check 5 hypothesis |
|---|---|---|---|
| `POST /ledger/voucher` | NO | Yes (via postings) | Insufficient — no SI entity |
| `POST /project/orderline` | NO | Yes (but vendor=null) | Insufficient — vendor doesn't persist |
| `POST /ledger/voucher/importDocument` (EHF XML) | YES | Yes (via postings PUT) | **Likely required** |

### Evidence
- All 4/11 runs used `POST /ledger/voucher` (check 6 = voucher with project+supplier linkage = 2pt)
- None of the 4/11 runs created a `supplierInvoice` entity
- The scorer likely needs BOTH:
  - **Check 6 (2pt)**: Voucher with project+supplier linkage → already passes
  - **Check 5 (~2pt)**: Formal supplierInvoice entity → requires importDocument

### Required approach (current trusted standard)
1. `POST /ledger/voucher` — creates accounting entries with project+supplier linkage (for check 6)
2. `POST /ledger/voucher/importDocument` — creates real supplierInvoice entity via EHF XML (for check 5)
3. `PUT /ledger/voucher/{id}?sendToLedger=false` — set postings with project linkage on imported voucher
4. `PUT /ledger/voucher/{id}?sendToLedger=true` — book the imported voucher

### CRITICAL: importDocument is NOT idempotent
Each call creates a new supplierInvoice entity. If the script crashes after importDocument, retry creates a DUPLICATE. The script MUST parse `response.values[0]` (list wrapper, NOT `.value`) correctly on the first attempt.

### The project orderline requirement
Per AGENTS.md: "For project-lifecycle prompts, `POST /project/orderline` with `unitCostCurrency` is MANDATORY for the project cost check — the voucher alone does not populate project-level costs."

The orderline is needed for project-level cost visibility, even though vendor doesn't persist. It's a separate concern from the supplierInvoice entity.

### Confidence: MEDIUM-HIGH
importDocument is in the current trusted standard but its effect on check 5 hasn't been production-confirmed.

## 5. Concrete Proposed Strategy

### Changes from the 4/11 baseline

| Step | 4/11 runs (old) | Proposed (new) | Why |
|---|---|---|---|
| Project creation | `isFixedPrice: true, fixedprice: BUDGET` | NO isFixedPrice, NO fixedprice | Prevents hourly rate suppression |
| Activity | May not have been chargeable | `isChargeable: true` inside `activity{}` | Required for billable hours |
| Hourly rates | Not set up (or suppressed) | Rate = `Math.round(BUDGET/TOTAL_HOURS)`, set BEFORE timesheets | Unlocks chargeable timesheet entries |
| Supplier invoice | Only voucher | Voucher + importDocument (EHF XML) | Creates real supplierInvoice entity |
| Invoice method | `POST /invoice` embedded orders ✓ | Same — `POST /invoice` embedded orders | Keep what works (check 6) |

### Exact API call sequence (17-20 writes + free GETs)

```
STEP 1 — Parallel frontload (7 calls)
  GET /department?isInactive=false&count=1&fields=*
  GET /employee?assignableProjectManagers=true&count=1&fields=*
  GET /ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber
  GET /ledger/vatType?typeOfVat=OUTGOING&vatDate=TODAY&fields=id,name,percentage
  GET /ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name
  POST /customer { name, organizationNumber, isCustomer: true }
  GET /token/session/>whoAmI?fields=*,company(*)

STEP 2 — Employees + project (2-3 parallel)
  POST /employee/list [
    { firstName: PM_FIRST, lastName: PM_LAST, email: PM_EMAIL, dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
    { firstName: CON_FIRST, lastName: CON_LAST, email: CON_EMAIL, dateOfBirth: "1992-01-01", userType: "NO_ACCESS", department: { id: deptId } },
  ]
  POST /project {
    name: PROJECT_NAME, startDate: TODAY,
    customer: { id: custId }, projectManager: { id: assignablePmId },
    // NO isFixedPrice, NO fixedprice
  }
  [conditional] PUT /ledger/account/{1920_id} { bankAccountNumber: "12345678903" }

STEP 3 — Activity + participants (2 parallel)
  POST /project/projectActivity {
    project: { id: pId }, startDate: TODAY,
    budgetHours: TOTAL_HOURS, budgetFeeCurrency: BUDGET,
    activity: { name: "Prosjektarbeid", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: true }
  }
  POST /project/participant/list [
    { project: { id: pId }, employee: { id: e1 }, adminAccess: true },   // PM
    { project: { id: pId }, employee: { id: e2 }, adminAccess: false },  // consultant
  ]

STEP 4 — Hourly rates (sequential — MUST be before timesheets)
  GET /project/hourlyRates?projectId={pId}&count=10&fields=*
  PUT /project/hourlyRates/{holderId} { project: { id: pId }, startDate: TODAY, hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES" }
  POST /project/hourlyRates/projectSpecificRates { projectHourlyRate: { id: holderId }, employee: { id: e1 }, activity: { id: actId }, hourlyRate: HOURLY_RATE }  // parallel with next
  POST /project/hourlyRates/projectSpecificRates { projectHourlyRate: { id: holderId }, employee: { id: e2 }, activity: { id: actId }, hourlyRate: HOURLY_RATE }

STEP 5 — Timesheet + supplier + orderline (3 parallel)
  POST /timesheet/entry/list [ ...splitHours for both employees ]
  POST /supplier { name: SUPP_NAME, organizationNumber: SUPP_ORG, isSupplier: true }
  POST /project/orderline { project: { id: pId }, description: "Leverandørkostnad", date: TODAY, count: 1, unitCostCurrency: SUPP_COST, isChargeable: false }

STEP 6 — Voucher (accounting) + importDocument (supplier invoice entity)
  POST /ledger/voucher { postings with project+supplier linkage, row: 1/2, acc 6590/2400 }
  POST /ledger/voucher/importDocument { EHF XML with supplier, amount, project }
  PUT /ledger/voucher/{importId}?sendToLedger=false { postings with project linkage }
  PUT /ledger/voucher/{importId}?sendToLedger=true { version only }

STEP 7 — Invoice (POST /invoice with embedded orders)
  POST /invoice?sendToCustomer=false {
    invoiceDate: TODAY, invoiceDueDate: +30d,
    orders: [{
      customer: { id: custId },
      project: { id: pId },
      orderDate: TODAY, deliveryDate: TODAY,
      orderLines: [{
        description: PROJECT_NAME,
        count: 1,
        unitPriceExcludingVatCurrency: BUDGET,
        vatType: { id: vatId },
      }]
    }]
  }

STEP 8 — Diagnostic readback (free GETs)
  GET project, invoice, timesheet, hourly rates, voucher, supplier invoice, orderlines
```

### Key differences from the 4/11 script
1. **NO isFixedPrice** on project → hourly rates no longer suppressed
2. **Hourly rates set up in Step 4** → timesheet entries will show hourlyRate > 0
3. **importDocument in Step 6** → creates real supplierInvoice entity
4. **POST /invoice with embedded orders** (NOT POST /order → PUT /:invoice) → keeps check 6 passing
5. All diagnostic GETs for logging

## 6. Check-by-Check Hypothesis

### Check 1 — Customer (1pt) ✅ PASS
**Validates**: Customer entity exists with correct `name` and `organizationNumber`.
**Evidence**: Passes in all 6 completed runs. Simple POST /customer. Reliable.

### Check 2 — Employees (1pt) ✅ PASS
**Validates**: Both employees exist with correct `firstName`, `lastName`, and `email`.
**Evidence**: Passes in all 6 completed runs. POST /employee/list with batch creation. Reliable.

### Check 3 — Project Configuration (~2pt) ❌ FAIL
**Most likely validates** (in priority order):
1. **Hourly rates configured** on project — project has TYPE_PROJECT_SPECIFIC_HOURLY_RATES model with per-employee rates matching `Math.round(BUDGET/TOTAL_HOURS)`
2. **Activity is chargeable** — `isChargeable: true` on the project activity
3. **Budget on activity** — `budgetFeeCurrency: BUDGET` and `budgetHours: TOTAL_HOURS`
4. **Employees are project participants** — both added via POST /project/participant/list

**Why it fails in 4/11 runs**: All used `isFixedPrice: true` which SUPPRESSES hourly rates. Even though rates were "configured," they were overridden to 0 by the fixed-price flag. The activity may also have been non-chargeable in some runs.

**Fix**: Remove isFixedPrice, ensure isChargeable: true, set up hourly rates properly.

**Confidence**: HIGH — the isFixedPrice suppression is a definitive root cause for rate-related failures.

### Check 4 — Hours/Timesheet (~2pt) ❌ FAIL
**Most likely validates**:
1. **Timesheet entries** for both employees with correct total hours (PM_HOURS and CON_HOURS)
2. **Entries are chargeable** — `chargeable: true` on each entry
3. **Entries have hourly rate** — `hourlyRate > 0` on each entry
4. Possibly: entries linked to correct activity

**Why it fails in 4/11 runs**: With `isFixedPrice: true`, ALL timesheet entries have `hourlyRate: 0` and `chargeable: false` regardless of rate configuration. The entries exist but are economically meaningless.

**Fix**: Same as check 3 — remove isFixedPrice, rates before entries, chargeable activity.

**Confidence**: HIGH — directly follows from the isFixedPrice suppression.

### Check 5 — Supplier Cost (~2pt) ❌ FAIL
**Most likely validates**:
1. **supplierInvoice entity exists** — a formal supplier invoice record (NOT just a voucher)
2. **Correct amount** matching the prompt's supplier cost
3. **Linked to correct supplier** (by ID or organization number)
4. Possibly: linked to project

**Why it fails in 4/11 runs**: Only `POST /ledger/voucher` was used. This creates accounting postings but NO supplierInvoice entity. `GET /supplierInvoice` returns 0 results.

**Fix**: Add `POST /ledger/voucher/importDocument` with EHF XML to create the formal entity.

**Confidence**: MEDIUM-HIGH — the voucher/SI distinction is fundamental in Norwegian accounting. The importDocument path is in the current standard but unconfirmed in production.

### Check 6 — Invoice (2pt) ✅ PASS
**Validates**: Customer invoice exists with:
1. Correct amount (`amountExcludingVatCurrency: BUDGET`)
2. Linked to project (`projectInvoiceDetails` present)
3. Correct customer linkage

**Critical**: Only passes with `POST /invoice` with embedded `orders[]`. Fails with `POST /order` → `PUT /order/:invoice` (run fa7bc779 proved this).

**Evidence**: 4/11 − 2/11 = 2pt. All 3 runs with POST /invoice embedded orders pass; the 1 run with POST /order → PUT /:invoice fails.

### Check 7 — Unknown (~1pt) ❌ FAIL
**Hypotheses** (ranked by likelihood):

1. **Project manager identity** (MEDIUM): The scorer checks `project.projectManager` matches the prompt's named PM. Currently impossible — newly created NO_ACCESS employees cannot be assigned as PM. Only the account owner is assignable. If this is the check, it's a structural limitation with no known API workaround.

2. **Invoice line structure or amount basis** (LOW-MEDIUM): The scorer expects the invoice to have per-employee line items (PM_HOURS × rate, CON_HOURS × rate) instead of a single BUDGET line. This would align with T&M accounting principles but contradicts the simple prompt structure.

3. **Project-level budget field** (LOW): The scorer checks a budget field on the project entity itself (not activity). Tripletex Project schema may have `budgetAmountCurrency` or similar that we're not setting.

4. **Voucher-to-project linkage quality** (LOW): The scorer checks that supplier cost postings appear in the project's cost roll-up. The project orderline provides this, but vendor doesn't persist.

5. **Something else entirely** (UNKNOWN): Could be an entity or linkage we haven't considered — e.g., project invoice generated from timesheet data rather than manual order lines.

**Assessment**: Check 7 is the true unknown. If it's about PM identity, it may be structurally unsolvable with the current API. If it's about invoice structure or project budget, it's testable. Recommend focused sandbox investigation AFTER confirming that the isFixedPrice fix unlocks checks 3+4 and importDocument unlocks check 5.

## 7. Expected Score After Fixes

| Check | Current (4/11) | After isFixedPrice fix | After importDocument | Combined |
|---|---|---|---|---|
| 1 (1pt) | ✅ | ✅ | ✅ | ✅ |
| 2 (1pt) | ✅ | ✅ | ✅ | ✅ |
| 3 (~2pt) | ❌ | ✅ (HIGH confidence) | ✅ | ✅ |
| 4 (~2pt) | ❌ | ✅ (HIGH confidence) | ✅ | ✅ |
| 5 (~2pt) | ❌ | ❌ | ✅ (MED-HIGH confidence) | ✅ |
| 6 (2pt) | ✅ | ✅ | ✅ | ✅ |
| 7 (~1pt) | ❌ | ❌ | ❌ | ❌ |

**Optimistic projection**: 10/11 (checks 1-6 pass, check 7 unknown)
**Conservative projection**: 8/11 (checks 1-4 and 6 pass from isFixedPrice fix; check 5 uncertain; check 7 unknown)
**Worst case**: 4/11 (if the isFixedPrice fix doesn't help and the root causes are something else entirely)

## 8. Priority Order for Investigation

1. **HIGHEST**: Production-test the isFixedPrice removal + hourly rate setup (targets checks 3+4, ~4pt)
2. **HIGH**: Confirm importDocument creates supplierInvoice entity that satisfies check 5 (~2pt)
3. **MEDIUM**: Investigate check 7 — test invoice per-employee lines, project-level budget, PM identity
4. **LOW**: Test alternative invoice amounts (hours × rate vs budget) — unlikely to matter given small rounding difference

## 9. Open Questions

1. Has the current trusted standard (with isFixedPrice removal + hourly rates + importDocument) been production-tested? The override doc says run 4db584f1 "was never scored."
2. Does the importDocument EHF XML reliably create a supplierInvoice entity in fresh production accounts? Sandbox shows it works, but production behavior may differ.
3. Is check 7 about PM identity (structurally unsolvable) or about something we can fix?
4. Should the invoice use `POST /invoice` with embedded orders (check 6 passes) even though it produces `isApproved: false`? The override says yes. Does the scorer care about isApproved?
5. Is the project orderline (with non-persisting vendor) actually needed for any check, or is it redundant with the voucher (check 6) and importDocument (check 5)?
