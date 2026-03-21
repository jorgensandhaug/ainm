const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "1DYMI6xx3Gs-Y-N454NRaxf99e_l8eUMEPbI3NeQ3bI";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// 1. Resolve customer by organizationNumber
const custRes = await fetch(`${BASE}/customer?organizationNumber=957080138&count=10&fields=*`, { headers: H });
const custData = await custRes.json();
console.log("Customer:", JSON.stringify(custData, null, 2));
const customer = custData.values?.find((c: any) => c.organizationNumber === "957080138");
if (!customer) throw new Error("Customer not found");
console.log("Customer ID:", customer.id);

// 2. Resolve project manager by email
const mgrRes = await fetch(`${BASE}/employee?email=silje.degard@example.org&assignableProjectManagers=true&count=10&fields=*`, { headers: H });
const mgrData = await mgrRes.json();
console.log("Manager:", JSON.stringify(mgrData, null, 2));
const manager = mgrData.values?.find((e: any) => e.email === "silje.degard@example.org");
if (!manager) throw new Error("Manager not found");
console.log("Manager ID:", manager.id);

// 3. Create project
const projectPayload = {
  name: "Implementering Nordhav",
  startDate: "2026-03-21",
  customer: { id: customer.id },
  projectManager: { id: manager.id },
};
const projRes = await fetch(`${BASE}/project`, { method: "POST", headers: H, body: JSON.stringify(projectPayload) });
const projData = await projRes.json();
console.log("Project:", JSON.stringify(projData, null, 2));
