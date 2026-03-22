const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ZlRPAMGvAEXgDg2V3IbcPST6Y2A6qWTzdNDCNxD2EJc";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(BASE + path, { headers: H });
  const j = await r.json();
  if (!r.ok) { console.error("GET", path, r.status, JSON.stringify(j)); process.exit(1); }
  return j;
}

async function post(path: string, body: any) {
  const r = await fetch(BASE + path, { method: "POST", headers: H, body: JSON.stringify(body) });
  const j = await r.json();
  if (!r.ok) { console.error("POST", path, r.status, JSON.stringify(j)); process.exit(1); }
  return j;
}

async function main() {
  // 1. Resolve customer by org number
  const custResp = await get("/customer?organizationNumber=948050927&count=10&fields=*");
  const cust = custResp.values?.find((c: any) => c.organizationNumber === "948050927");
  if (!cust) { console.error("Customer not found"); process.exit(1); }
  console.log("Customer:", cust.id, cust.name, cust.organizationNumber);

  // 2. Resolve project manager by email (assignable)
  const empResp = await get("/employee?email=edward.brown@example.org&assignableProjectManagers=true&count=10&fields=*");
  const mgr = empResp.values?.find((e: any) => e.email === "edward.brown@example.org");
  if (!mgr) { console.error("Project manager not found"); process.exit(1); }
  console.log("Manager:", mgr.id, mgr.firstName, mgr.lastName, mgr.email);

  // 3. Create project
  const proj = await post("/project", {
    name: "Implementation Ridgepoint",
    startDate: "2026-03-22",
    customer: { id: cust.id },
    projectManager: { id: mgr.id },
  });
  console.log("Project created:", proj.value?.id, proj.value?.name);
  console.log("  customer:", proj.value?.customer?.id, proj.value?.customer?.name);
  console.log("  manager:", proj.value?.projectManager?.id, proj.value?.projectManager?.email);
}

main();
