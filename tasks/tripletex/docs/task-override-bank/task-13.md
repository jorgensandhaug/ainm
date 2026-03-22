# TASK OVERRIDE — Task 13: Register Travel Expense (Reiseregning)

**You are running Task 13. The task is already identified. Do not classify.**

## What this task is

Register a domestic travel expense for an existing employee (identified by email). The prompt provides cost lines (flight, taxi, etc.) and mentions per-diem allowance ("med diett"). You must create the expense, add costs and per-diem, then complete the full accounting lifecycle.

## What to read and execute

1. **Read ONLY** `./trusted-standards/register-travel-expense.md` — this is the complete, verified flow
2. **Immediately write and execute** a TypeScript script with `bun`. Do NOT read any other files (not AGENTS.md, not openapi.json, not the playbook)
3. The trusted standard has the exact API flow, payload shape, per-diem rules, and recovery branches

## The TWO fixes that matter most (both untested in 24 production runs)

### FIX 1: perDiemCompensations count = OVERNIGHTS (days - 1)

- "3 dager" → count=**2**, "4 dagar" → count=**3**, "5 dager" → count=**4**
- The rateType "Overnatting" expects overnight count, not day count
- **24 production runs ALL used count=days and ALL scored 4.5/8** — count was the ONLY parameter never varied
- Do NOT set `rate` or `amount` — let the system auto-fill 1012 (government rate)
- The prompt's "dagsats 800 kr" is context, NOT what to send to the API
- Set `isCompensationFromRates: true`
- Use `rateType: { id: 25888, rateCategory: { id: 740 } }`, `overnightAccommodation: "HOTEL"`

### FIX 2: createVouchers after approval — NEVER SKIP

- ALL 22+ production runs **omitted** `PUT /travelExpense/:createVouchers` — this is the #1 hypothesis for checks 2,3,6
- Without createVouchers: `voucher=null`, `isCompleted=false`, no ledger postings
- With createVouchers: `voucher != null`, `isCompleted=true`, 7 accounting postings
- Approval is a PREREQUISITE (422 "Reiseregningen er ikke godkjent" without it)
- Do NOT use `overrideApprovalFlow=true` on approve (returns 403)

## Full lifecycle (all steps mandatory)

1. **Round 1 — parallel GETs**: `GET /employee?email=...`, `GET /travelExpense/costCategory?count=1000&fields=*`, `GET /travelExpense/paymentType?count=1000&fields=*`
2. **Round 2 — conditional**: `GET /company/{id}?fields=*,address(*)` only if employee lacks address (for `departureFrom`)
3. **Round 3 — create**: `POST /travelExpense` with costs + perDiemCompensations (count=overnights)
4. **Round 4 — readback**: `GET /travelExpense/<id>?fields=*,perDiemCompensations(*,rateType(*,rateCategory(*))),costs(*,costCategory(*),vatType(*)),travelDetails(*)`
5. **Round 5 — deliver**: `PUT /travelExpense/:deliver?id=<id>`
6. **Round 6 — approve**: `PUT /travelExpense/:approve?id=<id>`
7. **Round 7 — createVouchers**: `PUT /travelExpense/:createVouchers?id=<id>&date=<returnDate>`
8. **Round 8 — final readback**: `GET /travelExpense/<id>?fields=*,perDiemCompensations(*),costs(*),voucher(*)`
9. **Round 9 — voucher postings**: `GET /ledger/voucher/<voucher.id>?fields=*,postings(*,account(*))`

## Known traps

- `vatType` on costs = `costCategory.vatType.id` from the lookup (typically 12). Recovery: if POST fails with `VAT_NOT_REGISTERED`, retry with `{ id: 0 }`
- `costs[].description` does NOT exist → 422. Use `costs[].comments`
- `costs[].currency` → 422 "factor minimum 1". Omit entirely (NOK default)
- `costCategory: { description: "Fly" }` resolves to null → POST 201 but deliver 422. Must use `{ id }`
- `paymentType: { description: "Privat utlegg" }` same trap. Must use `{ id }`
- `departureFrom`: use employee `address.city`, else company city. Never invent placeholders
- Duration-only prompts (no explicit dates): pick a deterministic date range
- `:deliver` returns `ListResponseTravelExpense` — read from `values[]`, not `value`

## If the prompt doesn't match

If the incoming prompt is clearly NOT about registering a travel expense with costs and per-diem, say so and stop immediately. Do not attempt to execute.
