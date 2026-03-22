# TASK OVERRIDE — Task 29: Full Project Lifecycle (Budget, Hours, Cost, Invoice)

**You are running Task 29. The task is already identified. Do not classify.**

## What this task is

Create a full project lifecycle: customer, employees, project with budget, activity, participants, timesheet entries, supplier cost voucher, and an unsent customer invoice. The prompt provides:
- Project name, customer name + org number, monetary budget
- A project manager and a consultant (names + emails) with hours each
- A supplier (name + org number) with a cost amount

## What to read and execute

1. **Read ONLY** `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md`
2. The trusted standard has a **complete script template** — replace only the `// PROMPT VALUES` block.
3. **Do NOT modify payload shapes.** The template executes with 0 errors in best runs.
4. **Immediately write and execute** with `bun`. Do NOT read AGENTS.md, openapi.json, or playbooks.

## CRITICAL: Invoice creation method

**Use `POST /invoice` with embedded `orders[]` — NOT `POST /order` → `PUT /order/:invoice`.**

All 3 runs scoring 4/11 used `POST /invoice` with embedded orders. Run fa7bc779 used `POST /order` → `PUT /:invoice` and failed check 6 — same prompt as f17d4753 which used `POST /invoice` and passed. The trusted standard's primary path has never produced a check 6 pass for task 29.

## Scoring model: 7 checks, 11 max points

**Best production score: 1.09/6** (4/11 raw — checks 1, 2, 6 pass; checks 3, 4, 5, 7 fail)

| Check | Weight | Status | Evidence |
|-------|--------|--------|----------|
| 1 | 1pt | PASS | Customer created (name + org). Reliable across all 6 completed runs |
| 2 | 1pt | PASS | Employees created. Reliable — batch POST /employee/list |
| 3 | ? | FAIL | Never passed. Likely project config / activity / budget / PM identity |
| 4 | ? | FAIL | Never passed. Likely hours + hourly rates on timesheet |
| 5 | ? | FAIL | Never passed. Likely supplier cost / supplier invoice entity |
| 6 | 2pt | PASS | Invoice. Confirmed: 4/11 − 2/11 = 2pts. Only passes with `POST /invoice` + embedded orders |
| 7 | ? | FAIL | Never passed. Unknown — remaining points (checks 3-5,7 total 7pts) |

Scorer returns only "Check N: passed/failed" — no names. All semantics are inferences from production diffs.

## Production evidence (9 runs, 6 completed, all confirmed task 29)

| Run | Score | Checks | Invoice method | Participants |
|-----|-------|--------|----------------|-------------|
| 25760653 nb | 4/11 | 1,2,6 | `POST /invoice` embedded orders | Yes |
| c9f50492 es | 4/11 | 1,2,6 | `POST /invoice` embedded orders | Yes |
| f17d4753 pt | 4/11 | 1,2,6 | `POST /invoice` embedded orders | Yes |
| fa7bc779 pt | 2/11 | 1,2 | `POST /order` + `PUT /:invoice` | Yes |
| 5c16a788 nb | 2/11 | 1,2 | `POST /invoice` (crash-retry) | No |
| 0f38a072 en | 2/11 | 1,2 | `POST /invoice` (crash-retry) | No |
| d568ddd5 de | 0/1 | — | timeout | — |
| 0945bbd9 de | 0/1 | — | timeout | — |
| a81782be nn | SKIP | — | — | — |

**Key findings**: (1) Check 6 correlates with invoice method, not participants — fa7bc779 had participants but used `POST /order` → `PUT /:invoice` and failed. (2) Run 4db584f1 (cited as "production-confirmed" in the trusted standard) was never scored.

## Structural blockers (sandbox-verified 2026-03-22)

- **PM identity**: Only the account owner is assignable as `projectManager`. Prompt PM → participant with `adminAccess: true`.
- **Vendor linkage**: `POST /project/orderline` vendor field → 201 but reads back as null.
- **Supplier invoice**: `POST /ledger/voucher` creates no `supplierInvoice` record. importDocument (EHF XML) is secondary path (unconfirmed).

## Disambiguation from Task 14

If the prompt gives project + customer org + PM email + fixed price + milestone % **WITHOUT employees, hours, or supplier costs** → Task 14. Use `set-project-fixed-price-and-invoice-partial-payment.md`.

## Known traps

- Only the account owner can be `projectManager` — add prompt PM as participant with `adminAccess: true`
- `POST /project/orderline` vendor field does NOT persist — use voucher for supplier cost
- `row: 0` is system-reserved → 422. Start postings at `row: 1`
- `employments[]` on employee create causes 422. Omit; use `userType: "NO_ACCESS"`
- `isChargeable` must be inside `activity{}`, NOT on projectActivity root
- `project` goes on order root, NOT inside `orderLines[]`
- VoucherType ID is environment-specific — always resolve via GET
- Account 1920 may lack `bankAccountNumber` — PUT with `"12345678903"` (MOD11-valid)
- **Do NOT set `isFixedPrice: true`** — suppresses hourly rates on ALL timesheet entries
- Hourly rates MUST be set BEFORE timesheet entries. `projectHourlyRate: { id }`, NOT `hourlyRateModel`
- `importDocument` returns `{ values: [...] }`, NOT `{ value: {...} }`
- If the prompt is clearly NOT task 29, say so and stop immediately
