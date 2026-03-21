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
// REMAINING HYPOTHESES (ranked by probability):
//
//   1. [HIGH] occupationCode doesn't persist on production without division
//      - Sandbox always has division → occupationCode always persists
//      - Production has no division → occupationCode might silently drop
//      - All 5 codes fail, which is consistent with "code not persisted"
//      - Cannot test on sandbox (division required)
//      - ACTIONABLE: Add diagnostic GET readback on PRODUCTION after creation
//
//   2. [MEDIUM] payrollTaxMunicipalityId needs to be set
//      - Never set in any run
//      - Sandbox readback shows null
//      - Fresh production accounts may or may not have a default municipality
//      - ACTIONABLE: Try setting payrollTaxMunicipalityId from company/division settings
//
//   3. [LOW] Some other production-only difference (company settings, default data)
//      - Fresh production accounts may lack standard time settings
//      - Fresh production accounts may have different default configurations
//      - Cannot fully test without production access
//
// RECOMMENDED NEXT STEPS (in priority order):
//
//   STEP 1: Add a DIAGNOSTIC readback on production.
//   After POST /employee, add:
//     GET /employee/employment/details?employmentId=<id>&fields=occupationCode(*)
//   Cost: +1 API call (5 total instead of 4)
//   This definitively proves/disproves hypothesis 1.
//
//   STEP 2: If occupationCode persists on production, try setting payrollTaxMunicipalityId.
//   Need to determine the municipality from either:
//     GET /salary/settings?fields=municipality(*)  — company default
//     or GET /division?count=1&fields=municipality(*) — if division exists
//   Then include in employmentDetails: payrollTaxMunicipalityId: { id: <munId> }
//
//   STEP 3: If neither works, try a fundamentally different approach:
//     - Create employment WITHOUT nested details
//     - POST /employee/employment/details separately
//     - See if this changes the scoring outcome
//
// ============================================================================
// This file is a summary document, not executable code.
// See 72-*, 73-*, 74-*, 75-* for the actual test scripts.
// ============================================================================
