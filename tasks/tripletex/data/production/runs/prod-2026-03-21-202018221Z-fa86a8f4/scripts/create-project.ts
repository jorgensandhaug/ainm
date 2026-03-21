const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "2T0tuIEfTY-8aGAIQ_LV6DPSEX8DiGiMvJr6pSn-W-I";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Step 1: Resolve customer by organizationNumber
const custRes = await fetch(
  `${BASE}/customer?organizationNumber=869753017&count=10&fields=*`,
  { headers: H }
);
const custData = await custRes.json();
console.log("GET /customer status:", custRes.status);
const customers = (custData.values ?? []).filter(
  (c: any) => String(c.organizationNumber) === "869753017"
);
if (customers.length === 0) {
  console.error("No customer found with organizationNumber 869753017");
  process.exit(1);
}
const customerId = customers[0].id;
console.log("Customer ID:", customerId, "Name:", customers[0].name);

// Step 2: Resolve project manager by email (assignable only)
const empRes = await fetch(
  `${BASE}/employee?email=ines.dubois@example.org&assignableProjectManagers=true&count=10&fields=*`,
  { headers: H }
);
const empData = await empRes.json();
console.log("GET /employee status:", empRes.status);
const managers = (empData.values ?? []).filter(
  (e: any) => e.email === "ines.dubois@example.org"
);
if (managers.length === 0) {
  console.error("No assignable project manager found with email ines.dubois@example.org");
  process.exit(1);
}
const managerId = managers[0].id;
console.log("Manager ID:", managerId, "Name:", managers[0].firstName, managers[0].lastName);

// Step 3: POST /project
const projectPayload = {
  name: "Implémentation Colline",
  startDate: "2026-03-21",
  customer: { id: customerId },
  projectManager: { id: managerId },
};
console.log("POST /project payload:", JSON.stringify(projectPayload));
const projRes = await fetch(`${BASE}/project`, {
  method: "POST",
  headers: H,
  body: JSON.stringify(projectPayload),
});
const projData = await projRes.json();
console.log("POST /project status:", projRes.status);
console.log("POST /project response:", JSON.stringify(projData, null, 2));

if (projRes.status === 201) {
  const v = projData.value;
  console.log("\n=== VERIFICATION FROM WRITE RESPONSE ===");
  console.log("Project ID:", v.id);
  console.log("Project Name:", v.name);
  console.log("Start Date:", v.startDate);
  console.log("Customer ID:", v.customer?.id);
  console.log("Project Manager ID:", v.projectManager?.id);
  console.log("=== DONE ===");
} else {
  console.error("Project creation failed");
  process.exit(1);
}
