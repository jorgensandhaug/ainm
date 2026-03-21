const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "ZD1QKJNOyDqoqFUnnLFxaUKrExdlHHfJqfXbciZJ2ho";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // 1. Resolve customer by organizationNumber
  const custRes = await fetch(`${BASE}/customer?organizationNumber=887727872&count=10&fields=*`, { headers: H });
  const custData = await custRes.json();
  console.log("Customer lookup:", custRes.status, JSON.stringify(custData));
  const customer = custData.values?.find((c: any) => c.organizationNumber === "887727872");
  if (!customer) throw new Error("Customer not found");
  console.log("Customer ID:", customer.id, "Name:", customer.name);

  // 2. Resolve project manager by email (assignable)
  const empRes = await fetch(`${BASE}/employee?email=liv.stlsvik@example.org&assignableProjectManagers=true&count=10&fields=*`, { headers: H });
  const empData = await empRes.json();
  console.log("Employee lookup:", empRes.status, JSON.stringify(empData));
  const manager = empData.values?.find((e: any) => e.email === "liv.stlsvik@example.org");
  if (!manager) throw new Error("Project manager not found");
  console.log("Manager ID:", manager.id, "Name:", manager.firstName, manager.lastName);

  // 3. Create project
  const projRes = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Migrasjon Vestfjord",
      startDate: "2026-03-21",
      customer: { id: customer.id },
      projectManager: { id: manager.id },
    }),
  });
  const projData = await projRes.json();
  console.log("Create project:", projRes.status, JSON.stringify(projData));
  if (projRes.status !== 201) throw new Error("Project creation failed");
  console.log("Project ID:", projData.value?.id, "Name:", projData.value?.name);
}

main().catch((e) => { console.error(e); process.exit(1); });
