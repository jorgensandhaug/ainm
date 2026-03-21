// Verify the pre-read strategy: GET /department first, then POST /employee with dept
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function run() {
  // Step 1: Pre-read department
  const dr = await fetch(`${BASE}/department?isInactive=false&count=1&fields=id`, { headers: H });
  const dBody = await dr.json();
  console.log("GET /department →", dr.status, "count:", dBody.count);

  let deptId: number;
  if (dBody.count > 0) {
    deptId = dBody.values[0].id;
    console.log("Found dept:", deptId);
  } else {
    console.log("No active dept — would need POST /department");
    return;
  }

  // Step 2: POST /employee with dept included upfront
  const ts = Date.now();
  const employee = {
    firstName: "SandboxTest",
    lastName: `PreRead${ts}`,
    dateOfBirth: "1995-03-15",
    email: `sandbox-preread-${ts}@example.org`,
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{ startDate: "2026-06-01" }],
  };

  const r = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(employee),
  });
  const body = await r.json();
  console.log("POST /employee →", r.status);

  if (r.status === 201) {
    console.log("SUCCESS — 2 calls, 0 errors");
    console.log("firstName:", body.value.firstName);
    console.log("lastName:", body.value.lastName);
    console.log("dateOfBirth:", body.value.dateOfBirth);
    console.log("email:", body.value.email);
    console.log("dept:", body.value.department?.id);
    console.log("startDate:", body.value.employments?.[0]?.startDate);
  } else if (r.status === 422) {
    console.log("422 validation:", JSON.stringify(body.validationMessages, null, 2));
  } else {
    console.log("Unexpected:", r.status, JSON.stringify(body, null, 2));
  }
}

run();
