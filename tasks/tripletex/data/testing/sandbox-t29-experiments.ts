/**
 * Task 29 sandbox experiments — testing hypotheses about what we're doing wrong.
 *
 * Hypotheses:
 * H1: A STANDARD-type employee can be set as projectManager (we only tested NO_ACCESS)
 * H2: Project should NOT use isFixedPrice — budget should be set differently
 * H3: importDocument creates a proper supplierInvoice entity the scorer can verify
 * H4: There's a project invoicing API that generates invoices from registered hours
 * H5: Hourly rates / project category affect scoring
 *
 * Uses unique suffix to avoid collisions. Cleans up where possible.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const RUN_ID = Date.now().toString(36); // unique per run
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  return { ok: r.ok, status: r.status, data: b };
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  return { ok: r.ok, status: r.status, data: b };
}

async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  return { ok: r.ok, status: r.status, data: b };
}

async function del(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "DELETE", headers: h });
  if (r.status === 204) return { ok: true, status: 204, data: null };
  const b = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data: b };
}

// Track created entities for cleanup
const cleanup: { type: string; id: number; path: string }[] = [];

function track(type: string, id: number, path: string) {
  cleanup.push({ type, id, path });
}

async function cleanupAll() {
  console.log("\n=== CLEANUP ===");
  // Reverse order to handle dependencies
  for (const item of cleanup.reverse()) {
    const r = await del(item.path);
    console.log(`  DELETE ${item.type} ${item.id}: ${r.status} ${r.ok ? "OK" : "FAILED"}`);
  }
}

async function experiment1_employeeAsPM() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 1: Can a STANDARD employee be set as projectManager?");
  console.log("=".repeat(70));

  // Get department
  const dept = await get("/department?isInactive=false&count=1&fields=*");
  if (!dept.ok || !dept.data.values?.length) {
    console.log(`  Department lookup failed: ${dept.status} ${JSON.stringify(dept.data).slice(0, 300)}`);
    return;
  }
  const deptId = dept.data.values[0].id;
  console.log(`  Department: ${deptId}`);

  // Get customer (reuse existing or create)
  const custRes = await post("/customer", {
    name: `SandboxTest1 ${RUN_ID}`,
    organizationNumber: "999999999",
    isCustomer: true,
  });
  const custId = custRes.data.value.id;
  track("customer", custId, `/customer/${custId}`);
  console.log(`  Customer created: ${custId}`);

  // Test A: Create employee with userType NO_ACCESS, try as PM
  console.log("\n  --- Test A: NO_ACCESS employee as PM ---");
  const empA = await post("/employee", {
    firstName: "TestPM",
    lastName: `NoAccess ${RUN_ID}`,
    email: `testpm.noaccess.${RUN_ID}@example.org`,
    dateOfBirth: "1988-01-01",
    userType: "NO_ACCESS",
    department: { id: deptId },
  });
  console.log(`  Employee NO_ACCESS created: ${empA.ok} ${empA.status}`);
  if (empA.ok) {
    const empAId = empA.data.value.id;
    track("employee", empAId, `/employee/${empAId}`);

    // Try to create project with this employee as PM
    const projA = await post("/project", {
      name: `TestPM-NoAccess ${RUN_ID}`,
      startDate: new Date().toISOString().slice(0, 10),
      customer: { id: custId },
      projectManager: { id: empAId },
    });
    console.log(`  Project with NO_ACCESS PM: ${projA.ok} ${projA.status}`);
    if (!projA.ok) {
      console.log(`  Error: ${JSON.stringify(projA.data).slice(0, 300)}`);
    } else {
      const projAId = projA.data.value.id;
      track("project", projAId, `/project/${projAId}`);
      console.log(`  Project PM field: ${JSON.stringify(projA.data.value.projectManager)}`);
    }
  }

  // Test B: Create employee with userType STANDARD
  console.log("\n  --- Test B: STANDARD employee as PM ---");
  const empB = await post("/employee", {
    firstName: "TestPM",
    lastName: `Standard ${RUN_ID}`,
    email: `testpm.standard.${RUN_ID}@example.org`,
    dateOfBirth: "1988-01-01",
    userType: "STANDARD",
    department: { id: deptId },
  });
  console.log(`  Employee STANDARD created: ${empB.ok} ${empB.status}`);
  if (empB.ok) {
    const empBId = empB.data.value.id;
    track("employee", empBId, `/employee/${empBId}`);

    const projB = await post("/project", {
      name: `TestPM-Standard ${RUN_ID}`,
      startDate: new Date().toISOString().slice(0, 10),
      customer: { id: custId },
      projectManager: { id: empBId },
    });
    console.log(`  Project with STANDARD PM: ${projB.ok} ${projB.status}`);
    if (!projB.ok) {
      console.log(`  Error: ${JSON.stringify(projB.data).slice(0, 300)}`);
    } else {
      const projBId = projB.data.value.id;
      track("project", projBId, `/project/${projBId}`);
      console.log(`  Project PM field: ${JSON.stringify(projB.data.value.projectManager)}`);
    }
  } else {
    console.log(`  Error creating STANDARD employee: ${JSON.stringify(empB.data).slice(0, 300)}`);
  }

  // Test C: Try other userTypes
  for (const ut of ["READ_ONLY", "ADMINISTRATOR"]) {
    console.log(`\n  --- Test C: ${ut} employee as PM ---`);
    const emp = await post("/employee", {
      firstName: "TestPM",
      lastName: `${ut} ${RUN_ID}`,
      email: `testpm.${ut.toLowerCase()}.${RUN_ID}@example.org`,
      dateOfBirth: "1988-01-01",
      userType: ut,
      department: { id: deptId },
    });
    console.log(`  Employee ${ut} created: ${emp.ok} ${emp.status}`);
    if (emp.ok) {
      const empId = emp.data.value.id;
      track("employee", empId, `/employee/${empId}`);

      const proj = await post("/project", {
        name: `TestPM-${ut} ${RUN_ID}`,
        startDate: new Date().toISOString().slice(0, 10),
        customer: { id: custId },
        projectManager: { id: empId },
      });
      console.log(`  Project with ${ut} PM: ${proj.ok} ${proj.status}`);
      if (!proj.ok) {
        console.log(`  Error: ${JSON.stringify(proj.data).slice(0, 300)}`);
      } else {
        const projId = proj.data.value.id;
        track("project", projId, `/project/${projId}`);
        console.log(`  Project PM field: ${JSON.stringify(proj.data.value.projectManager)}`);
      }
    } else {
      console.log(`  Error: ${JSON.stringify(emp.data).slice(0, 300)}`);
    }
  }

  // Test D: Check assignable PM list for newly created employees
  console.log("\n  --- Test D: Check assignable PM list ---");
  const pmList = await get("/employee?assignableProjectManagers=true&count=100&fields=id,firstName,lastName,email,userType");
  console.log(`  Assignable PMs: ${pmList.data.values?.length} total`);
  for (const pm of pmList.data.values || []) {
    console.log(`    - ${pm.firstName} ${pm.lastName} (${pm.email}) userType=${pm.userType} id=${pm.id}`);
  }
}

async function experiment2_budgetWithoutFixedPrice() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 2: Project budget WITHOUT isFixedPrice");
  console.log("=".repeat(70));

  const dept = await get("/department?isInactive=false&count=1&fields=*");
  const deptId = dept.data.values[0].id;
  const pm = await get("/employee?assignableProjectManagers=true&count=1&fields=*");
  const pmId = pm.data.values[0].id;
  const TODAY = new Date().toISOString().slice(0, 10);

  const custRes = await post("/customer", {
    name: `BudgetTest ${RUN_ID}`,
    organizationNumber: "999999998",
    isCustomer: true,
  });
  const custId = custRes.data.value.id;
  track("customer", custId, `/customer/${custId}`);

  // Test A: Project WITHOUT isFixedPrice, with various budget fields
  console.log("\n  --- Test A: No isFixedPrice, explore budget fields ---");
  const projA = await post("/project", {
    name: `BudgetNoFP ${RUN_ID}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
    // NO isFixedPrice, NO fixedprice
  });
  console.log(`  Project (no FP): ${projA.ok} ${projA.status}`);
  if (projA.ok) {
    const projAId = projA.data.value.id;
    track("project", projAId, `/project/${projAId}`);

    // Read back all fields
    const readback = await get(`/project/${projAId}?fields=*`);
    const p = readback.data.value;
    console.log(`  Project fields: isFixedPrice=${p.isFixedPrice} fixedprice=${p.fixedprice} budget=${p.budget} totalBudget=${p.totalBudget}`);
    console.log(`  All budget-related keys: ${Object.keys(p).filter(k => k.toLowerCase().includes('budget') || k.toLowerCase().includes('price') || k.toLowerCase().includes('cost') || k.toLowerCase().includes('fixed')).join(', ')}`);

    // Try creating activity with budget on it
    const actA = await post("/project/projectActivity", {
      project: { id: projAId },
      startDate: TODAY,
      budgetHours: 93,
      budgetFeeCurrency: 418100,
      activity: {
        name: "Prosjektaktivitet",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    });
    console.log(`  Activity (budgetHours=93, budgetFee=418100): ${actA.ok} ${actA.status}`);
    if (actA.ok) {
      const actAId = actA.data.value.id;
      // Read back project to see if budget fields changed
      const readback2 = await get(`/project/${projAId}?fields=*`);
      const p2 = readback2.data.value;
      console.log(`  Project after activity: isFixedPrice=${p2.isFixedPrice} fixedprice=${p2.fixedprice}`);
    }
  }

  // Test B: Project WITH isFixedPrice=false explicitly
  console.log("\n  --- Test B: isFixedPrice=false explicitly ---");
  const projB = await post("/project", {
    name: `BudgetFPFalse ${RUN_ID}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
    isFixedPrice: false,
  });
  console.log(`  Project (FP=false): ${projB.ok} ${projB.status}`);
  if (projB.ok) {
    const projBId = projB.data.value.id;
    track("project", projBId, `/project/${projBId}`);
    const readback = await get(`/project/${projBId}?fields=*`);
    const p = readback.data.value;
    console.log(`  isFixedPrice=${p.isFixedPrice} fixedprice=${p.fixedprice}`);
  }

  // Test C: Explore what project fields exist related to budget/cost
  console.log("\n  --- Test C: All project fields (from first project) ---");
  if (projA.ok) {
    const readback = await get(`/project/${projA.data.value.id}?fields=*`);
    const allKeys = Object.keys(readback.data.value).sort();
    console.log(`  All project keys (${allKeys.length}): ${allKeys.join(', ')}`);
  }
}

async function experiment3_supplierInvoiceImportDocument() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 3: importDocument for supplier invoice");
  console.log("=".repeat(70));

  const TODAY = new Date().toISOString().slice(0, 10);

  // Create supplier
  const suppRes = await post("/supplier", {
    name: `SupplierTest ${RUN_ID}`,
    organizationNumber: "999999997",
    isSupplier: true,
  });
  console.log(`  Supplier created: ${suppRes.ok} ${suppRes.status}`);
  if (!suppRes.ok) {
    console.log(`  Error: ${JSON.stringify(suppRes.data).slice(0, 300)}`);
    return;
  }
  const suppId = suppRes.data.value.id;
  track("supplier", suppId, `/supplier/${suppId}`);

  // Test: POST /supplierInvoice directly
  console.log("\n  --- Test A: Direct POST /supplierInvoice ---");
  const siDirect = await post("/supplierInvoice", {
    invoiceNumber: `SI-${RUN_ID}`,
    invoiceDate: TODAY,
    supplier: { id: suppId },
    amountCurrency: 56200,
  });
  console.log(`  Direct POST /supplierInvoice: ${siDirect.ok} ${siDirect.status}`);
  if (!siDirect.ok) {
    console.log(`  Error: ${JSON.stringify(siDirect.data).slice(0, 300)}`);
  } else {
    console.log(`  Result: ${JSON.stringify(siDirect.data.value).slice(0, 300)}`);
  }

  // Test: importDocument
  console.log("\n  --- Test B: POST /supplierInvoice/importDocument ---");
  const importDoc = await post("/supplierInvoice/importDocument", {
    document: {
      invoiceNumber: `IMP-${RUN_ID}`,
      invoiceDate: TODAY,
      dueDate: TODAY,
      supplier: { id: suppId },
      amountCurrency: 56200,
    },
  });
  console.log(`  importDocument: ${importDoc.ok} ${importDoc.status}`);
  if (!importDoc.ok) {
    console.log(`  Error: ${JSON.stringify(importDoc.data).slice(0, 500)}`);
  } else {
    console.log(`  Result: ${JSON.stringify(importDoc.data).slice(0, 500)}`);
  }

  // Test: try with just flat fields (not nested document)
  console.log("\n  --- Test C: POST /supplierInvoice/importDocument flat ---");
  const importFlat = await post("/supplierInvoice/importDocument", {
    invoiceNumber: `IMP2-${RUN_ID}`,
    invoiceDate: TODAY,
    dueDate: TODAY,
    supplier: { id: suppId },
    amountCurrency: 56200,
  });
  console.log(`  importDocument flat: ${importFlat.ok} ${importFlat.status}`);
  if (!importFlat.ok) {
    console.log(`  Error: ${JSON.stringify(importFlat.data).slice(0, 500)}`);
  } else {
    console.log(`  Result: ${JSON.stringify(importFlat.data).slice(0, 500)}`);
  }
}

async function experiment4_projectInvoicingAPIs() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 4: Project invoicing APIs");
  console.log("=".repeat(70));

  // Check if there's a project invoicing endpoint
  const endpoints = [
    "/project/invoicing",
    "/project/projectInvoice",
    "/invoice/projectInvoice",
  ];

  for (const ep of endpoints) {
    console.log(`\n  --- GET ${ep} ---`);
    const r = await get(`${ep}?count=1&fields=*`);
    console.log(`  Status: ${r.status} ${r.ok ? "OK" : "FAILED"}`);
    if (r.ok) {
      console.log(`  Data: ${JSON.stringify(r.data).slice(0, 300)}`);
    }
  }

  // Check what projectCategory options exist
  console.log("\n  --- Project categories ---");
  const cats = await get("/project/category?count=100&fields=*");
  console.log(`  Status: ${cats.status}`);
  if (cats.ok) {
    for (const c of cats.data.values || []) {
      console.log(`    - ${c.name} (id=${c.id}) description=${c.description}`);
    }
  }

  // Check what project settings/modules are available
  console.log("\n  --- Company sales modules (project-related) ---");
  const modules = await get("/company/salesmodules?count=200&fields=*");
  console.log(`  Status: ${modules.status}`);
  if (modules.ok) {
    for (const m of modules.data.values || []) {
      if (m.name?.toLowerCase().includes('project') || m.name?.toLowerCase().includes('prosjekt')) {
        console.log(`    - ${m.name} (id=${m.id}) active=${m.isActive}`);
      }
    }
  }
}

async function experiment5_fullLifecycleAlt() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 5: Full lifecycle with alternative approach");
  console.log("=".repeat(70));

  const dept = await get("/department?isInactive=false&count=1&fields=*");
  const deptId = dept.data.values[0].id;
  const pm = await get("/employee?assignableProjectManagers=true&count=1&fields=*");
  const pmId = pm.data.values[0].id;
  const TODAY = new Date().toISOString().slice(0, 10);

  // Create customer
  const cust = await post("/customer", {
    name: `LifecycleAlt ${RUN_ID}`,
    organizationNumber: "999999996",
    isCustomer: true,
  });
  const custId = cust.data.value.id;
  track("customer", custId, `/customer/${custId}`);

  // Create employee (the "project manager" from prompt) with STANDARD access
  const empPM = await post("/employee", {
    firstName: "TestPM",
    lastName: `Alt ${RUN_ID}`,
    email: `testpm.alt.${RUN_ID}@example.org`,
    dateOfBirth: "1988-01-01",
    userType: "STANDARD",
    department: { id: deptId },
  });
  let actualPMId = pmId; // fallback to account owner
  if (empPM.ok) {
    const empPMId = empPM.data.value.id;
    track("employee", empPMId, `/employee/${empPMId}`);
    console.log(`  PM employee (STANDARD) created: ${empPMId}`);

    // Check if this employee shows up in assignable PMs
    const pmCheck = await get(`/employee?assignableProjectManagers=true&id=${empPMId}&count=1&fields=*`);
    console.log(`  PM assignable? ${pmCheck.data.values?.length > 0 ? "YES" : "NO"}`);
    if (pmCheck.data.values?.length > 0) {
      actualPMId = empPMId;
      console.log(`  Using created employee as PM!`);
    } else {
      console.log(`  Created employee NOT assignable — using account owner as PM`);
    }
  } else {
    console.log(`  STANDARD employee failed: ${JSON.stringify(empPM.data).slice(0, 200)}`);
  }

  // Create project WITHOUT isFixedPrice
  const proj = await post("/project", {
    name: `AltLifecycle ${RUN_ID}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: actualPMId },
    // NO isFixedPrice, NO fixedprice
  });
  console.log(`  Project (no FP): ${proj.ok} ${proj.status}`);
  if (!proj.ok) {
    console.log(`  Error: ${JSON.stringify(proj.data).slice(0, 300)}`);
    return;
  }
  const projId = proj.data.value.id;
  track("project", projId, `/project/${projId}`);

  // Read back project to see default fields
  const projRead = await get(`/project/${projId}?fields=*`);
  const p = projRead.data.value;
  console.log(`  Project defaults: isFixedPrice=${p.isFixedPrice} fixedprice=${p.fixedprice} projectCategory=${JSON.stringify(p.projectCategory)}`);

  // Create activity with budget
  const act = await post("/project/projectActivity", {
    project: { id: projId },
    startDate: TODAY,
    budgetHours: 93,
    budgetFeeCurrency: 418100,
    activity: {
      name: "Prosjektaktivitet",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  });
  console.log(`  Activity: ${act.ok} ${act.status}`);
  if (!act.ok) {
    console.log(`  Error: ${JSON.stringify(act.data).slice(0, 300)}`);
    return;
  }
  const actId = act.data.value.activity.id;

  // Read project again to see if budget propagated
  const projRead2 = await get(`/project/${projId}?fields=*`);
  const p2 = projRead2.data.value;
  console.log(`  Project after activity: isFixedPrice=${p2.isFixedPrice} fixedprice=${p2.fixedprice}`);

  console.log("\n  Experiment 5 done — project created without isFixedPrice");
}

async function experiment6_projectFields() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 6: Exhaustive project field exploration");
  console.log("=".repeat(70));

  // Look at OpenAPI for project fields
  const TODAY = new Date().toISOString().slice(0, 10);
  const pm = await get("/employee?assignableProjectManagers=true&count=1&fields=*");
  const pmId = pm.data.values[0].id;

  // Create a minimal project and read ALL fields
  const cust = await post("/customer", {
    name: `FieldTest ${RUN_ID}`,
    organizationNumber: "999999995",
    isCustomer: true,
  });
  const custId = cust.data.value.id;
  track("customer", custId, `/customer/${custId}`);

  // Test what fields POST /project accepts related to budget
  console.log("\n  --- Test: POST /project with budget-related fields ---");
  const proj = await post("/project", {
    name: `FieldExplore ${RUN_ID}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 418100,
  });
  if (proj.ok) {
    const projId = proj.data.value.id;
    track("project", projId, `/project/${projId}`);

    // Full readback
    const full = await get(`/project/${projId}?fields=*`);
    const v = full.data.value;
    console.log("  All project field values:");
    for (const [k, val] of Object.entries(v).sort()) {
      if (val !== null && val !== undefined && val !== "" && val !== false && val !== 0) {
        console.log(`    ${k}: ${JSON.stringify(val).slice(0, 150)}`);
      }
    }
  }
}

async function experiment7_invoiceMethods() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 7: Different invoice creation methods");
  console.log("=".repeat(70));

  // Check what happens with POST /invoice with projectInvoiceDetails
  // vs POST /order → PUT /order/:invoice
  // vs direct project invoicing

  const TODAY = new Date().toISOString().slice(0, 10);
  const pm = await get("/employee?assignableProjectManagers=true&count=1&fields=*");
  const pmId = pm.data.values[0].id;
  const dept = await get("/department?isInactive=false&count=1&fields=*");
  const deptId = dept.data.values[0].id;

  // Get vatType and bank account
  const [vatRes, bankRes] = await Promise.all([
    get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=id,name,percentage`),
    get("/ledger/account?isBankAccount=true&fields=id,number,name,bankAccountNumber"),
  ]);
  const vatId = vatRes.data.values[0].id;
  const bankAcct = bankRes.data.values[0];

  // Fix bank account if needed
  if (bankAcct && !bankAcct.bankAccountNumber) {
    await put(`/ledger/account/${bankAcct.id}`, { ...bankAcct, bankAccountNumber: "12345678903" });
    console.log("  Fixed bank account number");
  }

  // Create a full project setup for invoice testing
  const cust = await post("/customer", {
    name: `InvoiceTest ${RUN_ID}`,
    organizationNumber: "999999994",
    isCustomer: true,
  });
  const custId = cust.data.value.id;
  track("customer", custId, `/customer/${custId}`);

  // Create employee
  const emp = await post("/employee", {
    firstName: "InvTest",
    lastName: `Worker ${RUN_ID}`,
    email: `invtest.${RUN_ID}@example.org`,
    dateOfBirth: "1990-01-01",
    userType: "NO_ACCESS",
    department: { id: deptId },
  });
  const empId = emp.data.value.id;
  track("employee", empId, `/employee/${empId}`);

  // Create project (without fixedPrice this time)
  const proj = await post("/project", {
    name: `InvProject ${RUN_ID}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
  });
  const projId = proj.data.value.id;
  track("project", projId, `/project/${projId}`);

  // Create activity
  const act = await post("/project/projectActivity", {
    project: { id: projId },
    startDate: TODAY,
    budgetHours: 10,
    budgetFeeCurrency: 15000,
    activity: {
      name: "TestAktivitet",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  });
  const actId = act.data.value.activity.id;

  // Add participant
  await post("/project/participant", {
    project: { id: projId },
    employee: { id: empId },
    adminAccess: false,
  });

  // Register 5 hours
  await post("/timesheet/entry/list", [
    { employee: { id: empId }, project: { id: projId }, activity: { id: actId }, date: TODAY, hours: 5 },
  ]);

  // Test A: POST /invoice with project linkage
  console.log("\n  --- Test A: POST /invoice with hours-based line ---");
  const invA = await post("/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: custId },
    orders: [{
      customer: { id: custId },
      project: { id: projId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Project hours",
        count: 5,
        unitPriceExcludingVatCurrency: 1500,
        vatType: { id: vatId },
      }],
    }],
  });
  console.log(`  POST /invoice (hours-based): ${invA.ok} ${invA.status}`);
  if (invA.ok) {
    const invAId = invA.data.value.id;
    // Read back to check projectInvoiceDetails
    const readback = await get(`/invoice/${invAId}?fields=*,orders(*,orderLines(*)),projectInvoiceDetails(*)`);
    const inv = readback.data.value;
    console.log(`  Invoice amount: ${inv.amountExcludingVatCurrency}`);
    console.log(`  projectInvoiceDetails: ${JSON.stringify(inv.projectInvoiceDetails)}`);
    console.log(`  isApproved: ${inv.isApproved}`);
  } else {
    console.log(`  Error: ${JSON.stringify(invA.data).slice(0, 300)}`);
  }

  // Test B: Check if there's a project-based invoice generation endpoint
  console.log("\n  --- Test B: Explore project invoice generation ---");
  // Try POST /project/{id}/:createInvoice or similar
  const invoiceEndpoints = [
    { method: "POST", path: `/project/${projId}/:createInvoice` },
    { method: "POST", path: `/project/${projId}/:invoice` },
    { method: "PUT", path: `/project/${projId}/:createInvoice` },
    { method: "GET", path: `/project/${projId}/invoice` },
  ];

  for (const ep of invoiceEndpoints) {
    const r = ep.method === "GET"
      ? await get(ep.path)
      : await post(ep.path, {});
    console.log(`  ${ep.method} ${ep.path}: ${r.status}`);
    if (r.ok) {
      console.log(`    Response: ${JSON.stringify(r.data).slice(0, 200)}`);
    }
  }
}

async function main() {
  console.log(`\nSandbox T29 Experiments — Run ID: ${RUN_ID}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  try {
    await experiment1_employeeAsPM();
    await experiment2_budgetWithoutFixedPrice();
    await experiment3_supplierInvoiceImportDocument();
    await experiment4_projectInvoicingAPIs();
    await experiment6_projectFields();
    await experiment7_invoiceMethods();
  } finally {
    await cleanupAll();
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
