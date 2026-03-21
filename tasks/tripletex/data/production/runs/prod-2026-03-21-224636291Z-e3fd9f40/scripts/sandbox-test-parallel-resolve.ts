// Test: Can we resolve customer + manager in a single call somehow?
// Or can we POST /project with organizationNumber/email directly?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Test 1: POST /project with customer.organizationNumber + projectManager.email
console.log("=== Test 1: nested customer orgNumber + manager email ===");
const r1 = await fetch(`${BASE}/project`, {
  method: "POST", headers: H,
  body: JSON.stringify({
    name: "Sandbox Parallel Test A",
    startDate: "2026-03-21",
    customer: { organizationNumber: "957080138" },
    projectManager: { email: "silje.degard@example.org" },
  })
});
const d1 = await r1.json();
console.log("Status:", r1.status);
console.log("Response:", JSON.stringify(d1, null, 2));

// Test 2: POST /project with customer.organizationNumber + customer.name + projectManager with name+email
console.log("\n=== Test 2: nested customer orgNumber+name + manager name+email ===");
const r2 = await fetch(`${BASE}/project`, {
  method: "POST", headers: H,
  body: JSON.stringify({
    name: "Sandbox Parallel Test B",
    startDate: "2026-03-21",
    customer: { name: "Nordhav AS", organizationNumber: "957080138" },
    projectManager: { firstName: "Silje", lastName: "Ødegård", email: "silje.degard@example.org" },
  })
});
const d2 = await r2.json();
console.log("Status:", r2.status);
console.log("Response:", JSON.stringify(d2, null, 2));
