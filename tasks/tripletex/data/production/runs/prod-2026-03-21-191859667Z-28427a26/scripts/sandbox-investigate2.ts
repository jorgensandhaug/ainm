const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// Step 1: Get valid department
console.log("=== GET /department ===");
const rd = await fetch(`${BASE}/department?isInactive=false&count=1&fields=*`, { headers: H });
const jd = await rd.json();
console.log("Status:", rd.status);
const deptId = jd.values?.[0]?.id;
console.log("Department ID:", deptId);

if (!deptId) {
  // Create one
  console.log("\n=== POST /department ===");
  const rc = await fetch(`${BASE}/department`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ name: "Sandbox Avdeling" }),
  });
  const jc = await rc.json();
  console.log("Status:", rc.status);
  console.log("Response:", JSON.stringify(jc, null, 2));
}

// Step 2: Get valid division
console.log("\n=== GET /division ===");
const rv = await fetch(`${BASE}/division?count=1&fields=*`, { headers: H });
const jv = await rv.json();
console.log("Status:", rv.status);
const divId = jv.values?.[0]?.id;
console.log("Division ID:", divId);

const ts = Date.now();
const useDeptId = deptId || (await (async () => {
  const rc = await fetch(`${BASE}/department`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({ name: "Sandbox Avdeling" }),
  });
  const jc = await rc.json();
  return jc.value.id;
})());

// Step 3: POST /employee with fields=* to test if response includes startDate
console.log("\n=== POST /employee (with dept + div, fields=*) ===");
const empBody = {
  firstName: `Sandbox${ts}`,
  lastName: "Reflector",
  dateOfBirth: "1990-03-15",
  email: `sandbox-${ts}@example.org`,
  userType: "NO_ACCESS",
  department: { id: useDeptId },
  employments: [{ startDate: "2026-05-01", division: { id: divId } }],
};

const r1 = await fetch(`${BASE}/employee?fields=*`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(empBody),
});
const j1 = await r1.json();
console.log("Status:", r1.status);
console.log("Full response:", JSON.stringify(j1, null, 2));

if (r1.status === 201) {
  const emps = j1.value?.employments;
  console.log("\n--- Employments in create response ---");
  console.log(JSON.stringify(emps, null, 2));
  const hasStartDate = emps?.some((e: any) => e.startDate);
  console.log("startDate present in create response?", hasStartDate);

  // Step 4: GET /employee/<id>?fields=employments(*) to check nested expansion
  const empId = j1.value?.id;
  console.log("\n=== GET /employee/{id}?fields=employments(*) ===");
  const r2 = await fetch(`${BASE}/employee/${empId}?fields=employments(*)`, { headers: H });
  const j2 = await r2.json();
  console.log("Status:", r2.status);
  console.log("Employments via employee read:", JSON.stringify(j2.value?.employments, null, 2));

  // Step 5: compare with GET /employee/employment?employeeId=...&fields=*
  console.log("\n=== GET /employee/employment?employeeId=...&fields=* ===");
  const r3 = await fetch(`${BASE}/employee/employment?employeeId=${empId}&fields=*`, { headers: H });
  const j3 = await r3.json();
  console.log("Status:", r3.status);
  console.log("Employment via employment endpoint:", JSON.stringify(j3.values, null, 2));
}
