# Codex Reflection Summary

## Task
Onboard employee Leon Richter from a German-language offer letter (PDF). Create employee, assign Økonomi department, set up employment details (100%, 810,000 kr annual salary, permanent, Regnskapssjef), and configure standard worktime (7.5 h/day). Start date 2026-12-17, DOB 1989-08-17.

## Reflection
The run executed flawlessly from a technical standpoint — 5 API calls, 0 errors, 0 4xx responses. However, the **occupation code was wrong**. The agent used `nameNO=regnskapssjef&count=1` which returned KONSERNREGNSKAPSSJEF (id 2881, "Group Accounting Manager") instead of REGNSKAPSSJEF (id 4679, "Accounting Manager"). This is a correctness failure that would have cost points on the occupation code check.

What went well:
- Immediate recognition of the `onboard-employee` trusted standard match
- Read the trusted standard before writing code (as instructed)
- Correct extraction of all fields from the German PDF
- Correct handling of division (0 rows on fresh account → omitted)
- Correct use of `POST /employee/standardTime` (per-employee, not company-wide)
- All 5 calls succeeded with 0 errors

What went wrong:
- Used the wrong occupation code (2881 instead of 4679) due to the `nameNO` substring matching pitfall
- The trusted standard said `count=1` for dynamic lookups, which was itself wrong guidance

## Call Efficiency
The run used **5 calls** (GET /division, POST /department, GET /occupationCode, POST /employee, POST /employee/standardTime). This was **not minimal**. With Regnskapssjef hardcoded:

**Optimal path (4 calls):**
1. `GET /division?count=1&fields=id` (parallel)
2. `POST /department` with name "Økonomi" (parallel)
3. `POST /employee` with nested employmentDetails including `occupationCode: { id: 4679 }`
4. `POST /employee/standardTime` with hoursPerDay 7.5

**Wasted call:** `GET /employee/employment/occupationCode?nameNO=regnskapssjef&count=1` — unnecessary with hardcoded mapping, and returned the wrong result.

## Root Causes
1. **Missing hardcoded mapping**: Regnskapssjef was not in the hardcoded occupation code table, forcing a dynamic lookup.
2. **Unsafe dynamic lookup guidance**: The trusted standard and playbook both recommended `count=1` for dynamic lookups. The `nameNO` filter is a substring-containing match sorted alphabetically, so the first result for "regnskapssjef" was KONSERNREGNSKAPSSJEF (contains "regnskapssjef"), not REGNSKAPSSJEF itself. This is the same class of bug as the `code` filter substring matching pitfall that was already documented.
3. **No exact-match filtering**: The script blindly took `values[0]` without checking whether `nameNO` exactly matched the search term.

## Sandbox Verification
Sandbox verification on 2026-03-21 confirmed:
- `nameNO=regnskapssjef&count=5&fields=*` returns 3 results:
  1. KONSERNREGNSKAPSSJEF (id 2881, code 1231118) — wrong, "Group Accounting Manager"
  2. REGNSKAPSSJEF (id 4679, code 1231115) — correct, "Accounting Manager"
  3. SKATTEREGNSKAPSSJEF (id 5341, code 1227170) — wrong, "Tax Accounting Manager"
- `POST /employee` with `occupationCode: { id: 4679 }` → 201, readback confirmed `occupationCode.id=4679`, `nameNO=REGNSKAPSSJEF`, `code=1231115`
- All other fields persisted correctly: `annualSalary=810000`, `percentageOfFullTimeEquivalent=100`, `employmentForm=PERMANENT`, `hoursPerDay=7.5`

## Playbook Changes
Updated existing files (no new files created):

1. **`./trusted-standards/onboard-employee.md`**:
   - Added Regnskapssjef → id 4679 (code 1231115) to hardcoded mappings table
   - Updated dynamic lookup section: changed `count=1` to `count=10&fields=id,nameNO` with instruction to pick exact `nameNO` match
   - Added critical warning about `nameNO` substring matching + alphabetical sorting
   - Added production run documentation for this sixth run

2. **`./trusted-standards/common-endpoints.md`**:
   - Added `nameNO` substring matching warning to Occupation Code section
   - Updated dynamic lookup guidance to use `count=10` and pick exact match
   - Added Regnskapssjef and Seniorutvikler to hardcoded mappings list

3. **`./task-playbooks/onboard-employee.md`**:
   - Added Regnskapssjef → id 4679 to hardcoded mappings table
   - Updated dynamic lookup section with substring matching warning
   - Updated minimal safe flow to use `count=10&fields=id,nameNO`
   - Added avoidable mistake about `count=1` pitfall
   - Added production run history entry for this run

## Commit
- Hash: `6b61bf5a`
- Message: `tripletex playbook: onboard-employee — add Regnskapssjef hardcoded mapping (id 4679), fix nameNO substring matching pitfall`

## Reusable Heuristics
1. **Never use `count=1` for `nameNO` occupation code lookups.** The filter is substring-containing and results are sorted alphabetically. KONSERNREGNSKAPSSJEF sorts before REGNSKAPSSJEF because "K" < "R". Always use `count=10&fields=id,nameNO` and pick the exact match.
2. **Hardcode every verified occupation code mapping.** Each hardcoded entry saves 1 API call AND eliminates the risk of the wrong code being selected. The cost of storing a hardcoded mapping is near zero; the cost of a dynamic lookup going wrong is a failed check.
3. **The `nameNO` filter has the same substring-containing behavior as the `code` filter.** Both documented pitfalls stem from the same API design: substring matching with no "exact" mode. Apply the same caution to `nameNO` as already applied to `code`.
4. **Alphabetical sorting can systematically hide the correct result.** When the exact occupation name is a suffix of a compound term (e.g., "Regnskapssjef" in "Konsernregnskapssjef"), the compound term will always sort first. This is not a random ordering issue — it's a systematic bias that hardcoding permanently fixes.
5. **Minimum-call floor for Regnskapssjef + standard-worktime shape: 4 calls** (GET /division, POST /department, POST /employee, POST /employee/standardTime).
