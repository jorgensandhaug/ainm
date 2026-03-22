# TASK OVERRIDE — Task 29: Full Project Lifecycle (Budget, Hours, Cost, Invoice)

**You are running Task 29. The task is already identified. Do not classify.**

## What this task is

Create a full project lifecycle: customer, employees, project with budget, activity with hours, participants, timesheet entries, supplier cost voucher, and an unsent customer invoice. The prompt will mention:
- A project name, customer name + org number, monetary budget
- A project manager (name + email) and a consultant (name + email) with hours
- A supplier (name + org number) with a cost amount
- All entities need to be created fresh

## What to read and execute

1. **Read ONLY** `./trusted-standards/register-project-lifecycle-budget-hours-cost-and-invoice.md`
2. The trusted standard contains a **complete copy-paste script template** — use it directly. Replace only the `// PROMPT VALUES` block with values from the prompt.
3. **Do NOT modify payload shapes.** The template is production-verified.
4. **Immediately write and execute** with `bun` after reading. Do NOT read AGENTS.md, openapi.json, or playbooks.

## Critical scoring facts (11 checks, 7 check groups)

Current production score: **0.55/6** (2/11 raw — checks 1-2 pass, checks 3-7 fail)

The trusted standard fixes checks 3-7 by:
- **Check 3 (activity)**: `budgetHours` on activity, `isChargeable` inside `activity{}` not on root
- **Check 4 (participants)**: batch `POST /project/participant/list` with `adminAccess: true` for PM
- **Check 5 (timesheet)**: split hours across 7.5h/day slots using `splitHours()` helper
- **Check 6 (supplier cost)**: `POST /ledger/voucher` with project+supplier linkage in postings — this is what the scorer checks, NOT `/project/orderline`
- **Check 7 (invoice)**: `POST /order` → `PUT /order/:invoice` (NOT `POST /invoice` directly — that produces `isApproved=false`)

## CRITICAL: Disambiguation from Task 14

If the prompt gives project name + customer org + PM email + fixed price + milestone % **WITHOUT mentioning employees to create, hours to register, or supplier costs**, this is Task 14 (set-project-fixed-price), NOT Task 29. Use `./trusted-standards/set-project-fixed-price-and-invoice-partial-payment.md` instead. Stop and do not execute this override.

## Known traps

- Only the account owner can be `projectManager` — use `assignableProjectManagers=true` from GET, add prompt PM as participant with `adminAccess: true`
- `POST /project/orderline` vendor field does NOT persist (reads back as null) — use voucher instead
- `row: 0` is system-reserved → 422. Start at `row: 1`
- `employments[]` on employee create causes 422 traps. Omit it.
- `isChargeable` must be inside `activity{}`, not on projectActivity root
- `project` goes on order root, NOT inside `orderLines[]`
- VoucherType ID is environment-specific — always resolve via `GET /ledger/voucherType?name=Leverandørfaktura`
- Account 1920 may lack `bankAccountNumber` — PUT with `"12345678903"` (MOD11-valid)
- Use `Date.UTC()` for date arithmetic, not `new Date(str + "T00:00:00")` (CET/CEST shift)

## If the prompt doesn't match

If the incoming prompt is clearly NOT about creating a full project lifecycle with budget/hours/cost/invoice, say so and stop immediately.
