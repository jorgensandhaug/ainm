// Sandbox experiment: try POST /project with inline customer+PM resolution to see if any 2-call path exists
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  console.log(`\n${method} ${path} → ${r.status}`);
  console.log(JSON.stringify(j, null, 2));
  return { status: r.status, body: j };
}

// First, get a valid customer ID and PM ID for reference
const custRes = await api("GET", "/customer?count=1&fields=id,name,organizationNumber");
const custId = custRes.body.values?.[0]?.id;
const custOrg = custRes.body.values?.[0]?.organizationNumber;
console.log(`\nReference customer: id=${custId} org=${custOrg}`);

const empRes = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=id,email,firstName,lastName");
const pmId = empRes.body.values?.[0]?.id;
const pmEmail = empRes.body.values?.[0]?.email;
console.log(`\nReference PM: id=${pmId} email=${pmEmail}`);

// Experiment 1: POST /project with only customer.id (skip PM read, inline PM email)
console.log("\n=== Experiment 1: customer.id + inline PM email (no PM id) ===");
const exp1 = await api("POST", "/project", {
  name: "Sandbox Test 2call A",
  startDate: "2026-03-22",
  customer: { id: custId },
  projectManager: { email: pmEmail, firstName: "Test", lastName: "Test" }
});

// Experiment 2: POST /project with only PM.id (skip customer read, inline customer org)
console.log("\n=== Experiment 2: inline customer org + PM.id ===");
const exp2 = await api("POST", "/project", {
  name: "Sandbox Test 2call B",
  startDate: "2026-03-22",
  customer: { organizationNumber: custOrg, name: "Test Customer" },
  projectManager: { id: pmId }
});
if (exp2.status === 201) {
  console.log("Customer in response:", JSON.stringify(exp2.body.value?.customer));
}

// Experiment 3: Can we combine customer+employee lookup in one call?
// Try /project with both inlined
console.log("\n=== Experiment 3: both inline ===");
const exp3 = await api("POST", "/project", {
  name: "Sandbox Test 2call C",
  startDate: "2026-03-22",
  customer: { organizationNumber: custOrg, name: "Test Customer" },
  projectManager: { email: pmEmail, firstName: "Test", lastName: "Test" }
});
