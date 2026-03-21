# Reflection Summary

## Task

Onboard employee Camille Moreau from a French-language employment contract (arbeidskontrakt). Contract provided: name, DOB (12.01.1984), personnummer (12018486901), email, bank account (27925957246), department (Lager), STYRK 3323 (no job title text), employment form (Fast stilling → PERMANENT), salary type (Fastlønn → MONTHLY_WAGE), 80% employment, annual salary 860000 kr, start date 23.04.2026. No standard worktime hours specified.

## Reflection

**What went well:**
- Correctly matched to `onboard-employee` trusted standard
- Used hardcoded STYRK 3323 → occupation code id 2503 (INNKJØPER), saving 1 call vs dynamic lookup
- Executed only 3 API calls with 0 errors — the minimum for this contract shape
- Correctly handled fresh production account (GET /division returned 0 rows, omitted division from payload)
- All contract fields extracted correctly from French-prompt Norwegian-format contract
- nationalIdentityNumber and bankAccountNumber included on the employee payload
- Correctly skipped standard worktime write (not specified in contract)

**What went poorly:**
- Scoring attribution was ambiguous (2 candidate tasks: 10 and 19). If task 19 (15 checks, 2 failed), we scored 18/22 (2.4545 normalized) which did not improve the prior best of 2.7273. If task 10 (5 checks, 5/5 passed), we scored perfectly at 3.0. Cannot determine which task was ours.
- No trace files were generated for this run, making post-mortem analysis harder.

**Mistakes:**
- None identified in the API execution flow. All 3 calls succeeded. Sandbox readback confirmed all fields persisted correctly.

## Call Efficiency

**The run was minimal-call.** 3 calls total, 0 wasted, 0 errors.

| # | Call | Result |
|---|------|--------|
| 1 | `GET /division?count=1&fields=id` | 200 — 0 rows (fresh account) |
| 2 | `POST /department` (name: "Lager") | 201 — id 943456 |
| 3 | `POST /employee` (full nested payload) | 201 — id 18642312 |

**Lower-call path:** None. 3 calls is the floor for this shape. The GET /division is required to handle both fresh (0 divisions) and existing (need division id) accounts. The POST /department is required because the API needs `department.id`. The POST /employee is the core write.

## Root Causes

No errors or wasted calls to diagnose. The execution followed the trusted standard exactly. The ambiguous scoring attribution is a system-level limitation when multiple runs execute concurrently on the same Tripletex account.

## Sandbox Verification

Sandbox re-verification on 2026-03-21 confirmed the complete 3-call flow:

1. `GET /division?count=1&fields=id` → 200, division id 108244566 (sandbox has divisions)
2. `POST /department` (name: "Lager Verify ...") → 201
3. `POST /employee` with nationalIdentityNumber, bankAccountNumber, nested employmentDetails including occupationCode { id: 2503 } → 201

Readback confirmed all fields persisted:
- `firstName=Camille`, `lastName=Moreau Verify ...`
- `dateOfBirth=1984-01-12`, `nationalIdentityNumber=12018486901`
- `bankAccountNumber=27925957246`
- `startDate=2026-04-23`, `division.id=108244566`
- `employmentType=ORDINARY`, `employmentForm=PERMANENT`
- `remunerationType=MONTHLY_WAGE`, `workingHoursScheme=NOT_SHIFT`
- `percentageOfFullTimeEquivalent=80`, `annualSalary=860000`
- `occupationCode.id=2503`, `occupationCode.code=3416102`, `nameNO=INNKJØPER`

## Playbook Changes

Updated existing files (no new files created):

- `./trusted-standards/onboard-employee.md` — added verification entry for this production run: first use of hardcoded STYRK 3323 → id 2503 in production, 3-call floor confirmed, sandbox readback confirmed all fields
- `./task-playbooks/onboard-employee.md` — added production run history entry for STYRK 3323 French-prompt contract shape at 3-call floor

No AGENTS.md changes needed — the onboard-employee trusted standard and playbook entries were already present.

## Commit

- Hash: `e333a787`
- Message: `tripletex playbook: onboard-employee — first production use of hardcoded STYRK 3323→2503, 3-call floor confirmed`

## Reusable Heuristics

1. **STYRK 3323 hardcoded mapping confirmed in production**: id 2503 (INNKJØPER, code 3416102). Always use hardcoded id for this STYRK code — saves 1 call vs dynamic `GET /occupationCode?nameNO=innkjøper`.

2. **3-call floor for onboard-employee without standard worktime**: GET /division + POST /department + POST /employee. No further optimization possible for this shape.

3. **Fresh production accounts have 0 divisions**: GET /division returns 0 rows. Omit `division` from the employee payload — the create succeeds without it. Include `division.id` only when the pre-read returns results.

4. **nationalIdentityNumber and bankAccountNumber pass through cleanly**: Include directly on the employee payload. No special formatting or validation needed. The API accepts and persists them as-is.

5. **French prompts with Norwegian-format contract data**: The prompt language (French: "Créez l'employé") does not change the endpoint choice or field mappings. The contract fields are in Norwegian format regardless of prompt language.

6. **occupationCode must be sent by id, not by code**: Sandbox proved that `{ code: "..." }` writes are silently ignored (returns 201 but readback shows null). Always use `{ id: <number> }`.
