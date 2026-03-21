// Test 1: Can POST /project with nested customer { organizationNumber } + projectManager { email } work in 1 call?
// Test 2: Can we combine customer + employee lookup into one parallel pair + POST = still 3 calls but faster?
// Test 3: Re-confirm nested customer shortcut still fails

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// First, find a real customer and manager in the sandbox
const custRes = await fetch(`${BASE}/customer?count=1&fields=*`, { headers: H });
const custData = await custRes.json();
console.log("Sandbox customer lookup:", custRes.status);
const cust = custData.values?.[0];
if (!cust) { console.log("No customers in sandbox"); process.exit(1); }
console.log("Customer:", cust.id, cust.name, cust.organizationNumber);

const empRes = await fetch(`${BASE}/employee?assignableProjectManagers=true&count=1&fields=*`, { headers: H });
const empData = await empRes.json();
console.log("Sandbox employee lookup:", empRes.status);
const emp = empData.values?.[0];
if (!emp) { console.log("No assignable managers in sandbox"); process.exit(1); }
console.log("Manager:", emp.id, emp.firstName, emp.lastName, emp.email);

// Test: POST /project with nested customer (organizationNumber only, no id)
const ts = Date.now();
const testPayload1 = {
  name: `SandboxTest-NestedCust-${ts}`,
  startDate: "2026-03-21",
  customer: { name: cust.name, organizationNumber: cust.organizationNumber },
  projectManager: { id: emp.id },
};
console.log("\n--- Test 1: POST /project with nested customer (no id) ---");
const test1Res = await fetch(`${BASE}/project`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(testPayload1),
});
const test1Data = await test1Res.json();
console.log("Status:", test1Res.status);
console.log("customer in response:", JSON.stringify(test1Data.value?.customer));
console.log("Full response customer null?", test1Data.value?.customer === null);

// Test: POST /project with projectManager by email (no id)
const testPayload2 = {
  name: `SandboxTest-MgrEmail-${ts}`,
  startDate: "2026-03-21",
  customer: { id: cust.id },
  projectManager: { email: emp.email, firstName: emp.firstName, lastName: emp.lastName },
};
console.log("\n--- Test 2: POST /project with manager email (no id) ---");
const test2Res = await fetch(`${BASE}/project`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(testPayload2),
});
const test2Data = await test2Res.json();
console.log("Status:", test2Res.status);
if (test2Res.status !== 201) {
  console.log("Error:", JSON.stringify(test2Data));
} else {
  console.log("projectManager in response:", JSON.stringify(test2Data.value?.projectManager));
}

// Test: POST /project with both nested (1-call dream)
const testPayload3 = {
  name: `SandboxTest-BothNested-${ts}`,
  startDate: "2026-03-21",
  customer: { name: cust.name, organizationNumber: cust.organizationNumber },
  projectManager: { email: emp.email, firstName: emp.firstName, lastName: emp.lastName },
};
console.log("\n--- Test 3: POST /project with both nested (no ids) ---");
const test3Res = await fetch(`${BASE}/project`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(testPayload3),
});
const test3Data = await test3Res.json();
console.log("Status:", test3Res.status);
if (test3Res.status !== 201) {
  console.log("Error:", JSON.stringify(test3Data));
} else {
  console.log("customer:", JSON.stringify(test3Data.value?.customer));
  console.log("projectManager:", JSON.stringify(test3Data.value?.projectManager));
}

console.log("\n=== SUMMARY ===");
console.log("Test 1 (nested customer, no id): status", test1Res.status, "customer=", test1Data.value?.customer === null ? "NULL (BROKEN)" : "linked");
console.log("Test 2 (manager email, no id): status", test2Res.status);
console.log("Test 3 (both nested, no ids): status", test3Res.status);
