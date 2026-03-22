# Register Project Lifecycle With Budget, Hours, Cost, and Invoice

## Scope

Use for tasks that create a customer, two employees, one project with budget, register hours, register supplier cost, and create an unsent invoice.

Do not use for:
- prompts scoring internal billability or true reserve consumption
- **CRITICAL**: prompts giving project name + customer org + PM email + fixed price + milestone % WITHOUT employees/hours/supplier costs → use `set-project-fixed-price-and-invoice-partial-payment` instead

## Trusted Standard

See `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` — it contains a **complete copy-paste script template**. Read ONLY the trusted standard, then script immediately. Do not read both files. Do not read AGENTS.md first.

## Why This Task Fails

Production evidence from 20+ runs. Old best score: 4/11 (checks 1,2,6 pass). Checks 3,4,5,7 failed in ALL runs.

### ROOT CAUSE (found 2026-03-22): isFixedPrice=true suppresses hourly rates
All prior runs set `isFixedPrice: true` on the project. This causes ALL timesheet entries to have `hourlyRate=0` and `chargeable=false`, even with project-specific rates configured. The prompt says "budsjett" (budget), NOT "fastpris" (fixed price).

**Sandbox A/B test confirmed:**
- `isFixedPrice=false` + hourly rates → timesheet `hourlyRate=4496, chargeable=true`
- `isFixedPrice=true` + hourly rates → timesheet `hourlyRate=0, chargeable=false`

### Fix applied (3 changes):
1. **NO `isFixedPrice`/`fixedprice` on project.** Budget goes on activity `budgetFeeCurrency` only.
2. **Activity `isChargeable: true`** (was false). Non-chargeable prevents rate assignment.
3. **Hourly rates set BEFORE timesheet entries.** Rate = `Math.round(BUDGET / TOTAL_HOURS)`. Uses `TYPE_PROJECT_SPECIFIC_HOURLY_RATES` model + `POST /project/hourlyRates/projectSpecificRates` with `projectHourlyRate: { id: holderId }`.

### Still-verified working elements:
- Voucher with project+supplier linkage (check 6, worth 2 pts)
- `POST /order` → `PUT /order/:invoice` (isApproved=true)
- Diagnostic GETs for full state logging

## Optimal Path

**14-15 writes + free diagnostic GETs, 0 errors, 8 sequential steps.** (14 writes base; 15 if bank account needs repair — conditional PUT.) GETs are free. Includes voucher for check 6 + hourly rates for check 4. Sandbox-verified 2026-03-22, **production-confirmed 2026-03-22** (run 4db584f1, `Cloud Migration Northwave`, 15 writes incl bank repair, 0 errors, hourlyRate=2496, chargeable=true, invoice 396900 ex-VAT / 496125 incl-VAT, isApproved=true).

Steps: (1) 5 GETs + POST customer; (2) POST employees + POST project (NO isFixedPrice); (3) POST activity (isChargeable:true) + POST participants; (4) GET hourlyRates holder → PUT model → 2× POST specificRates; (5) POST timesheet + POST supplier + POST orderline; (6+7) POST voucher + POST order; (8) PUT order/:invoice.

**Diagnostic readback note:** Use `fields=*,projectInvoiceDetails(*)` on invoice GET. The invoice including-VAT field is `amountCurrency` (not `amountIncludingVatCurrency`).

## Common 422 Causes

- `isFixedPrice: true` on project — silently suppresses hourly rates (hourlyRate=0 on all timesheet entries)
- `isChargeable: false` on activity — prevents hourly rate assignment (use `true`)
- `hourlyRateModel: { id }` on projectSpecificRates — wrong field name, use `projectHourlyRate: { id: holderId }`
- missing `userType: "NO_ACCESS"` on employee
- `isChargeable` on projectActivity root instead of inside `activity{}`
- missing `activityType` or `name` on activity
- `new Date(str + "T00:00:00")` shifting dates in CET/CEST (use `Date.UTC`)
- `bankAccountNumber: "12345678901"` (not MOD11-valid — use `"12345678903"`)
- including `employments[]` on employees (triggers division/startDate traps)
- including `employmentType` or `percentageOfFullTimeEquivalent` (fields don't exist)
- putting `project` inside `orderLines[]` instead of on order root
- voucher postings without `row: 1` / `row: 2` (row 0 = system-reserved)
- hardcoded voucherType ID (environment-specific — always resolve via GET)

## Prior Faulty Assumptions (DISPROVEN)

These were believed correct in 20+ production runs but are WRONG:
- ~~`isFixedPrice: true` + `fixedprice: BUDGET` on project~~ → suppresses hourly rates
- ~~`isChargeable: false` on activity~~ → prevents rate assignment + makes timesheet non-chargeable
- ~~No hourly rate setup needed~~ → without rates, hourlyRate=0 even with chargeable activity
- ~~Checks 3,4,5,7 are "unsolvable" due to PM identity / supplierInvoice entity / read-only projectInvoiceDetails~~ → root cause was isFixedPrice suppressing rates all along
