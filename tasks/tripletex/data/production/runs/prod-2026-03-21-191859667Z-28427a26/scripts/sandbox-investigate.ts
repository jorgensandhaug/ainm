const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();

// Test 1: POST /employee with fields=* query param to see if response includes startDate
console.log("=== Test 1: POST /employee?fields=* ===");
const empBody = {
  firstName: `SandboxTest${ts}`,
  lastName: "Reflector",
  dateOfBirth: "1990-03-15",
  email: `sandbox-test-${ts}@example.org`,
  userType: "NO_ACCESS",
  department: { id: 737348 },
  employments: [{ startDate: "2026-05-01" }],
};

const r1 = await fetch(`${BASE}/employee?fields=*`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(empBody),
});
const j1 = await r1.json();
console.log("Status:", r1.status);
console.log("Response:", JSON.stringify(j1, null, 2));

// Check if employments in response contain startDate
if (r1.status === 201) {
  const emps = j1.value?.employments;
  console.log("\nEmployments in response:", JSON.stringify(emps, null, 2));
  const hasStartDate = emps?.some((e: any) => e.startDate);
  console.log("Has startDate in response?", hasStartDate);

  // Also check if we can use fields parameter on POST
  const empId = j1.value?.id;

  // Test 2: GET /employee/{id}?fields=* to see if employment details are included
  console.log("\n=== Test 2: GET /employee/{id}?fields=employments(*) ===");
  const r2 = await fetch(`${BASE}/employee/${empId}?fields=employments(*)`, { headers: H });
  const j2 = await r2.json();
  console.log("Status:", r2.status);
  console.log("Employments:", JSON.stringify(j2.value?.employments, null, 2));
}
