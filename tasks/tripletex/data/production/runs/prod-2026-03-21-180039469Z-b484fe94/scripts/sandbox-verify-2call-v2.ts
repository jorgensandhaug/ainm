// Sandbox verification: Find any customer and assignable manager, then test shortcut paths

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // Get any customer
  const custRes = await fetch(`${BASE}/customer?count=1&fields=*`, { headers: H });
  const custData = await custRes.json();
  const customer = custData.values?.[0];
  if (!customer) { console.log("No customers in sandbox"); return; }
  console.log("Customer:", customer.id, customer.name, customer.organizationNumber);

  // Get any assignable manager
  const empRes = await fetch(`${BASE}/employee?assignableProjectManagers=true&count=1&fields=*`, { headers: H });
  const empData = await empRes.json();
  const manager = empData.values?.[0];
  if (!manager) { console.log("No assignable managers"); return; }
  console.log("Manager:", manager.id, manager.displayName, manager.email);

  // Test 1: POST /project with nested customer { name, organizationNumber } + valid projectManager.id
  console.log("\n--- Test 1: Nested customer (name+orgNr) + valid manager ID ---");
  const test1 = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Sandbox Shortcut Test 1",
      startDate: "2026-03-21",
      customer: { name: customer.name, organizationNumber: customer.organizationNumber },
      projectManager: { id: manager.id },
    }),
  });
  const test1Data = await test1.json();
  console.log("Status:", test1.status);
  if (test1.status === 201) {
    console.log("Customer linked?", test1Data.value?.customer);
    console.log("CustomerName:", test1Data.value?.customerName);
  } else {
    console.log("Error:", JSON.stringify(test1Data));
  }

  // Test 2: POST /project with valid customer.id + manager email only (no ID)
  console.log("\n--- Test 2: Valid customer ID + manager by email only ---");
  const test2 = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Sandbox Shortcut Test 2",
      startDate: "2026-03-21",
      customer: { id: customer.id },
      projectManager: { email: manager.email },
    }),
  });
  const test2Data = await test2.json();
  console.log("Status:", test2.status);
  if (test2.status === 201) {
    console.log("Manager linked?", test2Data.value?.projectManager);
  } else {
    console.log("Error:", JSON.stringify(test2Data));
  }

  // Test 3: 1-call — both nested customer + manager by email
  console.log("\n--- Test 3: Both nested (1 call total) ---");
  const test3 = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Sandbox Shortcut Test 3",
      startDate: "2026-03-21",
      customer: { name: customer.name, organizationNumber: customer.organizationNumber },
      projectManager: { email: manager.email },
    }),
  });
  const test3Data = await test3.json();
  console.log("Status:", test3.status);
  if (test3.status === 201) {
    console.log("Customer linked?", test3Data.value?.customer);
    console.log("Manager linked?", test3Data.value?.projectManager);
  } else {
    console.log("Error:", JSON.stringify(test3Data));
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
