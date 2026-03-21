const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const CUST_ID = 108162307;
const CUST_NAME = "Codex Payment Probe 752963";
const CUST_ORG = "889752963";
const MGR_ID = 18441996;
const MGR_EMAIL = "simen.sandhaug@gmail.com";

// Test 1: nested customer { name, organizationNumber } + valid manager id
// Goal: see if we can skip the customer GET
console.log("=== Test 1: nested customer by orgNr + valid manager id ===");
const t1 = await fetch(`${BASE}/project`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: "Shortcut Test A " + Date.now(),
    startDate: "2026-03-21",
    customer: { name: CUST_NAME, organizationNumber: CUST_ORG },
    projectManager: { id: MGR_ID },
  }),
});
const t1b = await t1.json();
console.log("status:", t1.status);
console.log("customer:", JSON.stringify(t1b.value?.customer));
if (t1b.value?.customer) {
  // Check if the customer is actually linked
  console.log("customerName:", t1b.value?.customerName);
}

// Test 2: valid customer id + manager { email }
// Goal: see if we can skip the manager GET
console.log("\n=== Test 2: valid customer id + manager by email only ===");
const t2 = await fetch(`${BASE}/project`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: "Shortcut Test B " + Date.now(),
    startDate: "2026-03-21",
    customer: { id: CUST_ID },
    projectManager: { email: MGR_EMAIL },
  }),
});
const t2b = await t2.json();
console.log("status:", t2.status);
if (t2.status === 201) {
  console.log("projectManager:", JSON.stringify(t2b.value?.projectManager));
} else {
  console.log("error:", JSON.stringify(t2b).slice(0, 500));
}

// Test 3: valid customer id + manager { id } (control)
console.log("\n=== Test 3 (control): valid customer id + valid manager id ===");
const t3 = await fetch(`${BASE}/project`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: "Shortcut Test C " + Date.now(),
    startDate: "2026-03-21",
    customer: { id: CUST_ID },
    projectManager: { id: MGR_ID },
  }),
});
const t3b = await t3.json();
console.log("status:", t3.status);
console.log("customer:", JSON.stringify(t3b.value?.customer));
console.log("projectManager:", JSON.stringify(t3b.value?.projectManager));

// Test 4: customer { id } only (no manager) - test if manager really required
console.log("\n=== Test 4: customer id, no manager at all ===");
const t4 = await fetch(`${BASE}/project`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: "Shortcut Test D " + Date.now(),
    startDate: "2026-03-21",
    customer: { id: CUST_ID },
  }),
});
const t4b = await t4.json();
console.log("status:", t4.status);
if (t4.status !== 201) {
  console.log("error:", JSON.stringify(t4b).slice(0, 500));
} else {
  console.log("projectManager:", JSON.stringify(t4b.value?.projectManager));
}
