const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "SxUgBb211XKLO_gQbV9awODNYRV1iQIBh6XwZmGNpu8";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const json = await r.json();
  console.log(`${method} ${path} -> ${r.status}`);
  if (!r.ok) { console.log(JSON.stringify(json, null, 2)); throw new Error(`${r.status}`); }
  return json;
}

// 1. Resolve customer by organizationNumber
const custResp = await api("GET", "/customer?organizationNumber=980215350&count=10&fields=*");
const customers = custResp.values.filter((c: any) => c.organizationNumber === "980215350");
if (customers.length === 0) throw new Error("Customer not found");
const customerId = customers[0].id;
console.log("Customer ID:", customerId);

// 2. Resolve project manager by email (assignable)
const empResp = await api("GET", "/employee?email=emma.schneider@example.org&assignableProjectManagers=true&count=10&fields=*");
const managers = empResp.values.filter((e: any) => e.email === "emma.schneider@example.org");
if (managers.length === 0) throw new Error("Manager not found");
const managerId = managers[0].id;
console.log("Manager ID:", managerId);

// 3. Create project
const project = await api("POST", "/project", {
  name: "Analyse Sonnental",
  startDate: "2026-03-21",
  customer: { id: customerId },
  projectManager: { id: managerId },
});
console.log("Project created:", JSON.stringify(project.value, null, 2));
