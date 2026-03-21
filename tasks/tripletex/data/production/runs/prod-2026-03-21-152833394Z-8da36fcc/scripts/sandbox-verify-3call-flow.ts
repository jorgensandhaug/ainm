const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) { console.error(text); throw new Error(`${res.status}`); }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

async function main() {
  // 3-call flow: division pre-read + department create + employee create
  // Using hardcoded occupation code id 2503 for STYRK 3323 (INNKJØPER)
  const [divisions, dept] = await Promise.all([
    api("GET", "/division?count=1&fields=id"),
    api("POST", "/department", { name: "SandboxDrift3323" }),
  ]);

  const divisionId = Array.isArray(divisions) && divisions.length > 0 ? divisions[0].id : null;
  const deptId = dept.id;
  console.log(`Division: ${divisionId}, Dept: ${deptId}`);

  const employment: any = {
    startDate: "2026-07-18",
    employmentDetails: [{
      date: "2026-07-18",
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      annualSalary: 970000,
      occupationCode: { id: 2503 },  // hardcoded INNKJØPER
    }],
  };
  if (divisionId) employment.division = { id: divisionId };

  const employee = await api("POST", "/employee", {
    firstName: "SandboxLars",
    lastName: "SandboxLarsen",
    dateOfBirth: "1994-11-13",
    nationalIdentityNumber: "13119462627",
    email: "sandbox.lars@example.org",
    bankAccountNumber: "10371694965",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [employment],
  });

  console.log("Employee created:", JSON.stringify(employee, null, 2));

  // Readback to verify occupation code persisted
  const empId = employee.employments?.[0]?.id || employee.id;
  if (employee.employments?.[0]?.id) {
    const details = await api("GET", `/employee/employment/details?employmentId=${employee.employments[0].id}&fields=*,occupationCode(*)`);
    console.log("Employment details readback:", JSON.stringify(details, null, 2));
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
