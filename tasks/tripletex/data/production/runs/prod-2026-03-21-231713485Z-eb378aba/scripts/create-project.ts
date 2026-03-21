const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "lJjXHNHoAV3Gs9oG9Y-JJsRx_WsqIy6KWOkHT-6TIdo";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// 1. Resolve customer by organizationNumber
const custRes = await fetch(`${BASE}/customer?organizationNumber=883693329&count=10&fields=*`, { headers: H });
const custData = await custRes.json();
console.log("=== CUSTOMER ===", JSON.stringify(custData, null, 2));
const customers = custData.values?.filter((c: any) => c.organizationNumber === "883693329");
if (!customers?.length) { console.error("Customer not found"); process.exit(1); }
const customerId = customers[0].id;
console.log("Customer ID:", customerId);

// 2. Resolve project manager by email (assignable)
const empRes = await fetch(`${BASE}/employee?email=steinar.berge@example.org&assignableProjectManagers=true&count=10&fields=*`, { headers: H });
const empData = await empRes.json();
console.log("=== EMPLOYEE ===", JSON.stringify(empData, null, 2));
const employees = empData.values?.filter((e: any) => e.email === "steinar.berge@example.org");
if (!employees?.length) { console.error("Employee not found"); process.exit(1); }
const managerId = employees[0].id;
console.log("Manager ID:", managerId);

// 3. POST /project
const projectPayload = {
  name: "Analyse Sjøbris",
  startDate: "2026-03-22",
  customer: { id: customerId },
  projectManager: { id: managerId },
};
const projRes = await fetch(`${BASE}/project`, { method: "POST", headers: H, body: JSON.stringify(projectPayload) });
const projData = await projRes.json();
console.log("=== PROJECT ===", JSON.stringify(projData, null, 2));
