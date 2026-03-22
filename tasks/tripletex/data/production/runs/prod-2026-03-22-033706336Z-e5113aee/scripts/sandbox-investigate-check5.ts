// Sandbox investigation: test Check 5 hypotheses and division omission
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const text = await r.text();
  if (!r.ok) return { error: true, status: r.status, body: text, path };
  return { error: false, ...JSON.parse(text) };
}

// 1. Check if sandbox has divisions
const divRes = await get("/division?count=1&fields=id");
console.log("=== DIVISION CHECK ===");
console.log("count:", divRes.count, "values:", divRes.values);

// 2. Create a test department
const deptRes = await post("/department", { name: "SandboxTest-Check5-" + Date.now() });
if (deptRes.error) { console.log("dept error:", deptRes); process.exit(1); }
const deptId = deptRes.value.id;
console.log("dept id:", deptId);

// 3. Test Hypothesis 1: employmentType=NOT_CHOSEN (instead of ORDINARY)
const startDate = "2026-12-01";
const employment1: any = {
  startDate,
  employmentDetails: [{
    date: startDate,
    employmentType: "NOT_CHOSEN",
    employmentForm: "PERMANENT",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_SHIFT",
    percentageOfFullTimeEquivalent: 100,
    annualSalary: 810000,
    occupationCode: { id: 4679 },
  }],
};
if (divRes.count > 0) employment1.division = { id: divRes.values[0].id };

const emp1Res = await post("/employee", {
  firstName: "TestH1",
  lastName: "EmploymentTypeNotChosen",
  dateOfBirth: "1989-08-17",
  userType: "NO_ACCESS",
  department: { id: deptId },
  employments: [employment1],
});
console.log("\n=== H1: employmentType=NOT_CHOSEN ===");
if (emp1Res.error) {
  console.log("FAILED:", emp1Res.status, emp1Res.body);
} else {
  const empId1 = emp1Res.value.id;
  console.log("SUCCESS: employee id:", empId1);
  // Read back to verify
  const readback1 = await get(`/employee/${empId1}?fields=*`);
  const det1 = readback1.value.employments?.[0]?.employmentDetails?.[0];
  console.log("readback employmentType:", det1?.employmentType);
  console.log("readback employmentForm:", det1?.employmentForm);
  console.log("readback remunerationType:", det1?.remunerationType);
  console.log("readback workingHoursScheme:", det1?.workingHoursScheme);
}

// 4. Test Hypothesis 2: workingHoursScheme=NOT_CHOSEN (instead of NOT_SHIFT)
const employment2: any = {
  startDate,
  employmentDetails: [{
    date: startDate,
    employmentType: "ORDINARY",
    employmentForm: "PERMANENT",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_CHOSEN",
    percentageOfFullTimeEquivalent: 100,
    annualSalary: 810000,
    occupationCode: { id: 4679 },
  }],
};
if (divRes.count > 0) employment2.division = { id: divRes.values[0].id };

const emp2Res = await post("/employee", {
  firstName: "TestH2",
  lastName: "WorkSchemeNotChosen",
  dateOfBirth: "1990-03-15",
  userType: "NO_ACCESS",
  department: { id: deptId },
  employments: [employment2],
});
console.log("\n=== H2: workingHoursScheme=NOT_CHOSEN ===");
if (emp2Res.error) {
  console.log("FAILED:", emp2Res.status, emp2Res.body);
} else {
  const empId2 = emp2Res.value.id;
  console.log("SUCCESS: employee id:", empId2);
  const readback2 = await get(`/employee/${empId2}?fields=*`);
  const det2 = readback2.value.employments?.[0]?.employmentDetails?.[0];
  console.log("readback employmentType:", det2?.employmentType);
  console.log("readback workingHoursScheme:", det2?.workingHoursScheme);
}

// 5. Test Hypothesis 3: BOTH NOT_CHOSEN
const employment3: any = {
  startDate,
  employmentDetails: [{
    date: startDate,
    employmentType: "NOT_CHOSEN",
    employmentForm: "PERMANENT",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_CHOSEN",
    percentageOfFullTimeEquivalent: 100,
    annualSalary: 810000,
    occupationCode: { id: 4679 },
  }],
};
if (divRes.count > 0) employment3.division = { id: divRes.values[0].id };

const emp3Res = await post("/employee", {
  firstName: "TestH3",
  lastName: "BothNotChosen",
  dateOfBirth: "1991-06-20",
  userType: "NO_ACCESS",
  department: { id: deptId },
  employments: [employment3],
});
console.log("\n=== H3: BOTH NOT_CHOSEN ===");
if (emp3Res.error) {
  console.log("FAILED:", emp3Res.status, emp3Res.body);
} else {
  const empId3 = emp3Res.value.id;
  console.log("SUCCESS: employee id:", empId3);
  const readback3 = await get(`/employee/${empId3}?fields=*`);
  const det3 = readback3.value.employments?.[0]?.employmentDetails?.[0];
  console.log("readback employmentType:", det3?.employmentType);
  console.log("readback workingHoursScheme:", det3?.workingHoursScheme);
}

// 6. Test omitting division on an account that HAS divisions
if (divRes.count > 0) {
  console.log("\n=== TEST: omit division when account HAS divisions ===");
  const employment4: any = {
    startDate,
    employmentDetails: [{
      date: startDate,
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      annualSalary: 810000,
      occupationCode: { id: 4679 },
    }],
  };
  // deliberately omit division

  const emp4Res = await post("/employee", {
    firstName: "TestH4",
    lastName: "NoDivision",
    dateOfBirth: "1992-01-10",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [employment4],
  });
  if (emp4Res.error) {
    console.log("FAILED (expected):", emp4Res.status, emp4Res.body?.substring(0, 300));
  } else {
    console.log("SUCCEEDED — division is optional even when account has divisions! emp:", emp4Res.value.id);
    const readback4 = await get(`/employee/${emp4Res.value.id}?fields=*`);
    console.log("readback division:", readback4.value.employments?.[0]?.division);
  }
} else {
  console.log("\n=== Sandbox has NO divisions — cannot test omission ===");
}

// 7. Test if we can create department inline with POST /employee (skip separate POST /department)
console.log("\n=== TEST: inline department name on POST /employee ===");
const emp5Res = await post("/employee", {
  firstName: "TestH5",
  lastName: "InlineDept",
  dateOfBirth: "1993-05-25",
  userType: "NO_ACCESS",
  department: { name: "InlineTestDept-" + Date.now() },
  employments: [{
    startDate,
    ...(divRes.count > 0 ? { division: { id: divRes.values[0].id } } : {}),
    employmentDetails: [{
      date: startDate,
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      annualSalary: 810000,
      occupationCode: { id: 4679 },
    }],
  }],
});
if (emp5Res.error) {
  console.log("FAILED:", emp5Res.status, emp5Res.body?.substring(0, 300));
} else {
  console.log("SUCCEEDED! Inline department created. emp:", emp5Res.value.id);
  console.log("department:", emp5Res.value.department);
}
