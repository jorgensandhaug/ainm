// Sandbox test: check POST /employee response shape to understand what data is returned inline
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.error(JSON.stringify(json, null, 2)); throw new Error(`${r.status}`); }
  return json;
}

async function main() {
  // Get pre-reads
  const [divRes, salaryRes] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("GET", "/salary/settings?fields=municipality"),
  ]);

  const divisionId = divRes.values?.length > 0 ? divRes.values[0].id : null;
  const municipalityId = salaryRes.value?.municipality?.id ?? null;
  console.log(`Division: ${divisionId}, Municipality: ${municipalityId}`);

  // Search for existing "SandboxTest" department
  const deptRes = await api("GET", `/department?name=${encodeURIComponent("SandboxTestVerify")}&isInactive=false&count=1000&fields=*`);
  let deptId: number | null = null;
  if (deptRes.values?.length > 0) {
    const matches = deptRes.values.filter((d: any) => d.name.toLowerCase() === "sandboxtestverify");
    if (matches.length > 0) deptId = matches.reduce((a: any, b: any) => a.id > b.id ? a : b).id;
  }
  if (!deptId) {
    const deptCreate = await api("POST", "/department", { name: "SandboxTestVerify" });
    deptId = deptCreate.value.id;
  }
  console.log(`Department id: ${deptId}`);

  // POST employee and examine response shape
  const empPayload: any = {
    firstName: "TestSandbox",
    lastName: "Verify",
    dateOfBirth: "1990-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [
      {
        startDate: "2026-06-01",
        ...(divisionId ? { division: { id: divisionId } } : {}),
        employmentDetails: [
          {
            date: "2026-06-01",
            employmentType: "ORDINARY",
            employmentForm: "PERMANENT",
            remunerationType: "MONTHLY_WAGE",
            workingHoursScheme: "NOT_SHIFT",
            percentageOfFullTimeEquivalent: 100,
            annualSalary: 500000,
            occupationCode: { id: 2610 },
            ...(municipalityId ? { payrollTaxMunicipalityId: { id: municipalityId } } : {}),
          },
        ],
      },
    ],
  };

  const empRes = await api("POST", "/employee", empPayload);
  console.log("\n=== POST /employee response ===");
  console.log(JSON.stringify(empRes, null, 2));

  // Check what fields are in the response
  const emp = empRes.value;
  console.log("\n=== Key fields in response ===");
  console.log(`id: ${emp.id}`);
  console.log(`firstName: ${emp.firstName}`);
  console.log(`lastName: ${emp.lastName}`);
  console.log(`dateOfBirth: ${emp.dateOfBirth}`);
  console.log(`department: ${JSON.stringify(emp.department)}`);
  console.log(`employments: ${JSON.stringify(emp.employments)}`);
  console.log(`email: ${emp.email}`);

  // POST standardTime
  const stdRes = await api("POST", "/employee/standardTime", {
    employee: { id: emp.id },
    fromDate: "2026-06-01",
    hoursPerDay: 7.5,
  });
  console.log("\n=== POST /employee/standardTime response ===");
  console.log(JSON.stringify(stdRes, null, 2));

  console.log("\nSandbox verification complete.");
}

main().catch(e => { console.error(e); process.exit(1); });
