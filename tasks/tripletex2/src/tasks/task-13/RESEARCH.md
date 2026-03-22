# Task 13 — Register travel expense Research Memory

Read together with `task.ts`, the generated packet, and `research/AGENTS.md`.

## Current Runtime Surface

- Canonical task id: `13`
- Active strategy pin: `13.create-and-deliver-travel-expense.v3`
- Fallback: v1
- Proof input: `research/proofs/task-13/task-13-proof-input.json`

## Best Known Score: `1.125` / `4`

- Priority: `11`, Band: `focus`, Lane: `hard-research`
- 4.5/8 raw = 0.5625 correctness, 22 production attempts
- Checks 1+4+5 pass, checks 2+3+6 consistently fail

## The createVouchers Hypothesis (STRONGEST — unscored)

ALL 22 production runs omitted PUT /travelExpense/:createVouchers.
Run b57900d3 proved approve alone does NOT help (still 4.5/8).
The b57900d3 reflection identifies "missing ledger booking" as #1 hypothesis.

After createVouchers: `voucher != null`, `isCompleted=true`, 7 accounting postings.
Without createVouchers: `voucher=null`, no ledger postings.

| Run | approve? | createVouchers? | Score | Checks 2,3,6 |
|-----|----------|-----------------|-------|--------------|
| 20 legacy runs | NO | NO | 4.5/8 | all fail |
| b57900d3 | YES | NO | 4.5/8 | all fail |
| v3 sandbox | YES | YES | untested | untested |

**createVouchers has never been production-scored.**

## Strategies

### v3 (ACTIVE — 2026-03-22)
- Computes dates from `tripDurationDays` (returnDate=ctx.clock.today(), departureDate=today-N+1)
- Full lifecycle: deliver → approve → createVouchers (both best-effort)
- Per-diem rateType: prefers highest available rate
- `konferanse` in NON_DESTINATION_TOKENS
- vatType: `{ id: 0 }` per trusted standard
- Sandbox runs: 4 successful (tripDurationDays=2, 3, 4), all 9 calls 200/201, vouchers created
- Run D (no explicit dates, tripDurationDays=4): dates computed 2026-03-19→2026-03-22 via ctx.clock.today(), amount=8600, voucher=609367679, APPROVED

### v2 (superseded by v3)
- Same core logic as v3 but uses `new Date()` instead of `ctx.clock.today()`
- Timezone-fragile; replaced by v3's clock-based approach

### v1 (fallback)
- Requires explicit dates, no createVouchers in original version
- Production ceiling: 4.5/8 across 20 runs

## Proven Dead Ends (NO effect on score)

1. vatType (0 vs 12)
2. Per-diem count (3/4/5)
3. isForeignTravel
4. rateType (25886 vs 25888)
5. departureTime/returnTime
6. approve alone (without createVouchers) — proven by b57900d3

## Next Steps

1. **Get v3 production-scored** — createVouchers is the strongest untested hypothesis
2. If it fixes it: optimize call count, investigate if rate GET can be skipped
3. If it doesn't: investigate per-diem overnightAccommodation values, rate override, or account mapping
