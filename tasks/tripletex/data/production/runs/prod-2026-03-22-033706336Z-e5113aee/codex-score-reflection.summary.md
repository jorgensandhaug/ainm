# Score-Aware Reflection: prod-2026-03-22-033706336Z-e5113aee

## 1. Task Attribution

- **Task ID:** 21 (tilbudsbrev / offer letter onboarding)
- **Tier:** T3 (max 6 normalized points)
- **Prompt language:** German
- **Employee:** Leon Richter, Regnskapssjef, dept Økonomi, born 1989-08-17, start 2026-12-17, 100%, 810000 kr, 7.5 hrs/day

## 2. Correctness Verdict

**NOT PERFECT.** 12/14 raw (correctness = 0.857). 1/10 checks failed — Check 5.

| Check | Result | Likely field |
|-------|--------|-------------|
| 1 | passed | Employee exists |
| 2 | passed | First name |
| 3 | passed | Last name |
| 4 | passed | Date of birth |
| **5** | **failed** | **UNKNOWN — likely employmentType or workingHoursScheme** |
| 6 | passed | Department name |
| 7 | passed | Employment form = PERMANENT |
| 8 | passed | Occupation code (4679 REGNSKAPSSJEF) |
| 9 | passed | Annual salary (810000) |
| 10 | passed | Standard worktime (7.5 hrs/day) |

normalized_score = 2.5714. This ties the existing task 21 best (2.5714 before, 2.5714 after). No improvement.

## 3. Efficiency Verdict

**Optimal.** 4 API calls, 0 errors, 48s duration. This is the documented minimum for a hardcoded occupation code tilbudsbrev:

1. `GET /division?count=1&fields=id` — returned 0 rows (fresh account)
2. `POST /department` — created Økonomi
3. `POST /employee` — created Leon Richter with all employment details
4. `POST /employee/standardTime` — set 7.5 hrs/day

No wasted calls. No retries. No 4xx errors. The efficiency bonus is already maximized for this correctness level. The only lever for a higher normalized_score is fixing Check 5 (correctness 12/14 → 14/14).

## 4. Likely Root Cause

Check 5 has failed on **all 8 task 21 production runs** (including this one). The run used `employmentType: "ORDINARY"` and `workingHoursScheme: "NOT_SHIFT"` — the same values as every prior run.

The tilbudsbrev PDF does not specify ansettelsestype (employment type) or arbeidstidsordning (working hours scheme). The scorer likely expects `NOT_CHOSEN` for fields not explicitly stated in the document.

Evidence supporting this hypothesis:
- All 8 tilbudsbrev runs using ORDINARY/NOT_SHIFT score exactly 12/14
- remunerationType=NOT_CHOSEN was tested in prod-fd3075b7 — same 12/14 (rules out remunerationType)
- Sandbox verification confirmed NOT_CHOSEN is accepted by the API and stored correctly for both fields
- The arbeidskontrakt (task 19) does NOT have this failure pattern — it scores 20/22 with ORDINARY/NOT_SHIFT, consistent with different check lists

The prior reflection already updated the trusted standard to recommend NOT_CHOSEN for tilbudsbrev payloads (RULE 4). This run predates that update.

## 5. What Went Right

- **Minimal calls:** 4 calls is the absolute floor — confirmed by sandbox tests that division omission (422) and inline department name (422) both fail
- **Zero errors:** Clean execution, no retries
- **Correct occupation code:** Hardcoded Regnskapssjef → 4679, no lookup call needed
- **Correct data extraction:** All PDF fields correctly parsed despite German prompt language
- **Fast execution:** 48s total, well within 300s budget
- **Trusted standard followed:** Agent read the standard before writing the script

## 6. What To Change Next Time

1. **Use NOT_CHOSEN for tilbudsbrev:** The trusted standard (RULE 4) now specifies `employmentType: "NOT_CHOSEN"` and `workingHoursScheme: "NOT_CHOSEN"` for tilbudsbrev payloads. This is the primary untested fix for Check 5. Zero risk — same call count, same error profile. If it works → 14/14 (normalized ≈ 3.43 at 4 calls). If it doesn't → same 12/14.

2. **Keep ORDINARY/NOT_SHIFT for arbeidskontrakt:** The split is document-type-dependent. Arbeidskontrakt runs should continue using ORDINARY/NOT_SHIFT (proven 20/22).

3. **No call count optimization possible:** 4 calls is the proven minimum. GET /division is mandatory (422 without it on accounts with divisions). POST /department is mandatory (inline name gives 422). POST /employee and POST /employee/standardTime are both required.

4. **If NOT_CHOSEN fix fails:** The next hypothesis to test is a field we never set (payrollTaxMunicipalityId, taxDeductionCode, or similar). This would require deeper investigation of the EmploymentDetails schema and systematic field-by-field testing.
