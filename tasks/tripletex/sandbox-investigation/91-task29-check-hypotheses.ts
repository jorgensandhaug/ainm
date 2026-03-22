// Task 29 Hypothesis Testing
// Using entities from test 90: project 402048443, emp 18700198 (Samuel), emp 18700199 (Sarah)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) { console.error("GET", path, r.status, JSON.stringify(b).slice(0, 500)); }
  return { ok: r.ok, status: r.status, data: b };
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.error("POST", path, r.status, JSON.stringify(b).slice(0, 500)); }
  return { ok: r.ok, status: r.status, data: b };
}
async function putReq(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.error("PUT", path, r.status, JSON.stringify(b).slice(0, 500)); }
  return { ok: r.ok, status: r.status, data: b };
}

async function main() {
  // ========================================================
  // HYPOTHESIS 1: Can we change projectManager via PUT /project?
  // ========================================================
  console.log("=== HYPOTHESIS 1: Change projectManager via PUT ===");

  // First get the project
  const proj = await get("/project/402048443?fields=*");
  console.log("Current PM:", proj.data.value.projectManager?.id);

  // Try to PUT with employee as PM
  const putRes = await putReq("/project/402048443", {
    ...proj.data.value,
    projectManager: { id: 18700198 }, // Samuel Brown
  });
  console.log("PUT result:", putRes.ok, putRes.status);
  if (putRes.ok) {
    console.log("New PM:", putRes.data.value.projectManager?.id);
  }

  // ========================================================
  // HYPOTHESIS 2: Can we create employee with userType that allows PM?
  // ========================================================
  console.log("\n=== HYPOTHESIS 2: Employee with STANDARD userType as PM ===");

  const empRes = await post("/employee", {
    firstName: "TestPM",
    lastName: "Employee",
    email: "testpm-h2@example.org",
    dateOfBirth: "1985-01-01",
    userType: "STANDARD",
    department: { id: 837842 },
  });
  console.log("STANDARD employee:", empRes.ok, empRes.status);
  if (empRes.ok) {
    const testPmId = empRes.data.value.id;
    console.log("Employee ID:", testPmId);

    // Try to create project with this employee as PM
    const testProjRes = await post("/project", {
      name: "PM Test H2",
      startDate: TODAY,
      customer: { id: 108468362 },
      projectManager: { id: testPmId },
    });
    console.log("Project with STANDARD PM:", testProjRes.ok, testProjRes.status);
    if (!testProjRes.ok) {
      console.log("Error:", JSON.stringify(testProjRes.data.validationMessages).slice(0, 300));
    }
  }

  // ========================================================
  // HYPOTHESIS 3: Employee with ADMINISTRATOR userType
  // ========================================================
  console.log("\n=== HYPOTHESIS 3: Employee with ADMINISTRATOR userType ===");
  const empAdmin = await post("/employee", {
    firstName: "AdminPM",
    lastName: "Test",
    email: "adminpm-h3@example.org",
    dateOfBirth: "1985-01-01",
    userType: "ADMINISTRATOR",
    department: { id: 837842 },
  });
  console.log("ADMINISTRATOR employee:", empAdmin.ok, empAdmin.status);
  if (empAdmin.ok) {
    const adminId = empAdmin.data.value.id;

    // Check if this employee shows in assignable PMs
    const assignable = await get(`/employee?assignableProjectManagers=true&fields=id,firstName,lastName`);
    console.log("Assignable PMs:", assignable.data.values?.map((e: any) => `${e.id} ${e.firstName} ${e.lastName}`));

    const testProjRes = await post("/project", {
      name: "PM Test H3",
      startDate: TODAY,
      customer: { id: 108468362 },
      projectManager: { id: adminId },
    });
    console.log("Project with ADMIN PM:", testProjRes.ok, testProjRes.status);
  }

  // ========================================================
  // HYPOTHESIS 4: Can employee employment status affect timesheet?
  // ========================================================
  console.log("\n=== HYPOTHESIS 4: Employment status impact ===");

  // Check if employees have employments
  const emp1Info = await get("/employee/18700198?fields=*");
  console.log("Samuel employment count:", emp1Info.data.value.employments?.length);

  // Check if creating employment changes anything
  // First check if there's a division
  const divRes = await get("/division?count=1&fields=*");
  console.log("Divisions:", divRes.data.values?.length, divRes.data.values?.map((d: any) => `${d.id} ${d.name}`));

  // ========================================================
  // HYPOTHESIS 5: project/orderline with supplier field
  // ========================================================
  console.log("\n=== HYPOTHESIS 5: Orderline with supplier ===");

  const olWithSupp = await post("/project/orderline", {
    project: { id: 402048443 },
    description: "Test supplier orderline",
    date: TODAY,
    count: 1,
    unitCostCurrency: 1000,
    isChargeable: false,
    supplier: { id: 108468365 },
  });
  console.log("Orderline with supplier:", olWithSupp.ok, olWithSupp.status);
  if (olWithSupp.ok) {
    console.log("  supplier:", olWithSupp.data.value.supplier);
    console.log("  vendor:", olWithSupp.data.value.vendor);
  }

  // ========================================================
  // HYPOTHESIS 6: Check what amountIncludingVatCurrency is on invoice
  // ========================================================
  console.log("\n=== HYPOTHESIS 6: Invoice details ===");
  const invFull = await get("/invoice/2147654402?fields=*");
  const inv = invFull.data.value;
  console.log("amountExcludingVatCurrency:", inv.amountExcludingVatCurrency);
  console.log("amountIncludingVatCurrency:", inv.amountIncludingVatCurrency);
  console.log("amount:", inv.amount);
  console.log("amountCurrency:", inv.amountCurrency);
  console.log("amountOutstanding:", inv.amountOutstanding);
  console.log("amountOutstandingTotal:", inv.amountOutstandingTotal);
  console.log("sumRemits:", inv.sumRemits);
  console.log("invoiceNumber:", inv.invoiceNumber);
  console.log("invoiceDate:", inv.invoiceDate);
  console.log("invoiceDueDate:", inv.invoiceDueDate);
  console.log("ehfSendStatus:", inv.ehfSendStatus);
  console.log("isSent:", inv.isSent);

  // ========================================================
  // HYPOTHESIS 7: What does the scorer see? Check project fields
  // ========================================================
  console.log("\n=== HYPOTHESIS 7: Full project field dump ===");
  const fullProj = await get("/project/402048443?fields=*,projectActivities(*),participants(*)");
  const fp = fullProj.data.value;
  // Print all scalar fields
  for (const [k, v] of Object.entries(fp)) {
    if (typeof v !== 'object' || v === null) {
      console.log(`  ${k}: ${v}`);
    }
  }
  console.log("  projectCategory:", JSON.stringify(fp.projectCategory));
  console.log("  mainProject:", JSON.stringify(fp.mainProject));
  console.log("  department:", JSON.stringify(fp.department));
  console.log("  projectManager:", JSON.stringify(fp.projectManager));
  console.log("  contact:", JSON.stringify(fp.contact));
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
