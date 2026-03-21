// Sandbox test: verify pre-read department strategy (2 calls, 0 errors)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function run() {
  // Call 1: GET /department (pre-read)
  const deptRes = await fetch(`${BASE}/department?isInactive=false&count=1&fields=id`, {
    headers: H,
  });
  const deptData = await deptRes.json();
  console.log("Call 1 - GET /department:", deptRes.status);
  const deptId = deptData.values?.[0]?.id;
  console.log("  Department ID:", deptId);

  if (!deptId) {
    console.log("ERROR: No active department found");
    return;
  }

  // Call 2: POST /employee with department pre-filled
  const ts = Date.now();
  const empRes = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      firstName: `SandboxPreRead${ts}`,
      lastName: "TestWalker",
      dateOfBirth: "1999-01-21",
      email: `preread${ts}@example.org`,
      userType: "NO_ACCESS",
      department: { id: deptId },
      employments: [{ startDate: "2026-12-23" }],
    }),
  });
  const empData = await empRes.json();
  console.log("Call 2 - POST /employee:", empRes.status);

  if (empRes.status === 201) {
    const v = empData.value;
    console.log("  Employee ID:", v.id);
    console.log("  Name:", v.firstName, v.lastName);
    console.log("  DOB:", v.dateOfBirth);
    console.log("  Email:", v.email);
    console.log("  Start date:", v.employments?.[0]?.startDate);
    console.log("\nSUCCESS: 2 calls, 0 errors with pre-read strategy");
  } else {
    console.log("  Response:", JSON.stringify(empData, null, 2));
    console.log("\nFAILED: POST /employee returned", empRes.status);
  }
}

run();
