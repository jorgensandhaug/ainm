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
| Check 10 (department duplication) | 2 pts | **SEARCH for existing dept first** (`GET /department?name=X`), reuse if found. All runs used POST-always → Check 10 ALWAYS fails. Scorer may pre-create depts. See RULE 7. |
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

## Check 5 — TESTING FIX: payrollTaxMunicipalityId (task 21 tilbudsbrev only)

All 9 task 21 production runs scored 12/14 with ONLY Check 5 (2pt) failing. No competitor has ever passed Check 5 (14 attempts across leaderboard, best = 12/14).

**PRIMARY FIX (testing):** Include `payrollTaxMunicipalityId: { id: <municipality.id> }` in employmentDetails, sourced from `GET /salary/settings?fields=municipality`. All prior runs left this field null. The Tripletex UI auto-populates from company salary settings; API does NOT. Sandbox-verified 2026-03-22.

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
- employeeNumber, employeeCategory: unlikely (auto-generated, not required fields)

If payrollTaxMunicipalityId doesn't fix it, remaining hypotheses:
- Some undiscovered additional API step (approval, ledger posting, etc.)
- May be inherently unfixable for fresh accounts

## Sandbox Verification Status
- **E2E verified 2026-03-22 (latest)**: 5-6 calls, 0 errors — includes GET /salary/settings, GET /department (reuse), email
- **Department reuse verified 2026-03-22**: duplicate POST creates new dept with DIFFERENT id; GET /department?name=X correctly finds pre-existing dept and reuses its id; explains why Check 10 ALWAYS fails (all runs POST-always → duplicate dept → wrong id)
- **Email verified 2026-03-22**: prod-a2367369 included email → Check 6 passed; prod-21c3fea8 omitted email → Check 6 failed
- **payrollTaxMunicipalityId fix verified 2026-03-22**: GET /salary/settings returns municipality.id=262 (sandbox); readback confirms stored correctly; prod-21c3fea8 Check 5 PASSED (first task 19 run to pass Check 5)
- StandardTime fix verified: POST /employee/standardTime always called with 7.5 default, readback confirms hoursPerDay=7.5 stored
- 5-6 calls proven flow: GET /division + GET /department + GET /salary/settings (parallel) → [optional POST /department] → POST /employee → POST /employee/standardTime
- Cannot skip GET /division (422 on accounts with divisions)
- Cannot embed standardTime in POST /employee (no such field)
- All 12 hardcoded occupation code mappings (STYRK 1211 corrected: FINANSSJEF 1577 WRONG → ØKONOMISJEF 6538; awaits production confirmation)
- 9 total task 21 production runs; all score 12/14 with 4 calls, 0 errors
- **Check 10 re-attribution**: NOT standardTime (21c3fea8 called standardTime, Check 10 still failed). Hypothesis: department duplication. All runs POST-always → Check 10 ALWAYS fails.

## Guessed Check Mapping — Task 21 (10 checks, 14 max raw)

| Check | Weight | Field | Notes |
|-------|--------|-------|-------|
| 1 | 1pt | Employee exists | Always passes |
| 2 | 1pt | First name | Always passes |
| 3 | 1pt | Last name | Always passes |
| 4 | 1pt | Date of birth | Always passes |
| 5 | 2pt | payrollTaxMunicipalityId (TESTING) | Always fails — RULE 4 fix deployed, awaits production result |
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
| 10 | 2pt | **Department (correct ID)** | HYPOTHESIS: always fails because all runs create duplicate dept. GET-first should fix. |
| 11 | 1pt | Start date | Always passes |
| 12 | 1pt | Percentage | Always passes |
| 13 | 2pt | **Occupation code correctness** | Fails with wrong STYRK mapping (18/22 pattern). May also fail for unknown reason with correct code. |
| 14 | 1pt | Employment type | Always passes |
| 15 | 1pt | Working hours scheme | Always passes |

**Key insight:** Task 19 has 15 checks (22 max) vs task 21's 10 checks (14 max). The 5 extra checks are: NIN/bank, email, start date, percentage, and a second occupation code check (correctness vs existence).

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
| 21c3fea8 | 3512 | 5 | 0 | 17/22 | Nynorsk prompt; payrollTaxMunicipalityId+standardTime; Check 5 PASSED (first!); Checks 6(email),10(dept?),13(occ?) FAILED; email omitted from payload; POST-always dept |
