// Sandbox verification: re-confirm that no 2-call shortcut exists for create-project
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Test 1: POST /project with nested customer { name, organizationNumber } (no ID)
console.log("=== Test 1: nested customer without ID ===");
try {
  const r = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Sandbox Test Nested Customer",
      startDate: "2026-03-22",
      customer: { name: "Test Kunde AS", organizationNumber: "935092957" },
      projectManager: { id: 1 }, // will resolve or fail, doesn't matter — testing customer
    }),
  });
  const txt = await r.text();
  console.log(`Status: ${r.status}`);
  if (r.ok) {
    const j = JSON.parse(txt);
    console.log("customer on response:", JSON.stringify(j.value?.customer));
    console.log("RESULT: customer is", j.value?.customer ? "PRESENT" : "NULL/missing");
  } else {
    console.log("Error:", txt.slice(0, 300));
  }
} catch (e: any) { console.log("Exception:", e.message); }

// Test 2: POST /project with nested projectManager { email } (no ID)
console.log("\n=== Test 2: nested PM without ID ===");
try {
  // First get a real customer ID
  const cr = await fetch(`${BASE}/customer?count=1&fields=id`, { headers: H });
  const cd = await cr.json();
  const custId = cd.values?.[0]?.id;
  console.log("Using customer ID:", custId);

  const r = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Sandbox Test Nested PM",
      startDate: "2026-03-22",
      customer: { id: custId },
      projectManager: { email: "test@example.org", firstName: "Test", lastName: "User" },
    }),
  });
  const txt = await r.text();
  console.log(`Status: ${r.status}`);
  console.log("Response:", txt.slice(0, 300));
} catch (e: any) { console.log("Exception:", e.message); }

// Test 3: POST /project with customer { id } and projectManager { id } (the standard 1-call write)
console.log("\n=== Test 3: standard POST with IDs (control) ===");
try {
  const [cr2, er2] = await Promise.all([
    fetch(`${BASE}/customer?count=1&fields=id,name`, { headers: H }).then(r => r.json()),
    fetch(`${BASE}/employee?assignableProjectManagers=true&count=1&fields=id,email`, { headers: H }).then(r => r.json()),
  ]);
  const custId = cr2.values?.[0]?.id;
  const pmId = er2.values?.[0]?.id;
  console.log("Customer:", custId, "PM:", pmId);

  const r = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Sandbox Control Test " + Date.now(),
      startDate: "2026-03-22",
      customer: { id: custId },
      projectManager: { id: pmId },
    }),
  });
  const txt = await r.text();
  console.log(`Status: ${r.status}`);
  if (r.ok) {
    const j = JSON.parse(txt);
    console.log("Project:", j.value?.id, j.value?.name);
    console.log("Customer:", j.value?.customer?.id, j.value?.customer?.name);
    console.log("PM:", j.value?.projectManager?.id);
    console.log("RESULT: standard path works as expected");
  } else {
    console.log("Error:", txt.slice(0, 300));
  }
} catch (e: any) { console.log("Exception:", e.message); }

console.log("\n=== Summary ===");
console.log("3-call minimum confirmed if both tests 1 and 2 fail to produce correct results");
