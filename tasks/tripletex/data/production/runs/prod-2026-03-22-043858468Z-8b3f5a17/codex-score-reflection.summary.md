# Score Reflection — prod-2026-03-22-043858468Z-8b3f5a17

## 1. Task Attribution

- **Task ID**: 19 (arbeidskontrakt / employment contract)
- **Tier**: T3 (max 6 normalized)
- **Raw max**: 22 (15 checks)
- **Prompt language**: German
- **Key details**: STYRK 1211, Maximilian Fischer, 530000 kr, 100%, Kvalitetskontroll dept, start 2026-08-20

## 2. Correctness Verdict

**NOT PERFECT.** 18/22 raw, correctness = 0.8182, normalized = 2.4545.

- 13/15 checks passed, 2 failed: **Check 10** and **Check 13**.
- Prior leaderboard best for task 19: 2.7273 (= 20/22, 1 check failed).
- This run did NOT improve the leaderboard best.

Check results:
```
Checks 1-9:  passed
Check 10:    FAILED
Checks 11-12: passed
Check 13:    FAILED
Checks 14-15: passed
```

## 3. Efficiency Verdict

**NOT EFFICIENT.** 8 API calls instead of optimal 4-5. Wasted calls:

| # | Call | Verdict |
|---|------|---------|
| 1 | GET /division?count=1&fields=id | Needed, but duplicated in 2nd attempt |
| 2 | POST /department { name: "Kvalitetskontroll" } | Needed, succeeded |
| 3 | GET /employee/employment/occupationCode?code=1211&count=50 | **WASTED** — `code=` is substring match across 7-digit internal codes, returned 50 unrelated results, zero starting with "1211" |
| 4 | GET /division?count=1&fields=id | **DUPLICATE** — already fetched in call 1 |
| 5 | GET /department?name=Kvalitetskontroll&count=1&fields=id | **EXTRA** — only needed because script was rewritten after call 3 failed; could have reused POST result from call 2 |
| 6 | GET /occupationCode?nameNO=finanssjef&count=10 | Needed (dynamic lookup for unknown STYRK code) |
| 7 | POST /employee | Needed |
| 8 | POST /employee/standardTime | Needed |

**Wasted calls: 3** (calls 3, 4, 5). Optimal path for this task would have been 5 calls: GET /division + POST /department + GET /occupationCode?nameNO=... (parallel) → POST /employee → POST /employee/standardTime.

## 4. Likely Root Cause

### Check 13 — Wrong occupation code (FINANSSJEF is likely WRONG for STYRK 1211)

The 18/22 pattern with checks 10+13 failing is the **exact same pattern** from prior task 19 runs that used the wrong occupation code:
- Prior runs with STYRK 3313 → REGNSKAPSFØRER (4672, wrong) scored 18/22, checks 10,13 failed.
- Corrected mapping: REGNSKAPSMEDARBEIDER (4677) → expected to pass Check 13.

This run used FINANSSJEF (id 1577, Tripletex code 1226119) for STYRK 1211. Given the identical failure pattern, **FINANSSJEF is almost certainly the wrong occupation code**.

STYRK 1211 in STYRK-08 = "Finanssjefer" (Finance managers). But Tripletex uses internal 7-digit codes based on STYRK-98. No Tripletex codes start with "1211" (confirmed via sandbox search of 200+ codes). The name "FINANSSJEF" seemed like a semantic match but the failure pattern proves it wrong.

**The correct mapping is unknown.** Candidates to investigate:
- ØKONOMISJEF (id 6538, code 1231130) — "Finans- og økonomisjef" includes both "finans" and "økonomi"
- FINANSDIREKTØR (id 1567, code 1226112) — different level but similar domain
- Some other code that maps to STYRK-08 1211 through a STYRK-98 crosswalk

### Check 10 — Unknown field

The prior best run (a2367369, 20/22) had Check 10 as its only failure, attributed to "missing standardTime". Our run DID call POST /employee/standardTime (201 success) yet Check 10 still failed. Possible explanations:
1. Check 10 is NOT about standardTime for task 19 (the check mapping differs from task 21's mapping)
2. Check 10 is about a field that has never been correctly set in any task 19 run (no run has ever scored 22/22)
3. Check 10 could be about: employeeNumber (auto vs explicit from PDF "Personalnummer"), email format, NIN validation, or bank account

**Important**: The German prompt says "Personalnummer" — this could mean the PDF contains an explicit employee number that should be set via the `employeeNumber` field. If the PDF has a personnel number and we didn't set it, that could be Check 10.

## 5. What Went Right

1. **Correct document classification**: Correctly identified as ARBEIDSKONTRAKT (not tilbudsbrev), used ORDINARY/NOT_SHIFT.
2. **All identity fields correct**: First name, last name, DOB, NIN, bank account, department — checks 1-9 all passed.
3. **StandardTime called**: POST /employee/standardTime succeeded (201).
4. **Zero 4xx errors**: All 8 calls returned 200/201.
5. **Correct payload structure**: department as top-level field, division included, employmentDetails nested correctly.

## 6. What To Change Next Time

### Critical — Fix before next STYRK 1211 run

1. **REMOVE FINANSSJEF (1577) from the hardcoded occupation code table** for STYRK 1211 — it is wrong (Check 13 fails). The entry was added during the prior reflection but is incorrect.
2. **Investigate the correct STYRK 1211 mapping** in the sandbox:
   - Try ØKONOMISJEF (6538) and other candidates
   - Search more broadly: `nameNO=finans%C3%B8konomi`, variations on "finans- og økonomisjef"
   - The correct code likely has a Tripletex internal code that maps through STYRK-98 → STYRK-08 crosswalk to 1211
3. **Investigate Check 10 root cause**: Check if the PDF contains an explicit "Personalnummer" (employee number) that should be set via the `employeeNumber` field on POST /employee. The German prompt explicitly mentions "Personalnummer" as one of the details to create.

### Efficiency improvements

4. **Never use `code=` for occupation code lookups** — it's a substring match on 7-digit internal codes, not STYRK-08 codes. Always use `nameNO=`.
5. **Write the script correctly the first time** — the failed first attempt wasted 3 calls (duplicate division GET, wasted code search, forced department re-fetch).
6. **When occupation code lookup fails, don't rewrite the entire script** — just fix the occupation code search and continue from the existing state (department already created, division already known).

### For unknown STYRK codes (not in hardcoded table)

7. **Translate the 4-digit STYRK-08 code to its Norwegian name** using domain knowledge, then search by `nameNO=<name>`. Do NOT try `code=<4-digit>`.
8. **If the first nameNO search returns a plausible but unverified match**, consider that it might be wrong. The occupation code is a high-stakes field (2pt per check) — a wrong guess costs more than an extra lookup call.
9. **After this run's score is processed**, the STYRK 1211 hardcoded entry should be corrected or removed until the right mapping is proven in production.
