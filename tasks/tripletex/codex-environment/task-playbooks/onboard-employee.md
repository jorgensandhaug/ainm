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
| Check 5 (tilbudsbrev only) | 2 pts | TESTING FIX: use employmentType+workingHoursScheme=NOT_CHOSEN for tilbudsbrev — see trusted standard RULE 4 |
| Missing standard worktime | 2 pts | ALWAYS call `POST /employee/standardTime` (even when PDF omits hours → default 7.5) |
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

### Known WRONG mappings (failed in production):
- STYRK 3323 → ~~INNKJØPER (2503)~~ — 2 runs failed; use INNKJØPSASSISTENT (2507)
- STYRK 3313 → ~~REGNSKAPSFØRER (4672)~~ — 2 runs scored 18/22; use REGNSKAPSMEDARBEIDER (4677)
- Seniorutvikler → ~~DRIFTSUTVIKLER (1173)~~ — wrong field; use SYSTEMUTVIKLER (5935)
- Regnskapssjef → ~~KONSERNREGNSKAPSSJEF (2881)~~ — substring trap; use REGNSKAPSSJEF (4679)

### Dynamic Lookup Pitfalls
- `nameNO` filter is substring-containing + alphabetically sorted → `count=1` returns wrong result
- Always use `count=10&fields=id,nameNO` and pick the EXACT match, not the first result
- `nameNO=seniorutvikler` → 0 results; `nameNO=HR-rådgiver` → 0 results
- `code=<4-digit-STYRK>` → substring match, returns unrelated codes
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

## Check 5 — TESTING FIX (task 21 tilbudsbrev only)

All 7 task 21 production runs using ORDINARY/NOT_SHIFT scored 12/14 with ONLY Check 5 (2pt) failing. Fix now applied in trusted standard RULE 4:
- **Tilbudsbrev:** use `employmentType: "NOT_CHOSEN"` + `workingHoursScheme: "NOT_CHOSEN"`
- **Arbeidskontrakt:** keep `employmentType: "ORDINARY"` + `workingHoursScheme: "NOT_SHIFT"`
- Sandbox-verified 2026-03-22: both NOT_CHOSEN values accepted and stored correctly
- Zero-risk change: same call count, no error potential, potential +2pt upside

Eliminated hypotheses:
- remunerationType=NOT_CHOSEN: tested in prod-fd3075b7, same 12/14 score

## Sandbox Verification Status
- E2E verified 2026-03-22: production-faithful scenarios pass sandbox assertions, 4 calls, 0 errors
- NOT_CHOSEN hypothesis sandbox-verified 2026-03-22 (emp IDs 18731580, 18731581, 18731586)
- All 11 hardcoded occupation code mappings verified correct in sandbox 2026-03-22
- 7 total task 21 production runs; all score 12/14 with 4-6 calls, 0 errors

## Guessed Check Mapping (10 checks, 14 max raw)

| Check | Weight | Field | Notes |
|-------|--------|-------|-------|
| 1 | 1pt | Employee exists | Always passes |
| 2 | 1pt | First name | Always passes |
| 3 | 1pt | Last name | Always passes |
| 4 | 1pt | Date of birth | Always passes |
| 5 | 2pt | UNKNOWN | Always fails — see "Check 5 UNSOLVED" above |
| 6 | 1pt | Department name | Always passes |
| 7 | 1pt | Employment form = PERMANENT | Always passes |
| 8 | 2pt | Occupation code | Fails when wrong code used |
| 9 | 2pt | Annual salary | Always passes |
| 10 | 2pt | Standard worktime (hoursPerDay) | Fails when wrong endpoint or omitted |

## Production Run History

### Task 21 (tilbudsbrev/offer letter) — 10 checks, 14 max raw

All runs score 12/14 (Check 5 fails — root cause unknown):

| Run | Job title | remType | Calls | Errors | Score | Notes |
|-----|-----------|---------|-------|--------|-------|-------|
| 6dc64519 | Seniorutvikler | MONTHLY_WAGE | 6 | 0 | 12/14 | Wrong occ code (DRIFTSUTVIKLER) but Check 8 passed |
| 0523d6a8 | Seniorutvikler | MONTHLY_WAGE | 4 | 0 | 12/14 | Correct occ code (SYSTEMUTVIKLER) |
| aff0bd66 | Regnskapssjef | MONTHLY_WAGE | 5 | 0 | 12/14 | Wrong occ code (KONSERNREGNSKAPSSJEF) but Check 8 passed |
| 659ca714 | HR-rådgiver | MONTHLY_WAGE | 5 | 0 | 12/14 | Correct occ code (PERSONALRÅDGIVER) |
| fd3075b7 | Markedsanalytiker | NOT_CHOSEN | 5 | 0 | 12/14 | Dynamic lookup (3544); 80%, 780000, 6.0hrs; Spanish prompt |
| e5113aee | Regnskapssjef | MONTHLY_WAGE | 4 | 0 | ?/14 | Hardcoded occ (4679); 100%, 810000, 7.5hrs; German prompt; uses ORDINARY/NOT_SHIFT (pre-fix) |

### Task 19 (arbeidskontrakt/contract) — 15 checks, 22 max raw

Selected runs showing occupation code findings:

| Run | STYRK | Calls | Errors | Score | Notes |
|-----|-------|-------|--------|-------|-------|
| (9th) | 3313 | 4 | 0 | 18/22 | REGNSKAPSFØRER (4672) → wrong; checks 10,13 fail |
| (10th) | 3313 | 3 | 0 | 18/22 | Same wrong code confirmed; corrected to REGNSKAPSMEDARBEIDER (4677) |
| (14th) | 3323 | 3 | 0 | ? | Used INNKJØPER (2503); corrected to INNKJØPSASSISTENT (2507) |
| (15th) | 3512 | 5 | 0 | ? | First encounter; dynamic lookup found BRUKERSTØTTE IKT (752) |
| (17th) | HR-rådgiver | 4 | 0 | ? | First hardcoded HR-rådgiver (4169); saved 1 call |
