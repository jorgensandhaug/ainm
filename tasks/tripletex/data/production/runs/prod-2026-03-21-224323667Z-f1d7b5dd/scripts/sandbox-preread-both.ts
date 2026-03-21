// Sandbox test: pre-read both department and division
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function run() {
  // Test 1: Can we pre-read department and division in parallel, then POST employee with both?
  const ts = Date.now();

  // Parallel pre-reads
  const [deptRes, divRes] = await Promise.all([
    fetch(`${BASE}/department?isInactive=false&count=1&fields=id`, { headers: H }),
    fetch(`${BASE}/division?count=1&fields=id`, { headers: H }),
  ]);
  const deptData = await deptRes.json();
  const divData = await divRes.json();

  const deptId = deptData.values?.[0]?.id;
  const divId = divData.values?.[0]?.id;
  console.log("Call 1 - GET /department:", deptRes.status, "→ deptId:", deptId);
  console.log("Call 2 - GET /division:", divRes.status, "→ divId:", divId);

  // POST employee with both
  const payload: any = {
    firstName: `SandboxBoth${ts}`,
    lastName: "TestWalker",
    dateOfBirth: "1999-01-21",
    email: `both${ts}@example.org`,
    userType: "NO_ACCESS",
    employments: [
      {
        startDate: "2026-12-23",
        ...(divId ? { division: { id: divId } } : {}),
      },
    ],
  };
  if (deptId) payload.department = { id: deptId };

  const empRes = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(payload),
  });
  const empData = await empRes.json();
  console.log("Call 3 - POST /employee:", empRes.status);

  if (empRes.status === 201) {
    const v = empData.value;
    console.log("  Employee ID:", v.id);
    console.log("  Name:", v.firstName, v.lastName);
    console.log("  DOB:", v.dateOfBirth);
    console.log("  Email:", v.email);
    console.log("  Start date:", v.employments?.[0]?.startDate);
    console.log("\nSandbox SUCCESS: 3 calls (2 parallel pre-reads + 1 POST), 0 errors");
  } else {
    console.log("  Response:", JSON.stringify(empData, null, 2));
  }

  // Test 2: What about sending department and division on an account that doesn't need them?
  // Can't test this in sandbox (sandbox requires both), but note for production.
  console.log("\n--- Analysis ---");
  console.log("Sandbox requires both department and division.");
  console.log("Production: 4/8 runs needed department, 0/8 needed division.");
  console.log("At 50% dept-required + 0% div-required in production:");
  console.log("  Pre-read dept only: 2 calls avg, 0 errors avg");
  console.log("  No pre-read: 2 calls avg, 0.5 errors avg");
  console.log("  Pre-read both: 3 calls always (wastes 1 on division in prod)");
  console.log("Recommendation: pre-read department, keep division as repair-only");
}

run();
