# Score-Aware Reflection: prod-a816e2a4

## Task Attribution

- **Attributed task**: Task 19 (arbeidskontrakt / onboard employee)
- **Inference status**: ambiguous (3 candidates), but leaderboard diff confirms task 19 got +1 attempt at 11:20:42, matching this run's completion time
- **Prompt language**: Spanish (es_03)
- **Employee**: Isabel García, STYRK 3313, dept Kundeservice, salary 640000, 80%, start 2026-07-13

## Correctness Verdict

**NOT PERFECT.** Score: **18/22 raw** (normalized 2.4545 out of max 6).

- 2/15 checks failed: **Check 10** and **Check 13**
- Check 10: always fails across ALL task 19 runs — cause unknown, accepted as ceiling limitation
- **Check 13: occupation code correctness — STYRK 3313 → 4677 (REGNSKAPSMEDARBEIDER) is WRONG**

This run scored BELOW the leaderboard best (2.7273 = 20/22 from prod-42b9ad7f, which used STYRK 4110→2951 and passed Check 13). The best_score did not change.

## Efficiency Verdict

**Execution was optimal** — 3 POSTs, 6 GETs, 0 errors. No wasted calls. The issue is purely a correctness problem with the occupation code mapping, not efficiency.

- Step 1: 3 parallel GETs (division, department, salary/settings) — all free
- Step 2: 1 POST /department (Kundeservice, no pre-existing match) — correct
- Step 3: 1 POST /employee — 201, 0 errors
- Step 4: 1 POST /employee/standardTime — 201, 0 errors
- Step 5: 3 parallel verification GETs — all free, confirmed correct fields

## Likely Root Cause

**The hardcoded occupation code mapping for STYRK 3313 is wrong.** Two different codes have now been tested in production, and BOTH fail Check 13:

| Run | STYRK | Occupation code used | Check 13 | Score |
|-----|-------|---------------------|----------|-------|
| 9th, 10th | 3313 | 4672 REGNSKAPSFØRER | FAILED | 18/22 |
| a816e2a4 | 3313 | 4677 REGNSKAPSMEDARBEIDER | FAILED | 18/22 |
| 42b9ad7f | 4110 | 2951 KONTORMEDARBEIDER | PASSED | 20/22 |

The assumption that "4672 failed → must be 4677" was untested speculation. This run proves 4677 is also wrong.

**The correct mapping for STYRK 3313 must be a THIRD occupation code.** STYRK-08 3313 = "Regnskapsmedarbeidere" (accounting clerks). Possible candidates to investigate in sandbox:
- BOKHOLDER / BOKHOLDERSKE (bookkeeper — a common synonym for "regnskapsmedarbeider")
- REGNSKAPSASSISTENT
- REVISORASSISTENT
- REGNSKAPSKONSULENT
- Other "regnskap*" variants in Tripletex's occupation code list

**Action needed**: Sandbox lookup of `GET /employee/employment/occupationCode?nameNO=regnskap&count=50&fields=id,nameNO,code` to enumerate ALL regnskap-related codes and identify which one Tripletex maps to STYRK 3313.

## What Went Right

1. **Flawless execution flow**: 3 POSTs, 0 errors, all fields correctly set per readback
2. **All identity fields correct**: name, DOB, NIN, bank account, email — checks 1-9, 11-12, 14-15 all passed
3. **payrollTaxMunicipalityId included**: Check 5 passed (confirmed for task 19)
4. **Email extracted from PDF**: Check 6 passed
5. **standardTime set**: Check 15 passed
6. **employeeNumber/employmentId="1"** included (RULE 5)
7. **Department search-first** used correctly (no match → created new)
8. **Deep expansion sandbox finding**: discovered `employments(*,employmentDetails(*))` works on POST (useful for future runs)
9. **Response shape bug identified**: `.values[0]` vs `.value` for list endpoints documented

## What To Change Next Time

1. **CRITICAL: Fix STYRK 3313 mapping.** Before the next production run, investigate in sandbox which occupation code is correct for STYRK 3313. The hardcoded table entry `4677 REGNSKAPSMEDARBEIDER` must be updated. Enumerate all `regnskap*` codes and test candidates.

2. **Add STYRK 3313 → 4677 to the "Wrong mappings" table.** Both 4672 and 4677 are now confirmed wrong for this STYRK code.

3. **Consider that Check 13 may require exact STYRK-internal-code matching**, not just a semantically similar occupation name. The Tripletex occupation code API may have multiple codes for "regnskapsmedarbeider" variants, and only one specific internal code maps to STYRK-08 3313.

4. **Use deep expansion `employments(*,employmentDetails(*))` on POST /employee** to get full details inline and avoid the `.values[0]` vs `.value` response shape bug that caused false verification warnings in this run.

5. **Check 10 remains unsolved** for task 19. This is a separate issue from Check 13. Even with the correct occupation code, task 19's ceiling would be 20/22 until Check 10's root cause is found.
