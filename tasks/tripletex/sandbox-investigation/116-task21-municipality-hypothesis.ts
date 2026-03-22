/**
 * HYPOTHESIS: Check 5 verifies payrollTaxMunicipalityId on employment details.
 *
 * Evidence:
 * - We NEVER set payrollTaxMunicipalityId — it's always null
 * - Company salary settings have a default municipality (id: 262 in sandbox)
 * - Tripletex UI likely auto-populates this from company settings
 * - API does NOT auto-populate it — leaves it null
 * - PayrollTaxMunicipalityId is REQUIRED for proper A-ordningen reporting
 * - It's the ONLY consistently-unset field on EmploymentDetails
 *
 * Test: Full production-faithful flow with municipality from salary/settings
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.error(`  ERROR: ${text.substring(0, 300)}`);
  return { ok: r.ok, status: r.status, data: parsed };
}

async function main() {
  console.log("=== PRODUCTION-FAITHFUL FLOW WITH MUNICIPALITY ===\n");

  // Step 1 (parallel): GET division + POST department + GET salary/settings
  console.log("--- Step 1: Parallel prerequisites ---");
  const [divRes, deptRes, salaryRes] = await Promise.all([
    api("GET", "division?count=1&fields=id"),
    api("POST", "department", { name: "MunicipalityTest-" + Date.now() }),
    api("GET", "salary/settings?fields=municipality"),
  ]);

  const divId = divRes.data.values?.[0]?.id;
  const deptId = deptRes.data.value.id;
  const municipalityId = salaryRes.data.value?.municipality?.id;
  console.log(`  Division: ${divId}, Department: ${deptId}, Municipality: ${municipalityId}`);

  if (!municipalityId) {
    console.log("  WARNING: No municipality in salary settings — skipping payrollTaxMunicipalityId");
  }

  // Step 2: POST /employee with payrollTaxMunicipalityId
  console.log("\n--- Step 2: Create employee ---");
  const employment: any = {
    startDate: "2026-12-06",
    employmentDetails: [{
      date: "2026-12-06",
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      annualSalary: 620000,
      occupationCode: { id: 4679 },
      ...(municipalityId ? { payrollTaxMunicipalityId: { id: municipalityId } } : {}),
    }],
  };
  if (divId) employment.division = { id: divId };

  const empRes = await api("POST", "employee", {
    firstName: "Lucía",
    lastName: "González",
    dateOfBirth: "1983-01-31",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [employment],
  });

  if (!empRes.ok) {
    console.error("FAILED to create employee!");
    return;
  }

  const empId = empRes.data.value.id;
  console.log(`  Employee created: ${empId}`);

  // Step 3: POST /employee/standardTime
  console.log("\n--- Step 3: Set standard time ---");
  const stRes = await api("POST", "employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-12-06",
    hoursPerDay: 7.5,
  });

  // READBACK: Verify all fields
  console.log("\n--- READBACK ---");

  // Full employee
  const emp = await api("GET", `employee/${empId}?fields=*`);
  if (emp.ok) {
    const v = emp.data.value;
    console.log(`  Name: ${v.firstName} ${v.lastName}`);
    console.log(`  DOB: ${v.dateOfBirth}`);
    console.log(`  Department: ${JSON.stringify(v.department)}`);
  }

  // Employment
  const emps = await api("GET", `employee/employment?employeeId=${empId}&fields=*`);
  if (emps.ok && emps.data.values.length > 0) {
    const e = emps.data.values[0];
    console.log(`  Employment startDate: ${e.startDate}`);
    console.log(`  isMainEmployer: ${e.isMainEmployer}`);
    console.log(`  taxDeductionCode: ${e.taxDeductionCode}`);

    // Details
    const details = await api("GET", `employee/employment/details?employmentId=${e.id}&fields=*`);
    if (details.ok && details.data.values.length > 0) {
      const d = details.data.values[0];
      console.log(`  employmentType: ${d.employmentType}`);
      console.log(`  employmentForm: ${d.employmentForm}`);
      console.log(`  remunerationType: ${d.remunerationType}`);
      console.log(`  workingHoursScheme: ${d.workingHoursScheme}`);
      console.log(`  percentage: ${d.percentageOfFullTimeEquivalent}`);
      console.log(`  annualSalary: ${d.annualSalary}`);
      console.log(`  monthlySalary: ${d.monthlySalary}`);
      console.log(`  payrollTaxMunicipalityId: ${JSON.stringify(d.payrollTaxMunicipalityId)}`);
      console.log(`  occupationCode: ${JSON.stringify(d.occupationCode)}`);
    }
  }

  // Standard time
  const st2 = await api("GET", `employee/standardTime?employeeId=${empId}&fields=*`);
  if (st2.ok && st2.data.values.length > 0) {
    console.log(`  standardTime hoursPerDay: ${st2.data.values[0].hoursPerDay}`);
  }

  console.log("\n=== SUMMARY ===");
  console.log(`Total API calls: 5 (3 parallel + POST employee + POST standardTime)`);
  console.log(`payrollTaxMunicipalityId: ${municipalityId ? "SET to " + municipalityId : "NOT SET (no company municipality)"}`);
  console.log("If Check 5 was about payrollTaxMunicipalityId, this flow should fix it.");
  console.log("Production test needed to confirm.");
}

main().catch(e => { console.error(e); process.exit(1); });
