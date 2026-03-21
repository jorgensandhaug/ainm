# Codex Reflection Summary

## 1. Task

Onboard employee from Portuguese-language offer letter (tilbudsbrev): Catarina Oliveira, HR-rådgiver, Økonomi department, born 1990-02-26, start 2026-06-26, 100% employment, 610000 kr annual salary, 7.5 hours/day, permanent position, monthly wage.

## 2. Reflection

**What went well:**
- Correctly read the trusted standard before writing any script — followed knowledge order exactly.
- Used the hardcoded HR-rådgiver → id 4169 (PERSONALRÅDGIVER) mapping — saved 1 call vs the 7th production run which used dynamic `nameNO=personalrådgiver` lookup.
- All 4 calls succeeded with 0 errors.
- Correctly extracted all fields from the Portuguese PDF: name, birth date, department, job title, start date, employment percentage, salary, working hours.
- Correctly mapped "Fast stilling" → PERMANENT, "Fastlønn" → MONTHLY_WAGE.
- Correctly defaulted to userType: "NO_ACCESS" and workingHoursScheme: "NOT_SHIFT".
- Ran GET /division + POST /department in parallel, reducing sequential steps.

**What went poorly:**
- Nothing. This was a clean, optimal execution.

**Mistakes:**
- None. The run matched the theoretical minimum call count with zero errors.

## 3. Call Efficiency

**Was the run minimal-call?** Yes — 4 calls is the theoretical minimum for the hardcoded-occupation-code + standard-worktime task shape.

**Call breakdown:**
1. `GET /division?count=1&fields=id` — required safety check (accounts with divisions need division.id on employment, accounts without don't)
2. `POST /department` — required to get department.id (inline `department: { name: ... }` fails with 422)
3. `POST /employee` — the main write with nested employmentDetails including occupationCode
4. `POST /employee/standardTime` — per-employee standard time (always required for scoring)

**Wasted calls:** 0.

**Lower-call path for next agent:** Same 4-call path. Cannot be reduced further:
- GET /division cannot be removed (sandbox confirms 422 when omitting division.id on accounts that have divisions)
- POST /department cannot be removed (inline department by name fails 422)
- POST /employee is the core write
- POST /employee/standardTime is always scored

## 4. Root Causes

No failures in this run. The run benefited from learnings accumulated over 16 prior production runs:
- HR-rådgiver → id 4169 hardcoded mapping was added after the 7th run proved the dynamic lookup
- Standard worktime endpoint corrected from `/salary/settings/standardTime` (company-wide) to `/employee/standardTime` (per-employee) after the 1st run's 2 failed checks
- Occupation code inclusion enforced after the 1st run missed the job title → STYRK mapping

## 5. Sandbox Verification

Sandbox verification confirmed:
- `id=4169` → PERSONALRÅDGIVER (code 2512149) — correct mapping
- `nameNO=HR-rådgiver` → 0 results — hardcoding is necessary; the modern "HR-" prefix does not exist in Tripletex
- `nameNO=personalrådgiver` → exactly 1 result (id 4169) — the traditional Norwegian term is the correct search key
- `department: { name: ... }` inline → 422 `department.id: Feltet må fylles ut.` — POST /department remains required

No alternative lower-call path found. The 4-call path is irreducible for this task shape.

## 6. Playbook Changes

**Updated existing files (no new files created):**
- `./task-playbooks/onboard-employee.md` — added 17th production run entry (HR-rådgiver, Portuguese prompt, hardcoded id 4169, 4 calls 0 errors)
- `./trusted-standards/onboard-employee.md` — added 17th production run entry with sandbox re-verification results

No AGENTS.md changes needed — onboard-employee entries already exist in both tables.

## 7. Commit

```
01147f38 tripletex playbook: onboard-employee — add 17th production confirmation (b5cac3a0, Portuguese prompt, HR-rådgiver hardcoded id 4169, Catarina Oliveira / 1990-02-26 / Økonomi / 100% / 610000 / 7.5h, 4 calls 0 errors); 1st HR-rådgiver run with hardcoded mapping (saves 1 call vs 7th run dynamic lookup)
```

Files changed: `trusted-standards/onboard-employee.md`, `task-playbooks/onboard-employee.md` (+16 lines total)

## 8. Reusable Heuristics

1. **Hardcoded occupation code mappings eliminate dynamic lookups.** This run saved 1 call (4 vs 5) by using the pre-verified HR-rådgiver → id 4169 mapping. Every new job title encountered in production should be hardcoded after verification.

2. **Modern "HR-" prefix titles don't exist in Tripletex.** Always map to traditional Norwegian equivalents: "HR-rådgiver" → "personalrådgiver". This is not guessable from the API — `nameNO=HR-rådgiver` returns 0 results.

3. **The 4-call floor for hardcoded + standard-worktime is irreducible.** GET /division (safety), POST /department (required), POST /employee (core), POST /employee/standardTime (scored). No speculative shortcut bypasses any of these.

4. **Portuguese-language prompts don't change the API interaction pattern.** The prompt language only affects field extraction from the PDF/prompt text; all API payloads use the same Norwegian/English field names and values.

5. **17 production runs confirm the onboard-employee standard is mature.** 15 of the last 16 runs used 3-5 calls with 0 errors. The hardcoded mapping table now covers 10 job titles/STYRK codes, eliminating dynamic lookups for the most common contract shapes.
