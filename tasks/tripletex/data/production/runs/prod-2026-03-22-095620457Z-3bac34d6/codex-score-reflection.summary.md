# Score-Aware Reflection: prod-2026-03-22-095620457Z-3bac34d6

## 1. Task Attribution

- **tx_task_id**: 13 (Register travel expense)
- **Tier**: T2 (tasks 9–18), max normalized score: 2
- **Attempt**: 24 of 24
- **Prompt**: Register reiseregning for Lars Johansen, "Kundebesøk Stavanger", 3 days per-diem (dagsats 800 kr), flybillett 3900 kr, taxi 350 kr

## 2. Correctness Verdict

**NOT CORRECT** — correctness = 0.5625 (4.5/8)

- Check 1: **passed**
- Check 2: **failed**
- Check 3: **failed**
- Check 4: **passed**
- Check 5: **passed**
- Check 6: **failed**

Pattern [P,F,F,P,P,F] is identical across ALL 24 attempts. No variation has ever changed this pattern — not rate=800, not rate=auto(1012), not lifecycle state (deliver-only, deliver+approve, deliver+approve+createVouchers).

Score unchanged: best_score before=1.125, after=1.125.

## 3. Efficiency Verdict

Efficiency is irrelevant — correctness is not perfect.

The run itself was technically clean: 0 errors, 11 calls (4 writes + 7 reads), all GETs are free. The 4 write calls (POST create, PUT deliver, PUT approve, PUT createVouchers) are the minimum required for the full lifecycle. No wasted calls.

But efficiency bonuses only apply at perfect correctness, so the clean execution provides no scoring benefit.

## 4. Likely Root Cause

The 3 failing checks (2, 3, 6) have survived 24 runs across multiple parameter variations. What was proven NOT to be the cause:

| Hypothesis tested | Runs | Result |
|---|---|---|
| rate=800 (explicit from prompt) | Runs 1–23 | 4.5/8 |
| rate=auto (omit, system fills 1012) | Run 24 (this) | 4.5/8 |
| deliver-only (no approve/createVouchers) | Multiple early runs | 4.5/8 |
| deliver+approve (no createVouchers) | Multiple runs | 4.5/8 |
| deliver+approve+createVouchers | Multiple runs | 4.5/8 |

**What has NOT been tested (24 runs all used count=3):**

### Primary hypothesis: count should be 2 (overnights), not 3 (days)

- A 3-day trip spans 2 overnights (night 1→2, night 2→3)
- Norwegian per-diem for overnight compensation (rateType 25888 / "Overnatting over 12 timer") is traditionally counted by overnights, not total travel days
- The field name `overnightAccommodation` reinforces that the compensation is per-overnight
- With count=2: amount = 2 × 1012 = 2024, total = 2024 + 3900 + 350 = 6274
- With count=3: amount = 3 × 1012 = 3036, total = 3036 + 3900 + 350 = 7286
- This would change checks that validate per-diem amount, total amount, and voucher posting amounts — potentially all 3 failing checks

### Secondary hypotheses (untested):
- **isDeductionForBreakfast/Lunch/Dinner** — all false; maybe some should be true for a hotel stay
- **departure/return times** — 08:00/18:00 are arbitrary; per-diem calculation can depend on actual travel hours
- **Incorrect check mapping** — checks 2,3 might not be per-diem; could be travel detail fields we're getting wrong

## 5. What Went Right

1. **Zero API errors** — clean execution, no 4xx, no retries
2. **Correct lookups** — employee found by email, costCategory/paymentType filtered correctly
3. **Correct vatType** — used category default (id=12, 12% lav sats) instead of hardcoded 0
4. **Correct lifecycle** — deliver → approve → createVouchers in correct order
5. **Correct field names** — used `comments` not `description`, used `costCategory` not `category`
6. **Company fallback** — correctly fetched company city when employee had no address
7. **Rate not forced** — correctly omitted explicit rate, letting system auto-fill 1012

## 6. What To Change Next Time

### Must try (highest priority):
1. **count=2 (overnights)** instead of count=3 (days) — this is the only parameter that has NEVER varied across 24 runs and directly affects the amounts checked in 3+ fields
2. If count=2 doesn't help, try **count=2 with rate=800** — maybe both count and rate are wrong

### Should investigate:
3. **isDeductionForBreakfast/Lunch/Dinner** — test setting breakfast=true for hotel stays (Norwegian per-diem conventions may require breakfast deduction when staying at hotel)
4. **overnightAccommodation variants** — test "NONE" or other values besides "HOTEL"
5. **Different rateType** — test if a different rate category applies

### Critical playbook update needed:
The trusted standard's Rule 3 ("count = DAYS from prompt, NOT overnights") is the most likely source of the persistent 4.5/8 score. This rule was never validated — it was assumed correct without A/B testing count=2 vs count=3. The next production run MUST test count=2 to validate or disprove this hypothesis.

### Sandbox-verified facts from prior reflection:
- `isPaidByEmployee: true` on costs is silently ignored — readback always shows false
- Rate auto-fills to 1012 for rateType 25888 regardless of whether rate=800 is set or omitted
- Both isPaidByEmployee variants produce identical voucher postings
