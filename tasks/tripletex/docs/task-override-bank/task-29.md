# TASK OVERRIDE — Task 29: Full Project Lifecycle (Budget, Hours, Cost, Invoice)

**You are running Task 29. The task is already identified. Do not classify.**

## What this task is

Create a full project lifecycle: customer, employees, project with budget, activity with hours, participants, timesheet entries, supplier cost voucher, and an unsent customer invoice. The prompt mentions:
- A project name, customer name + org number, monetary budget
- A project manager (name + email) and a consultant (name + email) with hours
- A supplier (name + org number) with a cost amount
- All entities need to be created fresh

## What to read and execute

1. **Read ONLY** `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md`
2. The trusted standard contains a **complete copy-paste script template** — use it directly. Replace only the `// PROMPT VALUES` block with values from the prompt.
3. **Do NOT modify payload shapes.** The template is production-verified (run 4db584f1: 0 errors, 17-18 writes).
4. **Immediately write and execute** with `bun` after reading. Do NOT read AGENTS.md, openapi.json, or playbooks.

## Scoring model: 11 checks, 7 check groups

**Best production score: 1.09/6** (4/11 raw — checks 1, 2, 6 pass; checks 3, 4, 5, 7 fail)

| Check | What it checks | Weight | Status | Notes |
|-------|---------------|--------|--------|-------|
| 1 | Customer created (name + org) | ~1pt | PASS | Reliable across all 6 completed runs |
| 2 | Employees created | ~1pt | PASS | Reliable — batch POST /employee/list |
| 3 | Project config / activity / budget | ~2pt | FAIL | Budget on activity works; PM identity may be checked |
| 4 | Hours + hourly rates on timesheet | ~2pt | FAIL | Rates set correctly but PM constraint may block |
| 5 | Supplier cost / supplier invoice entity | ~2pt | FAIL | importDocument added — needs production confirmation |
| 6 | Project participants (adminAccess) | ~2pt | PASS | Breakthrough: POST /project/participant/list earns this |
| 7 | Invoice structure (isApproved, project link) | ~1pt | FAIL | POST /order → PUT /:invoice gives isApproved=true |

## Production evidence (9 runs, 6 completed)

| Run | Lang | Score | Checks passed | API calls | Errors |
|-----|------|-------|---------------|-----------|--------|
| 25760653 (Snøhetta) | nb | 4/11 | 1, 2, 6 | 26 | 3 |
| c9f50492 (Montaña) | es | 4/11 | 1, 2, 6 | 18 | 0 |
| f17d4753 (Horizonte) | pt | 4/11 | 1, 2, 6 | 19 | 0 |
| 5c16a788 (Havbris) | nb | 2/11 | 1, 2 | 17 | 0 |
| 0f38a072 (Northwave) | en | 2/11 | 1, 2 | 16 | 0 |
| fa7bc779 (Horizonte) | pt | 2/11 | 1, 2 | — | — |
| d568ddd5 (Brückentor) | de | 0/1 | — | timeout | — |
| 0945bbd9 (Eichenhof) | de | 0/1 | — | timeout | — |
| a81782be (Elvdal) | nn | SKIP | — | — | — |

**Key finding**: 4/11 runs all passed check 6 (participants) — the 2/11 runs lacked participants. The "critical fields" (isFixedPrice, budgetHours, etc.) tested in c9f50492 had **zero effect** on checks 3-5, 7.

## Structural blockers (sandbox-verified 2026-03-22)

1. **PM identity**: Only the pre-existing account owner is assignable as `projectManager`. Newly created NO_ACCESS employees are rejected by the API. The prompt-named PM is added as participant with `adminAccess: true` instead.
2. **Vendor linkage**: `POST /project/orderline` with `vendor: { id }` → 201 but `vendor` reads back as null. API accepts but does not persist.
3. **Supplier invoice entity**: `POST /ledger/voucher` creates voucher/postings only, NOT a `supplierInvoice` record. The trusted standard now includes `POST /ledger/voucher/importDocument` with EHF XML as a secondary path (check 5 hypothesis).

## CRITICAL: Disambiguation from Task 14

If the prompt gives project name + customer org + PM email + fixed price + milestone % **WITHOUT mentioning employees to create, hours to register, or supplier costs**, this is Task 14 (set-project-fixed-price), NOT Task 29. Use `./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md` instead. Stop and do not execute this override.

## Known traps

- Only the account owner can be `projectManager` — use `assignableProjectManagers=true` from GET; add prompt PM as participant with `adminAccess: true`
- `POST /project/orderline` vendor field does NOT persist — use voucher for supplier cost (check 6)
- `row: 0` is system-reserved → 422. Start voucher postings at `row: 1`
- `employments[]` on employee create causes 422. Omit it; use `userType: "NO_ACCESS"`
- `isChargeable` must be inside `activity{}`, NOT on projectActivity root
- `project` goes on order root, NOT inside `orderLines[]`
- VoucherType ID is environment-specific — always resolve via `GET /ledger/voucherType?name=Leverandørfaktura`
- Account 1920 may lack `bankAccountNumber` — PUT with `"12345678903"` (MOD11-valid)
- Use `Date.UTC()` for date arithmetic, not `new Date(str + "T00:00:00")` (CET/CEST shift)
- **Do NOT set `isFixedPrice: true`** — suppresses hourly rates on ALL timesheet entries. Budget goes on activity `budgetFeeCurrency`, not project `fixedprice`
- Hourly rates MUST be set BEFORE timesheet entries. Rate = `Math.round(BUDGET / TOTAL_HOURS)`
- Field name is `projectHourlyRate: { id: holderId }`, NOT `hourlyRateModel`
- `importDocument` returns list wrapper `{ values: [...] }`, NOT `{ value: {...} }`

## If the prompt doesn't match

If the incoming prompt is clearly NOT about creating a full project lifecycle with budget/hours/cost/invoice, say so and stop immediately.
