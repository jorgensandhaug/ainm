// Sandbox verification: can we create a project with inline customer+PM in a single POST?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Test 1: POST /project with inline customer { name, organizationNumber } and PM { email }
console.log("=== Test 1: inline customer+PM (no IDs) ===");
try {
  const r1 = await fetch(BASE + "/project", {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "SandboxTest 2Call A",
      startDate: "2026-03-22",
      customer: { name: "TestCo", organizationNumber: "123456789" },
      projectManager: { email: "test@example.org", firstName: "Test", lastName: "User" },
    }),
  });
  const b1 = await r1.text();
  console.log(`Status: ${r1.status}`);
  console.log(`Body: ${b1.substring(0, 500)}`);
} catch (e: any) {
  console.log("Error:", e.message);
}

// Test 2: POST /project with only customer ID (resolved) but inline PM email
// First get a real customer ID
console.log("\n=== Test 2: real customer ID + inline PM ===");
const custResp = await fetch(BASE + "/customer?count=1&fields=id,name", { headers: H });
const custData = await custResp.json();
const custId = custData.values?.[0]?.id;
console.log("Using customer ID:", custId);

if (custId) {
  try {
    const r2 = await fetch(BASE + "/project", {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        name: "SandboxTest 2Call B",
        startDate: "2026-03-22",
        customer: { id: custId },
        projectManager: { email: "test@example.org" },
      }),
    });
    const b2 = await r2.text();
    console.log(`Status: ${r2.status}`);
    console.log(`Body: ${b2.substring(0, 500)}`);
  } catch (e: any) {
    console.log("Error:", e.message);
  }
}

// Test 3: POST /project with inline customer but real PM ID
console.log("\n=== Test 3: inline customer + real PM ID ===");
const empResp = await fetch(BASE + "/employee?assignableProjectManagers=true&count=1&fields=id,email", { headers: H });
const empData = await empResp.json();
const empId = empData.values?.[0]?.id;
console.log("Using employee ID:", empId);

if (empId) {
  try {
    const r3 = await fetch(BASE + "/project", {
      method: "POST",
      headers: H,
      body: JSON.stringify({
        name: "SandboxTest 2Call C",
        startDate: "2026-03-22",
        customer: { name: "InlineCo", organizationNumber: "987654321" },
        projectManager: { id: empId },
      }),
    });
    const b3 = await r3.text();
    console.log(`Status: ${r3.status}`);
    // Check if customer is null
    if (r3.status === 201) {
      const parsed = JSON.parse(b3);
      console.log("customer field:", JSON.stringify(parsed.value?.customer));
      console.log("projectManager field:", JSON.stringify(parsed.value?.projectManager));
    } else {
      console.log(`Body: ${b3.substring(0, 500)}`);
    }
  } catch (e: any) {
    console.log("Error:", e.message);
  }
}
