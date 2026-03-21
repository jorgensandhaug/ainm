// Test: Can we skip customer read by passing organizationNumber inline on POST /project?
// Test: Can we skip manager read by passing email inline on POST /project?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  const ts = Date.now();

  // Test 1: POST /project with customer { organizationNumber } + valid manager ID
  // First get a valid manager ID
  const empRes = await fetch(`${BASE}/employee?assignableProjectManagers=true&count=1&fields=id,email`, { headers: H });
  const empData = await empRes.json();
  const mgr = empData.values?.[0];
  console.log("Manager for test:", mgr?.id, mgr?.email);

  // Get a valid customer for reference
  const custRes = await fetch(`${BASE}/customer?count=1&fields=id,organizationNumber,name`, { headers: H });
  const custData = await custRes.json();
  const cust = custData.values?.[0];
  console.log("Customer for test:", cust?.id, cust?.organizationNumber, cust?.name);

  if (!mgr || !cust) { console.log("No test data"); return; }

  // Test 1: nested customer by organizationNumber
  console.log("\n--- Test 1: POST /project with customer { organizationNumber } ---");
  const r1 = await fetch(`${BASE}/project`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      name: `SB-nested-cust-${ts}`,
      startDate: "2026-03-21",
      customer: { organizationNumber: cust.organizationNumber },
      projectManager: { id: mgr.id },
    }),
  });
  const d1 = await r1.json();
  console.log("Status:", r1.status);
  console.log("customer in response:", JSON.stringify(d1.value?.customer));

  // Test 2: nested customer by name + organizationNumber
  console.log("\n--- Test 2: POST /project with customer { name, organizationNumber } ---");
  const r2 = await fetch(`${BASE}/project`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      name: `SB-nested-cust2-${ts}`,
      startDate: "2026-03-21",
      customer: { name: cust.name, organizationNumber: cust.organizationNumber },
      projectManager: { id: mgr.id },
    }),
  });
  const d2 = await r2.json();
  console.log("Status:", r2.status);
  console.log("customer in response:", JSON.stringify(d2.value?.customer));

  // Test 3: nested customer by id (the known working path, as control)
  console.log("\n--- Test 3 (control): POST /project with customer { id } ---");
  const r3 = await fetch(`${BASE}/project`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      name: `SB-control-${ts}`,
      startDate: "2026-03-21",
      customer: { id: cust.id },
      projectManager: { id: mgr.id },
    }),
  });
  const d3 = await r3.json();
  console.log("Status:", r3.status);
  console.log("customer in response:", JSON.stringify(d3.value?.customer));
}

main().catch((e) => { console.error(e); process.exit(1); });
