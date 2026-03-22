/**
 * Investigation: Task 21 Check 5 — test OMITTING fields vs setting NOT_CHOSEN.
 * Also test payrollTaxMunicipalityId and other rarely-set fields.
 *
 * Key hypothesis: What if OMITTING employmentType/workingHoursScheme produces
 * different stored values than explicitly setting NOT_CHOSEN?
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
  if (!r.ok) console.error(`${method} ${path} → ${r.status}: ${text.substring(0, 300)}`);
  else console.log(`${method} ${path} → ${r.status}`);
  return { ok: r.ok, status: r.status, data: parsed };
}

async function readEmploymentDetails(empId: number) {
  const emps = await api("GET", `employee/employment?employeeId=${empId}&fields=*`);
  if (!emps.ok || !emps.data.values?.length) return;
  const e = emps.data.values[0];
  const details = await api("GET", `employee/employment/details?employmentId=${e.id}&fields=*`);
  if (!details.ok || !details.data.values?.length) return;
  const d = details.data.values[0];
  return {
    employment: {
      startDate: e.startDate,
      isMainEmployer: e.isMainEmployer,
      taxDeductionCode: e.taxDeductionCode,
    },
    details: {
      date: d.date,
      employmentType: d.employmentType,
      employmentForm: d.employmentForm,
      remunerationType: d.remunerationType,
      workingHoursScheme: d.workingHoursScheme,
      percentageOfFullTimeEquivalent: d.percentageOfFullTimeEquivalent,
      annualSalary: d.annualSalary,
      payrollTaxMunicipalityId: d.payrollTaxMunicipalityId,
      occupationCode: d.occupationCode,
    },
  };
}

async function main() {
  // Get division
  const divRes = await api("GET", "division?count=1&fields=id");
  const divId = divRes.data.values?.[0]?.id;

  // Create department
  const deptRes = await api("POST", "department", { name: "OmitTest-" + Date.now() });
  const deptId = deptRes.data.value.id;

  // ==========================================
  // TEST 1: OMIT employmentType + workingHoursScheme entirely
  // ==========================================
  console.log("\n=== TEST 1: OMIT employmentType + workingHoursScheme ===");
  const emp1 = await api("POST", "employee", {
    firstName: "Test1",
    lastName: "Omitted",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-06-01",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-06-01",
        // OMIT employmentType
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        // OMIT workingHoursScheme
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 600000,
        occupationCode: { id: 4679 },
      }],
    }],
  });
  if (emp1.ok) {
    const d = await readEmploymentDetails(emp1.data.value.id);
    console.log("  STORED:", JSON.stringify(d?.details, null, 2));
  }

  // ==========================================
  // TEST 2: Set payrollTaxMunicipalityId to company municipality
  // ==========================================
  console.log("\n=== TEST 2: Set payrollTaxMunicipalityId = 262 ===");
  const emp2 = await api("POST", "employee", {
    firstName: "Test2",
    lastName: "WithMunicipality",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-06-01",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-06-01",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 600000,
        occupationCode: { id: 4679 },
        payrollTaxMunicipalityId: { id: 262 },
      }],
    }],
  });
  if (emp2.ok) {
    const d = await readEmploymentDetails(emp2.data.value.id);
    console.log("  STORED:", JSON.stringify(d?.details, null, 2));
  }

  // ==========================================
  // TEST 3: OMIT employmentForm too (everything NOT_CHOSEN/omitted)
  // ==========================================
  console.log("\n=== TEST 3: OMIT everything except salary and percentage ===");
  const emp3 = await api("POST", "employee", {
    firstName: "Test3",
    lastName: "MinimalDetails",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-06-01",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-06-01",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 600000,
        occupationCode: { id: 4679 },
      }],
    }],
  });
  if (emp3.ok) {
    const d = await readEmploymentDetails(emp3.data.value.id);
    console.log("  STORED:", JSON.stringify(d?.details, null, 2));
  }

  // ==========================================
  // TEST 4: FREELANCE employmentType (just to see what happens)
  // ==========================================
  console.log("\n=== TEST 4: employmentType = FREELANCE ===");
  const emp4 = await api("POST", "employee", {
    firstName: "Test4",
    lastName: "Freelance",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-06-01",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-06-01",
        employmentType: "FREELANCE",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 600000,
        occupationCode: { id: 4679 },
      }],
    }],
  });
  if (emp4.ok) {
    const d = await readEmploymentDetails(emp4.data.value.id);
    console.log("  STORED:", JSON.stringify(d?.details, null, 2));
  }

  // ==========================================
  // TEST 5: Try setting employee email (common field we never set)
  // ==========================================
  console.log("\n=== TEST 5: Set email on employee ===");
  const emp5 = await api("POST", "employee", {
    firstName: "Test5",
    lastName: "WithEmail",
    dateOfBirth: "1990-01-15",
    email: "test5@example.com",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-06-01",
      division: { id: divId },
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
  if (emp5.ok) {
    const empData = await api("GET", `employee/${emp5.data.value.id}?fields=email`);
    console.log("  Email stored:", empData.data.value?.email);
  }

  // ==========================================
  // TEST 6: Try setting employmentForm to NOT_CHOSEN (instead of PERMANENT)
  // ==========================================
  console.log("\n=== TEST 6: employmentForm = NOT_CHOSEN ===");
  const emp6 = await api("POST", "employee", {
    firstName: "Test6",
    lastName: "FormNotChosen",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-06-01",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-06-01",
        employmentType: "ORDINARY",
        employmentForm: "NOT_CHOSEN",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 600000,
        occupationCode: { id: 4679 },
      }],
    }],
  });
  if (emp6.ok) {
    const d = await readEmploymentDetails(emp6.data.value.id);
    console.log("  STORED employmentForm:", d?.details?.employmentForm);
  }

  // ==========================================
  // TEST 7: What if we set TEMPORARY instead of PERMANENT?
  // ==========================================
  console.log("\n=== TEST 7: employmentForm = TEMPORARY ===");
  const emp7 = await api("POST", "employee", {
    firstName: "Test7",
    lastName: "Temporary",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{
      startDate: "2026-06-01",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-06-01",
        employmentType: "ORDINARY",
        employmentForm: "TEMPORARY",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 600000,
        occupationCode: { id: 4679 },
      }],
    }],
  });
  if (emp7.ok) {
    const d = await readEmploymentDetails(emp7.data.value.id);
    console.log("  STORED employmentForm:", d?.details?.employmentForm);
  }

  console.log("\n\nDONE - Check which tests change stored values vs baseline");
}

main().catch(e => { console.error(e); process.exit(1); });
