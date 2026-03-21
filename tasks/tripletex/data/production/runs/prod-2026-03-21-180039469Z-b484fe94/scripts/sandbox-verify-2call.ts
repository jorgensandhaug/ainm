// Sandbox verification: Can we skip the customer read by sending nested customer data on POST /project?
// Also test: Can we skip the manager read by sending email-only manager data?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // First, get a valid customer and manager for reference
  const custRes = await fetch(`${BASE}/customer?organizationNumber=842138248&count=10&fields=*`, { headers: H });
  const custData = await custRes.json();
  const customer = custData.values?.find((c: any) => c.organizationNumber === "842138248");
  console.log("Reference customer:", customer?.id, customer?.name);

  const empRes = await fetch(`${BASE}/employee?email=jules.martin@example.org&assignableProjectManagers=true&count=10&fields=*`, { headers: H });
  const empData = await empRes.json();
  const manager = empData.values?.find((e: any) => e.email === "jules.martin@example.org");
  console.log("Reference manager:", manager?.id, manager?.displayName);

  // Test 1: POST /project with nested customer { name, organizationNumber } + valid projectManager.id
  console.log("\n--- Test 1: Nested customer details (skip customer read) ---");
  const test1 = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Sandbox Test 1 - Nested Customer",
      startDate: "2026-03-21",
      customer: { name: "Montagne SARL", organizationNumber: "842138248" },
      projectManager: { id: manager?.id },
    }),
  });
  const test1Data = await test1.json();
  console.log("Status:", test1.status);
  console.log("Customer in response:", test1Data.value?.customer);
  console.log("CustomerName:", test1Data.value?.customerName);

  // Test 2: POST /project with valid customer.id + manager email (skip manager read)
  console.log("\n--- Test 2: Manager by email only (skip manager read) ---");
  const test2 = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Sandbox Test 2 - Manager Email Only",
      startDate: "2026-03-21",
      customer: { id: customer?.id },
      projectManager: { email: "jules.martin@example.org" },
    }),
  });
  const test2Data = await test2.json();
  console.log("Status:", test2.status);
  if (test2.status !== 201) {
    console.log("Error:", JSON.stringify(test2Data));
  } else {
    console.log("Manager in response:", test2Data.value?.projectManager);
  }

  // Test 3: POST /project with valid customer.id + manager firstName/lastName (skip manager read)
  console.log("\n--- Test 3: Manager by name only (skip manager read) ---");
  const test3 = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Sandbox Test 3 - Manager Name Only",
      startDate: "2026-03-21",
      customer: { id: customer?.id },
      projectManager: { firstName: "Jules", lastName: "Martin" },
    }),
  });
  const test3Data = await test3.json();
  console.log("Status:", test3.status);
  if (test3.status !== 201) {
    console.log("Error:", JSON.stringify(test3Data));
  } else {
    console.log("Manager in response:", test3Data.value?.projectManager);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
