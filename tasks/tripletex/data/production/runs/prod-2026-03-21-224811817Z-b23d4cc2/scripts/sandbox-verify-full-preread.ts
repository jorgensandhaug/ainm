// Full pre-read strategy with sandbox division repair
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function run() {
  let callCount = 0;
  let errorCount = 0;

  // Step 1: Pre-read department
  callCount++;
  const dr = await fetch(`${BASE}/department?isInactive=false&count=1&fields=id`, { headers: H });
  const dBody = await dr.json();
  console.log(`[Call ${callCount}] GET /department → ${dr.status}, count: ${dBody.count}`);

  let deptId: number;
  if (dBody.count > 0) {
    deptId = dBody.values[0].id;
  } else {
    console.log("No active dept — creating...");
    callCount++;
    const cr = await fetch(`${BASE}/department?fields=id`, {
      method: "POST",
      headers: H,
      body: JSON.stringify({ name: "Avdeling" }),
    });
    const cBody = await cr.json();
    console.log(`[Call ${callCount}] POST /department → ${cr.status}`);
    deptId = cBody.value.id;
  }

  // Step 2: POST employee with dept
  const ts = Date.now();
  const employee: any = {
    firstName: "SandboxTest",
    lastName: `FullPreRead${ts}`,
    dateOfBirth: "1991-11-14",
    email: `sandbox-fullpreread-${ts}@example.org`,
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{ startDate: "2026-02-11" }],
  };

  callCount++;
  let r = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
    method: "POST",
    headers: H,
    body: JSON.stringify(employee),
  });
  let body = await r.json();
  console.log(`[Call ${callCount}] POST /employee → ${r.status}`);

  // Division repair if needed (sandbox-only)
  if (r.status === 422) {
    errorCount++;
    const msgs = body.validationMessages || [];
    const needsDiv = msgs.some((m: any) => m.field === "employments.division.id");
    if (needsDiv) {
      console.log("Division required (sandbox) — resolving...");
      callCount++;
      const divR = await fetch(`${BASE}/division?count=1&fields=id`, { headers: H });
      const divBody = await divR.json();
      console.log(`[Call ${callCount}] GET /division → ${divR.status}`);
      const divId = divBody.values[0].id;

      employee.employments[0].division = { id: divId };

      callCount++;
      r = await fetch(`${BASE}/employee?fields=*,employments(*)`, {
        method: "POST",
        headers: H,
        body: JSON.stringify(employee),
      });
      body = await r.json();
      console.log(`[Call ${callCount}] POST /employee (with div) → ${r.status}`);
    }
  }

  if (r.status === 201) {
    console.log(`\nSUCCESS — ${callCount} calls, ${errorCount} errors`);
    console.log("firstName:", body.value.firstName);
    console.log("lastName:", body.value.lastName);
    console.log("dateOfBirth:", body.value.dateOfBirth);
    console.log("email:", body.value.email);
    console.log("dept:", body.value.department?.id);
    console.log("startDate:", body.value.employments?.[0]?.startDate);
    console.log("\nIn production (no division needed): would be 2 calls, 0 errors");
  } else {
    console.log("FAILED:", r.status, JSON.stringify(body, null, 2));
  }
}

run();
