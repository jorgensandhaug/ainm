/**
 * Task 21 (Onboard Employee - tilbudsbrev) comprehensive sandbox investigation
 *
 * Goal: Find what Check 5 requires. 15 production runs, ALL 12/14, Check 5 ALWAYS fails.
 *
 * Strategy:
 * 1. First: cleanup any prior test employees
 * 2. Create employee with ALL fields including untested ones:
 *    - employeeNumber: "1"
 *    - employmentId: "1"
 *    - comments (maybe probation info from PDF?)
 *    - isMainEmployer explicitly
 *    - taxDeductionCode explicitly
 * 3. Full readback of EVERY field
 * 4. Check employee/employment/details endpoints for fields we might be missing
 * 5. Explore attachment upload endpoint
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function api(method: string, path: string, body?: any): Promise<{status: number; data: any}> {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = text; }
  if (res.status >= 400) {
    console.log(`  [${res.status}] ${method} ${path}: ${JSON.stringify(data).slice(0, 300)}`);
  }
  return { status: res.status, data };
}

function extract(resp: any): any {
  if (resp.data?.values !== undefined) return resp.data.values;
  if (resp.data?.value !== undefined) return resp.data.value;
  return resp.data;
}

async function main() {
  console.log("=== TASK 21 INVESTIGATION: Onboard Employee (tilbudsbrev) ===\n");

  // Step 0: Check current employees to understand sandbox state
  console.log("--- Step 0: Current employees ---");
  const empResp = await api("GET", "/employee?count=100&fields=id,firstName,lastName,employeeNumber,email,dateOfBirth");
  const employees = extract(empResp);
  console.log(`Current employees: ${employees.length}`);
  for (const e of employees) {
    console.log(`  id=${e.id} ${e.firstName} ${e.lastName} empNum="${e.employeeNumber}" email="${e.email}" dob=${e.dateOfBirth}`);
  }

  // Step 0b: Find and delete any prior "Test" employees we created
  const testEmps = employees.filter((e: any) =>
    e.firstName?.startsWith("Sandbox") || e.lastName?.startsWith("T21")
  );
  for (const te of testEmps) {
    console.log(`  Deleting test employee ${te.id} ${te.firstName} ${te.lastName}...`);
    const del = await api("DELETE", `/employee/${te.id}`);
    console.log(`    DELETE: ${del.status}`);
  }

  // Step 1: Pre-reads (parallel in production, sequential here for clarity)
  console.log("\n--- Step 1: Pre-reads ---");

  const divResp = await api("GET", "/division?count=1&fields=id,name");
  const divisions = extract(divResp);
  console.log(`Divisions: ${divisions.length}`);
  for (const d of divisions) console.log(`  id=${d.id} name=${d.name}`);
  const divisionId = divisions.length > 0 ? divisions[0].id : null;

  const deptResp = await api("GET", "/department?isInactive=false&count=1000&fields=*");
  const departments = extract(deptResp);
  console.log(`Departments: ${departments.length}`);
  for (const d of departments) console.log(`  id=${d.id} name="${d.name}"`);

  const salarySettingsResp = await api("GET", "/salary/settings?fields=municipality");
  const salarySettings = extract(salarySettingsResp);
  console.log(`Salary settings municipality: ${JSON.stringify(salarySettings?.municipality)}`);
  const municipalityId = salarySettings?.municipality?.id;

  // Step 1b: Check employee categories
  const catResp = await api("GET", "/employee/category?count=100&fields=*");
  const categories = extract(catResp);
  console.log(`Employee categories: ${categories.length}`);
  for (const c of categories) console.log(`  id=${c.id} name="${c.name}" number="${c.number}" displayName="${c.displayName}"`);

  // Step 2: Find or create department "IT"
  console.log("\n--- Step 2: Department ---");
  let deptId: number;
  const itDept = departments.find((d: any) => d.name?.toLowerCase() === "it");
  if (itDept) {
    deptId = itDept.id;
    console.log(`Found existing IT dept: id=${deptId}`);
  } else {
    const createDept = await api("POST", "/department", { name: "IT" });
    deptId = extract(createDept)?.id;
    console.log(`Created IT dept: id=${deptId}`);
  }

  // Step 3: Find next available employeeNumber
  console.log("\n--- Step 3: Find available employeeNumber ---");
  const existingNums = employees.map((e: any) => e.employeeNumber).filter(Boolean);
  console.log(`Existing employee numbers: ${JSON.stringify(existingNums)}`);
  // Find next free number
  let nextEmpNum = 1;
  while (existingNums.includes(String(nextEmpNum))) nextEmpNum++;
  console.log(`Using employeeNumber: "${nextEmpNum}"`);

  // Step 4: Create employee with MAXIMAL payload
  console.log("\n--- Step 4: Create employee (MAXIMAL payload) ---");
  const employeePayload: any = {
    firstName: "Sandbox",
    lastName: "T21-Test",
    dateOfBirth: "1987-12-30",
    userType: "NO_ACCESS",
    employeeNumber: String(nextEmpNum),
    email: "", // Try empty string explicitly
    comments: "Prøvetid: 6 måneder med 14 dagers gjensidig oppsigelsesfrist. Etter prøvetiden er oppsigelsesfristen 3 måneder.",
    department: { id: deptId },
    employments: [
      {
        startDate: "2026-05-24",
        employmentId: String(nextEmpNum),
        isMainEmployer: true,
        taxDeductionCode: "loennFraHovedarbeidsgiver",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-05-24",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 560000,
            occupationCode: { id: 2610 }, // IT-konsulent
            ...(municipalityId ? { payrollTaxMunicipalityId: { id: municipalityId } } : {}),
          }
        ]
      }
    ]
  };

  console.log("Employee payload:");
  console.log(JSON.stringify(employeePayload, null, 2));

  const createEmpResp = await api("POST", "/employee?fields=*,employments(*,employmentDetails(*))", employeePayload);
  const newEmployee = extract(createEmpResp);

  if (createEmpResp.status >= 400) {
    console.log("FAILED to create employee!");
    console.log(JSON.stringify(createEmpResp.data, null, 2));

    // If employeeNumber conflict, try next
    if (JSON.stringify(createEmpResp.data).includes("Finnes fra før")) {
      console.log("employeeNumber conflict, trying next...");
      employeePayload.employeeNumber = String(nextEmpNum + 1);
      employeePayload.employments[0].employmentId = String(nextEmpNum + 1);
      const retry = await api("POST", "/employee?fields=*,employments(*,employmentDetails(*))", employeePayload);
      if (retry.status < 400) {
        Object.assign(newEmployee, extract(retry));
        console.log("Retry succeeded!");
      } else {
        console.log("Retry also failed:", JSON.stringify(retry.data, null, 2));
        return;
      }
    } else {
      return;
    }
  }

  const empId = newEmployee?.id;
  const employmentId = newEmployee?.employments?.[0]?.id;
  console.log(`\nCreated employee id=${empId}`);
  console.log(`Employment id=${employmentId}`);
  console.log("\nFull POST response:");
  console.log(JSON.stringify(newEmployee, null, 2));

  // Step 5: POST standard time
  console.log("\n--- Step 5: POST standard time ---");
  const stdTimeResp = await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-05-24",
    hoursPerDay: 7.5,
  });
  console.log(`Standard time: ${stdTimeResp.status}`);
  console.log(JSON.stringify(extract(stdTimeResp), null, 2));

  // Step 6: COMPREHENSIVE readback
  console.log("\n--- Step 6: Comprehensive readback ---");

  // 6a: Employee with deep expansion
  const readEmp = await api("GET", `/employee/${empId}?fields=*,department(*),employments(*,employmentDetails(*,occupationCode(*),payrollTaxMunicipalityId(*))),address(*),employeeCategory(*),holidayAllowanceEarned(*)`);
  console.log("\n=== FULL EMPLOYEE READBACK ===");
  console.log(JSON.stringify(extract(readEmp), null, 2));

  // 6b: Standard time
  const readStdTime = await api("GET", `/employee/standardTime?employeeId=${empId}&fields=*`);
  console.log("\n=== STANDARD TIME READBACK ===");
  console.log(JSON.stringify(extract(readStdTime), null, 2));

  // 6c: Employment details separately
  if (employmentId) {
    const readDetails = await api("GET", `/employee/employment/details?employmentId=${employmentId}&fields=*,occupationCode(*),payrollTaxMunicipalityId(*)`);
    console.log("\n=== EMPLOYMENT DETAILS READBACK ===");
    console.log(JSON.stringify(extract(readDetails), null, 2));
  }

  // Step 7: Check what fields are empty/missing vs what UI would set
  console.log("\n--- Step 7: Field analysis ---");
  const emp = extract(readEmp);
  const checks = {
    firstName: emp.firstName,
    lastName: emp.lastName,
    dateOfBirth: emp.dateOfBirth,
    email: emp.email,
    employeeNumber: emp.employeeNumber,
    comments: emp.comments,
    userType: emp.userType,
    isContact: emp.isContact,
    department_id: emp.department?.id,
    department_name: emp.department?.name,
    nationalIdentityNumber: emp.nationalIdentityNumber,
    bankAccountNumber: emp.bankAccountNumber,
    phoneNumberMobile: emp.phoneNumberMobile,
    phoneNumberHome: emp.phoneNumberHome,
    phoneNumberWork: emp.phoneNumberWork,
    address: emp.address,
    employeeCategory: emp.employeeCategory,
    holidayAllowanceEarned: emp.holidayAllowanceEarned,
    allowInformationRegistration: emp.allowInformationRegistration,
    employment_startDate: emp.employments?.[0]?.startDate,
    employment_employmentId: emp.employments?.[0]?.employmentId,
    employment_isMainEmployer: emp.employments?.[0]?.isMainEmployer,
    employment_taxDeductionCode: emp.employments?.[0]?.taxDeductionCode,
    employment_noEmploymentRelationship: emp.employments?.[0]?.noEmploymentRelationship,
    detail_employmentType: emp.employments?.[0]?.employmentDetails?.[0]?.employmentType,
    detail_employmentForm: emp.employments?.[0]?.employmentDetails?.[0]?.employmentForm,
    detail_remunerationType: emp.employments?.[0]?.employmentDetails?.[0]?.remunerationType,
    detail_workingHoursScheme: emp.employments?.[0]?.employmentDetails?.[0]?.workingHoursScheme,
    detail_annualSalary: emp.employments?.[0]?.employmentDetails?.[0]?.annualSalary,
    detail_percentageOfFullTimeEquivalent: emp.employments?.[0]?.employmentDetails?.[0]?.percentageOfFullTimeEquivalent,
    detail_occupationCode_id: emp.employments?.[0]?.employmentDetails?.[0]?.occupationCode?.id,
    detail_payrollTaxMunicipalityId_id: emp.employments?.[0]?.employmentDetails?.[0]?.payrollTaxMunicipalityId?.id,
    detail_monthlySalary: emp.employments?.[0]?.employmentDetails?.[0]?.monthlySalary,
  };

  console.log("\nField summary:");
  for (const [key, val] of Object.entries(checks)) {
    const status = val === null || val === undefined || val === "" ? "❌ EMPTY" : "✅";
    console.log(`  ${status} ${key} = ${JSON.stringify(val)}`);
  }

  // Step 8: Try to discover attachment/upload endpoints for employee
  console.log("\n--- Step 8: Explore attachment endpoints ---");

  // Try common attachment patterns
  const attachEndpoints = [
    `/employee/${empId}/attachment`,
    `/employee/${empId}/document`,
    `/document?employeeId=${empId}`,
  ];
  for (const ep of attachEndpoints) {
    const r = await api("GET", ep);
    console.log(`  GET ${ep}: ${r.status} ${JSON.stringify(r.data).slice(0, 200)}`);
  }

  // Step 9: Try to explore undocumented employee endpoints
  console.log("\n--- Step 9: Explore related endpoints ---");

  // Check if there's an employee token/access endpoint
  const exploreEndpoints = [
    `/employee/${empId}/token`,
    `/employee/${empId}/preferences`,
    `/employee/${empId}/leaveOfAbsence`,
    `/employee/${empId}/contract`,
  ];
  for (const ep of exploreEndpoints) {
    const r = await api("GET", ep);
    if (r.status < 400) {
      console.log(`  ✅ GET ${ep}: ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
    } else {
      console.log(`  ❌ GET ${ep}: ${r.status}`);
    }
  }

  // Step 10: Check what the existing sandbox employee (id=1) looks like
  // to compare fields with ours
  console.log("\n--- Step 10: Compare with existing employee ---");
  if (employees.length > 0) {
    const existingId = employees[0].id;
    const existingFull = await api("GET", `/employee/${existingId}?fields=*,department(*),employments(*,employmentDetails(*,occupationCode(*),payrollTaxMunicipalityId(*))),address(*),employeeCategory(*),holidayAllowanceEarned(*)`);
    const existing = extract(existingFull);
    console.log(`\nExisting employee id=${existingId} (${existing.firstName} ${existing.lastName}):`);

    // Compare key fields
    const compareFields = [
      "employeeNumber", "email", "comments", "userType", "isContact",
      "nationalIdentityNumber", "bankAccountNumber", "allowInformationRegistration",
      "phoneNumberMobile", "phoneNumberHome", "phoneNumberWork",
    ];
    for (const field of compareFields) {
      const ours = (emp as any)?.[field];
      const theirs = existing?.[field];
      const diff = JSON.stringify(ours) !== JSON.stringify(theirs) ? " ⚠️ DIFFERENT" : "";
      console.log(`  ${field}: ours=${JSON.stringify(ours)} theirs=${JSON.stringify(theirs)}${diff}`);
    }

    // Compare employment fields
    if (existing?.employments?.[0]) {
      const theirEmp = existing.employments[0];
      const ourEmp = emp.employments?.[0];
      console.log(`\n  Employment comparison:`);
      const empFields = ["employmentId", "startDate", "isMainEmployer", "taxDeductionCode", "noEmploymentRelationship"];
      for (const field of empFields) {
        const ours = (ourEmp as any)?.[field];
        const theirs = (theirEmp as any)?.[field];
        const diff = JSON.stringify(ours) !== JSON.stringify(theirs) ? " ⚠️ DIFFERENT" : "";
        console.log(`    ${field}: ours=${JSON.stringify(ours)} theirs=${JSON.stringify(theirs)}${diff}`);
      }

      // Compare employment details
      if (theirEmp.employmentDetails?.[0]) {
        const theirDet = theirEmp.employmentDetails[0];
        const ourDet = emp.employments?.[0]?.employmentDetails?.[0];
        console.log(`\n  EmploymentDetails comparison:`);
        const detFields = ["employmentType", "employmentForm", "remunerationType", "workingHoursScheme",
                           "percentageOfFullTimeEquivalent", "annualSalary", "monthlySalary",
                           "occupationCode", "payrollTaxMunicipalityId", "shiftDurationHours"];
        for (const field of detFields) {
          const ours = (ourDet as any)?.[field];
          const theirs = (theirDet as any)?.[field];
          const diff = JSON.stringify(ours) !== JSON.stringify(theirs) ? " ⚠️ DIFFERENT" : "";
          console.log(`    ${field}: ours=${JSON.stringify(ours)} theirs=${JSON.stringify(theirs)}${diff}`);
        }
      }
    }
  }

  // Cleanup: Delete the test employee
  console.log("\n--- Cleanup ---");
  if (empId) {
    const delResp = await api("DELETE", `/employee/${empId}`);
    console.log(`Delete employee ${empId}: ${delResp.status}`);
  }
}

main().catch(console.error);
