const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "SXHgDZKjUVuy_rnRsVK3MDDZ7ldKCF91FwtgC1MhB80";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function main() {
  // 1. Resolve customer by organizationNumber
  const custRes = await fetch(
    `${BASE}/customer?organizationNumber=842138248&count=10&fields=*`,
    { headers: H }
  );
  const custData = await custRes.json();
  console.log("Customer response:", JSON.stringify(custData, null, 2));
  const customers = custData.values?.filter(
    (c: any) => c.organizationNumber === "842138248"
  );
  if (!customers || customers.length === 0) throw new Error("Customer not found");
  const customerId = customers[0].id;
  console.log("Customer ID:", customerId);

  // 2. Resolve project manager by email (assignable)
  const empRes = await fetch(
    `${BASE}/employee?email=jules.martin@example.org&assignableProjectManagers=true&count=10&fields=*`,
    { headers: H }
  );
  const empData = await empRes.json();
  console.log("Employee response:", JSON.stringify(empData, null, 2));
  const employees = empData.values?.filter(
    (e: any) => e.email === "jules.martin@example.org"
  );
  if (!employees || employees.length === 0) throw new Error("Employee not found");
  const managerId = employees[0].id;
  console.log("Manager ID:", managerId);

  // 3. Create project
  const projectRes = await fetch(`${BASE}/project`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: "Implémentation Montagne",
      startDate: "2026-03-21",
      customer: { id: customerId },
      projectManager: { id: managerId },
    }),
  });
  const projectData = await projectRes.json();
  console.log("Project response:", projectRes.status, JSON.stringify(projectData, null, 2));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
