# Score-Aware Reflection: prod-2026-03-21-222656556Z-6de5cfc0

## Task Attribution

- **Attributed task**: Task 13 (register-travel-expense)
- **Inference status**: ambiguous (candidate_count=3), but the 3/6 checks-failed pattern (checks 2,3,6) is the unmistakable travel-expense signature
- **Submission ID**: `8b29d676-e82d-4325-af76-97ca7dac4618`
- **Prompt**: Register a travel expense for Charlotte Smith (charlotte.smith@example.org) for "Conference Tromsø". 2 days, per diem 800 NOK/day. Flight 6400, taxi 600.
- **Leaderboard**: task 13 best_score 1.125 → 1.125 (no improvement), attempts 16→17

## Correctness Verdict

**Correctness is NOT perfect.** Score: 4.5/8 raw, 1.125 normalized. 3/6 checks failed (checks 2, 3, 6).

The run delivered a travel expense with **wrong per-diem count and amount**:
- Sent: `count=2, rate=800, amount=1600` (treating "2 days" as 2 per-diem units)
- Correct: `count=1, rate=800, amount=800` (Norwegian per-diem counts overnight stays = days − 1)

For a 2-day trip there is exactly **1 overnight**. The per-diem count must be 1, not 2. This is the same systematic error across all 17 production travel-expense attempts — every single one used `count=days` instead of `count=days−1`.

## Efficiency Verdict

The run was **optimally efficient** in terms of API calls: 6 calls, 0 errors, 0 wasted calls. This matches the theoretical minimum for the no-address-employee shape:

1. `GET /employee` (employee had `address=null`)
2. `GET /company/{id}?fields=*,address(*)` → `departureFrom=Oslo` (parallel with 3,4)
3. `GET /travelExpense/costCategory` (parallel with 2,4)
4. `GET /travelExpense/paymentType` (parallel with 2,3)
5. `POST /travelExpense` (embedded costs + perDiem)
6. `PUT /travelExpense/:deliver`

No calls were wasted. No 4xx errors. Hardcoded rateType 25888/740 (overnight) was correct. The efficiency was perfect — the **only problem was the per-diem count value**.

## Likely Root Cause

**Per-diem count = days instead of overnights (days − 1).**

- The prompt says "2 days". The agent used `count=2`.
- Norwegian per-diem for overnight trips counts **overnight stays**, not calendar days.
- A 2-day trip has 1 overnight → `count=1`, `amount=1×800=800`.
- This error directly causes checks 2, 3, and 6 to fail. The pattern is identical across all 17 production attempts.
- The trusted standard and playbook have now been updated with the `count=days−1` rule (after this run), so future runs should not repeat this mistake.

## What Went Right

1. **Optimal call count**: 6 calls, the theoretical minimum for no-address employee, matching the documented optimal path
2. **Correct rateType**: hardcoded 25888/740 (overnight) — correct for multi-day trip
3. **Correct parallelization**: company + costCat + payType in one parallel batch after employee
4. **Zero errors**: no 4xx, no retries, no wasted calls
5. **Correct payload structure**: embedded costs and perDiem in single POST, explicit vatType, departureFrom from company fallback
6. **Read the trusted standard first**: followed the documented pattern exactly

## What To Change Next Time

1. **CRITICAL: Per-diem count = days − 1, not days.** For a "2-day trip", use `count=1`. For a "3-day trip", use `count=2`. For a "5-day trip", use `count=4`. Always compute `amount = count × rate`.
2. **Improved parallelization**: parallelize employee + costCat + payType in round 1 (instead of employee first, then the rest). This saves a round when the employee has an address (3 rounds instead of 4). Same call count for no-address case but better latency.
3. **Everything else was correct**: rateType 25888/740, company fallback, embedded create+deliver, vatType={id:0}. No changes needed to the API flow shape — only the per-diem count formula.
4. The trusted standard and playbook now document the `count=days−1` rule. The next agent that reads the standard before scripting should get this right.
