# Task 29 — Full project lifecycle Research Memory

This file is the task-local research memory for improving agents.
Read it together with `task.ts`, the generated packet, and `research/AGENTS.md`.
Update it after any meaningful frontier import, sandbox verification, promotion decision, or blocker discovery.

## Current Runtime Surface

- Canonical task id: `29`
- Active strategy pin: `29.full-project-lifecycle.v1`
- Challenger strategy: `29.full-project-lifecycle.v2` (sandbox-pass)
- Task implementation: `task.ts`
- Proof input: `proof-input.json`

## Current Research Queue Snapshot

- Priority: `4`
- Band: `focus`
- Queue eligibility: `ready`
- Research lane: `implemented-unproven`
- Best known score: `0.5455` / `6` (from packet; leaderboard best is 1.0909 from legacy runs)

## Scoring Rubric (11 sub-checks under 7 check groups)

| Check | Points | What it tests | v1 | v2 |
|-------|--------|---------------|----|----|
| 1 | 1 | Customer exists with correct org number | PASS | PASS |
| 2 | 1 | Project exists with correct name | PASS | PASS |
| 3 | 4 | isFixedPrice=true, fixedprice=budget, budgetHours=totalHours, budgetFeeCurrency=budget | FAIL | PASS |
| 4 | 1 | PM timesheet hours match | FAIL* | PASS |
| 5 | 1 | Consultant hours + orderline with supplier cost | FAIL* | PASS |
| 6 | 2 | Participants registered (PM adminAccess=true, consultant present) | partial | PASS |
| 7 | 1 | Invoice exists, correct amount, not credit note, has projectInvoiceDetails | FAIL | PASS |

*Checks 4/5 may have passed in v1 runs but are scored 0 in the leaderboard due to other check group packaging.

## Frontier Memory

### Strongest known branch
- **v2 challenger** (`29.full-project-lifecycle.v2`): sandbox-verified 2026-03-22, 17 calls, 0 errors, all scorer fields correct.

### Score / correctness ceiling
- v1 production best: 4/11 (1.0909 normalized, checks 1+2+6 pass)
- v2 sandbox: all 11/11 sub-checks should pass (projected 6/6)

### Call-budget frontier
- v1 target: 13 calls (no participants, no voucher, no isFixedPrice)
- v2 actual: 17 calls (includes participants, voucher, isFixedPrice, proactive bank fix)
- Theoretical minimum: ~14-15 calls (with aggressive parallelization and skipping resolve-or-create for entities known to be new)

### Production evidence consulted
- `prod-2026-03-21-210613278Z-f17d4753` (Portuguese, 4/11, 19 calls) — best legacy score
- `prod-2026-03-21-205413966Z-25760653` (Norwegian, 4/11, 26 calls) — first 1.0909 breakthrough
- `prod-2026-03-21-181150994Z-0f38a072` (English, 2/11, 16 calls) — isChargeable placement error
- `prod-2026-03-21-174545193Z-5c16a788` (Norwegian, 2/11, 17 calls) — timezone bug
- `prod-2026-03-21-132511516Z-d568ddd5` (German, 0/11, timeout) — stale playbook, project placement error
- `prod-2026-03-21-155527510Z-0945bbd9` (German, 0/11, timeout) — division guard missing, invalid bank number
- `prod-2026-03-21-211402061Z-a81782be` (Nynorsk, skipped) — missing submission snapshot

### Anti-patterns / dead ends
- **Division/employments on employee creation**: Not needed. Employees work without `employments[]` array. Confirmed in production run f17d4753 investigations.
- **POST /order + PUT /order/:invoice path**: Does not generate `projectInvoiceDetails`. Use `POST /invoice?sendToCustomer=false` with inline orders instead.
- **Hardcoded voucherType IDs**: Environment-specific. Always resolve via GET /ledger/voucherType.
- **Random bank account numbers**: Must use MOD11-valid `12345678903`. Random 11-digit numbers fail.
- **24h timesheet split**: Works but 7.5h/day matches the e2e verified pattern.

## V2 Key Changes from V1

1. **Project creation**: Added `isFixedPrice: true, fixedprice: projectBudgetNok`
2. **Activity creation**: Added `budgetHours: totalEmployeeHours`
3. **Participant registration**: POST /project/participant/list with adminAccess=true for PM
4. **Invoice path**: Changed from POST /order + PUT /order/:invoice to POST /invoice?sendToCustomer=false with inline orders
5. **Supplier voucher**: Added POST /ledger/voucher with project linkage on debit posting
6. **Employee creation**: Removed division/employments dependency, batch create via POST /employee/list
7. **Frontloaded reads**: All reference data (department, accounts, voucherType, vatType, assignable PM) in one parallel step
8. **Bank account**: Proactive fix before invoice creation instead of catch-and-retry

## Sandbox Verification

- Run ID: `sandbox-29-29.full-project-lifecycle.v2-2026-03-22T02-29-02-752Z`
- Status: completed, 17 calls, 0 errors
- All 11 scorer sub-checks verified correct via manual sandbox inspection:
  - isFixedPrice=true, fixedprice=396900
  - budgetHours=159, budgetFeeCurrency=396900
  - PM hours=74, consultant hours=85
  - orderline unitCost=56750
  - 3 participants (PM admin, samuel admin, sarah non-admin)
  - invoice amount=396900, isCreditNote=false, projectInvoiceDetails.length=1

## Next Improving-Agent Update Checklist

- [ ] Promote v2 to active strategy in `configs/active-strategies.json` after production verification
- [ ] Investigate call reduction: can resolve-or-create be skipped for entities unlikely to exist?
- [ ] Consider merging employee lookups with assignable PM lookup
- [ ] Test with different prompt languages (German, Portuguese, Norwegian) to ensure extraction robustness
