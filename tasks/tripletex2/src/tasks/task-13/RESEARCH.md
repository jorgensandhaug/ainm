# Task 13 — Register travel expense Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `13`
- Active strategy pin: `13.create-and-deliver-travel-expense.v1`
- Task implementation: `task.ts`

## Current Research Queue Snapshot

- Priority: `11`
- Band: `focus`
- Queue eligibility: `ready`
- Research lane: `hard-research`
- Best known score: `1.125` / `4`
- Baseline call budget: `8`

## Frontier Summary

### Strongest verified branch: `13.create-and-deliver-travel-expense.v1`

- **Sandbox completed** on 2026-03-22 at 09:03:04Z
- **9 API calls** (8 within budget + 1 best-effort createVouchers)
- Travel expense state: **APPROVED**
- createVouchers: fails with 422 in sandbox (caught gracefully, strategy still completes)
- Sandbox run: `sandbox-13-13.create-and-deliver-travel-expense.v1-2026-03-22T09-03-04-159Z`

### Call profile (happy path with company address fallback)

1. GET /employee — resolve employee by email
2. GET /company/{companyId}?fields=*,address(*) — conditional departureFrom fallback
3. GET /travelExpense/costCategory — resolve categories (parallel with 4+5)
4. GET /travelExpense/paymentType — resolve payment type (parallel with 3+5)
5. GET /travelExpense/rate — resolve per-diem rates (parallel with 3+4)
6. POST /travelExpense — create with embedded costs and per-diem
7. PUT /travelExpense/:deliver — deliver (state=DELIVERED)
8. PUT /travelExpense/:approve — best-effort approve (state=APPROVED)
9. PUT /travelExpense/:createVouchers — best-effort voucher creation

## Bugs Fixed (2026-03-22)

1. **TDZ crash**: `resolveTravelDates` call passed uninitialized variables. Fixed to use `input.departureDate`/`input.returnDate`.
2. **Date propagation**: Rate lookup, POST body, per-diem payload, cost dates, and createVouchers all used optional `input.departureDate`/`input.returnDate` instead of resolved values.
3. **Best-effort approve/createVouchers**: Wrapped in try/catch so strategy completes on DELIVERED/APPROVED path.
4. **Bidirectional category matching**: Added reverse substring so "Flybillett" matches category "Fly".
5. **Merge conflicts**: Fixed conflicts in verification-plan.ts, task-06/task.ts, verifier.ts, task-24/ files.

## Anti-Patterns

- Do not crash on `:approve` or `:createVouchers` — bonus steps that fail in many contexts
- Do not assume explicit dates in input — prompts often only say "X dagar"
- Cost category matching must be bidirectional
- Merge conflicts block ALL sandbox runs — fix immediately

## Sandbox Verification — 2026-03-22 (detailed, run C)

Full end-to-end test after sandbox reset, matching production prompt pattern:

| Field | Value |
|-------|-------|
| Employee | simen.sandhaug@gmail.com (id=18441996) |
| Title | Kundebesok Bergen |
| Dates | 2026-03-18 to 2026-03-22 (5 days) |
| Per-diem | count=5, rate=800, amount=4000, rateType=25888, HOTEL |
| Costs | Fly 7900 (departure), Taxi 250 (return) |
| DepartureFrom | Oslo (company fallback) |
| Destination | Bergen |
| isDayTrip | false |
| State | APPROVED |
| Voucher | id=609366142, number=823 |
| createVouchers | SUCCESS (200) |

**Key findings:**
- Per-diem rate 800 accepted despite rateType.id=25888 having rate=1012 — Tripletex stores our value
- All 9 API calls succeed: GET employee, GET company, GET categories+paymentType+rate (parallel), POST, :deliver, :approve, :createVouchers
- Voucher created successfully — this was previously identified as a critical failing check

## Next Hypotheses

1. Production validation needed to test date-resolution + best-effort flow
2. When employee has address, skip company read (save 1 call)
3. Consider: should rateType match the rate=800 exactly? Available rates: 397, 736, 1012
