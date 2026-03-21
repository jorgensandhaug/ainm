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

## Production History Summary

- **17 calls, 0 errors** is the proven optimal baseline (or 18 with bank-account fix)
- all pre-fix runs scored 4/11 due to 4 omitted fields: `isFixedPrice`+`fixedprice`, `budgetHours`, `adminAccess: true` for PM, project orderline
- common 422 causes: missing `userType` on employee, `isChargeable` on projectActivity root (must be inside `activity`), missing `activityType` on activity, missing `row` on voucher postings, local-time Date construction shifting dates, hardcoded voucherType ID, invalid bank account number
- 2026-03-21 run `Datenplattform Grünfeld` (5cd19b53) timed out with 0 API calls because agent read both trusted standard + playbook + AGENTS.md, consuming all 300s in processing — fix: read only trusted standard, then script immediately
