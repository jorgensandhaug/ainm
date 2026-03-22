# Register Project Lifecycle With Budget, Hours, Cost, and Invoice

## Scope

Use for tasks that create a customer, two employees, one project with budget, register hours, register supplier cost, and create an unsent invoice.

Do not use for:
- prompts scoring internal billability or true reserve consumption
- **CRITICAL**: prompts giving project name + customer org + PM email + fixed price + milestone % WITHOUT employees/hours/supplier costs → use `set-project-fixed-price-and-invoice-partial-payment` instead

## Trusted Standard

See `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` — it contains a **complete copy-paste script template**. Read ONLY the trusted standard, then script immediately. Do not read both files. Do not read AGENTS.md first.

## Why This Task Fails

The two root causes that caused ALL production failures:

### 1. Wrong invoice flow (most checks fail)
Using `POST /invoice` with embedded `orders[]` creates the invoice but leaves:
- `isApproved: false` (should be `true`)
- order `status: NOT_CHOSEN` (should be `INVOICED`)

**Fix:** Use `POST /order` then `PUT /order/{id}/:invoice` instead. This produces `isApproved: true` and order `status: INVOICED`. Sandbox-verified 2026-03-22.

### 2. Missing critical fields
| Field | Where | What happens if omitted |
|-------|-------|------------------------|
| `isFixedPrice: true` + `fixedprice` | POST /project | project.fixedprice=0, check fails |
| `budgetHours` | POST /project/projectActivity | budgetHours=0, check fails |
| `POST /project/orderline` with `unitCostCurrency` | Step 4 | project costs=0, check fails |
| `adminAccess: true` on PM participant | POST /project/participant/list | check fails |

## Optimal Path

**13 calls, 0 errors, 6 sequential steps.** Sandbox-verified 2026-03-22 (all checks pass including isApproved=true, order INVOICED). Optimized from 14→13 by hardcoding vatType id=3 ("Utgående avgift, høy sats" 25%) — always valid in Norwegian Tripletex accounts.

## Common 422 Causes

- missing `userType: "NO_ACCESS"` on employee
- `isChargeable` on projectActivity root instead of inside `activity{}`
- missing `activityType` or `name` on activity
- `new Date(str + "T00:00:00")` shifting dates in CET/CEST (use `Date.UTC`)
- `bankAccountNumber: "12345678901"` (not MOD11-valid — use `"12345678903"`)
- including `employments[]` on employees (triggers division/startDate traps)
- putting `project` inside `orderLines[]` instead of on `orders[]` or order root
