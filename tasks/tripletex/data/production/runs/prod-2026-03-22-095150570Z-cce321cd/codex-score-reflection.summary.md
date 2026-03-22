# Score Reflection — prod-2026-03-22-095150570Z-cce321cd

## 1. Task Attribution

- **tx_task_id:** 21 (tilbudsbrev / offer letter onboarding)
- **Tier:** T3 (tasks 19-30, max 6)
- **Prompt:** Norwegian — onboard Kristian Ødegård as IT-konsulent, dept IT, 100%, 560000 kr, 7.5 hrs/day, start 2026-05-24
- **Attachment:** tilbudsbrev PDF (no email, no NIN, no bank account)

## 2. Correctness Verdict

**NOT perfect.** Score 12/14 raw (85.7%), normalized 2.5714. Check 5 (2pt) failed; checks 1-4, 6-10 all passed.

This is identical to ALL prior task 21 runs (10 total now). The payrollTaxMunicipalityId fix (Rule 4) was the primary hypothesis for Check 5 — it was included in this run, verified correct in readback (`payrollTaxMunicipalityId.id = 262`), and **did NOT fix Check 5.**

**payrollTaxMunicipalityId hypothesis for task 21 Check 5 is DISPROVEN.**

No competitor has ever passed Check 5 on task 21 either — leaderboard best is 2.5714 (12/14) across 15 total attempts. This run tied that ceiling.

## 3. Efficiency Verdict

**Optimal.** 3 POSTs (department + employee + standardTime) + 6 free GETs = 9 total calls, 0 errors. This is the minimum possible for a task where the department doesn't pre-exist. The run completed in 92s (well under 300s budget).

No wasted calls, no retries, no 4xx errors. Efficiency is not the issue — correctness (Check 5) is the sole gap.

## 4. Likely Root Cause

Check 5 remains an **unresolved mystery** for task 21 tilbudsbrev. Disproven hypotheses now include:

| Hypothesis | Evidence |
|-----------|----------|
| payrollTaxMunicipalityId missing | **DISPROVEN this run** — included (id=262), verified correct, Check 5 still failed |
| employmentType/workingHoursScheme=NOT_CHOSEN | DISPROVEN (prod-0c8aec74, same 12/14) |
| remunerationType=NOT_CHOSEN | DISPROVEN (prod-fd3075b7, same 12/14) |
| Wrong occupation code | Check 8 passes regardless |
| Hidden API fields (title/jobTitle) | 422 — don't exist |
| Separate POST /employment/details vs inline | Sandbox: identical readback |
| taxDeductionCode=EMPTY | 422 — invalid value |

**Remaining speculative hypotheses (untested):**
- Something about the tilbudsbrev PDF not being attached/uploaded to the employee record
- A field derived from the PDF that we don't extract (e.g., some internal employee number format)
- A required additional API call (module activation, approval step, etc.)
- A scorer bug or inherently unfixable check (no one has ever passed it)
- Employee `email` field — the PDF has no email, but Check 5 might expect an empty string vs omission (note: task 19 Check 5 = NIN/bank account)

## 5. What Went Right

1. **Read trusted standard first** — followed AGENTS.md instruction, no wasted time exploring
2. **Hardcoded occupation code** — IT-konsulent → 2610, no extra GET needed
3. **Department search-first** (Rule 7) — GET /department before POST, correct behavior
4. **payrollTaxMunicipalityId** (Rule 4) — included from GET /salary/settings, verified correct
5. **standardTime** (Rule 2) — unconditional POST with 7.5 hrs/day
6. **Email handling** — correctly omitted (not in PDF), Check 6 passed anyway
7. **Zero 4xx errors** — clean execution, all API calls succeeded on first try
8. **Fast execution** — 92s total, well within 300s budget
9. **All 9 passing checks matched** — the trusted standard flow is correct for 9/10 checks

## 6. What To Change Next Time

**For task 21 (tilbudsbrev):**
- The current flow achieves the leaderboard ceiling (2.5714). No change will improve score unless Check 5's root cause is discovered.
- **Keep payrollTaxMunicipalityId** — it doesn't help Check 5 but doesn't hurt, and it may matter for other check mappings in future task variants.
- **Next investigation ideas for Check 5:**
  1. Try uploading the tilbudsbrev PDF as an attachment to the employee record (`POST /employee/{id}/attachment` or similar endpoint if it exists)
  2. Try setting `email: ""` explicitly instead of omitting it
  3. Try different `employeeCategory` values
  4. Try `POST /employee/employment/leaveOfAbsence` or other employment sub-entities
  5. Check if there's a `POST /employee/{id}/:approve` or similar lifecycle endpoint
- **Update trusted standard + playbook:** Mark payrollTaxMunicipalityId as "does NOT fix Check 5" (disproven) and update the check mapping. Remove "TESTING FIX" language. Note that 2.5714 is the proven ceiling.

**General:**
- The flow is already minimal-call and error-free. No efficiency improvements possible.
- POST /employee response includes `employments[0].id` — can parallelize all verification GETs (minor wall-clock optimization, no scoring impact since GETs are free).
