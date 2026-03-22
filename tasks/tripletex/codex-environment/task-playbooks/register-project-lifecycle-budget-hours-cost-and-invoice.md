# Register Project Lifecycle With Budget, Hours, Cost, and Invoice

## Scope

Use for tasks that create a customer, two employees, one project with budget, register hours, register supplier cost, and create an unsent invoice.

Do not use for:
- prompts scoring internal billability or true reserve consumption
- **CRITICAL**: prompts giving project name + customer org + PM email + fixed price + milestone % WITHOUT employees/hours/supplier costs → use `set-project-fixed-price-and-invoice-partial-payment` instead

## Trusted Standard

See `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` — it contains a **complete copy-paste script template**. Read ONLY the trusted standard, then script immediately. Do not read both files. Do not read AGENTS.md first.

## Why This Task Fails

Production evidence from 17+ runs. Best score: 4/11 (checks 1,2,6 pass). Checks 3,4,5,7 fail in ALL runs.

### 1. Missing supplier cost voucher (check 6, worth 2 points)
The scorer checks for a `POST /ledger/voucher` with project+supplier linkage in postings. Without it: check 6 fails (2/11). With it: check 6 passes (4/11).

**CRITICAL:** `POST /project/orderline` is NOT sufficient — its `vendor` field does NOT persist (reads back as null). The voucher is what the scorer verifies.

Voucher shape (production-verified):
- Account 6590 (debit) with `project: { id }` linkage
- Account 2400 (credit) with `supplier: { id }` linkage
- Explicit `row: 1` / `row: 2` on postings (row 0 = system-reserved = 422)
- VoucherType resolved via `GET /ledger/voucherType?name=Leverandørfaktura` (ID is environment-specific)

### 2. Wrong invoice flow
Using `POST /invoice` with embedded `orders[]` produces `isApproved: false` and order `status: NOT_CHOSEN`.
**Fix:** Use `POST /order` then `PUT /order/{id}/:invoice` → produces `isApproved: true` and `status: INVOICED`.

### 3. Checks 3,4,5,7 — still unsolved
These fail in ALL 17+ production runs regardless of what fields are set. Hypotheses:
- PM identity: API only allows company admin as projectManager (prompt-named employee can't be PM)
- Supplier invoice entity: voucher alone doesn't create a `supplierInvoice` record (needs `importDocument`)
- Invoice structure details unknown

The diagnostic GETs in the trusted standard will log full entity state to help debug these.

## Optimal Path

**11-12 write calls + diagnostic GETs, 0 errors, 7 sequential steps.** GETs are free (don't lower score). Includes voucher for check 6. Sandbox-verified 2026-03-22: 11 writes, 16 reads, 0 errors.

## Common 422 Causes

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
