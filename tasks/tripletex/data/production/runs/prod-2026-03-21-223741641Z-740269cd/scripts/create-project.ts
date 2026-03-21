const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "kHVZL6pR3EQnCopiGN-V1uocrsKkUwOTMsmm9WBhf2k";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // 1. Resolve customer by organizationNumber
  const custRes = await fetch(`${BASE}/customer?organizationNumber=877501906&count=10&fields=*`, { headers: H });
  const custData = await custRes.json();
  console.log("Customer:", JSON.stringify(custData, null, 2));
  const customers = custData.values?.filter((c: any) => c.organizationNumber === "877501906");
  if (!customers?.length) throw new Error("Customer not found");
  const customerId = customers[0].id;
  console.log("Customer ID:", customerId);

  // 2. Resolve project manager by email (assignable)
  const empRes = await fetch(`${BASE}/employee?email=liv.haugen@example.org&assignableProjectManagers=true&count=10&fields=*`, { headers: H });
  const empData = await empRes.json();
  console.log("Employee:", JSON.stringify(empData, null, 2));
  const employees = empData.values?.filter((e: any) => e.email === "liv.haugen@example.org");
  if (!employees?.length) throw new Error("Project manager not found");
  const managerId = employees[0].id;
  console.log("Manager ID:", managerId);

  // 3. POST /project
  const projectRes = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Migrasjon Elvdal",
      startDate: "2026-03-21",
      customer: { id: customerId },
      projectManager: { id: managerId },
    }),
  });
  const projectData = await projectRes.json();
  console.log("Project:", JSON.stringify(projectData, null, 2));
  if (projectRes.status >= 400) throw new Error(`POST /project failed: ${projectRes.status}`);
  console.log("Done. Project ID:", projectData.value?.id);
}

main().catch((e) => { console.error(e); process.exit(1); });
