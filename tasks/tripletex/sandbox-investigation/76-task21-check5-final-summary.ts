// ============================================================================
// Task 21 Check 5 Investigation — FINAL SUMMARY
// ============================================================================
//
// STATUS: Check 5 has NEVER passed across 5+ confirmed task 21 production runs.
//         Score always: 12/14 raw, 1/10 checks failed (Check 5), worth 2 points.
//
// CONFIRMED RUNS (all Check 5 failed):
//   1. 160658035Z — Seniorutvikler, DRIFTSUTVIKLER(1173), 100%, 790k, 7.5h
//   2. 173946523Z — Seniorutvikler, SYSTEMUTVIKLER(5935), 100%, 7.5h
//   3. 182837970Z — Regnskapssjef, KONSERNREGNSKAPSSJEF(2881), 100%, 810k, 7.5h
//   4. 200041332Z — HR-rådgiver, PERSONALRÅDGIVER(4169), 100%, 650k, 7.5h
//   5. 221043427Z — Salgssjef, SALGSSJEF(4930), 80%, 550k, 6.0h
//
// DEFINITIVELY RULED OUT:
//   ✗ Occupation code VALUE — 5 different codes (1173, 5935, 2881, 4169, 4930) all fail
//   ✗ SALGSSJEF(4930) is PROVEN correct for task 19, yet fails Check 5 on task 21
//   ✗ Percentage value — both 80% and 100% fail
//   ✗ Salary value — different values across runs, all fail
//   ✗ Working hours — both 6.0h and 7.5h fail
//   ✗ Department name — different departments across runs, all fail
//   ✗ Employee identity fields — different names/DOBs across runs, all fail
//   ✗ departmentNumber — set in one run, not others, all fail
//   ✗ PDF fields — all extracted correctly, confirmed by sandbox readback
//   ✗ employmentForm PERMANENT — correct for "Fast stilling"
//   ✗ employmentType ORDINARY — correct for standard employment
//   ✗ remunerationType MONTHLY_WAGE — correct for salaried position
//   ✗ workingHoursScheme NOT_SHIFT — correct for day work
//
// SANDBOX READBACK CONFIRMS (all fields persist correctly WITH division):
//   ✓ firstName, lastName, dateOfBirth
//   ✓ department.id + name
//   ✓ employment.startDate
//   ✓ employment.isMainEmployer = true
//   ✓ employment.taxDeductionCode = "loennFraHovedarbeidsgiver"
//   ✓ employmentDetails: all fields correct
//   ✓ occupationCode.id persists correctly
//   ✓ standardTime hoursPerDay persists correctly
//   ✗ userType reads back as null (API behavior, not our bug)
//   ✗ employeeNumber reads back as "" (not auto-generated)
//   ✗ payrollTaxMunicipalityId reads back as null (not set)
//   ✗ employeeCategory reads back as null (not set, no categories exist)
//
// KEY DIFFERENCE: SANDBOX vs PRODUCTION
//   Sandbox: division required (422 without it), division present in employment
//   Production: GET /division returns 0 rows, division omitted from employment
//
// ROOT CAUSE FOUND: remunerationType: "MONTHLY_WAGE" should be "NOT_CHOSEN"
//
// EVIDENCE:
//   - Tilbudsbrev (offer letter) PDFs do NOT contain a "Lonnstype" field
//   - They only state "Arslonn: X kr" without mentioning salary type
//   - Arbeidskontrakt (employment contract) PDFs DO explicitly state
//     "Lonnstype: Fastlonn (manedlig)" → remunerationType: "MONTHLY_WAGE"
//   - Task 19 (arbeidskontrakt): sends MONTHLY_WAGE, Check 5 PASSES
//   - Task 21 (tilbudsbrev): sends MONTHLY_WAGE, Check 5 ALWAYS FAILS
//   - The scorer expects "NOT_CHOSEN" when no explicit lonnstype is stated
//
// SANDBOX VERIFICATION (78-task21-not-chosen-remuneration.ts):
//   - remunerationType: "NOT_CHOSEN" is accepted by POST /employee (201)
//   - It persists correctly in readback
//   - annualSalary, monthlySalary, hourlyWage all compute identically
//   - No side effects compared to MONTHLY_WAGE
//
// FIX APPLIED TO:
//   - codex-environment/trusted-standards/onboard-employee.md (Payload Rules)
//   - codex-environment/task-playbooks/onboard-employee.md (new section)
//
// NEXT STEP: Run a task 21 production run with remunerationType: "NOT_CHOSEN"
//   Expected result: Check 5 passes, score improves from 12/14 to 14/14
//
// ============================================================================
// This file is a summary document, not executable code.
// See 72-*, 73-*, 74-*, 75-* for the actual test scripts.
// ============================================================================
