const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "YeQrrO-0cFm1pjL41qIWZL3EgsGBXfEPI-Uov54Lg-4";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Resolve customer by organizationNumber
const custRes = await fetch(
  `${BASE}/customer?organizationNumber=826557990&count=10&fields=*`,
  { headers: H }
);
if (!custRes.ok) { console.error("customer lookup failed", custRes.status, await custRes.text()); process.exit(1); }
const custData = await custRes.json();
const customers = (custData.values ?? []).filter(
  (c: any) => String(c.organizationNumber) === "826557990"
);
if (customers.length === 0) { console.error("no customer with org nr 826557990"); process.exit(1); }
const customerId = customers[0].id;
console.log("customer id:", customerId);

// Step 2: Resolve project manager by email (assignable only)
const mgrRes = await fetch(
  `${BASE}/employee?email=torbjrn.stlsvik@example.org&assignableProjectManagers=true&count=10&fields=*`,
  { headers: H }
);
if (!mgrRes.ok) { console.error("manager lookup failed", mgrRes.status, await mgrRes.text()); process.exit(1); }
const mgrData = await mgrRes.json();
const managers = (mgrData.values ?? []).filter(
  (e: any) => e.email === "torbjrn.stlsvik@example.org"
);
if (managers.length === 0) { console.error("no assignable manager with email torbjrn.stlsvik@example.org"); process.exit(1); }
const managerId = managers[0].id;
console.log("manager id:", managerId);

// Step 3: Create project
const projRes = await fetch(`${BASE}/project`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: "Oppgradering Fjelltopp",
    startDate: "2026-03-21",
    customer: { id: customerId },
    projectManager: { id: managerId },
  }),
});
const projBody = await projRes.json();
console.log("POST /project status:", projRes.status);
console.log("response:", JSON.stringify(projBody, null, 2));

if (!projRes.ok) { console.error("project create failed"); process.exit(1); }

const v = projBody.value;
console.log("\n=== VERIFICATION ===");
console.log("project id:", v.id);
console.log("name:", v.name);
console.log("startDate:", v.startDate);
console.log("customer.id:", v?.customer?.id);
console.log("projectManager.id:", v?.projectManager?.id);
