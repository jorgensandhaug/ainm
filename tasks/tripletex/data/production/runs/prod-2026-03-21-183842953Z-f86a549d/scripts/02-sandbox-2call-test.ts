// Sandbox investigation: test if POST /project can now accept customer by organizationNumber
// or projectManager by email, avoiding the separate resolver GETs.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// First, get a known customer and manager for reference
const custRes = await fetch(`${BASE}/customer?organizationNumber=826557990&count=1&fields=id,name,organizationNumber`, { headers: H });
const custData = await custRes.json();
console.log("=== Customer lookup ===");
console.log("status:", custRes.status);
const cust = custData.values?.[0];
console.log("customer:", JSON.stringify(cust));

const mgrRes = await fetch(`${BASE}/employee?email=torbjrn.stlsvik@example.org&assignableProjectManagers=true&count=1&fields=id,email,firstName,lastName`, { headers: H });
const mgrData = await mgrRes.json();
console.log("\n=== Manager lookup ===");
console.log("status:", mgrRes.status);
const mgr = mgrData.values?.[0];
console.log("manager:", JSON.stringify(mgr));

if (!cust || !mgr) {
  console.log("Customer or manager not found in sandbox, skipping further tests");
  process.exit(0);
}

// Test 1: POST /project with nested customer { organizationNumber } and valid projectManager.id
console.log("\n=== Test 1: nested customer { name, organizationNumber } + valid manager id ===");
const test1 = await fetch(`${BASE}/project`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: "Sandbox Test Nested Customer " + Date.now(),
    startDate: "2026-03-21",
    customer: { name: cust.name, organizationNumber: String(cust.organizationNumber) },
    projectManager: { id: mgr.id },
  }),
});
const test1Body = await test1.json();
console.log("status:", test1.status);
console.log("customer in response:", JSON.stringify(test1Body.value?.customer));
console.log("projectManager in response:", JSON.stringify(test1Body.value?.projectManager));

// Test 2: POST /project with valid customer.id and projectManager { email }
console.log("\n=== Test 2: valid customer id + nested manager { email, firstName, lastName } ===");
const test2 = await fetch(`${BASE}/project`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: "Sandbox Test Nested Manager " + Date.now(),
    startDate: "2026-03-21",
    customer: { id: cust.id },
    projectManager: { email: mgr.email, firstName: mgr.firstName, lastName: mgr.lastName },
  }),
});
const test2Body = await test2.json();
console.log("status:", test2.status);
if (test2.status === 201) {
  console.log("customer in response:", JSON.stringify(test2Body.value?.customer));
  console.log("projectManager in response:", JSON.stringify(test2Body.value?.projectManager));
} else {
  console.log("error:", JSON.stringify(test2Body));
}

// Test 3: POST /project with valid customer.id and valid manager.id (control - should work)
console.log("\n=== Test 3: control - valid customer id + valid manager id ===");
const test3 = await fetch(`${BASE}/project`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: "Sandbox Test Control " + Date.now(),
    startDate: "2026-03-21",
    customer: { id: cust.id },
    projectManager: { id: mgr.id },
  }),
});
const test3Body = await test3.json();
console.log("status:", test3.status);
console.log("customer in response:", JSON.stringify(test3Body.value?.customer));
console.log("projectManager in response:", JSON.stringify(test3Body.value?.projectManager));
