// Sandbox verification: confirm non-7.5 hoursPerDay (6.0) works correctly
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  console.log(`${method} ${path} → ${res.status}`);
  if (res.status >= 400) { console.log(JSON.stringify(data, null, 2)); throw new Error(`${res.status}`); }
  return data;
}

async function main() {
  // Step 1: GET division
  const divRes = await api("GET", "/division?count=1&fields=id");
  const divisionId = divRes.count > 0 ? divRes.values[0].id : null;
  console.log("Division id:", divisionId);

  // Step 2: POST department
  const deptRes = await api("POST", "/department", { name: "SandboxVerify6h" });
  const departmentId = deptRes.value.id;
  console.log("Department id:", departmentId);

  // Step 3: POST employee with 80% and Salgssjef occupation code
  const empPayload: any = {
    firstName: "SandboxTest",
    lastName: "SixHours",
    dateOfBirth: "2000-03-18",
    userType: "NO_ACCESS",
    department: { id: departmentId },
    employments: [{
      startDate: "2026-07-24",
      ...(divisionId ? { division: { id: divisionId } } : {}),
      employmentDetails: [{
        date: "2026-07-24",
        employmentType: "ORDINARY",
        employmentForm: "PERMANENT",
        remunerationType: "MONTHLY_WAGE",
        workingHoursScheme: "NOT_SHIFT",
        percentageOfFullTimeEquivalent: 80,
        annualSalary: 550000,
        occupationCode: { id: 4930 },
      }],
    }],
  };

  const empRes = await api("POST", "/employee", empPayload);
  const employeeId = empRes.value.id;
  const employmentId = empRes.value.employments?.[0]?.id;
  console.log("Employee id:", employeeId, "Employment id:", employmentId);

  // Step 4: POST standard worktime with 6.0 hours (non-7.5 value)
  const stRes = await api("POST", "/employee/standardTime", {
    employee: { id: employeeId },
    fromDate: "2026-07-24",
    hoursPerDay: 6.0,
  });
  console.log("StandardTime response:", JSON.stringify(stRes, null, 2));

  // Readback: verify standard worktime persisted as 6.0
  const readback = await api("GET", `/employee/standardTime?employeeId=${employeeId}&fields=*`);
  console.log("StandardTime readback:", JSON.stringify(readback, null, 2));

  // Readback: verify employment details
  if (employmentId) {
    const detailsReadback = await api("GET", `/employee/employment/details?employmentId=${employmentId}&fields=*,occupationCode(*)`);
    console.log("Employment details readback:", JSON.stringify(detailsReadback, null, 2));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
