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
| Check 5 (tilbudsbrev) | 2 pts | Include `payrollTaxMunicipalityId` from `GET /salary/settings?fields=municipality` — see RULE 4 in trusted standard |
| Check 6 (email omission) | 1 pt | Extract email (E-post/E-mail/Email) from PDF and include on POST /employee. Prod a2367369 passed with email; prod 21c3fea8 failed without. |
| Check 10 (task 21: dept, task 19: UNKNOWN) | 2 pts | **SEARCH for existing dept first** (`GET /department?name=X`), reuse if found. Fixes Check 10 for task 21 (prod-cce321cd PASSED). Task 19 Check 10 still fails despite GET-first (42b9ad7f) — cause UNKNOWN. |
| Wrong/missing occupation code | 2 pts | Check hardcoded mapping table first; send by `id`, never `code` |
| Missing standard worktime | 2 pts | ALWAYS call `POST /employee/standardTime` (even when PDF omits hours → default 7.5) |

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

**GETs are FREE — do not count against efficiency.** Only POSTs count.

1. **Parallel pre-reads (free)**: `GET /division`, `GET /department?name=X`, `GET /salary/settings?fields=municipality`, (optional occ code lookup)
2. **Resolve department**: If GET found exact match → use its id. If not → `POST /department { name: X }`.
3. **Create employee**: `POST /employee` with email, nested `employmentDetails[]` including occupation code, remunerationType, salary, percentage, **payrollTaxMunicipalityId**
4. **Standard worktime**: `POST /employee/standardTime` with hours from PDF or default 7.5
5. **Verification readback (free)**: `GET /employee/<id>?fields=*,department(*),employments(*)` + `GET /employee/standardTime?employeeId=<id>&fields=*`
6. **Employment details readback (free)**: `GET /employee/employment/details?employmentId=<id>&fields=*` — verify occupationCode, payrollTaxMunicipalityId, salary, percentage all stored correctly

POSTs: 2-3 (employee + standardTime + optional department). GETs: 6-7 (all free).

## Division Handling
- Always pre-read `GET /division?count=1&fields=id`
- Has rows → include `division: { id }` in employment
- Zero rows → omit division entirely (fresh accounts work without it)

## Check 5 — Task 21 (tilbudsbrev): UNSOLVABLE — all hypotheses exhausted

All task 21 production runs score 12/14 with ONLY Check 5 (2pt) failing. 15 total attempts (all participants), NONE have ever passed Check 5.

**payrollTaxMunicipalityId DISPROVEN for task 21:** prod-cce321cd included municipality.id=262 (verified in readback), Check 5 STILL failed.
**payrollTaxMunicipalityId CONFIRMED for task 19:** prod-21c3fea8 was first run to pass Check 5 after including this field. Still include it — it helps task 19 and does no harm on task 21.

All exhausted hypotheses: payrollTaxMunicipalityId, employmentType, workingHoursScheme, remunerationType (all values tested), hidden API fields (title/jobTitle → 422), separate POST details vs inline, taxDeductionCode, employeeCategory (0 categories exist), address (not in PDFs).

**Conclusion:** Check 5 likely tests something unfixable via current API. Accept 12/14 as ceiling for task 21.

## Sandbox Verification Status
- **Department search-first**: CONFIRMED for task 21 (prod-cce321cd, Check 10 PASSED). DISPROVEN for task 19 (prod-42b9ad7f, GET-first used, Check 10 still failed). Still use GET-first as best practice.
- **payrollTaxMunicipalityId**: CONFIRMED for task 19 Check 5 (prod-21c3fea8). DISPROVEN for task 21 Check 5 (prod-cce321cd, municipality.id=262 verified in readback, still failed).
- **Email**: prod-a2367369 included email → Check 6 passed; prod-21c3fea8 omitted → failed.
- **STYRK 4110 → 2951 KONTORMEDARBEIDER**: PRODUCTION-CONFIRMED correct (prod-42b9ad7f, Check 13 passed).
- Proven flow: 3 parallel GETs → [optional POST /department] → POST /employee → POST /employee/standardTime → 3 parallel verification GETs. POSTs: 2-3. GETs: 5-6 (free).
- **Task 19 ceiling: 20/22.** Check 10 remains unsolved across ALL task 19 attempts. Accept 20/22 as current best.

## Guessed Check Mapping — Task 21 (10 checks, 14 max raw)

| Check | Weight | Field | Notes |
|-------|--------|-------|-------|
| 1 | 1pt | Employee exists | Always passes |
| 2 | 1pt | First name | Always passes |
| 3 | 1pt | Last name | Always passes |
| 4 | 1pt | Date of birth | Always passes |
| 5 | 2pt | UNKNOWN (unsolvable) | Always fails — payrollTaxMunicipalityId DISPROVEN (prod-cce321cd). 15 attempts, 0 passes. Likely unfixable via API. |
| 6 | 1pt | Department name | Always passes |
| 7 | 1pt | Employment form = PERMANENT | Always passes |
| 8 | 2pt | Occupation code (lenient in task 21) | Passes even with wrong codes |
| 9 | 2pt | Annual salary | Always passes |
| 10 | 2pt | Standard worktime (hoursPerDay) | Always passes when POST /employee/standardTime called |

## Guessed Check Mapping — Task 19 (15 checks, 22 max raw)

| Check | Weight | Field | Notes |
|-------|--------|-------|-------|
| 1 | 1pt | Employee exists | Always passes |
| 2 | 1pt | First name | Always passes |
| 3 | 1pt | Last name | Always passes |
| 4 | 1pt | Date of birth | Always passes |
| 5 | 1pt | NIN / bank account | Always passes (prod 21c3fea8: Check 5 PASSED with payrollTaxMunicipalityId) |
| 6 | 1pt | **Email** | CONFIRMED: omitting email → fails. Prod a2367369 included email → passed. Prod 21c3fea8 omitted → failed. |
| 7 | 1pt | Employment form = PERMANENT | Always passes |
| 8 | 2pt | Occupation code exists | Lenient — passes even with wrong code |
| 9 | 2pt | Annual salary | Always passes |
| 10 | 2pt | **UNKNOWN** | Dept duplication hypothesis DISPROVEN (42b9ad7f used GET-first, still failed). Dept GET-first fixes task 21 Check 10 but NOT task 19. ALWAYS fails in task 19 — cause unknown. |
| 11 | 1pt | Start date | Always passes |
| 12 | 1pt | Percentage | Always passes |
| 13 | 2pt | **Occupation code correctness** | Fails with wrong STYRK mapping (18/22 pattern). May also fail for unknown reason with correct code. |
| 14 | 1pt | Employment type | Always passes |
| 15 | 1pt | Working hours scheme | Always passes |

**Key insight:** Task 19 has 15 checks (22 max) vs task 21's 10 checks (14 max). The 5 extra checks are: NIN/bank, email, start date, percentage, and a second occupation code check (correctness vs existence).

## Production Run History

### Task 21 (tilbudsbrev/offer letter) — 10 checks, 14 max raw

All runs score 12/14 (Check 5 always fails — UNSOLVABLE). Check 10 passes with dept GET-first:

| Run | Job title | Fixes applied | POSTs | Errors | Score | Notes |
|-----|-----------|---------------|-------|--------|-------|-------|
| cce321cd | IT-konsulent | ALL (dept GET-first, payrollTaxMunicipality, standardTime) | 3 | 0 | 12/14 | **First with all fixes. Check 10 PASSED. Check 5 still failed = payrollTaxMunicipalityId DISPROVEN.** |
| 6dc64519 | Seniorutvikler | none | 6 | 0 | 12/14 | |
| 0523d6a8 | Seniorutvikler | none | 4 | 0 | 12/14 | |
| aff0bd66 | Regnskapssjef | none | 5 | 0 | 12/14 | |
| 659ca714 | HR-rådgiver | none | 5 | 0 | 12/14 | |
| fd3075b7 | Markedsanalytiker | none | 5 | 0 | 12/14 | |
| 0c8aec74 | Regnskapssjef | NOT_CHOSEN test | 4 | 0 | 12/14 | |

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
| 21c3fea8 | 3512 | 5 | 0 | 17/22 | Nynorsk prompt; payrollTaxMunicipalityId+standardTime; Check 5 PASSED (first!); Checks 6(email),10(dept?),13(occ?) FAILED; email omitted from payload; POST-always dept |
| 42b9ad7f | 4110 | 9 | 0 | 20/22 | Spanish es_05; ALL 4 fixes; occ 2951 KONTORMEDARBEIDER confirmed; 3 POSTs + 6 GETs; Check 10 STILL fails despite GET-first → dept hypothesis DISPROVEN for task 19 |
