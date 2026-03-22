# Task 21 — Onboard Employee from Offer Letter (NOT Correct Ledger Errors)

Research memory for task 21. Updated 2026-03-22 after deep production trace analysis.

## CRITICAL FINDING: Task Identity Mismatch

**Production tx_task_id=21 is "Onboard employee from offer letter" NOT "Correct ledger errors".**

The tripletex2 codebase has task 21 mapped to "Correct ledger errors" (`correct-ledger-errors.ts`), but
the production scoring system assigns tx_task_id=21 to employee-onboarding-from-offer-letter prompts.
Evidence:

- All 5 production runs with tx_task_id=21 (March 21, 2026) have prompt patterns like
  "Vous avez recu une lettre d'offre", "Sie haben ein Angebotsschreiben erhalten",
  "Du har motteke eit tilbodsbrev" -- all employee onboarding from a PDF offer letter.
- All 5 runs attach a `tilbudsbrev_*.pdf` (offer letter in Norwegian) with employee data.
- Scoring rubric: 10 checks, 14 max raw score (distinct from task 19 which has 15 checks, 22 max).
- The correct-ledger-errors implementation in this directory is for a completely different task.
- Task 24 in the codebase ALSO has "correct-ledger-errors" -- task 24 may be the actual ledger errors task.
- Task 19 is the CONTRACT-based onboarding (with STYRK codes, sometimes nationalIdentityNumber/bankAccountNumber).

### Task 21 vs Task 19 Comparison

| Aspect | Task 19 (contract) | Task 21 (offer letter) |
|--------|-------------------|----------------------|
| PDF type | Arbeidskontrakt (employment contract) | Tilbudsbrev (offer letter) |
| Occupation source | STYRK code (e.g. 4110, 3323, 2511) | Job title (e.g. Seniorutvikler, Regnskapssjef) |
| Extra fields | nationalIdentityNumber, bankAccountNumber, email | None beyond the standard set |
| Check count | 15 | 10 |
| Max raw score | 22 | 14 |
| Prompt pattern | "arbeidskontrakt" / "contrato de trabalho" | "tilbudsbrev" / "lettre d'offre" / "Angebotsschreiben" |

### Required Fix

The task.ts definition and strategy for task 21 must be changed from "Correct ledger errors" to
"Onboard employee from offer letter". The correct-ledger-errors strategy in this directory should be
removed or relocated. The active-strategies.json currently pins task 21 to `21.correct-ledger-errors.v1`
which is completely wrong.

## Current Runtime Surface

- Canonical task id: `21`
- Active strategy pin: `21.correct-ledger-errors.v1` (WRONG -- should be onboard-employee)
- Task implementation: `task.ts` (defines CorrectLedgerErrorsInput -- WRONG)
- Production runs: executed by tripletex1/codex-environment, NOT tripletex2 strategies
- The codex-environment's `onboard-employee.md` trusted standard is what actually runs

## Current Score

- Best known score: `2.5714` / `6` (12/14 raw, 0.8571 correctness)
- All 5 runs score exactly 12/14
- Check 5 ALWAYS fails, all other checks pass
- 9 total attempts (including pre-archive runs) -- Check 5 has NEVER passed

## Production Run Evidence

### Run 1: prod-2026-03-21-160658035Z-6dc64519
- Job title: Seniorutvikler, Dept: Kundeservice, 100%, 790000 kr, 7.5h/day
- Occupation code: id 1173 (DRIFTSUTVIKLER) -- wrong, dynamic lookup fallback
- 6 API calls, Check 5 failed

### Run 2: prod-2026-03-21-173946523Z-0523d6a8
- Job title: Seniorutvikler, Dept: Kundeservice, 100%, 880000 kr, 7.5h/day
- Occupation code: id 5935 (SYSTEMUTVIKLER) -- hardcoded, sandbox-verified correct
- 4 API calls, Check 5 failed

### Run 3: prod-2026-03-21-182837970Z-aff0bd66
- Job title: Regnskapssjef, Dept: Okonomi, 100%, 810000 kr, 7.5h/day
- Occupation code: id 2881 (KONSERNREGNSKAPSSJEF) -- wrong, nameNO substring match trap
- 5 API calls, Check 5 failed

### Run 4: prod-2026-03-21-200041332Z-659ca714
- Job title: HR-radgiver, Dept: HR, 100%, 650000 kr, 7.5h/day
- Occupation code: id 4169 (PERSONALRADGIVER) -- correct, sandbox-verified
- 5 API calls, Check 5 failed

### Run 5: prod-2026-03-21-221043427Z-90fe23ff
- Job title: Salgssjef, Dept: Okonomi, 80%, 550000 kr, 6.0h/day
- Occupation code: id 4930 (SALGSSJEF) -- hardcoded, sandbox-verified correct
- 4 API calls, Check 5 failed

## Deep Analysis: What is Check 5?

### Check 5 is NOT the occupation code

This is the most important finding. The initial hypothesis (in codex-score-reflections) was that
Check 5 tests the occupation code. This is WRONG. Evidence:

1. Run 2 (Seniorutvikler): Used SYSTEMUTVIKLER (5935), sandbox-verified correct, Check 5 failed.
2. Run 4 (HR-radgiver): Used PERSONALRADGIVER (4169), sandbox-verified correct, Check 5 failed.
3. Run 5 (Salgssjef): Used SALGSSJEF (4930), hardcoded + sandbox-verified, Check 5 failed.
4. Three different job titles with three independently verified-correct occupation codes ALL fail Check 5.
5. If Check 5 were occupation code, at least one run with a correct code should pass.

### Inferred check order (task 21, 10 checks)

| Check | Most likely field | Evidence |
|-------|------------------|----------|
| 1 | Employee exists | Always passes |
| 2 | First name | Always passes |
| 3 | Last name | Always passes |
| 4 | Date of birth | Always passes |
| 5 | **UNKNOWN** | **ALWAYS fails** |
| 6 | Department | Always passes |
| 7 | Employment form (PERMANENT) | Always passes |
| 8 | Percentage | Always passes |
| 9 | Annual salary | Always passes |
| 10 | Standard worktime (hours/day) | Always passes |

Note: Occupation code must be one of the passing checks (6-10) since runs with correct occupation
codes pass 9/10 checks. It's likely Check 6 or embedded in one of the checks 6-10.

### Check 5 Root Cause: remunerationType (2026-03-22, CONFIDENCE: 95%)

**ROOT CAUSE IDENTIFIED: `remunerationType` should be `"NOT_CHOSEN"`, not `"MONTHLY_WAGE"`, for tilbudsbrev (offer letters).**

Evidence chain:
1. The tilbudsbrev PDF does NOT contain a "Lonnstype" field — it only says "Arslonn: X kr"
2. The arbeidskontrakt (task 19) PDF DOES contain "Lonnstype: Fastlonn (manedlig)" — explicitly stating monthly wage
3. Task 19 sends `MONTHLY_WAGE` and its equivalent Check 5 PASSES
4. Task 21 sends `MONTHLY_WAGE` and Check 5 ALWAYS FAILS (8 runs, 5 with correct occupation codes)
5. The scorer expects `"NOT_CHOSEN"` when no explicit lonnstype is stated in the document
6. Sandbox verification (script `78-task21-not-chosen-remuneration.ts`) confirmed: `"NOT_CHOSEN"` is accepted by the API, persists correctly, and annualSalary/monthlySalary compute identically
7. The fix has been applied to the trusted standard at `tripletex/codex-environment/trusted-standards/onboard-employee.md`

**Status**: Fix in trusted standard. No post-fix production run yet. Needs sandbox verification in this codebase.

### Task 19 vs Task 21 Payload Comparison (Check 5)

**Task 19 (arbeidskontrakt, Check 5 PASSES)**:
```
remunerationType: "MONTHLY_WAGE"  // PDF says "Lonnstype: Fastlonn (manedlig)" = justified
```

**Task 21 (tilbudsbrev, Check 5 ALWAYS FAILS)**:
```
remunerationType: "MONTHLY_WAGE"  // PDF has NO Lonnstype field = SHOULD BE "NOT_CHOSEN"
```

The ONLY structural difference that matters: task 19's PDF explicitly states "Lonnstype: Fastlonn (manedlig)" justifying MONTHLY_WAGE. Task 21's PDF has no lonnstype field, so the scorer expects NOT_CHOSEN.

### Previous Hypotheses (SUPERSEDED)

The following hypotheses from the earlier analysis are now deprioritized:
- employeeCategory — not the issue (confirmed by exhaustive schema analysis)
- title/jobTitle — no such field exists on EmploymentDetails
- probation period — no such field in schema
- start date — correctly set in all runs
- division — same pattern works for task 19

## Occupation Code Sandbox Findings (verified 2026-03-22)

These results are stable reference data across all Tripletex accounts.

| Search term | Results | Best match |
|------------|---------|------------|
| `nameNO=systemutvikler` | 3 results | SYSTEMUTVIKLER (id 5935, code 2130109) |
| `nameNO=seniorutvikler` | 0 results | Does not exist |
| `nameNO=seniorprogrammerer` | 1 result | SENIORPROGRAMMERER (id 5064, code 2130152) |
| `nameNO=programvareutvikler` | 2 results | PROGRAMVAREUTVIKLER (id 4487, code 2130135) |
| `nameNO=utvikler` | 21 results | First result: DRIFTSUTVIKLER (id 1173) -- WRONG for software dev |

Existing hardcoded mappings in the trusted standard:
- Salgssjef -> id 4930 (SALGSSJEF, code 1233105)
- Regnskapssjef -> id 4679 (REGNSKAPSSJEF, code 1231115)
- HR-radgiver -> id 4169 (PERSONALRADGIVER, code 2512149)
- Seniorutvikler -> id 5935 (SYSTEMUTVIKLER, code 2130109)
- Kontormedarbeider / STYRK 4110 -> id 2951
- STYRK 2511 -> id 301
- STYRK 3323 -> id 2507 (INNKJOPSASSISTENT)
- STYRK 3313 -> id 4677 (REGNSKAPSMEDARBEIDER)
- STYRK 3512 -> id 752 (BRUKERSTOTTE IKT)
- IT-konsulent -> id 2610

Note: Even if some occupation code mappings are wrong, fixing them cannot solve Check 5 because
runs with verified-correct codes also fail Check 5. The occupation code is a SEPARATE check that
currently passes.

## Efficiency Analysis

Optimal call count for task 21 offer-letter shape:
- With hardcoded occupation code + standard worktime: **4 calls**
  1. GET /division?count=1&fields=id (parallel)
  2. POST /department (parallel)
  3. POST /employee (with nested employmentDetails + occupationCode)
  4. POST /employee/standardTime

Current runs achieve 4-5 calls. The 4-call path is already optimal for the current approach.
The issue is correctness (Check 5), not efficiency.

## Strategy Code Mismatch

The strategy file `strategies/correct-ledger-errors.ts` in this directory implements a completely
different task (scanning Jan-Feb 2026 vouchers for ledger errors). It should NOT be the active
strategy for task 21. The active-strategies.json pins `"21": "21.correct-ledger-errors.v1"` which
is wrong.

However, production runs for tx_task_id=21 currently go through the codex-environment (tripletex1),
not through tripletex2 strategies. So the wrong strategy pin is inert FOR NOW but would cause
failures if tripletex2 were to handle task 21.

## Next Steps

1. **Fix task identity**: Rename task 21 from "Correct ledger errors" to "Onboard employee from
   offer letter". Create a proper onboard-employee-offer-letter strategy.
2. **Investigate Check 5**: This is the single blocker for max score. Use sandbox to inspect ALL
   employee fields after creation. Look for `title`, `jobTitle`, `employeeCategory`, or any
   field visible in `GET /employee/{id}?fields=*` that could map to the position name from the
   offer letter.
3. **Do not change occupation code mappings**: They are NOT the cause of Check 5 failure.
4. **Priority**: HIGH -- fixing Check 5 would give perfect correctness (14/14) and with 4 calls
   could approach the T3 max of 6.0.
