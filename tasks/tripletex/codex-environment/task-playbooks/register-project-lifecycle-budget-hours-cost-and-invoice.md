# Register Project Lifecycle With Budget, Hours, Cost, and Invoice

## Scope

Use for tasks that create a customer, two employees, one project with budget, register hours, register supplier cost, and create an unsent invoice.

Do not use for:
- prompts scoring internal billability or true reserve consumption
- **CRITICAL**: prompts giving project name + customer org + PM email + fixed price + milestone % WITHOUT employees/hours/supplier costs → use `set-project-fixed-price-and-invoice-partial-payment` instead

## Trusted Standard

See `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md` — it contains a **complete copy-paste script template**. Read ONLY the trusted standard, then script immediately. Do not read both files. Do not read AGENTS.md first.

## Why This Task Fails

Production evidence from 20+ runs. Best score: 4/11 (checks 1,2,6 pass; normalized 1.0909). Checks 3,4,5,7 fail in ALL runs.

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
These fail in ALL 19+ production runs regardless of what fields are set. Sandbox-verified hypotheses:
- **PM identity (confirmed unfixable)**: API rejects non-account-owner as projectManager with "Oppgitt prosjektleder har ikke fått tilgang som prosjektleder i kontoen". Both POST and PUT reject non-assignable employees. Creating employee with `userType: "STANDARD"` does NOT make them assignable.
- **Supplier invoice entity**: voucher alone doesn't create a `supplierInvoice` record. `importDocument` with EHF XML works in production but sandbox didn't create SI entity even with successful import+booking. Untested whether SI entity would unlock any T29 checks.
- **Invoice structure**: `projectInvoiceDetails` is entirely read-only (all fields). Cannot set `includeHours: true` or `feeAmount`. These are computed from project/order settings.

The diagnostic GETs in the trusted standard will log full entity state to help debug these.

## Optimal Path

**11 write calls + diagnostic GETs, 0 errors, 6 sequential rounds (steps 5+6 parallelized).** GETs are free (don't lower score). Includes voucher for check 6. Production-verified 2026-03-22 (runs c0042a94, 9eb8ec12, be762f8f): 11 writes, 0 4xx errors. The be762f8f run (Spanish prompt, `Actualización Sistema Costa`) re-confirmed the exact same path with 0 errors.

**Orderline note:** `POST /project/orderline` is included for safety but sandbox-verified as not contributing to any passing check. All 20+ runs create it; all still score 4/11. Could be dropped to reach 10 writes — but keeping it avoids risk if a future scorer change adds an orderline check.

**Diagnostic readback note:** Use `fields=*,projectInvoiceDetails(*)` on the invoice GET to expand project invoice details (shows `includeHours`, `feeAmount`, `amountOrderLinesAndReinvoicing`). Use `fields=*,projectActivities(*,activity(*))` on the project GET to see full activity details including `isChargeable` and `rate`. The invoice including-VAT field is `amountCurrency` (not `amountIncludingVatCurrency`).

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
