const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}/${path}`;
  const opts: RequestInit = {
    method,
    headers: { "Authorization": AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const res = await fetch(url, opts);
  const text = await res.text();
  console.log(`\n${method} /${path} → ${res.status}`);
  if (!res.ok) {
    console.log("ERROR:", text);
    return null;
  }
  if (!text) return null;
  const json = JSON.parse(text);
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Full onboarding flow with systemutvikler (id 5935) as occupation code
console.log("=== Step 1: Parallel prereqs ===");
const [divisions, dept] = await Promise.all([
  api("GET", "division?count=1&fields=id"),
  api("POST", "department", { name: "Kundeservice-test" }),
]);

const divisionId = Array.isArray(divisions) && divisions.length > 0 ? divisions[0].id : null;
const deptId = dept?.id;
console.log("Division:", divisionId, "Dept:", deptId);

if (!deptId) {
  console.log("FAILED: could not create department");
  process.exit(1);
}

// Step 2: Create employee with occupation code 5935 (SYSTEMUTVIKLER)
console.log("\n=== Step 2: POST /employee ===");
const employeePayload: any = {
  firstName: "Test",
  lastName: "Seniorutvikler",
  dateOfBirth: "1997-01-31",
  userType: "NO_ACCESS",
  department: { id: deptId },
  employments: [
    {
      startDate: "2026-06-02",
      ...(divisionId ? { division: { id: divisionId } } : {}),
      employmentDetails: [
        {
          date: "2026-06-02",
          employmentType: "ORDINARY",
          employmentForm: "PERMANENT",
          remunerationType: "MONTHLY_WAGE",
          workingHoursScheme: "NOT_SHIFT",
          percentageOfFullTimeEquivalent: 100,
          annualSalary: 790000,
          occupationCode: { id: 5935 },
        },
      ],
    },
  ],
};

const employee = await api("POST", "employee", employeePayload);
if (!employee) {
  console.log("FAILED: employee creation failed");
  process.exit(1);
}
const employeeId = employee.id;
console.log("Employee created:", employeeId);

// Step 3: Standard worktime
console.log("\n=== Step 3: POST /employee/standardTime ===");
const stdTime = await api("POST", "employee/standardTime", {
  employee: { id: employeeId },
  fromDate: "2026-06-02",
  hoursPerDay: 7.5,
});
console.log("Standard time result:", JSON.stringify(stdTime, null, 2));

// Readback to verify
console.log("\n=== Readback: employment details ===");
// Get employments
const empls = await api("GET", `employee/employment?employeeId=${employeeId}&fields=*`);
if (Array.isArray(empls) && empls.length > 0) {
  const emplId = empls[0].id;
  console.log("Employment id:", emplId);
  const details = await api("GET", `employee/employment/details?employmentId=${emplId}&fields=*,occupationCode(*)`);
  console.log("Employment details:", JSON.stringify(details, null, 2));
}

// Readback standard time
console.log("\n=== Readback: standard time ===");
const stdTimeRead = await api("GET", `employee/standardTime?employeeId=${employeeId}&fields=*`);
console.log("Standard time:", JSON.stringify(stdTimeRead, null, 2));
