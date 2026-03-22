/**
 * Investigation: Task 21 Check 5 — test SEPARATE creation steps vs NESTED.
 *
 * Hypothesis: Maybe the scorer reads employment/details from the SEPARATE endpoints
 * and expects them to be created via separate POST calls, not inline in POST /employee.
 *
 * Also: test taxDeductionCode, isMainEmployer, and do full readback.
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
  const status = r.status;
  let parsed: any;
  try { parsed = JSON.parse(text); } catch { parsed = text; }
  console.log(`${method} ${path} → ${status}`);
  if (!r.ok) {
    console.error(`  ERROR: ${text.substring(0, 500)}`);
    return { error: true, status, body: parsed };
  }
  return parsed;
}

async function readback(empId: number) {
  console.log(`\n=== READBACK for employee ${empId} ===`);

  // Full employee readback
  const emp = await api("GET", `employee/${empId}?fields=*`);
  if (!emp.error) {
    const v = emp.value;
    console.log("  Employee keys:", Object.keys(v).join(", "));
    console.log("  firstName:", v.firstName, "lastName:", v.lastName);
    console.log("  dateOfBirth:", v.dateOfBirth);
    console.log("  department:", JSON.stringify(v.department));
    console.log("  employments count:", v.employments?.length);
  }

  // Employment readback
  const emps = await api("GET", `employee/employment?employeeId=${empId}&fields=*`);
  if (!emps.error && emps.values?.length > 0) {
    const e = emps.values[0];
    console.log("  Employment keys:", Object.keys(e).join(", "));
    console.log("  startDate:", e.startDate);
    console.log("  isMainEmployer:", e.isMainEmployer);
    console.log("  taxDeductionCode:", e.taxDeductionCode);
    console.log("  noEmploymentRelationship:", e.noEmploymentRelationship);
    console.log("  employmentId:", e.employmentId);
    console.log("  division:", JSON.stringify(e.division));
    console.log("  lastSalaryChangeDate:", e.lastSalaryChangeDate);

    // Employment details readback
    const empId2 = e.id;
    const details = await api("GET", `employee/employment/details?employmentId=${empId2}&fields=*`);
    if (!details.error && details.values?.length > 0) {
      const d = details.values[0];
      console.log("  Details keys:", Object.keys(d).join(", "));
      console.log("  date:", d.date);
      console.log("  employmentType:", d.employmentType);
      console.log("  employmentForm:", d.employmentForm);
      console.log("  remunerationType:", d.remunerationType);
      console.log("  workingHoursScheme:", d.workingHoursScheme);
      console.log("  occupationCode:", JSON.stringify(d.occupationCode));
      console.log("  percentageOfFullTimeEquivalent:", d.percentageOfFullTimeEquivalent);
      console.log("  annualSalary:", d.annualSalary);
      console.log("  hourlyWage:", d.hourlyWage);
      console.log("  payrollTaxMunicipalityId:", JSON.stringify(d.payrollTaxMunicipalityId));
      console.log("  maritimeEmployment:", JSON.stringify(d.maritimeEmployment));
      console.log("  shiftDurationHours:", d.shiftDurationHours);
      console.log("  monthlySalary:", d.monthlySalary);
    }
  }

  // Standard time readback
  const st = await api("GET", `employee/standardTime?employeeId=${empId}&fields=*`);
  if (!st.error) {
    console.log("  StandardTime:", JSON.stringify(st.values));
  }
}

async function main() {
  // Get division first (sandbox has divisions)
  const divRes = await api("GET", "division?count=1&fields=id");
  const divId = divRes.values?.[0]?.id;
  console.log("Division id:", divId);

  // Create department for all tests
  const deptRes = await api("POST", "department", { name: "TestCheck5-" + Date.now() });
  const deptId = deptRes.value.id;

  console.log("\n========================================");
  console.log("TEST A: Standard NESTED approach (baseline)");
  console.log("========================================");

  const empA = await api("POST", "employee", {
    firstName: "TestA",
    lastName: "Nested",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-06-01",
      division: divId ? { id: divId } : undefined,
      employmentDetails: [{
        date: "2026-06-01",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 600000,
        occupationCode: { id: 4679 },
      }],
    }],
  });
  const empIdA = empA.value.id;
  await api("POST", "employee/standardTime", {
    employee: { id: empIdA },
    fromDate: "2026-06-01",
    hoursPerDay: 7.5,
  });
  await readback(empIdA);

  console.log("\n========================================");
  console.log("TEST B: SEPARATE employment + details creation");
  console.log("========================================");

  // Step 1: Create employee WITHOUT employments
  const empB = await api("POST", "employee", {
    firstName: "TestB",
    lastName: "Separate",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
  });
  const empIdB = empB.value.id;
  console.log("  Employee created (no employments):", empIdB);

  // Step 2: POST /employee/employment separately
  const emplB = await api("POST", "employee/employment", {
    employee: { id: empIdB },
    startDate: "2026-06-01",
    division: divId ? { id: divId } : undefined,
  });
  if (emplB.error) {
    console.error("  FAILED to create employment separately:", JSON.stringify(emplB));
  } else {
    const emplIdB = emplB.value.id;
    console.log("  Employment created separately:", emplIdB);

    // Step 3: POST /employee/employment/details separately
    const detB = await api("POST", "employee/employment/details", {
      employment: { id: emplIdB },
      date: "2026-06-01",
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      annualSalary: 600000,
      occupationCode: { id: 4679 },
    });
    if (detB.error) {
      console.error("  FAILED to create details separately:", JSON.stringify(detB));
    } else {
      console.log("  Details created separately:", detB.value.id);
    }
  }

  // Step 4: Standard time
  await api("POST", "employee/standardTime", {
    employee: { id: empIdB },
    fromDate: "2026-06-01",
    hoursPerDay: 7.5,
  });
  await readback(empIdB);

  console.log("\n========================================");
  console.log("TEST C: Nested + explicit taxDeductionCode & isMainEmployer");
  console.log("========================================");

  const empC = await api("POST", "employee", {
    firstName: "TestC",
    lastName: "TaxCode",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-06-01",
      division: divId ? { id: divId } : undefined,
      taxDeductionCode: "loennFraHovedarbeidsgiver",
      isMainEmployer: true,
      employmentDetails: [{
        date: "2026-06-01",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 600000,
        occupationCode: { id: 4679 },
      }],
    }],
  });
  const empIdC = empC.value.id;
  await api("POST", "employee/standardTime", {
    employee: { id: empIdC },
    fromDate: "2026-06-01",
    hoursPerDay: 7.5,
  });
  await readback(empIdC);

  console.log("\n========================================");
  console.log("TEST D: Employee WITHOUT employments + separate emp + details + explicit fields");
  console.log("========================================");

  const empD = await api("POST", "employee", {
    firstName: "TestD",
    lastName: "FullSeparate",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
  });
  const empIdD = empD.value.id;

  const emplD = await api("POST", "employee/employment", {
    employee: { id: empIdD },
    startDate: "2026-06-01",
    division: divId ? { id: divId } : undefined,
    taxDeductionCode: "loennFraHovedarbeidsgiver",
    isMainEmployer: true,
    employmentDetails: [{
      date: "2026-06-01",
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      annualSalary: 600000,
      occupationCode: { id: 4679 },
    }],
  });
  if (emplD.error) {
    console.error("  Employment creation failed");
  } else {
    console.log("  Employment created:", emplD.value.id);
  }

  await api("POST", "employee/standardTime", {
    employee: { id: empIdD },
    fromDate: "2026-06-01",
    hoursPerDay: 7.5,
  });
  await readback(empIdD);

  console.log("\n========================================");
  console.log("TEST E: Try startDate on employee level too (maybe employee.startDate?)");
  console.log("========================================");

  // What if there's an employee-level field we haven't tried?
  const empE = await api("POST", "employee", {
    firstName: "TestE",
    lastName: "StartDate",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    startDate: "2026-06-01", // Try employee-level startDate
    employments: [{
      startDate: "2026-06-01",
      division: divId ? { id: divId } : undefined,
      employmentDetails: [{
        date: "2026-06-01",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 600000,
        occupationCode: { id: 4679 },
      }],
    }],
  });
  if (empE.error) {
    console.log("  Employee-level startDate: REJECTED (field doesn't exist)");
  } else {
    console.log("  Employee-level startDate: ACCEPTED, id:", empE.value.id);
    await readback(empE.value.id);
  }

  console.log("\n========================================");
  console.log("TEST F: Check if there's any difference in employment/details between A (nested) and B (separate)");
  console.log("========================================");
  console.log("Compare the readback outputs above — look for any field that differs");

  console.log("\n\nDONE — check results above for differences between approaches");
}

main().catch(e => { console.error(e); process.exit(1); });
