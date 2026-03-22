# Register Project Lifecycle With Budget, Hours, Cost, and Invoice

## Scope

Use for tasks that create a customer, two employees, one project with budget, register hours, register supplier cost, and create an unsent invoice.

Do not use for:
- prompts scoring internal billability or true reserve consumption
- **CRITICAL**: prompts giving project name + customer org + PM email + fixed price + milestone % WITHOUT employees/hours/supplier costs → use `set-project-fixed-price-and-invoice-partial-payment` instead

## Trusted Standard

See `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` — it contains a **complete copy-paste script template**. Read ONLY the trusted standard, then script immediately. Do not read both files. Do not read AGENTS.md first.

## Why This Task Fails (15/15 production runs scored ≤ 1.09/6)

Every failure traces to agents improvising instead of copying the script template. The 4 fields below are each checked independently. Omitting any one = that check fails = score drops.

| Field | Where | What happens if omitted |
|-------|-------|------------------------|
| `isFixedPrice: true` + `fixedprice` | POST /project | project.fixedprice=0, check 3 fails |
| `budgetHours` | POST /project/projectActivity | budgetHours=0, check 3 fails |
| `POST /project/orderline` with `unitCostCurrency` | Step 4 (separate call) | project costs=0, check 5 fails |
| `adminAccess: true` on PM participant | POST /project/participant/list | check 6 fails |

## Optimal Path

**15 calls, 0 errors, 4 sequential phases.** Sandbox-verified 2026-03-22 (15 calls, all 201s, 4 phases).

Phase layout (optimized from 5→4 sequential phases):
1. **Phase 1** (7 parallel): 5 GETs + POST customer + POST supplier — supplier has NO dependencies
2. **Phase 2** (2-3 parallel): POST employee/list + POST project + conditional PUT bank account
3. **Phase 3** (4 parallel): POST activity + POST participant/list + POST orderline + POST voucher — all depend only on phase 1+2 results
4. **Phase 4** (2 parallel): POST timesheet/entry/list + POST invoice

## Common 422 Causes

- missing `userType: "NO_ACCESS"` on employee
- `isChargeable` on projectActivity root instead of inside `activity{}`
- missing `activityType` or `name` on activity
- missing `row: 1` / `row: 2` on voucher postings
- `new Date(str + "T00:00:00")` shifting dates in CET/CEST (use `Date.UTC`)
- hardcoded voucherType ID (environment-specific — always GET first)
- `bankAccountNumber: "12345678901"` (not MOD11-valid — use `"12345678903"`)
- including `employments[]` on employees (triggers division/startDate traps)
- putting `project` inside `orderLines[]` instead of on `orders[]`
- omitting `invoiceDueDate` on invoice

## 409 Recovery

If POST /invoice returns 409 "Duplicate entry" (transient proxy issue), retry the same POST directly. Do NOT waste calls checking existing orders/invoices with GET — those endpoints require `orderDateFrom/To` or `invoiceDateFrom/To` params, and omitting them causes 422.
