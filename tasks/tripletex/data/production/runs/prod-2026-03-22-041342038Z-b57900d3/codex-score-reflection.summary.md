# Score-Aware Reflection: prod-2026-03-22-041342038Z-b57900d3

## 1. Task Attribution

- **Task ID**: 13 (register travel expense)
- **Tier**: T2 (tasks 9–18), max normalized score = 4
- **Prompt**: Norwegian — Ingrid Larsen, Kundebesøk Trondheim, 2 days diett 800 kr, Fly 2500 kr + Taxi 600 kr
- **Leaderboard before**: best_score 1.125, 21 attempts
- **Leaderboard after**: best_score 1.125, 22 attempts (no improvement)

## 2. Correctness Verdict

**NOT PERFECT.** Correctness = 0.5625 (4.5/8 raw).

- Check 1: **passed**
- Check 2: **failed**
- Check 3: **failed**
- Check 4: **passed**
- Check 5: **passed**
- Check 6: **failed**

This is **identical** to all 22 prior runs — same score (4.5/8), same 3 checks failing (2, 3, 6). The `:approve` step hypothesis was **wrong**: adding it did not change the score at all. The count=days (vs days-1) change also had no measurable effect.

## 3. Efficiency Verdict

N/A — correctness is the blocking issue. The run used 7 calls with 0 errors, which would be optimal IF correctness were perfect. But since correctness = 0.5625, efficiency is irrelevant until the 3 failing checks are fixed.

## 4. Likely Root Cause

The prior reflection committed playbook changes asserting the `:approve` step was the "root cause" of checks 2, 3, 6 failing. **This was wrong.** Evidence:

| Change tested | Score | Checks 2,3,6 |
|---|---|---|
| 22 prior runs (no approve, count=days-1) | 4.5/8 | all failed |
| This run (WITH approve, count=days) | 4.5/8 | all failed |

Both the approve step and the count correction made zero difference. The actual root cause remains **unknown** and must be one or more of:

1. **Missing ledger booking/posting**: The travel expense is approved but may not be booked to the ledger. Approval ≠ booking. The scorer may expect ledger postings to exist (like supplier invoices need a booking step after creation).
2. **Wrong overnightAccommodation**: We send `"HOTEL"` — might need `"NONE"` or a different value depending on prompt details.
3. **Wrong rateType/rateCategory IDs**: Hardcoded 25888/740 may not be correct for all production accounts (these are sandbox-derived values).
4. **Wrong vatType on costs**: Using category default (id=12) — scorer may expect id=0 or a different VAT treatment.
5. **Per-diem rate override rejected**: Setting rate=800 may be silently overridden by the system to the government rate (1012). If the scorer checks the actual stored rate rather than what we sent, it might see 1012 instead of 800.
6. **Date/time values**: Specific departure/return dates or times may matter to the scorer.
7. **Missing currency or amount fields**: The costs might need `amountNOKExclVAT` or `currency` fields that we omit.

The most likely candidate is **#1 (missing ledger booking)** or **#5 (rate silently overridden)**, because these would explain why the approve step had zero effect on scoring while still changing the API state correctly.

## 5. What Went Right

- Followed the trusted standard exactly — 7 calls, 0 errors
- All API calls succeeded: create → deliver → approve
- Final state was APPROVED with isApproved=true
- Employee lookup, costCategory, paymentType lookups all correct
- Company GET for departureFrom correctly triggered when employee had no address
- Per-diem used count=2 (days) and rate=800 (from prompt)
- vatType from category lookup (id=12) applied to both costs
- Script was clean, fast (60s), no retries

## 6. What To Change Next Time

### Immediate investigation needed (sandbox)

1. **Check if rate=800 is actually stored**: After POST, read back the travel expense and check `perDiemCompensations[].rate` — does it stay 800 or get overridden to the system rate (1012)?
2. **Try booking the travel expense to ledger**: After approve, check if there's a step to book/post the travel expense (like `PUT /travelExpense/:book` or checking if vouchers are created).
3. **Try different overnightAccommodation values**: Test `"NONE"`, `"BOARDING_HOUSE_WITHOUT_COOKING"`, etc.
4. **Read back the full travel expense after approve**: Compare every field against what was sent to find silent overrides or missing values.
5. **Check if costs need explicit account numbers**: The costCategory maps to an account, but the scorer might check the account directly.
6. **Try vatType=0 on costs**: Some production accounts may not be VAT-registered, causing vatType=12 to be silently wrong.

### Playbook correction needed

The prior reflection committed changes asserting the approve step was "the root cause" with "CRITICAL, NEVER SKIP" emphasis. While approve is likely still correct behavior, it is NOT the root cause of the 3 failing checks. The playbook's production history section and Rule 1 emphasis should be tempered — the approve step is unproven as a scoring factor since this run scored identically with it included.

### Priority hypothesis ranking

1. **Rate silently overridden** (highest priority) — if the system ignores our rate=800 and stores 1012, then count × rate ≠ what we expect, and the per-diem check fails
2. **Missing ledger booking step** — travel expense may need explicit booking like supplier invoices do
3. **overnightAccommodation value** — "HOTEL" assumption may be wrong for a 2-day domestic trip
4. **Account/VAT mismatch** — costCategory defaults may not match scorer expectations
