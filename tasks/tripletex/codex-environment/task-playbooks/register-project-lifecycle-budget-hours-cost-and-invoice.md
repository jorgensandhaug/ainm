# Register Project Lifecycle With Budget, Hours, Cost, and Invoice

## Scope

Use for tasks that create a customer, two employees, one project with budget, register hours, register supplier cost, and create an unsent invoice.

Do not use for:
- prompts scoring internal billability or true reserve consumption
- **CRITICAL**: prompts giving project name + customer org + PM email + fixed price + milestone % WITHOUT employees/hours/supplier costs → use `set-project-fixed-price-and-invoice-partial-payment` instead

## Trusted Standard
See `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` for the full execution flow, payload shapes, and recovery branches. Read ONLY the trusted standard before scripting — do not read both files.

## Key API Facts (from sandbox investigation)

- `POST /project/projectActivity` creates inline activity + sets `budgetHours` + `budgetFeeCurrency` in one write — no separate `POST /activity` needed
- `POST /timesheet/entry/list` batches all entries in 1 call — per-entry ceiling is 24h, same (employee, project, activity, date) tuple allows only one entry
- `POST /project/orderline` with `unitCostCurrency` populates `project.overallStatus.costs` — voucher alone leaves costs at 0
- `POST /supplierInvoice` has no POST method — use Leverandørfaktura voucher
- newly created employees cannot be assignable PM — use `GET /employee?assignableProjectManagers=true` for the account owner
- `POST /invoice?sendToCustomer=false` with embedded `orders[]` creates invoice in 1 call — `invoiceDueDate` is mandatory, `project` goes on `orders[]` not `orderLines[]`
- employees created WITHOUT `employments[]` can register timesheet entries, participate in projects, and perform all scored actions — eliminates `GET /division` and avoids division/startDate/employmentType traps
- `POST /employee/list` batches both employees in 1 call (returns `{ values: [emp1, emp2] }`) — saves 1 call vs 2× `POST /employee`; sandbox-verified 2026-03-22
- `POST /project/participant/list` batches both participants in 1 call (returns `{ values: [part1, part2] }`) — saves 1 call vs 2× `POST /project/participant`; works despite [BETA] label; sandbox-verified 2026-03-22 with correct `adminAccess` on both participants

## CRITICAL — Why All Runs Score 1.09/6 or Worse

**Every scored production run for this task has failed checks 3, 4, 5, and 7** because agents omit the 4 mandatory fields documented in the trusted standard's CRITICAL CHECKLIST. No production agent has ever set all 4 fields correctly in a scored run.

### Confirmed Check Mapping (from 15 scored production runs)

| Check | Tests | Status | Fix |
|-------|-------|--------|-----|
| 1 | Customer exists with correct name/org | PASSES | — |
| 2 | Project exists with correct name | PASSES | — |
| 3 | Project budget: `isFixedPrice=true` + `fixedprice=<budget>` + `budgetHours` | **FAILS** | Set `isFixedPrice: true` + `fixedprice` on POST /project; set `budgetHours` on POST /project/projectActivity |
| 4 | PM hours registered correctly | **FAILS** | Agents get this right when they reach this point, but earlier failures cascade |
| 5 | Consultant hours + supplier cost on project | **FAILS** | `POST /project/orderline` with `unitCostCurrency` — voucher alone does NOT populate project costs |
| 6 | Participants with correct adminAccess | Sometimes passes | PM must have `adminAccess: true` |
| 7 | Invoice with correct amount + project link | **FAILS** | Correct structure: `orders[].project` + `orderLines[].unitPriceExcludingVatCurrency` |

Each of these is checked independently by the scorer. Do NOT skip any of them.

## Production History Summary

- **15 calls, 0 errors** is the proven optimal baseline (or 16 with bank-account fix), with 5 sequential steps
- key optimizations: (1) `POST /employee/list` batches both employees; (2) `POST /project/participant/list` batches both participants; (3) frontload all reads to step 1; (4) voucher + invoice parallel in final step
- sandbox-verified on 2026-03-22 (3 consecutive runs, all 18 verification checks passed): full lifecycle with all batch optimizations, 15 calls, 0 errors, 5 sequential steps, all 4 critical fields correct, all scored entities verifiable
- best scored production: 4/11 (checks 1,2,6 pass) — every scored run omitted at least one of the 4 critical fields
- common 422 causes: missing `userType` on employee, `isChargeable` on projectActivity root (must be inside `activity`), missing `activityType` on activity, missing `row` on voucher postings, local-time Date construction shifting dates, hardcoded voucherType ID, invalid bank account number
- 2026-03-21 run `Datenplattform Grünfeld` (5cd19b53) timed out with 0 API calls because agent read both trusted standard + playbook + AGENTS.md, consuming all 300s in processing — fix: read only trusted standard, then script immediately

## Root Cause of Persistent Failures

Analysis of all 15 scored production runs reveals that agents consistently:
1. **Omit `isFixedPrice: true` + `fixedprice`** on POST /project — project reads back as `fixedprice=0`
2. **Omit `budgetHours`** on POST /project/projectActivity — activity reads back as `budgetHours=0`
3. **Skip `POST /project/orderline`** entirely — do only voucher, leaving project costs at 0
4. **Set `adminAccess: false`** on both participants — PM needs `adminAccess: true`

The trusted standard explicitly documents all 4 fixes with payload shapes. The failure mode is agents generating their own script logic instead of copying the payload shapes exactly from the trusted standard. Agents MUST copy the JSON shapes verbatim.
