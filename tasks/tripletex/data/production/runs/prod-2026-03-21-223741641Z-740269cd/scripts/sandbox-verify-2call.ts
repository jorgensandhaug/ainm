// Test if POST /project can resolve customer by orgNumber + manager by email inline (2-call or 1-call path)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // First, get a valid customer and manager for reference
  const custRes = await fetch(`${BASE}/customer?count=1&fields=id,organizationNumber,name`, { headers: H });
  const custData = await custRes.json();
  const cust = custData.values?.[0];
  console.log("Reference customer:", cust?.id, cust?.name, cust?.organizationNumber);

  const empRes = await fetch(`${BASE}/employee?assignableProjectManagers=true&count=1&fields=id,email,firstName,lastName`, { headers: H });
  const empData = await empRes.json();
  const emp = empData.values?.[0];
  console.log("Reference manager:", emp?.id, emp?.email, emp?.firstName, emp?.lastName);

  if (!cust || !emp) { console.log("No reference data"); return; }

  // Test 1: POST /project with nested customer { organizationNumber } + valid projectManager.id
  console.log("\n--- Test 1: nested customer { organizationNumber } + valid manager id ---");
  const t1 = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "SandboxTest2Call-" + Date.now(),
      startDate: "2026-03-21",
      customer: { organizationNumber: cust.organizationNumber },
      projectManager: { id: emp.id },
    }),
  });
  const t1d = await t1.json();
  console.log("Status:", t1.status, "customer:", t1d.value?.customer, "name:", t1d.value?.name);

  // Test 2: POST /project with valid customer.id + nested manager { email }
  console.log("\n--- Test 2: valid customer id + nested manager { email } ---");
  const t2 = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "SandboxTest2Call2-" + Date.now(),
      startDate: "2026-03-21",
      customer: { id: cust.id },
      projectManager: { email: emp.email, firstName: emp.firstName, lastName: emp.lastName },
    }),
  });
  const t2d = await t2.json();
  console.log("Status:", t2.status);
  if (t2.status >= 400) console.log("Error:", JSON.stringify(t2d));
  else console.log("manager:", t2d.value?.projectManager, "name:", t2d.value?.name);

  // Test 3: POST /project with nested customer { name, organizationNumber } + valid manager id (re-check existing proof)
  console.log("\n--- Test 3: nested customer { name, orgNr } + valid manager id ---");
  const t3 = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "SandboxTest2Call3-" + Date.now(),
      startDate: "2026-03-21",
      customer: { name: cust.name, organizationNumber: cust.organizationNumber },
      projectManager: { id: emp.id },
    }),
  });
  const t3d = await t3.json();
  console.log("Status:", t3.status, "customer:", t3d.value?.customer, "name:", t3d.value?.name);
}

main().catch(e => { console.error(e); process.exit(1); });
