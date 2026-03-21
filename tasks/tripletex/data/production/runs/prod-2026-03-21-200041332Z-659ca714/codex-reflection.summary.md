# Codex Reflection Summary

## 1. Task

Onboard employee from a Nynorsk offer letter (tilbudsbrev): create employee Randi Stølsvik (DOB 1992-05-11), attach department "HR", set up employment with 100% position, 650 000 NOK annual salary, start date 2026-10-21, job title "HR-rådgiver", and configure 7.5 hours/day standard worktime.

## 2. Reflection

**What went well:**
- Correctly identified "Onboard employee" trusted standard as exact match
- Read the trusted standard before writing any code (as mandated)
- Correctly extracted all fields from the PDF attachment
- Successfully mapped "HR-rådgiver" to the search term "personalrådgiver" (traditional Norwegian equivalent), getting exact match PERSONALRÅDGIVER (id 4169)
- All 5 API calls succeeded with 0 errors, 0 4xx responses
- Correctly handled fresh account (no division), used `POST /employee/standardTime` (not the wrong company-wide endpoint)
- Correct parallel prerequisite calls

**What could have been better:**
- The occupation code for "HR-rådgiver" was not in the hardcoded mappings table, requiring a dynamic lookup (1 extra call)
- The agent correctly guessed "personalrådgiver" as the search term, but this mapping should now be hardcoded for future runs

## 3. Call Efficiency

**Run used: 5 calls, 0 errors**

| # | Call | Result | Necessary? |
|---|------|--------|-----------|
| 1 | GET /division?count=1&fields=id | 0 rows | Yes (must check for division) |
| 2 | POST /department { name: "HR" } | id 953526 | Yes |
| 3 | GET /occupationCode?nameNO=personalrådgiver&count=10 | id 4169 | Avoidable with hardcoded mapping |
| 4 | POST /employee | id 18659639 | Yes |
| 5 | POST /employee/standardTime | 7.5 h/day | Yes |

**Wasted calls: 1** — the occupation code lookup (call #3) is now avoidable by hardcoding HR-rådgiver → id 4169.

**Optimal path for this exact task shape: 4 calls**
1. GET /division?count=1&fields=id (parallel)
2. POST /department { name: "HR" } (parallel)
3. POST /employee with nested employmentDetails including occupationCode { id: 4169 }
4. POST /employee/standardTime with hoursPerDay 7.5

## 4. Root Causes

The single extra call was caused by the "HR-rådgiver" job title not being in the hardcoded occupation code mappings table. This is a pattern:
- **Modern "HR-" prefix titles**: Tripletex uses traditional Norwegian occupation terminology ("PERSONALRÅDGIVER") rather than modern English-influenced "HR-" prefix titles ("HR-rådgiver")
- `nameNO=HR-rådgiver` returns 0 results — the term does not exist in Tripletex
- `nameNO=rådgiver` is too broad — returns 10+ compound results and PERSONALRÅDGIVER is not in the first 10 alphabetically
- The agent correctly guessed "personalrådgiver" as the Norwegian equivalent, but this knowledge wasn't codified in the trusted standard

## 5. Sandbox Verification

Sandbox verification confirmed:
- `nameNO=personalrådgiver` returns exactly 1 result: PERSONALRÅDGIVER (id 4169, code 2512149)
- `nameNO=HR-rådgiver` returns 0 results
- `nameNO=rådgiver` returns 10+ results (ARBEIDSTILSYNSRÅDGIVER, BEDRIFTSRÅDGIVER, etc.) — PERSONALRÅDGIVER not in first 10
- POST /employee with occupationCode { id: 4169 } → 201, readback confirmed:
  - occupationCode.id=4169
  - occupationCode.nameNO=PERSONALRÅDGIVER
  - occupationCode.code=2512149
  - percentageOfFullTimeEquivalent=100
  - annualSalary=650000
  - employmentForm=PERMANENT
- POST /employee/standardTime with hoursPerDay 7.5 → 201, readback confirmed hoursPerDay=7.5

## 6. Playbook Changes

Updated existing files (no new files created):

- **`./trusted-standards/onboard-employee.md`**:
  - Added HR-rådgiver → PERSONALRÅDGIVER (id 4169, code 2512149) to hardcoded mappings table
  - Added new section "Modern 'HR-' Prefix Job Titles" documenting the mapping trap
  - Added pitfalls: `nameNO=HR-rådgiver` returns 0, `nameNO=rådgiver` too broad
  - Added 7th production run documentation

- **`./task-playbooks/onboard-employee.md`**:
  - Added HR-rådgiver to hardcoded mappings table
  - Added avoidable mistakes for HR-rådgiver search patterns
  - Added 7th production run history entry

## 7. Commit

- **Hash**: `c0045ff0`
- **Message**: `tripletex playbook: onboard-employee — add 7th production confirmation (659ca714, Nynorsk prompt, Randi Stølsvik / HR-rådgiver / HR dept / 650000 / 100% / 7.5h, 5 calls 0 errors), hardcode HR-rådgiver → PERSONALRÅDGIVER id 4169 (code 2512149), document modern "HR-" prefix → traditional Norwegian "PERSONAL-" prefix mapping trap, nameNO=HR-rådgiver returns 0 results, nameNO=rådgiver too broad (10+ results, target not in first 10), optimal flow 4 calls with hardcoded mapping`

## 8. Reusable Heuristics

1. **Modern "HR-" prefix → traditional Norwegian**: Tripletex occupation codes use traditional Norwegian terminology. "HR-rådgiver" must be mapped to "personalrådgiver", "HR-sjef" to "personalsjef", etc. Always check if a modern English-influenced job title has a traditional Norwegian equivalent before searching.

2. **Broad substring searches are dangerous**: `nameNO=rådgiver` returns 10+ compound results and the target may not be in the first N. Always use the most specific term possible, and prefer hardcoded mappings.

3. **The hardcoded mappings table is the first-class optimization**: Every new job title that appears in production should be hardcoded after sandbox verification. Each hardcoded mapping saves exactly 1 API call.

4. **Current hardcoded mappings (7 entries)**:
   - Kontormedarbeider / STYRK 4110 → id 2951
   - Salgssjef / STYRK 1233 → id 4930
   - Regnskapssjef → id 4679
   - Innkjøper / STYRK 3323 → id 2503
   - HR-rådgiver → id 4169
   - Seniorutvikler → id 5935
   - STYRK 2511 only → id 301

5. **Minimum-call floors by shape**:
   - Hardcoded occupation + no standard worktime: 3 calls
   - Hardcoded occupation + standard worktime: 4 calls
   - Dynamic occupation lookup + no standard worktime: 4 calls
   - Dynamic occupation lookup + standard worktime: 5 calls
