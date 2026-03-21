# Post-Run Reflection: prod-2026-03-21-152833394Z-8da36fcc

## Task

Onboard employee Lars Larsen from a Norwegian employment contract (arbeidskontrakt) into Tripletex. Contract specified: personnummer 13119462627, fødselsdato 13.11.1994, avdeling Drift, stillingskode (STYRK) 3323, fast stilling, fastlønn månedlig, stillingsprosent 100%, årslønn 970000 kr, tiltredelse 18.07.2026, email, bank account. No job title given — only STYRK code. No standard worktime specified.

## Reflection

**What went well:**
- Correctly identified the task as an exact match for the `onboard-employee` trusted standard
- Correctly extracted all contract fields from the PDF attachment
- Correctly identified STYRK 3323 was not in the hardcoded mappings, requiring a dynamic lookup
- Correctly resolved STYRK 3323 to Norwegian occupation name "innkjøper" and used `nameNO=innkjøper` for the lookup
- The `nameNO` search returned the correct occupation code id 2503 (INNKJØPER, code 3416102) as the first result
- All 4 API calls succeeded with 0 errors, 0 retries
- Employee was created with all required fields correctly set

**What could have been better:**
- The run used 4 calls when 3 would have been optimal. The `GET /employee/employment/occupationCode?nameNO=innkjøper` call was unnecessary if STYRK 3323 → id 2503 had been in the hardcoded mappings.
- No actual mistakes — the run was correct but not maximally efficient.

## Call Efficiency

**Run used 4 calls. Optimal is 3 calls.** 1 call was avoidable.

| # | Call | Status | Necessary? |
|---|------|--------|------------|
| 1 | `GET /division?count=1&fields=id` | 200 | Yes — needed to determine whether to include `division.id` |
| 2 | `POST /department` (name: "Drift") | 201 | Yes — department must exist before employee create |
| 3 | `GET /employee/employment/occupationCode?nameNO=innkjøper&count=1&fields=id` | 200 | **Avoidable** — could be hardcoded |
| 4 | `POST /employee` (with nested employment + employmentDetails) | 201 | Yes — the core write |

**Optimal 3-call path for this exact contract shape (now that STYRK 3323 is hardcoded):**
1. `GET /division?count=1&fields=id` (parallel)
2. `POST /department` with name "Drift" (parallel)
3. `POST /employee` with `occupationCode: { id: 2503 }` (hardcoded)

## Root Causes

The single avoidable call happened because STYRK 3323 was not yet in the hardcoded occupation code mappings. The agent correctly followed the trusted standard's dynamic lookup path, which is the correct fallback for unknown STYRK codes. This is not an agent error — it's a knowledge gap that this reflection run addresses by adding the hardcoded mapping.

**Key discovery**: The 4-digit STYRK code from the contract does NOT always match the first 4 digits of the Tripletex 7-digit occupation code. STYRK 3323 ("Innkjøper") maps to Tripletex code `3416102`, and `code=3323` returns 0 results from the API. This means `code=<STYRK>` searches would have returned empty for this contract — the `nameNO` approach was the only correct dynamic resolution path.

## Sandbox Verification

All verification performed on persistent sandbox `kkpqfuj-amager.tripletex.dev`.

1. **`nameNO=innkjøper` search** → returned 3 results, first is id 2503 (INNKJØPER, code `3416102`)
2. **`code=3323` search** → returned 0 results, confirming STYRK 3323 does not map to any Tripletex code substring
3. **`id=2503` direct lookup** → confirmed: nameNO=INNKJØPER, code=3416102
4. **Full 3-call flow** (GET /division, POST /department, POST /employee with hardcoded `occupationCode: { id: 2503 }`) → all succeeded
5. **Readback** confirmed persisted state:
   - `occupationCode.id=2503`, `occupationCode.code=3416102`, `nameNO=INNKJØPER`
   - `annualSalary=970000`, `percentageOfFullTimeEquivalent=100`
   - `employmentForm=PERMANENT`, `remunerationType=MONTHLY_WAGE`
   - `workingHoursScheme=NOT_SHIFT`, `employmentType=ORDINARY`
   - `date=2026-07-18`

## Playbook Changes

Updated 3 existing files (no new files created):

| File | Change |
|------|--------|
| `./trusted-standards/onboard-employee.md` | Added STYRK 3323 → id 2503 to hardcoded mappings table; added STYRK-only 3323 shortcut instruction; added pitfall about STYRK-to-Tripletex code prefix mismatch; added production run and sandbox verification notes |
| `./trusted-standards/common-endpoints.md` | Added `innkjøper` → id 2503 to known hardcoded mappings; added note about STYRK 4-digit to Tripletex 7-digit code prefix mismatch |
| `./task-playbooks/onboard-employee.md` | Added STYRK 3323 to hardcoded mappings table and minimal safe flow; added production run findings; added pitfalls about STYRK code prefix mismatch and STYRK-to-name resolution |

AGENTS.md was not modified — no new trusted standards or playbooks were created.

## Commit

- **Hash**: `a31a6205`
- **Message**: `tripletex playbook: hardcode STYRK 3323 → occupation code id 2503 (INNKJØPER)`
- **Files changed**: 3 (trusted-standards/onboard-employee.md, trusted-standards/common-endpoints.md, task-playbooks/onboard-employee.md)
- **Insertions**: 23 lines

## Reusable Heuristics

1. **STYRK 4-digit codes do NOT always correspond to the Tripletex 7-digit code prefix.** STYRK 3323 maps to Tripletex code `3416102`. Never assume the 4-digit STYRK code is a prefix of the 7-digit Tripletex code. Always resolve via `nameNO` or hardcoded mapping.

2. **`code=<4-digit-STYRK>` can return 0 results** even for valid STYRK codes, because the Tripletex 7-digit code may use a completely different prefix. The `nameNO` search is the only reliable dynamic resolution path.

3. **Every new STYRK code encountered in production should be hardcoded** in the post-run reflection. Occupation code ids are reference data and identical across all Tripletex accounts. Each hardcoded mapping saves 1 API call on every future run with that STYRK code.

4. **Known hardcoded STYRK → occupation code id mappings** (all sandbox + production verified):
   - STYRK 4110 → id 2951 (KONTORMEDARBEIDER, code 4114105)
   - STYRK 1233 → id 4930 (SALGSSJEF, code 1233105)
   - STYRK 3323 → id 2503 (INNKJØPER, code 3416102)
   - STYRK 2511 → id 301 (AUTORISERT REGNSKAPSFØRER, code 2511102)

5. **For STYRK-only contracts** (no job title given), the agent must map the STYRK code to its Norwegian occupation name, then check hardcoded mappings. For unknown codes, search `nameNO=<occupation-name>&count=1&fields=id`.

6. **Minimum call count for onboard-employee by shape:**
   - Hardcoded occupation code, no standard worktime: **3 calls**
   - Hardcoded occupation code, with standard worktime: **4 calls**
   - Dynamic occupation code lookup, no standard worktime: **4 calls**
   - Dynamic occupation code lookup, with standard worktime: **5 calls**
