const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) console.log("BODY:", JSON.stringify(json).slice(0, 800));
  return { status: r.status, ok: r.ok, data: json };
}

async function main() {
  // Test 1: Can we use department: { name: "TestInlineDept" } directly on POST /employee?
  console.log("=== TEST 1: Inline department by name (no pre-POST /department) ===");
  const res1 = await api("POST", "/employee", {
    firstName: "TestInline",
    lastName: "DeptTest",
    dateOfBirth: "1990-01-01",
    userType: "NO_ACCESS",
    department: { name: "InlineDeptTest" },
    employments: [{
      startDate: "2026-08-01",
      employmentDetails: [{
        date: "2026-08-01",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 100,
        annualSalary: 500000,
        occupationCode: { id: 752 },
      }]
    }]
  });

  if (res1.ok) {
    console.log("INLINE DEPT WORKED! Employee created:", res1.data.value?.id);
    console.log("Department in response:", JSON.stringify(res1.data.value?.department));
  } else {
    console.log("INLINE DEPT FAILED (expected — trusted standard says 422)");
  }

  // Test 2: Full 5-call production flow readback verification
  console.log("\n=== TEST 2: Full 5-call flow + readback ===");
  const [divRes, deptRes, salRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "SandboxUtvikling" + Date.now() }),
    api("GET", "/salary/settings?fields=municipality"),
  ]);

  const divId = divRes.data.count > 0 ? divRes.data.values[0].id : null;
  const deptId = deptRes.data.value.id;
  const munId = salRes.data.value?.municipality?.id ?? null;

  console.log("divId:", divId, "deptId:", deptId, "munId:", munId);

  const empDetails: any = {
    date: "2026-07-25",
    employmentType: "ORDINARY",
    employmentForm: "PERMANENT",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_SHIFT",
    percentageOfFullTimeEquivalent: 80,
    annualSalary: 480000,
    occupationCode: { id: 752 },
  };
  if (munId) empDetails.payrollTaxMunicipalityId = { id: munId };

  const employment: any = {
    startDate: "2026-07-25",
    employmentDetails: [empDetails],
  };
  if (divId) employment.division = { id: divId };

  const empRes = await api("POST", "/employee", {
    firstName: "Marit",
    lastName: "Lunde",
    dateOfBirth: "1982-09-19",
    userType: "NO_ACCESS",
    nationalIdentityNumber: "19098246226",
    bankAccountNumber: "58953347618",
    department: { id: deptId },
    employments: [employment],
  });

  if (!empRes.ok) { console.log("EMPLOYEE CREATE FAILED"); return; }
  const empId = empRes.data.value.id;
  console.log("empId:", empId);

  const stRes = await api("POST", "/employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-07-25",
    hoursPerDay: 7.5,
  });
  console.log("standardTime:", stRes.ok ? "OK" : "FAIL");

  // Readback to verify all fields
  console.log("\n=== READBACK ===");
  const rb = await api("GET", `/employee/${empId}?fields=*`);
  if (rb.ok) {
    const e = rb.data.value;
    console.log("firstName:", e.firstName);
    console.log("lastName:", e.lastName);
    console.log("dateOfBirth:", e.dateOfBirth);
    console.log("NIN:", e.nationalIdentityNumber);
    console.log("bankAccount:", e.bankAccountNumber);
    console.log("department:", e.department?.name, "id:", e.department?.id);
  }

  // Read employment details
  const empDetails2 = await api("GET", `/employee/employment?employeeId=${empId}&fields=*`);
  if (empDetails2.ok && empDetails2.data.values?.length > 0) {
    const emp = empDetails2.data.values[0];
    console.log("startDate:", emp.startDate);
    console.log("division:", emp.division?.id);
    if (emp.employmentDetails?.length > 0) {
      const d = emp.employmentDetails[0];
      console.log("employmentType:", d.employmentType);
      console.log("employmentForm:", d.employmentForm);
      console.log("remunerationType:", d.remunerationType);
      console.log("workingHoursScheme:", d.workingHoursScheme);
      console.log("percentage:", d.percentageOfFullTimeEquivalent);
      console.log("annualSalary:", d.annualSalary);
      console.log("occupationCode:", d.occupationCode?.id, d.occupationCode?.nameNO);
      console.log("payrollTaxMunicipalityId:", d.payrollTaxMunicipalityId?.id, d.payrollTaxMunicipalityId?.municipalityName);
    }
  }

  // Read standard time
  const stRb = await api("GET", `/employee/standardTime?employeeId=${empId}&fields=*`);
  if (stRb.ok && stRb.data.values?.length > 0) {
    const st = stRb.data.values[0];
    console.log("standardTime fromDate:", st.fromDate, "hoursPerDay:", st.hoursPerDay);
  }

  console.log("\nDONE");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
