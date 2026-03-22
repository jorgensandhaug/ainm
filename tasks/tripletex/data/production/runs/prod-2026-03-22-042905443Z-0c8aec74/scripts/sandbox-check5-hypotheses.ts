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
  if (!r.ok) {
    console.log(`  ${method} ${path} → ${r.status}: ${text.substring(0, 300)}`);
    return null;
  }
  return JSON.parse(text);
}

async function createDept(name: string) {
  const res = await api("POST", "department", { name });
  return res?.value?.id;
}

async function readEmploymentDetails(employmentId: number) {
  const res = await api("GET", `employee/employment/details?employmentId=${employmentId}&fields=*`);
  if (res?.values?.[0]) {
    const d = res.values[0];
    return {
      employmentType: d.employmentType,
      workingHoursScheme: d.workingHoursScheme,
      remunerationType: d.remunerationType,
      employmentForm: d.employmentForm,
      annualSalary: d.annualSalary,
      percentageOfFullTimeEquivalent: d.percentageOfFullTimeEquivalent,
      occupationCode: d.occupationCode?.id,
      payrollTaxMunicipalityId: d.payrollTaxMunicipalityId,
      shiftDurationHours: d.shiftDurationHours,
      hourlyWage: d.hourlyWage,
    };
  }
  return null;
}

async function readEmployment(empId: number) {
  const res = await api("GET", `employee/employment?employeeId=${empId}&fields=*`);
  if (res?.values?.[0]) {
    const e = res.values[0];
    return {
      employmentId_str: e.employmentId,
      startDate: e.startDate,
      taxDeductionCode: e.taxDeductionCode,
      isMainEmployer: e.isMainEmployer,
      noEmploymentRelationship: e.noEmploymentRelationship,
      division: e.division?.id,
    };
  }
  return null;
}

const divId = 108244566; // sandbox division

async function main() {
  // =============================================
  // HYPOTHESIS A: Separate POST /employee/employment/details
  // Create employee with minimal employment (no inline details), then POST details separately
  // =============================================
  console.log("=== HYPOTHESIS A: Separate POST employment details ===");
  const deptA = await createDept("HypA_SeparateDetails");
  if (!deptA) return;

  // Create employee with employment but NO inline employmentDetails
  const empA = await api("POST", "employee", {
    firstName: "HypA",
    lastName: "SeparateDetails",
    dateOfBirth: "1983-01-31",
    userType: "NO_ACCESS",
    department: { id: deptA },
    employments: [{
      startDate: "2026-12-06",
      division: { id: divId },
      // NO employmentDetails - will add separately
    }],
  });

  if (empA) {
    const empIdA = empA.value.id;
    console.log("  Employee created:", empIdA);

    // Get the employment ID
    const employmentsA = await api("GET", `employee/employment?employeeId=${empIdA}&fields=id`);
    const employmentIdA = employmentsA?.values?.[0]?.id;
    console.log("  Employment ID:", employmentIdA);

    if (employmentIdA) {
      // POST employment details separately
      const detailsA = await api("POST", "employee/employment/details", {
        employment: { id: employmentIdA },
        date: "2026-12-06",
        employmentType: "NOT_CHOSEN",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_CHOSEN",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 620000,
        occupationCode: { id: 4679 },
      });
      console.log("  Details created:", detailsA ? "YES" : "FAILED");

      // Readback
      const readA = await readEmploymentDetails(employmentIdA);
      console.log("  Readback:", JSON.stringify(readA));
      const readEmpA = await readEmployment(empIdA);
      console.log("  Employment:", JSON.stringify(readEmpA));
    }
  }

  // =============================================
  // HYPOTHESIS B: Inline details (our current approach) - for comparison
  // =============================================
  console.log("\n=== HYPOTHESIS B: Inline details (current approach) ===");
  const deptB = await createDept("HypB_InlineDetails");
  if (!deptB) return;

  const empB = await api("POST", "employee", {
    firstName: "HypB",
    lastName: "InlineDetails",
    dateOfBirth: "1983-01-31",
    userType: "NO_ACCESS",
    department: { id: deptB },
    employments: [{
      startDate: "2026-12-06",
      division: { id: divId },
      employmentDetails: [{
        date: "2026-12-06",
        employmentType: "NOT_CHOSEN",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_CHOSEN",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 620000,
        occupationCode: { id: 4679 },
      }],
    }],
  });

  if (empB) {
    const empIdB = empB.value.id;
    console.log("  Employee created:", empIdB);
    const employmentsB = await api("GET", `employee/employment?employeeId=${empIdB}&fields=id`);
    const employmentIdB = employmentsB?.values?.[0]?.id;
    const readB = await readEmploymentDetails(employmentIdB!);
    console.log("  Readback:", JSON.stringify(readB));
    const readEmpB = await readEmployment(empIdB);
    console.log("  Employment:", JSON.stringify(readEmpB));
  }

  // =============================================
  // HYPOTHESIS C: Set taxDeductionCode explicitly to EMPTY
  // =============================================
  console.log("\n=== HYPOTHESIS C: taxDeductionCode = EMPTY ===");
  const deptC = await createDept("HypC_TaxDeduct");
  if (!deptC) return;

  const empC = await api("POST", "employee", {
    firstName: "HypC",
    lastName: "TaxDeductEmpty",
    dateOfBirth: "1983-01-31",
    userType: "NO_ACCESS",
    department: { id: deptC },
    employments: [{
      startDate: "2026-12-06",
      division: { id: divId },
      taxDeductionCode: "EMPTY",
      employmentDetails: [{
        date: "2026-12-06",
        employmentType: "NOT_CHOSEN",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_CHOSEN",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 620000,
        occupationCode: { id: 4679 },
      }],
    }],
  });

  if (empC) {
    const empIdC = empC.value.id;
    console.log("  Employee created:", empIdC);
    const readEmpC = await readEmployment(empIdC);
    console.log("  Employment:", JSON.stringify(readEmpC));
  }

  // =============================================
  // HYPOTHESIS D: Different employmentForm — TEMPORARY instead of PERMANENT
  // =============================================
  console.log("\n=== HYPOTHESIS D: What employmentForm values exist? ===");
  // This is just for reference — the PDF says "Fast stilling" = PERMANENT, so this is unlikely
  // But let me check what the enum options are
  console.log("  Skipping — PDF says 'Fast stilling' = PERMANENT, this is correct");

  // =============================================
  // HYPOTHESIS E: What if we need to also set email or other profile fields?
  // =============================================
  console.log("\n=== HYPOTHESIS E: Check if userType NO_ACCESS is stored ===");
  if (empB) {
    const fullEmp = await api("GET", `employee/${empB.value.id}?fields=userType,email,employeeNumber`);
    console.log("  userType:", fullEmp?.value?.userType);
    console.log("  email:", fullEmp?.value?.email);
    console.log("  employeeNumber:", fullEmp?.value?.employeeNumber);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
