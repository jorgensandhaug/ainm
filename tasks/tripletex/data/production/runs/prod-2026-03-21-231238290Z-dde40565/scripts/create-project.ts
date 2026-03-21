const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "gdCUcLIVKjLIoi3tKfeJr20wO452zW3EDATuyWr6Ws4";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${txt}`);
  return JSON.parse(txt);
}

// Step 1: resolve customer + assignable PM in parallel
const [custData, empData] = await Promise.all([
  get("/customer?organizationNumber=935092957&count=10&fields=*"),
  get("/employee?email=hakon.berge@example.org&assignableProjectManagers=true&count=10&fields=*"),
]);

const cust = custData.values.find((c: any) => c.organizationNumber === "935092957");
if (!cust) throw new Error("Customer 935092957 not found");
console.log("Customer:", cust.id, cust.name);

const emp = empData.values.find((e: any) => e.email === "hakon.berge@example.org");
if (!emp) throw new Error("Employee hakon.berge@example.org not found as assignable PM");
console.log("PM:", emp.id, emp.firstName, emp.lastName);

// Step 2: create project
const proj = await post("/project", {
  name: "Implementering Strandvik",
  startDate: "2026-03-22",
  customer: { id: cust.id },
  projectManager: { id: emp.id },
});

console.log("Project created:", proj.value.id, proj.value.name);
console.log("Customer on project:", proj.value.customer?.id, proj.value.customer?.name);
console.log("PM on project:", proj.value.projectManager?.id);
console.log("Done. 3 calls, 0 errors.");
