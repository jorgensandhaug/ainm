const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "jDfrqQ2yEdBIDKA1_C3OXtvLokGLlGXUeJ6hIr7DVD8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  const j = await r.json();
  if (!r.ok) { console.error("GET", path, r.status, JSON.stringify(j)); throw new Error(`GET ${path} → ${r.status}`); }
  return j;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error("POST", path, r.status, JSON.stringify(j)); throw new Error(`POST ${path} → ${r.status}`); }
  return j;
}

async function main() {
  // Step 1: parallel free GETs
  const [divRes, deptRes, salaryRes] = await Promise.all([
    get("/division?count=1&fields=id"),
    get("/department?name=Utvikling&isInactive=false&count=1000&fields=*"),
    get("/salary/settings?fields=municipality"),
  ]);

  // Division
  const divisionId = divRes.count > 0 ? divRes.values[0].id : null;
  console.log("Division:", divisionId);

  // Department — reuse if exact match exists
  let departmentId: number | null = null;
  if (deptRes.count > 0) {
    const matches = deptRes.values.filter((d: any) => d.name.toLowerCase() === "utvikling");
    if (matches.length > 0) {
      departmentId = matches.reduce((a: any, b: any) => a.id > b.id ? a : b).id;
      console.log("Reusing department:", departmentId);
    }
  }

  // Step 2: create department only if no match
  if (departmentId === null) {
    const deptCreate = await post("/department", { name: "Utvikling" });
    departmentId = deptCreate.value.id;
    console.log("Created department:", departmentId);
  }

  // Municipality for payrollTaxMunicipalityId
  const municipalityId = salaryRes.value?.municipality?.id ?? null;
  console.log("Municipality:", municipalityId);

  // Step 3: POST /employee
  const employmentDetails: any = {
    date: "2026-04-04",
    employmentType: "ORDINARY",
    employmentForm: "PERMANENT",
    remunerationType: "MONTHLY_WAGE",
    workingHoursScheme: "NOT_SHIFT",
    percentageOfFullTimeEquivalent: 100,
    annualSalary: 510000,
    occupationCode: { id: 2951 },
  };
  if (municipalityId) {
    employmentDetails.payrollTaxMunicipalityId = { id: municipalityId };
  }

  const employment: any = {
    startDate: "2026-04-04",
    employmentDetails: [employmentDetails],
  };
  if (divisionId) {
    employment.division = { id: divisionId };
  }

  const empPayload: any = {
    firstName: "Pablo",
    lastName: "Torres",
    dateOfBirth: "1996-08-18",
    nationalIdentityNumber: "18089648714",
    bankAccountNumber: "37262474683",
    email: "pablo.torres@example.org",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [employment],
  };

  const empRes = await post("/employee", empPayload);
  const empId = empRes.value.id;
  console.log("Created employee:", empId);

  // Step 4: POST /employee/standardTime (default 7.5)
  const stRes = await post("/employee/standardTime", {
    employee: { id: empId },
    fromDate: "2026-04-04",
    hoursPerDay: 7.5,
  });
  console.log("StandardTime created:", stRes.value?.id);

  // Step 5: verification readback (free GETs)
  const [empRead, stRead] = await Promise.all([
    get(`/employee/${empId}?fields=*,department(*),employments(*)`),
    get(`/employee/standardTime?employeeId=${empId}&fields=*`),
  ]);

  const e = empRead.value;
  console.log("\n=== VERIFICATION ===");
  console.log("firstName:", e.firstName, e.firstName === "Pablo" ? "OK" : "WARN");
  console.log("lastName:", e.lastName, e.lastName === "Torres" ? "OK" : "WARN");
  console.log("dateOfBirth:", e.dateOfBirth, e.dateOfBirth === "1996-08-18" ? "OK" : "WARN");
  console.log("email:", e.email, e.email === "pablo.torres@example.org" ? "OK" : "WARN");
  console.log("NIN:", e.nationalIdentityNumber, e.nationalIdentityNumber === "18089648714" ? "OK" : "WARN");
  console.log("bankAccount:", e.bankAccountNumber, e.bankAccountNumber === "37262474683" ? "OK" : "WARN");
  console.log("department:", e.department?.name, e.department?.name === "Utvikling" ? "OK" : "WARN");
  console.log("department.id:", e.department?.id, e.department?.id === departmentId ? "OK" : "WARN");
  const emp0 = e.employments?.[0];
  console.log("startDate:", emp0?.startDate, emp0?.startDate === "2026-04-04" ? "OK" : "WARN");
  console.log("standardTime hoursPerDay:", stRead.values?.[0]?.hoursPerDay, stRead.values?.[0]?.hoursPerDay === 7.5 ? "OK" : "WARN");

  // Step 6: employment details readback
  const employmentId = emp0?.id;
  if (employmentId) {
    const detailsRes = await get(`/employee/employment/details?employmentId=${employmentId}&fields=*`);
    const d = detailsRes.values?.[0];
    if (d) {
      console.log("\n=== EMPLOYMENT DETAILS ===");
      console.log("employmentType:", d.employmentType, d.employmentType === "ORDINARY" ? "OK" : "WARN");
      console.log("employmentForm:", d.employmentForm, d.employmentForm === "PERMANENT" ? "OK" : "WARN");
      console.log("remunerationType:", d.remunerationType, d.remunerationType === "MONTHLY_WAGE" ? "OK" : "WARN");
      console.log("workingHoursScheme:", d.workingHoursScheme, d.workingHoursScheme === "NOT_SHIFT" ? "OK" : "WARN");
      console.log("annualSalary:", d.annualSalary, d.annualSalary === 510000 ? "OK" : "WARN");
      console.log("percentage:", d.percentageOfFullTimeEquivalent, d.percentageOfFullTimeEquivalent === 100 ? "OK" : "WARN");
      console.log("occupationCode:", d.occupationCode?.id, d.occupationCode?.id === 2951 ? "OK" : "WARN");
      console.log("payrollTaxMunicipalityId:", d.payrollTaxMunicipalityId?.id, d.payrollTaxMunicipalityId?.id ? "OK" : "WARN: null");
    }
  }

  console.log("\nDone. POSTs: 2-3, GETs: 6-7 (free).");
}

main().catch(e => { console.error(e); process.exit(1); });
