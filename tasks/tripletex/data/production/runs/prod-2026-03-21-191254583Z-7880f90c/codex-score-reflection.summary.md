# Score Reflection — prod-2026-03-21-191254583Z-7880f90c

## Task Attribution

- **tx_task_id**: 13 (T2, tier max = 4)
- **Prompt**: Registrer en reiseregning for Lars Johansen (lars.johansen@example.org) for "Kundebesøk Stavanger". 3 dager diett (dagsats 800 kr). Utlegg: flybillett 3900 kr og taxi 350 kr.
- **Leaderboard best before**: 1.125
- **Leaderboard best after**: 1.125 (tied, no improvement)
- **Total attempts**: 14 → 15

## Correctness Verdict

**NOT PERFECT.** correctness = 0.5625 (4.5/8). 3/6 checks failed (checks 2, 3, 6).

The run delivered the travel expense successfully (`state=DELIVERED`, id=11149476, 2 costs, 1 per-diem), but used the **wrong rateType** on the per-diem compensation. The agent selected rateType id=25886 ("Dagsreise 6-12 timer", day-trip rate, rate=397) for a 3-day overnight trip. The correct rate is id=25888 ("Overnatting over 12 timer", overnight rate, rate=1012).

Failed checks likely correspond to:
- **Check 2**: wrong `perDiemCompensations[].rateType` — day-trip rate used instead of overnight rate
- **Check 3**: wrong `perDiemCompensations[].rateCategory` — day-trip category instead of overnight/accommodation category
- **Check 6**: possibly the rate's numeric value (397 vs 1012) or another rateType-dependent field on the per-diem row

Passed checks (1, 4, 5) likely correspond to: correct employee, correct title/travelDetails, correct cost rows (amounts, categories, payment type).

## Efficiency Verdict

**Moot — correctness was not perfect, so efficiency bonus does not apply.**

The run itself was mechanically clean: 7 API calls, 0 errors, no retries. This would be optimal if the payload had been correct. No wasted calls.

However, the 7-call count includes `GET /travelExpense/rate` which was called but its response was misinterpreted — the agent grabbed `rates[0]` (first returned, id=25886 day-trip) instead of filtering for overnight-appropriate rates using `rateCategory.isValidAccommodation=true`. The rate call itself was not wasted; the agent just used it wrong.

## Likely Root Cause

**Wrong rate selection logic in the script.** The agent's code was:

```typescript
const matchingRate = rates.find((r: any) => r.rate === 800) || rates[0];
```

Since no rate has `rate=800`, this fell through to `rates[0]` which is id=25886 (day-trip). For a 3-day overnight trip (`isDayTrip=false`), the correct approach is:

1. Use `fields=*,rateCategory(*)` on the rate query to expand `rateCategory` inline
2. Filter for rates where `rateCategory.isValidAccommodation=true`
3. Among those, pick the one with the highest `.rate` (id=25888, rate=1012)

The trusted standard at the time of this run **did not contain** the critical overnight rate-selection guidance. It simply said "prefer a rate value whose numeric `.rate` matches the prompt day rate when such a row exists; otherwise reuse the first returned value's `.id`". This is wrong for overnight trips — the fallback should not be "first returned" but "the semantically correct overnight rate".

The trusted standard and playbook have since been updated by a concurrent reflection session to include the overnight rate selection rules and the full rate catalog.

## What Went Right

1. **Clean execution**: 7 calls, 0 errors, no retries — mechanically flawless
2. **Correct employee resolution**: found Lars Johansen by email on first try
3. **Correct company-address fallback**: employee had `address=null`, company read produced `departureFrom=Oslo`
4. **Correct payload structure**: embedded costs and per-diem in one POST, delivered in one PUT
5. **Correct cost rows**: both Fly (3900 kr) and Taxi (350 kr) with proper categories, payment type, and zero-VAT
6. **Correct rateType mapping**: used `{ id: rateValue.id, rateCategory: { id: rateValue.rateCategory.id } }` correctly (avoided the `.rateType` pitfall)
7. **Read the trusted standard before writing the script** — followed the documented flow exactly

## What To Change Next Time

1. **CRITICAL: Rate selection must distinguish day-trip vs overnight trips.** For multi-day trips (`isDayTrip=false`):
   - Use `fields=*,rateCategory(*)` on the rate query to expand `rateCategory`
   - Filter for `rateCategory.isValidAccommodation=true`
   - Pick the highest-rate accommodation rate (id=25888, rate=1012 for "Overnatting over 12 timer")
   - Do NOT fall back to `rates[0]` blindly — that returns a day-trip rate

2. **Rate selection code should be:**
   ```typescript
   // For overnight trips (isDayTrip=false):
   const overnightRates = rates.filter((r: any) => r.rateCategory?.isValidAccommodation === true);
   const matchingRate = overnightRates.find((r: any) => r.rate === promptRate)
     || overnightRates.sort((a: any, b: any) => b.rate - a.rate)[0];

   // For day trips (isDayTrip=true):
   const dayRates = rates.filter((r: any) => r.rateCategory?.isValidDayTrip === true && r.rateCategory?.isValidAccommodation === false);
   const matchingRate = dayRates.find((r: any) => r.rate === promptRate) || dayRates[0];
   ```

3. **The trusted standard and playbook have already been updated** with the correct rate catalog and selection logic. Future agents reading the updated standard will get the right guidance.

4. **Hardcoded rateType optimization is available but secondary.** Sandbox investigation confirmed rateType IDs (25886-25890) are stable across accounts. The rate lookup could be skipped entirely by hardcoding `rateType: { id: 25888, rateCategory: { id: 740 } }` for overnight trips. But correctness via proper filtering is more important than saving 1 API call. Keep the rate lookup and use it correctly.

5. **This run's score (1.125) tied the previous best.** The same rateType mistake was likely made in all 14 prior attempts. Fixing the overnight rate selection is the single change needed to unlock higher scores on task 13.
