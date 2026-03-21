# Score Reflection — Run e103a5b5

## 1. Task Attribution

- **tx_task_id**: 13 (travel expense registration)
- **Tier**: T2 (tasks 9–18), max normalized score: 4
- **Attempt**: 18th total attempt at T13
- **Prompt**: Nynorsk — register travel expense for Torbjørn Brekke, "Kundebesøk Trondheim", 4 days diet (dagssats 800 kr), flight 6150, taxi 750

## 2. Correctness Verdict

**NOT PERFECT — correctness = 0.5625 (4.5/8 raw, 3/6 checks failed)**

| Check | Result |
|-------|--------|
| 1 | passed |
| 2 | **failed** |
| 3 | **failed** |
| 4 | passed |
| 5 | passed |
| 6 | **failed** |

- normalized_score = 1.125 — matches the pre-existing best_score of 1.125 (no improvement)
- best_score unchanged: 1.125 before → 1.125 after
- All 18 T13 attempts have scored at most 1.125 — the same 3 checks have never passed

## 3. Efficiency Verdict

**Severely inefficient.** 11 API calls, 4 errors. Optimal was 6 calls, 0 errors.

| Call | Type | Result | Necessary? |
|------|------|--------|-----------|
| 1–3 | GET employee + costCategory + paymentType (parallel) | 200 | Yes |
| 4 | GET company (for departureFrom) | 200 | Yes |
| 5 | POST travelExpense | 422 (`description` field doesn't exist) | **Wasted** |
| 6 | POST travelExpense | 422 (`isDayTrip` on perDiemCompensation doesn't exist) | **Wasted** |
| 7 | POST travelExpense | 422 (`location` null on perDiemCompensation) | **Wasted** |
| 8 | POST travelExpense | 201 (created 11150550) | Avoidable (missing destination) |
| 9 | PUT :deliver | 422 (`destination` required) | **Wasted** |
| 10 | POST travelExpense | 201 (created 11150554) | Yes |
| 11 | PUT :deliver | 200 (DELIVERED) | Yes |

- **5 wasted calls** (3 failed POSTs + 1 unnecessary POST + 1 failed deliver)
- **4 avoidable 4xx errors**
- Created **orphan expense** 11150550 (OPEN state, not delivered) — potential scoring confound
- Even ignoring correctness issues, efficiency alone would have degraded the score

## 4. Likely Root Cause

### For correctness failures (checks 2, 3, 6):

The root cause remains **unknown** after this run. Key evidence:

1. **count=days-1 hypothesis did NOT help**: This run used count=3 (overnights = 4 days − 1). Previous runs used count=days. Both scored identically at 4.5/8 with the same checks failing. The trusted standard's days-1 rule did not produce a score improvement.

2. **Persistent pattern across ALL 18 T13 attempts**: best_score has never exceeded 1.125. Every attempt has the same 3 failing checks regardless of:
   - Per-diem count (days vs days-1)
   - rateType (25886 vs 25888)
   - destination/location presence or absence
   - Different employees, prompts, languages

3. **Possible root causes still unexplored**:
   - The per-diem `count` might need to be exactly `4` (the prompt says "4 dagar") — not days-1
   - The `rate` or `amount` calculation might be wrong — maybe the scorer expects the system rate (1012) instead of the prompt rate (800)
   - The `overnightAccommodation` value might be wrong — maybe `NONE` or another enum is expected
   - Some per-diem field combination might be incorrect that we haven't varied
   - The orphan OPEN expense (11150550) created in this run could confuse the scorer by presenting two travel expenses for the same employee
   - The `date` fields on travel details or costs might need to match a specific pattern

4. **What checks likely test** (inference from passed/failed pattern):
   - Check 1 (passed): Expense exists and is delivered for correct employee
   - Check 4 (passed): Flight cost line correct (6150, Fly category)
   - Check 5 (passed): Taxi cost line correct (750, Taxi category)
   - Checks 2, 3, 6 (failed): Per-diem related — count/rate/amount, rateType, or other per-diem fields

### For efficiency failures:

1. Agent used `costs[].description` (nonexistent) instead of `costs[].comments` — not documented in trusted standard at the time
2. Agent put `isDayTrip` on `perDiemCompensations` (nonexistent) instead of only on `travelDetails`
3. Agent omitted `perDiemCompensations[].location` (newly required at POST time)
4. Agent omitted `travelDetails.destination` (newly required at deliver time)
5. All 4 field errors were due to the trusted standard not documenting these requirements; the agent wrote from partial memory of the schema rather than strictly using the trusted standard's payload shape

## 5. What Went Right

1. **Per-diem count logic**: Correctly applied the days-1 (overnights) formula: 4 days → count=3
2. **rateType selection**: Used correct overnight rateType 25888/740 (not day-trip 25886)
3. **departureFrom resolution**: Correctly fell back to company address when employee had `address=null`, got "Oslo"
4. **Cost structure**: Both cost lines passed checks 4 and 5
5. **Final delivery**: Despite errors, the run eventually delivered the expense successfully
6. **Destination inference**: Correctly inferred "Trondheim" from trip title
7. **Rate lookup skipped**: Did not waste a call on `GET /travelExpense/rate` — used hardcoded IDs

## 6. What To Change Next Time

### Correctness investigation needed (highest priority):

1. **Stop assuming count=days-1 is correct** — it didn't improve the score vs count=days. Need sandbox experimentation with the scorer's actual expectations. Try count=4 (literal prompt days) in next T13 run.

2. **Investigate whether the prompt rate (800) vs system rate (1012) matters** — maybe the scorer expects `rate=1012` (the rateType's official rate) instead of the prompt's custom rate. The trusted standard says to use the prompt rate, but this has never produced a passing check 2/3/6.

3. **Investigate orphan expense impact** — this run created an orphan OPEN expense (11150550). If the scorer queries all travel expenses for the employee, the orphan could cause check failures. Future runs must not create orphan expenses.

4. **Systematically vary per-diem fields in sandbox** to find the combination that produces 6/6 checks.

### Efficiency fixes (already applied to trusted standard):

1. **Always include `travelDetails.destination`** — set to trip destination city
2. **Always include `perDiemCompensations[].location`** — set to per-diem location (same as destination)
3. **Never use `costs[].description`** — use `comments` only
4. **Never put `isDayTrip` on perDiemCompensations** — it belongs on `travelDetails` only
5. **Follow the playbook's winning payload shape exactly** — the playbook already had the correct field set (including `destination` and `location`) but the agent didn't read it because AGENTS.md says to read only the trusted standard for exact matches

### Process fix:

The trusted standard's payload rules must exactly match the playbook's winning payload shape. The two documents diverged: the playbook included `destination` and `location` in its example, but the trusted standard's payload rules didn't mention them as required. Since the agent reads only the trusted standard for exact matches, any field missing from the trusted standard will be omitted even if the playbook documents it.
