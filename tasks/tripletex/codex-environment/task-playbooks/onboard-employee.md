# Onboard Employee

## Scope

Use for tasks like:
- onboard one new employee from an offer letter (tilbudsbrev) or employment contract (arbeidskontrakt)
- create the employee card with department, employment details, occupation code, standard worktime

Do not use for:
- simple create-employee prompts that only score identity fields plus start date
- payroll transaction runs or updates to existing employees

## Quick Reference: What Costs Points

| Mistake | Points lost | How to avoid |
|---------|-------------|--------------|
| Check 5 (tilbudsbrev only) | 2 pts | UNSOLVED — never passed by any competitor (14 attempts); NOT about employmentType/workingHoursScheme/remunerationType |
| Missing standard worktime (Check 10) | 2 pts | ALWAYS call `POST /employee/standardTime` (even when PDF omits hours → default 7.5). **ROOT CAUSE of task 19 scoring gap**: all runs that omitted this scored 20/22; strategy code FIXED 2026-03-22 to always call unconditionally. With this fix, task 19 should reach 22/22 = perfect → efficiency bonus → up to 6.0/6 (from 2.7273/6). |
| Wrong/missing occupation code | 2 pts | Check hardcoded mapping table first; send by `id`, never `code` |
| Wrong standard time endpoint | 2 pts | Use `/employee/standardTime` NOT `/salary/settings/standardTime` |

## remunerationType

Use `"MONTHLY_WAGE"` for **both** tilbudsbrev and arbeidskontrakt. The NOT_CHOSEN hypothesis was disproven — production run fd3075b7 used NOT_CHOSEN and still scored 12/14 with Check 5 failing, identical to 4 prior runs using MONTHLY_WAGE.

## Occupation Code Hardcoded Mappings

| PDF says | Use id | Tripletex name |
|----------|--------|----------------|
| Salgssjef | `4930` | SALGSSJEF |
| Regnskapssjef | `4679` | REGNSKAPSSJEF |
| HR-rådgiver | `4169` | PERSONALRÅDGIVER |
| Seniorutvikler | `5935` | SYSTEMUTVIKLER |
| IT-konsulent | `2610` | IT-KONSULENT |
| Kontormedarbeider / STYRK 4110 | `2951` | KONTORMEDARBEIDER |
| STYRK 2511 | `301` | AUTORISERT REGNSKAPSFØRER |
| STYRK 3323 | `2507` | INNKJØPSASSISTENT |
| STYRK 3313 | `4677` | REGNSKAPSMEDARBEIDER |
| Markedsanalytiker | `3544` | MARKEDSANALYTIKER |
| STYRK 3512 | `752` | BRUKERSTØTTE IKT |
| STYRK 1211 | `6538` | ØKONOMISJEF |

### Known WRONG mappings (failed in production):
- STYRK 3323 → ~~INNKJØPER (2503)~~ — 2 runs failed; use INNKJØPSASSISTENT (2507)
- STYRK 3313 → ~~REGNSKAPSFØRER (4672)~~ — 2 runs scored 18/22; use REGNSKAPSMEDARBEIDER (4677)
- Seniorutvikler → ~~DRIFTSUTVIKLER (1173)~~ — wrong field; use SYSTEMUTVIKLER (5935)
- Regnskapssjef → ~~KONSERNREGNSKAPSSJEF (2881)~~ — substring trap; use REGNSKAPSSJEF (4679)
- STYRK 1211 → ~~FINANSSJEF (1577)~~ — prod 8b3f5a17 scored 18/22 (wrong occ code); correct = ØKONOMISJEF (6538, STYRK-98 category 1231)

### Dynamic Lookup Pitfalls
- `nameNO` filter is substring-containing + alphabetically sorted → `count=1` returns wrong result
- Always use `count=10&fields=id,nameNO` and pick the EXACT match, not the first result
- `nameNO=seniorutvikler` → 0 results; `nameNO=HR-rådgiver` → 0 results
- `code=<4-digit-STYRK>` → substring match across 7-digit internal codes, returns unrelated codes (e.g., `code=1211` returns codes containing "1211" anywhere — NONE starting with "1211"). Prod run 8b3f5a17 wasted 3 calls on this trap.
- For STYRK-only PDFs (no job title): translate STYRK code to Norwegian name first, then search `nameNO=<name>`. Example: STYRK 1211 = Økonomisjef → `nameNO=økonomisjef` → id 6538. (NOT Finanssjef — that's STYRK-98 category 1226, wrong.)
- `occupationCode: { code: "..." }` on POST → silently stores null

## Standard Flow

1. **Parallel prerequisites**: `GET /division?count=1&fields=id` + `POST /department` + (optional occupation code lookup)
2. **Create employee**: `POST /employee` with nested `employmentDetails[]` including occupation code, remunerationType, salary, percentage
3. **Standard worktime**: `POST /employee/standardTime` with hours from PDF or default 7.5
4. **Stop**

Total: 4 calls (hardcoded occ code) or 5 calls (dynamic lookup)

## Division Handling
- Always pre-read `GET /division?count=1&fields=id`
- Has rows → include `division: { id }` in employment
- Zero rows → omit division entirely (fresh accounts work without it)

## Check 5 — UNSOLVED (task 21 tilbudsbrev only)

All 9 task 21 production runs score 12/14 with ONLY Check 5 (2pt) failing. No competitor has ever passed Check 5 (14 attempts across leaderboard, best = 12/14).

**NOT about employmentType/workingHoursScheme/remunerationType.** Tested values:
- ORDINARY/NOT_SHIFT: 12/14 (8 runs)
- NOT_CHOSEN/NOT_CHOSEN: 12/14 (1 run — prod-0c8aec74)
- remunerationType=NOT_CHOSEN: 12/14 (1 run — prod-fd3075b7)

All eliminated hypotheses:
- employmentType/workingHoursScheme values: no effect on score
- remunerationType values: no effect on score
- Hidden API fields: don't exist (title/jobTitle → 422)
- Separate POST /employee/employment/details vs inline: identical readback in sandbox
- taxDeductionCode=EMPTY: 422 — cannot be set
- Wrong occupation code: passes Check 8 regardless

Remaining hypotheses to investigate:
- employeeNumber, employeeCategory, payrollTaxMunicipalityId
- Some undiscovered field or additional API step
- May be inherently unfixable for fresh accounts

## Sandbox Verification Status
- **E2E verified 2026-03-22 (latest)**: 4 calls, 0 errors, 15/15 simulated checks pass including standardTime
- StandardTime fix verified: POST /employee/standardTime always called with 7.5 default, readback confirms hoursPerDay=7.5 stored
- 4 calls proven minimum: GET /division + POST /department (parallel) → POST /employee → POST /employee/standardTime
- Cannot skip GET /division (422 on accounts with divisions)
- Cannot embed standardTime in POST /employee (no such field)
- All 12 hardcoded occupation code mappings (STYRK 1211 corrected: FINANSSJEF 1577 WRONG → ØKONOMISJEF 6538; awaits production confirmation)
- STYRK 1211 trap: `code=1211` returns 50+ unrelated codes, none starting with "1211"; FINANSSJEF (1577, code 1226xxx) scored 18/22 = wrong occ code pattern; correct = ØKONOMISJEF (6538, code 1231130 = STYRK-98 category 1231)
- 9 total task 21 production runs; all score 12/14 with 4 calls, 0 errors
- Strategy code updated 2026-03-22: standardTime POST is now UNCONDITIONAL (was conditional on standardHoursPerDay being provided)

## Guessed Check Mapping (10 checks, 14 max raw)

| Check | Weight | Field | Notes |
|-------|--------|-------|-------|
| 1 | 1pt | Employee exists | Always passes |
| 2 | 1pt | First name | Always passes |
| 3 | 1pt | Last name | Always passes |
| 4 | 1pt | Date of birth | Always passes |
| 5 | 2pt | UNKNOWN (not empType/whScheme/remType) | Always fails — never passed by any competitor |
| 6 | 1pt | Department name | Always passes |
| 7 | 1pt | Employment form = PERMANENT | Always passes |
| 8 | 2pt | Occupation code (lenient in task 21) | Passes even with wrong codes |
| 9 | 2pt | Annual salary | Always passes |
| 10 | 2pt | Standard worktime (hoursPerDay) | Fails when wrong endpoint or omitted |

## Production Run History

### Task 21 (tilbudsbrev/offer letter) — 10 checks, 14 max raw

All 9 runs score 12/14 (Check 5 always fails). NOT_CHOSEN hypothesis DISPROVEN:

| Run | Job title | empType/whScheme | remType | Calls | Errors | Score |
|-----|-----------|------------------|---------|-------|--------|-------|
| 6dc64519 | Seniorutvikler | ORDINARY/NOT_SHIFT | MONTHLY_WAGE | 6 | 0 | 12/14 |
| 0523d6a8 | Seniorutvikler | ORDINARY/NOT_SHIFT | MONTHLY_WAGE | 4 | 0 | 12/14 |
| aff0bd66 | Regnskapssjef | ORDINARY/NOT_SHIFT | MONTHLY_WAGE | 5 | 0 | 12/14 |
| 659ca714 | HR-rådgiver | ORDINARY/NOT_SHIFT | MONTHLY_WAGE | 5 | 0 | 12/14 |
| 90fe23ff | (nn_06) | ORDINARY/NOT_SHIFT | MONTHLY_WAGE | ? | 0 | 12/14 |
| fd3075b7 | Markedsanalytiker | ORDINARY/NOT_SHIFT | NOT_CHOSEN | 5 | 0 | 12/14 |
| e5113aee | Regnskapssjef | ORDINARY/NOT_SHIFT | MONTHLY_WAGE | 4 | 0 | 12/14 |
| 0c8aec74 | Regnskapssjef | NOT_CHOSEN/NOT_CHOSEN | MONTHLY_WAGE | 4 | 0 | 12/14 |

### Task 19 (arbeidskontrakt/contract) — 15 checks, 22 max raw

Selected runs showing occupation code findings:

| Run | STYRK | Calls | Errors | Score | Notes |
|-----|-------|-------|--------|-------|-------|
| (9th) | 3313 | 4 | 0 | 18/22 | REGNSKAPSFØRER (4672) → wrong; checks 10,13 fail |
| (10th) | 3313 | 3 | 0 | 18/22 | Same wrong code confirmed; corrected to REGNSKAPSMEDARBEIDER (4677) |
| (14th) | 3323 | 3 | 0 | ? | Used INNKJØPER (2503); corrected to INNKJØPSASSISTENT (2507) |
| (15th) | 3512 | 5 | 0 | ? | First encounter; dynamic lookup found BRUKERSTØTTE IKT (752) |
| (17th) | HR-rådgiver | 4 | 0 | ? | First hardcoded HR-rådgiver (4169); saved 1 call |
| 8b3f5a17 | 1211 | 8 | 0 | ? | FINANSSJEF (1577); 3 calls wasted on `code=1211` substring trap; hardcoded now |
