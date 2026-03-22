const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "R5gbjcfKmrhBaY29eI-Cv4LfFOCMXPYrnmbfGmFH3AE";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const j = await r.json();
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.error(JSON.stringify(j, null, 2)); throw new Error(`${r.status}`); }
  return j;
}

// 1. Resolve customer by org number
const custRes = await api("GET", "/customer?organizationNumber=886715536&count=10&fields=*");
const cust = custRes.values.find((c: any) => c.organizationNumber === "886715536");
if (!cust) throw new Error("Customer not found");
console.log(`Customer: id=${cust.id} name=${cust.name} org=${cust.organizationNumber}`);

// 2. Resolve project manager by email
const empRes = await api("GET", "/employee?email=jonas.haugen@example.org&assignableProjectManagers=true&count=10&fields=*");
const pm = empRes.values.find((e: any) => e.email === "jonas.haugen@example.org");
if (!pm) throw new Error("Project manager not found");
console.log(`PM: id=${pm.id} name=${pm.firstName} ${pm.lastName} email=${pm.email}`);

// 3. Create project
const project = await api("POST", "/project", {
  name: "Implementering Tindra",
  startDate: "2026-03-22",
  customer: { id: cust.id },
  projectManager: { id: pm.id },
});
const p = project.value;
console.log(`Project created: id=${p.id} name=${p.name} startDate=${p.startDate}`);
console.log(`  customer: id=${p.customer?.id} name=${p.customer?.name} org=${p.customer?.organizationNumber}`);
console.log(`  pm: id=${p.projectManager?.id} name=${p.projectManager?.firstName} ${p.projectManager?.lastName} email=${p.projectManager?.email}`);
