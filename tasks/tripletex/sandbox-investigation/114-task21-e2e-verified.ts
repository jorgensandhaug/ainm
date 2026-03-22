/**
 * Task 21 — End-to-End Verified Test: Onboard Employee from Offer Letter
 *
 * This script simulates the EXACT production flow for task 21 (tilbudsbrev/offer letter)
 * and verifies every scored field via readback.
 *
 * KEY FIX UNDER TEST: remunerationType: "NOT_CHOSEN" (not "MONTHLY_WAGE")
 * for tilbudsbrev that only say "Årslønn: X kr" without a "Lønnstype" field.
 *
 * Flow (4 calls, 0 errors expected):
 *   1. GET /division?count=1&fields=id
 *   2. POST /department
 *   3. POST /employee (with nested employmentDetails, remunerationType: NOT_CHOSEN)
 *   4. POST /employee/standardTime
 *
 * Then full readback verification.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN =
  "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H: Record<string, string> = {
  Authorization: AUTH,
  "Content-Type": "application/json",
};

let callCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  const status = res.status;
  if (status >= 400) {
    errorCount++;
    console.log(
      `[CALL ${callCount}] ${method} ${path} => ${status} ERROR`
    );
    console.log(`  ${JSON.stringify(json).slice(0, 600)}`);
  } else {
    console.log(`[CALL ${callCount}] ${method} ${path} => ${status} OK`);
  }
  return { status, data: json, ok: status < 400 };
}

function val(r: { data: any }) {
  if (r.data?.values !== undefined) return r.data.values;
  if (r.data?.value !== undefined) return r.data.value;
  return r.data;
}

// Readback calls don't count towards the "production call count"
async function readback(method: string, path: string) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: H });
  const text = await res.text();
  let json: any;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, data: json };
}

function rbVal(r: { data: any }) {
  if (r.data?.values !== undefined) return r.data.values;
  if (r.data?.value !== undefined) return r.data.value;
  return r.data;
}

// ============================================================================
// TEST SCENARIO: Salgssjef offer letter (tilbudsbrev)
// Simulates: "Du har mottatt et tilbudsbrev for stillingen som Salgssjef"
// ============================================================================
const SCENARIO = {
  firstName: "E2E-Test",
  lastName: "Tilbudsbrev",
  dateOfBirth: "1985-06-15",
  department: "E2E-Testavdeling",
  startDate: "2026-08-01",
  percentage: 100,
  annualSalary: 750000,
  hoursPerDay: 7.5,
  occupationCodeId: 4930, // SALGSSJEF (hardcoded)
  remunerationType: "NOT_CHOSEN", // THE KEY FIX — tilbudsbrev has no Lønnstype
};

async function main() {
  console.log("=" .repeat(80));
  console.log("TASK 21 — END-TO-END VERIFIED TEST");
  console.log("Scenario: Salgssjef offer letter (tilbudsbrev)");
  console.log(`remunerationType: ${SCENARIO.remunerationType} (THE KEY FIX)`);
  console.log("=" .repeat(80));

  // ========================
  // STEP 1 & 2: Parallel prerequisites (GET /division + POST /department)
  // ========================
  console.log("\n--- STEP 1+2: Prerequisites (parallel) ---");

  const divRes = await api("GET", "/division?count=1&fields=id");
  const divisions = val(divRes);
  const divId = Array.isArray(divisions) && divisions.length > 0 ? divisions[0].id : null;
  console.log(`  Division: ${divId ? `id=${divId}` : "none (fresh account)"}`);

  const deptRes = await api("POST", "/department", { name: SCENARIO.department });
  const deptId = val(deptRes)?.id;
  if (!deptId) {
    console.log("FATAL: Failed to create department");
    process.exit(1);
  }
  console.log(`  Department: id=${deptId}`);

  // ========================
  // STEP 3: POST /employee with nested employmentDetails
  // ========================
  console.log("\n--- STEP 3: POST /employee ---");

  const employeePayload: any = {
    firstName: SCENARIO.firstName,
    lastName: SCENARIO.lastName,
    dateOfBirth: SCENARIO.dateOfBirth,
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [
      {
        startDate: SCENARIO.startDate,
        ...(divId ? { division: { id: divId } } : {}),
        employmentDetails: [
          {
            date: SCENARIO.startDate,
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: SCENARIO.remunerationType,
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: SCENARIO.percentage,
            annualSalary: SCENARIO.annualSalary,
            occupationCode: { id: SCENARIO.occupationCodeId },
          },
        ],
      },
    ],
  };

  console.log("  Payload:", JSON.stringify(employeePayload, null, 2));

  const empRes = await api("POST", "/employee?fields=*,employments(*)", employeePayload);
  const emp = val(empRes);
  if (!emp?.id) {
    console.log("FATAL: Failed to create employee");
    process.exit(1);
  }
  const empId = emp.id;
  const emplId = emp.employments?.[0]?.id;
  console.log(`  Employee created: id=${empId}, employment id=${emplId}`);

  // ========================
  // STEP 4: POST /employee/standardTime
  // ========================
  console.log("\n--- STEP 4: POST /employee/standardTime ---");

  const stdTimeRes = await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: SCENARIO.startDate,
    hoursPerDay: SCENARIO.hoursPerDay,
  });
  if (!stdTimeRes.ok) {
    console.log("WARNING: standardTime POST failed (non-fatal for this test)");
  }

  // ========================
  // SUMMARY OF PRODUCTION CALLS
  // ========================
  console.log("\n" + "=" .repeat(80));
  console.log(`PRODUCTION CALLS: ${callCount} calls, ${errorCount} errors`);
  console.log("=" .repeat(80));

  // ========================
  // READBACK: Verify ALL scored fields
  // ========================
  console.log("\n" + "=" .repeat(80));
  console.log("READBACK VERIFICATION (not counted as production calls)");
  console.log("=" .repeat(80));

  // 1. Employee identity
  const empRb = await readback("GET", `/employee/${empId}?fields=*`);
  const e = rbVal(empRb);
  console.log("\n--- Employee identity ---");
  console.log(`  firstName:   ${e?.firstName}  (expected: ${SCENARIO.firstName})`);
  console.log(`  lastName:    ${e?.lastName}  (expected: ${SCENARIO.lastName})`);
  console.log(`  dateOfBirth: ${e?.dateOfBirth}  (expected: ${SCENARIO.dateOfBirth})`);
  console.log(`  department:  ${e?.department?.id}  (expected: ${deptId})`);

  // 2. Employment details
  const detRb = await readback(
    "GET",
    `/employee/employment/details?employmentId=${emplId}&fields=*,occupationCode(*)`
  );
  const det = rbVal(detRb)?.[0];
  console.log("\n--- Employment details ---");
  console.log(`  employmentType:     ${det?.employmentType}  (expected: ORDINARY)`);
  console.log(`  employmentForm:     ${det?.employmentForm}  (expected: PERMANENT)`);
  console.log(`  remunerationType:   ${det?.remunerationType}  (expected: ${SCENARIO.remunerationType})`);
  console.log(`  workingHoursScheme: ${det?.workingHoursScheme}  (expected: NOT_SHIFT)`);
  console.log(`  percentage:         ${det?.percentageOfFullTimeEquivalent}  (expected: ${SCENARIO.percentage})`);
  console.log(`  annualSalary:       ${det?.annualSalary}  (expected: ${SCENARIO.annualSalary})`);
  console.log(`  monthlySalary:      ${det?.monthlySalary}`);
  console.log(`  occupationCode.id:  ${det?.occupationCode?.id}  (expected: ${SCENARIO.occupationCodeId})`);
  console.log(`  occupationCode.nameNO: ${det?.occupationCode?.nameNO}`);
  console.log(`  occupationCode.code:   ${det?.occupationCode?.code}`);

  // 3. Standard worktime
  const stRb = await readback(
    "GET",
    `/employee/standardTime?employeeId=${empId}&fields=*`
  );
  const st = rbVal(stRb)?.[0];
  console.log("\n--- Standard worktime ---");
  console.log(`  hoursPerDay: ${st?.hoursPerDay}  (expected: ${SCENARIO.hoursPerDay})`);
  console.log(`  fromDate:    ${st?.fromDate}  (expected: ${SCENARIO.startDate})`);
  console.log(`  employee.id: ${st?.employee?.id}  (expected: ${empId})`);

  // 4. Department readback
  const deptRb = await readback("GET", `/department/${deptId}?fields=*`);
  const dept = rbVal(deptRb);
  console.log("\n--- Department ---");
  console.log(`  name: ${dept?.name}  (expected: ${SCENARIO.department})`);

  // ========================
  // CHECK-BY-CHECK SIMULATION
  // ========================
  console.log("\n" + "=" .repeat(80));
  console.log("CHECK-BY-CHECK SIMULATION (task 21: 10 checks, 14 max raw score)");
  console.log("=" .repeat(80));

  const checks: { name: string; pass: boolean; reason: string }[] = [];

  // Check 1: Employee exists
  checks.push({
    name: "Check 1: Employee exists",
    pass: !!emp?.id,
    reason: emp?.id ? `id=${empId}` : "no employee created",
  });

  // Check 2: First name
  checks.push({
    name: "Check 2: First name",
    pass: e?.firstName === SCENARIO.firstName,
    reason: `${e?.firstName} vs expected ${SCENARIO.firstName}`,
  });

  // Check 3: Last name
  checks.push({
    name: "Check 3: Last name",
    pass: e?.lastName === SCENARIO.lastName,
    reason: `${e?.lastName} vs expected ${SCENARIO.lastName}`,
  });

  // Check 4: Date of birth
  checks.push({
    name: "Check 4: Date of birth",
    pass: e?.dateOfBirth === SCENARIO.dateOfBirth,
    reason: `${e?.dateOfBirth} vs expected ${SCENARIO.dateOfBirth}`,
  });

  // Check 5: remunerationType (THE KEY FIX)
  checks.push({
    name: "Check 5: remunerationType",
    pass: det?.remunerationType === SCENARIO.remunerationType,
    reason: `${det?.remunerationType} vs expected ${SCENARIO.remunerationType}`,
  });

  // Check 6: Department
  checks.push({
    name: "Check 6: Department",
    pass: e?.department?.id === deptId,
    reason: `${e?.department?.id} vs expected ${deptId}`,
  });

  // Check 7: Employment form (PERMANENT)
  checks.push({
    name: "Check 7: Employment form",
    pass: det?.employmentForm === "PERMANENT",
    reason: `${det?.employmentForm} vs expected PERMANENT`,
  });

  // Check 8: Percentage
  checks.push({
    name: "Check 8: Percentage",
    pass: det?.percentageOfFullTimeEquivalent === SCENARIO.percentage,
    reason: `${det?.percentageOfFullTimeEquivalent} vs expected ${SCENARIO.percentage}`,
  });

  // Check 9: Annual salary
  checks.push({
    name: "Check 9: Annual salary",
    pass: det?.annualSalary === SCENARIO.annualSalary,
    reason: `${det?.annualSalary} vs expected ${SCENARIO.annualSalary}`,
  });

  // Check 10: Standard worktime
  checks.push({
    name: "Check 10: Standard worktime",
    pass: st?.hoursPerDay === SCENARIO.hoursPerDay,
    reason: `${st?.hoursPerDay} vs expected ${SCENARIO.hoursPerDay}`,
  });

  let passCount = 0;
  for (const c of checks) {
    const status = c.pass ? "PASS" : "FAIL";
    passCount += c.pass ? 1 : 0;
    console.log(`  ${status}  ${c.name}  (${c.reason})`);
  }

  // ========================
  // FINAL VERDICT
  // ========================
  console.log("\n" + "=" .repeat(80));
  console.log("FINAL VERDICT");
  console.log("=" .repeat(80));
  console.log(`  Checks passed: ${passCount}/10`);
  console.log(`  API calls:     ${callCount}`);
  console.log(`  Errors:        ${errorCount}`);
  console.log(
    `  remunerationType persisted as: ${det?.remunerationType} (${
      det?.remunerationType === "NOT_CHOSEN" ? "CORRECT" : "WRONG"
    })`
  );

  if (passCount === 10 && errorCount === 0 && callCount === 4) {
    console.log("\n  *** PERFECT: 10/10 checks, 4 calls, 0 errors ***");
    console.log("  This flow is ready for production.");
  } else if (passCount === 10 && errorCount === 0) {
    console.log(`\n  *** ALL CHECKS PASS but ${callCount} calls (optimal is 4) ***`);
  } else {
    console.log(`\n  *** ISSUES FOUND — review failed checks above ***`);
  }

  // ========================
  // BONUS: Occupation code verification for ALL hardcoded mappings
  // ========================
  console.log("\n" + "=" .repeat(80));
  console.log("BONUS: Verify ALL hardcoded occupation code mappings");
  console.log("=" .repeat(80));

  const mappings = [
    { label: "Salgssjef", id: 4930, expectedName: "SALGSSJEF" },
    { label: "Regnskapssjef", id: 4679, expectedName: "REGNSKAPSSJEF" },
    { label: "HR-rådgiver", id: 4169, expectedName: "PERSONALRÅDGIVER" },
    { label: "Seniorutvikler", id: 5935, expectedName: "SYSTEMUTVIKLER" },
    { label: "Kontormedarbeider", id: 2951, expectedName: "KONTORMEDARBEIDER" },
    { label: "IT-konsulent", id: 2610, expectedName: "IT-KONSULENT" },
    { label: "STYRK 2511", id: 301, expectedName: null },
    { label: "STYRK 3323 (Innkjøpsassistent)", id: 2507, expectedName: "INNKJØPSASSISTENT" },
    { label: "STYRK 3313 (Regnskapsmedarbeider)", id: 4677, expectedName: "REGNSKAPSMEDARBEIDER" },
    { label: "STYRK 3512 (Brukerstøtte IKT)", id: 752, expectedName: "BRUKERSTØTTE IKT" },
  ];

  for (const m of mappings) {
    const r = await readback(
      "GET",
      `/employee/employment/occupationCode/${m.id}?fields=id,nameNO,code`
    );
    const oc = rbVal(r);
    const nameMatch = m.expectedName === null || oc?.nameNO === m.expectedName;
    console.log(
      `  ${nameMatch ? "OK" : "MISMATCH"}  ${m.label}: id=${m.id} => ${oc?.nameNO} (code=${oc?.code})`
    );
  }
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
