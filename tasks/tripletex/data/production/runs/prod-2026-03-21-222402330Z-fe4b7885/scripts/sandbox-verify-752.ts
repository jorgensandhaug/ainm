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

// Get division and department
const divRes = await api("GET", "/division?count=1&fields=id");
const divisionId = divRes.count > 0 ? divRes.values[0].id : null;

// Create department for test
const deptRes = await api("POST", "/department", { name: "SandboxTest3512" });
const deptId = deptRes.value.id;

// Create test employee with occupationCode 752 (BRUKERSTØTTE IKT)
const empPayload: any = {
  firstName: "Test3512",
  lastName: "Verify",
  dateOfBirth: "1990-01-15",
  nationalIdentityNumber: "15019056789",
  email: "test3512verify@example.org",
  bankAccountNumber: "12345678901",
  userType: "NO_ACCESS",
  department: { id: deptId },
  employments: [{
    startDate: "2026-06-17",
    ...(divisionId ? { division: { id: divisionId } } : {}),
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
console.log("\n=== Readback employment details ===");
await api("GET", `/employee/employment/details?employmentId=${employmentId}&fields=*,occupationCode(*)`);

// Also set standard worktime and verify
const stRes = await api("POST", "/employee/standardTime", {
  employee: { id: employeeId },
  fromDate: "2026-06-17",
  hoursPerDay: 7.5,
});

// Readback standard time
console.log("\n=== Readback standard time ===");
await api("GET", `/employee/standardTime?employeeId=${employeeId}&fields=*`);
