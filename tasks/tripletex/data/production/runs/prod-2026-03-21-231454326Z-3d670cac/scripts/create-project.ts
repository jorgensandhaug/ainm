const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "9upuuZZrsD_zv0FV_2ea2keqCjZPsVGxDOAfpu4TSew";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(BASE + path, { headers: H });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(BASE + path, { method: "POST", headers: H, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

// Step 1+2 parallel: resolve customer + project manager
const [custData, empData] = await Promise.all([
  get("/customer?organizationNumber=962211348&count=10&fields=*"),
  get("/employee?email=geir.aasen@example.org&assignableProjectManagers=true&count=10&fields=*"),
]);

const cust = custData.values?.find((c: any) => String(c.organizationNumber) === "962211348");
if (!cust) throw new Error("Customer not found");
console.log("Customer:", cust.id, cust.name, cust.organizationNumber);

const emp = empData.values?.find((e: any) => e.email === "geir.aasen@example.org");
if (!emp) throw new Error("Employee not found");
console.log("ProjectManager:", emp.id, emp.firstName, emp.lastName, emp.email);

// Step 3: create project
const proj = await post("/project", {
  name: "Migrasjon Elvdal",
  startDate: "2026-03-22",
  customer: { id: cust.id },
  projectManager: { id: emp.id },
});

console.log("Project created:", JSON.stringify(proj.value, null, 2));
