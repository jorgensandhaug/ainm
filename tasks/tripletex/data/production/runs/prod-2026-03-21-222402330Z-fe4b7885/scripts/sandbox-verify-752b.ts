const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  console.log(`${method} ${url}`);
  const r = await fetch(url, { method, headers: H, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  console.log(`  → ${r.status}`, JSON.stringify(data, null, 2));
  return data;
}

// Get division
const divRes = await api("GET", "/division?count=1&fields=id");
const divisionId = divRes.values[0].id;

// Create department for test
const deptRes = await api("POST", "/department", { name: "SandboxTest3512v2" });
const deptId = deptRes.value.id;

// Create test employee with occupationCode 752 (BRUKERSTØTTE IKT) — no national ID to avoid validation
const empPayload = {
  firstName: "Test3512",
  lastName: "VerifyOcc",
  dateOfBirth: "1990-01-15",
  email: "test3512b@example.org",
  userType: "NO_ACCESS",
  department: { id: deptId },
  employments: [{
    startDate: "2026-06-17",
    division: { id: divisionId },
    employmentDetails: [{
      date: "2026-06-17",
      employmentType: "ORDINARY",
      employmentForm: "PERMANENT",
      remunerationType: "MONTHLY_WAGE",
      workingHoursScheme: "NOT_SHIFT",
      percentageOfFullTimeEquivalent: 100,
      annualSalary: 750000,
      occupationCode: { id: 752 },
    }],
  }],
};

const empRes = await api("POST", "/employee?fields=*,employments(*)", empPayload);
const employeeId = empRes.value?.id;
const employmentId = empRes.value?.employments?.[0]?.id;

if (!employmentId) {
  console.log("ERROR: Could not get employment ID");
  process.exit(1);
}

// Readback employment details with full occupationCode expansion
console.log("\n=== Readback: employment details ===");
const detailsRes = await api("GET", `/employee/employment/details?employmentId=${employmentId}&fields=*,occupationCode(*)`);
const det = detailsRes.values?.[0];
console.log("\nOccupation code readback:");
console.log("  id:", det?.occupationCode?.id);
console.log("  nameNO:", det?.occupationCode?.nameNO);
console.log("  code:", det?.occupationCode?.code);
console.log("  annualSalary:", det?.annualSalary);
console.log("  percentageOfFullTimeEquivalent:", det?.percentageOfFullTimeEquivalent);
console.log("  employmentForm:", det?.employmentForm);

// Standard worktime
await api("POST", "/employee/standardTime", {
  employee: { id: employeeId },
  fromDate: "2026-06-17",
  hoursPerDay: 7.5,
});

const stRes = await api("GET", `/employee/standardTime?employeeId=${employeeId}&fields=*`);
console.log("\nStandard time readback:");
console.log("  hoursPerDay:", stRes.values?.[0]?.hoursPerDay);
