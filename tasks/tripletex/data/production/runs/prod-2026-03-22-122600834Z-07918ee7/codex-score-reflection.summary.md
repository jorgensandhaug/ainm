# Score Reflection — prod-2026-03-22-122600834Z-07918ee7

## 1. Task Attribution

**Task ID: T13** (Register Travel Expense) — T2 tier, max score 4.

Attribution confidence: **high** despite `inference_status: "ambiguous"`. The prompt is clearly a travel expense ("Registrer ei reiserekning"), and T13 is the only travel-expense entry. T14 also incremented (27→28) in the same window, but that's a concurrent unrelated submission.

Leaderboard diff:
- T13: attempts 24→25, best_score 1.125→1.125 (unchanged)
- T14: attempts 27→28, best_score 4.0→4.0 (unchanged, concurrent)

## 2. Correctness Verdict

**NOT improved.** Score stayed at 1.125/4 (28.1% of max).

This is the **26th run** for T13 and the **1st with count=overnights**. The count=overnights hypothesis — that switching perDiemCompensations count from `days` to `days-1 (overnights)` would fix checks 2, 3, 6 — is now **DISPROVEN**.

All 25 scored T13 runs (24 with count=days + this 1 with count=overnights) produced the same score: 1.125/4. No parameter variation has ever changed the score.

Parameters varied across 25 runs with no effect:
- count: days (24 runs) AND overnights (this run) — both score 1.125
- rate: auto-fill 1012, explicit 800 — no effect
- rateType: 25888, others — no effect
- vatType on costs: category default (12), hardcoded 0 — no effect
- lifecycle state: full chain (deliver→approve→createVouchers) vs partial — no effect

## 3. Efficiency Verdict

**N/A.** Correctness was imperfect (1.125 < 4.0), so the efficiency bonus is irrelevant. The run itself was clean (0 errors, 4 writes, 7 free GETs), but correctness is the binding constraint.

## 4. Likely Root Cause

The root cause of T13's persistent 1.125/4 score is **NOT** any of the parameters we've been varying (count, rate, rateType, vatType, lifecycle). After 25 runs with exhaustive parameter variation and zero improvement, the issue is **structural** — something fundamental about our approach is missing or wrong.

**Hypotheses for what checks 2, 3, 6 might be testing (ranked by plausibility):**

1. **Different perDiemCompensation structure entirely.** Maybe the scorer expects `perDiemCompensations` to use a different `rateCategory` (e.g., "Kost" instead of "Overnatting"), or expects multiple perDiem entries (one per day/overnight rather than one with count=N), or expects `isCompensationFromRates: false` with manual rate/amount.

2. **Missing or wrong travelDetails fields.** Checks might validate `departureFrom` vs `destination` semantics (e.g., the trip departs FROM employee's city TO Oslo, but we used `departureFrom: "Oslo"` because the company is in Oslo — maybe the scorer expects the employee's actual home city from some other source), or validate departure/return times.

3. **Employee-level configuration issue.** The employee had `address: null`, `dateOfBirth: null`, `employments: []`. Maybe the scorer expects an employee with an address set (for `departureFrom` validation), or employment details configured.

4. **Cost field we're not setting.** `isPaidByEmployee` is always `false` in our runs — maybe the scorer expects `true` (employee pays out-of-pocket, gets reimbursed). Or maybe `rate` on costs should be something other than 1.

5. **Completely different approach needed.** Maybe the perDiemCompensations array should be empty/omitted, and per-diem should be handled as a cost line or accommodation allowance instead.

**Most actionable next step:** Try the documented fallback — remove `perDiemCompensations` entirely, set `isCompensationFromRates: false`, and see if checks 2, 3, 6 change. If score still stays at 1.125, per-diem is not the problem at all.

## 5. What Went Right

1. **Zero errors.** The run completed with 0 avoidable 4xx errors — perfect execution discipline.
2. **Full lifecycle.** deliver → approve → createVouchers chain completed correctly. isCompleted=true, voucher created.
3. **Correct cost handling.** Fly 3600 and Taxi 250 with vatType=12 (12% lav sats) from category defaults. Voucher postings show correct VAT split (7140 expense + 2712 input VAT).
4. **Comprehensive GET logging.** Every write followed by readback GET with full field expansion. Voucher postings logged with account details. All 9 rounds of the trusted standard executed.
5. **Fast execution.** Script written immediately after reading trusted standard, no wasted time on AGENTS.md or openapi.json re-reading. Clean single-pass execution.
6. **Company city fallback.** Correctly detected employee's missing address and fell back to company address city (Oslo) for departureFrom.

## 6. What To Change Next Time

### Immediate priority: exhaustive hypothesis testing
Since 25 runs with parameter variation all scored 1.125, the next agent should NOT just repeat the same approach with minor tweaks. The space of "obvious" parameters is exhausted. Instead:

1. **Try removing perDiemCompensations entirely.** Set `isCompensationFromRates: false`, omit `perDiemCompensations` array. If score changes, the perDiem structure is the issue. If score stays at 1.125, per-diem is irrelevant and the failing checks test something else entirely.

2. **Try a different rateCategory.** Instead of `rateCategory: { id: 740 }` ("Overnatting over 12 timer - innland"), try the "Kost" (meals) category — the prompt says "diett" which literally means "diet/meals allowance", not "overnight accommodation". The Overnatting rateType may be completely wrong for what the scorer expects.

3. **Investigate the actual check definitions.** Without knowing what checks 2, 3, 6 test, we're guessing blindly. If there's any way to get check-level feedback (scorer API, documentation, or prior scored runs with different check patterns), prioritize that.

4. **Try setting `isPaidByEmployee: true`** on cost lines. The employee pays out-of-pocket for flights/taxis and gets reimbursed — `isPaidByEmployee` being false may cause a check failure.

5. **Do NOT repeat the count=overnights approach.** It is confirmed to produce the same 1.125 score as count=days. Both are equally wrong or irrelevant.

### Documentation updates needed (for next editing phase)
- Mark count=overnights hypothesis as **DISPROVEN** in trusted standard and playbook
- Add the no-perDiem fallback as the new primary hypothesis
- Add rateCategory investigation (Kost vs Overnatting) as secondary hypothesis
- Update AGENTS.md T13 gotcha to reflect that 25 runs with exhaustive parameter variation all score 1.125
