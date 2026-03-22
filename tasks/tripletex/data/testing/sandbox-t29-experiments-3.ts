/**
 * Task 29 sandbox experiments — Round 3
 *
 * Focus: hourly rates (fix field names), invoice includeHours mode,
 * project fields that might matter, and supplierInvoice via correct path.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const RUN_ID = Date.now().toString(36);
const h = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = new Date().toISOString().slice(0, 10);

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  return { ok: r.ok, status: r.status, data: await r.json() };
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  return { ok: r.ok, status: r.status, data: await r.json() };
}
async function put(path: string, body?: any) {
  const opts: any = { method: "PUT", headers: h };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  return { ok: r.ok, status: r.status, data: await r.json() };
}
async function del(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "DELETE", headers: h });
  return { ok: r.ok || r.status === 204, status: r.status };
}

const cleanup: string[] = [];
function track(path: string) { cleanup.push(path); }

async function cleanupAll() {
  console.log("\n=== CLEANUP ===");
  for (const path of cleanup.reverse()) {
    const r = await del(path);
    console.log(`  DELETE ${path}: ${r.status}`);
  }
}

async function setupProject() {
  const dept = await get("/department?isInactive=false&count=1&fields=*");
  const deptId = dept.data.values[0].id;
  const pm = await get("/employee?assignableProjectManagers=true&count=1&fields=*");
  const pmId = pm.data.values[0].id;
  const vat = await get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=id,name,percentage`);
  const vatId = vat.data.values[0].id;
  const acctRes = await get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber");
  const a1920 = acctRes.data.values.find((a: any) => a.number === 1920);
  if (a1920 && !a1920.bankAccountNumber) {
    await put(`/ledger/account/${a1920.id}`, { ...a1920, bankAccountNumber: "12345678903" });
  }
  const vtRes = await get("/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name");
  const vtId = vtRes.data.values[0].id;

  const cust = await post("/customer", {
    name: `Lifecycle3 ${RUN_ID}`,
    organizationNumber: "999999992",
    isCustomer: true,
  });
  const custId = cust.data.value.id;
  track(`/customer/${custId}`);

  const emps = await post("/employee/list", [
    { firstName: "PM3", lastName: `Leader ${RUN_ID}`, email: `pm3.${RUN_ID}@example.org`, dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
    { firstName: "Con3", lastName: `Worker ${RUN_ID}`, email: `con3.${RUN_ID}@example.org`, dateOfBirth: "1990-01-01", userType: "NO_ACCESS", department: { id: deptId } },
  ]);
  const e1 = emps.data.values[0].id;
  const e2 = emps.data.values[1].id;
  track(`/employee/${e1}`);
  track(`/employee/${e2}`);

  return { deptId, pmId, custId, e1, e2, vatId, vtId, acctRes };
}

async function experiment10_hourlyRatesCorrectFields() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 10: Hourly rates with correct field names");
  console.log("=".repeat(70));

  const { pmId, custId, e1, e2, vatId } = await setupProject();

  // Create project
  const proj = await post("/project", {
    name: `HourlyRate ${RUN_ID}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 418100,
  });
  const projId = proj.data.value.id;
  track(`/project/${projId}`);

  // Create CHARGEABLE activity
  const act = await post("/project/projectActivity", {
    project: { id: projId },
    startDate: TODAY,
    budgetHours: 122,
    budgetFeeCurrency: 418100,
    activity: {
      name: "Prosjektarbeid",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: true,
    },
  });
  const actId = act.data.value.activity.id;
  console.log(`  Activity (chargeable): ${actId}`);

  // Read project hourly rates
  const rates = await get(`/project/hourlyRates?projectId=${projId}&count=100&fields=*,projectSpecificRates(*)`);
  console.log(`  Rate holders: ${JSON.stringify(rates.data.values?.map((r: any) => ({ id: r.id, model: r.hourlyRateModel })))}`);

  if (rates.data.values?.length > 0) {
    const holder = rates.data.values[0];

    // Switch to project-specific rates
    const switchRes = await put(`/project/hourlyRates/${holder.id}`, {
      project: { id: projId },
      startDate: TODAY,
      hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
    });
    console.log(`  Switch rate model: ${switchRes.ok} ${switchRes.status}`);

    // Try different field names for creating specific rates
    const fieldVariations = [
      { label: "projectHourlyRate ref", body: { projectHourlyRate: { id: holder.id }, employee: { id: e1 }, activity: { id: actId }, hourlyRate: 3427, hourlyRateCurrency: 3427 } },
      { label: "no parent ref", body: { employee: { id: e1 }, activity: { id: actId }, hourlyRate: 3427, hourlyRateCurrency: 3427 } },
      { label: "project ref", body: { project: { id: projId }, employee: { id: e1 }, activity: { id: actId }, hourlyRate: 3427 } },
    ];

    for (const v of fieldVariations) {
      console.log(`\n  --- Rate variation: ${v.label} ---`);
      const r = await post("/project/hourlyRates/projectSpecificRates", v.body);
      console.log(`  Result: ${r.ok} ${r.status}`);
      if (!r.ok) {
        console.log(`  Error: ${JSON.stringify(r.data).slice(0, 300)}`);
      } else {
        console.log(`  Created: ${JSON.stringify(r.data.value).slice(0, 300)}`);
        break; // Stop on first success
      }
    }
  }

  // Add participants
  await post("/project/participant/list", [
    { project: { id: projId }, employee: { id: e1 }, adminAccess: true },
    { project: { id: projId }, employee: { id: e2 }, adminAccess: false },
  ]);

  // Register hours
  const tsRes = await post("/timesheet/entry/list", [
    { employee: { id: e1 }, project: { id: projId }, activity: { id: actId }, date: TODAY, hours: 7.5 },
    { employee: { id: e2 }, project: { id: projId }, activity: { id: actId }, date: TODAY, hours: 7.5 },
  ]);
  console.log(`\n  Timesheet: ${tsRes.ok}`);
  for (const entry of tsRes.data.values || []) {
    console.log(`    Entry: hours=${entry.hours} chargeable=${entry.chargeable} hourlyRate=${entry.hourlyRate}`);
  }
}

async function experiment11_invoiceWithProjectDetails() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 11: Invoice with projectInvoiceDetails control");
  console.log("=".repeat(70));

  const { pmId, custId, e1, e2, vatId } = await setupProject();

  const proj = await post("/project", {
    name: `InvDetail ${RUN_ID}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 100000,
  });
  const projId = proj.data.value.id;
  track(`/project/${projId}`);

  const act = await post("/project/projectActivity", {
    project: { id: projId },
    startDate: TODAY,
    budgetHours: 20,
    budgetFeeCurrency: 100000,
    activity: {
      name: "Arbeid",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: true,
    },
  });
  const actId = act.data.value.activity.id;

  // Participants
  await post("/project/participant/list", [
    { project: { id: projId }, employee: { id: e1 }, adminAccess: true },
    { project: { id: projId }, employee: { id: e2 }, adminAccess: false },
  ]);

  // Hours
  await post("/timesheet/entry/list", [
    { employee: { id: e1 }, project: { id: projId }, activity: { id: actId }, date: TODAY, hours: 5 },
    { employee: { id: e2 }, project: { id: projId }, activity: { id: actId }, date: TODAY, hours: 5 },
  ]);

  // Test A: POST /invoice with projectInvoiceDetails that include hours
  console.log("\n  --- Test A: Invoice with includeHours=true ---");
  const invA = await post("/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: custId },
    projectInvoiceDetails: [{
      project: { id: projId },
      includeHours: true,
      includeOrderLinesAndReinvoicing: false,
      includeOnAccountBalance: false,
    }],
  });
  console.log(`  Invoice (includeHours): ${invA.ok} ${invA.status}`);
  if (invA.ok) {
    const invId = invA.data.value.id;
    const read = await get(`/invoice/${invId}?fields=*,projectInvoiceDetails(*),orders(*,orderLines(*))`);
    const inv = read.data.value;
    console.log(`  amount: ${inv.amountExcludingVatCurrency}`);
    console.log(`  isApproved: ${inv.isApproved}`);
    console.log(`  projectInvoiceDetails: ${JSON.stringify(inv.projectInvoiceDetails).slice(0, 400)}`);
    console.log(`  orders: ${JSON.stringify(inv.orders).slice(0, 400)}`);
  } else {
    console.log(`  Error: ${JSON.stringify(invA.data).slice(0, 400)}`);
  }

  // Test B: POST /invoice with only project reference (let system decide)
  console.log("\n  --- Test B: Invoice with just project ref ---");
  const invB = await post("/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    customer: { id: custId },
    projectInvoiceDetails: [{
      project: { id: projId },
    }],
  });
  console.log(`  Invoice (project only): ${invB.ok} ${invB.status}`);
  if (invB.ok) {
    const invId = invB.data.value.id;
    const read = await get(`/invoice/${invId}?fields=*,projectInvoiceDetails(*),orders(*,orderLines(*))`);
    const inv = read.data.value;
    console.log(`  amount: ${inv.amountExcludingVatCurrency}`);
    console.log(`  isApproved: ${inv.isApproved}`);
    console.log(`  details: ${JSON.stringify(inv.projectInvoiceDetails).slice(0, 300)}`);
  } else {
    console.log(`  Error: ${JSON.stringify(invB.data).slice(0, 400)}`);
  }

  // Test C: POST /order with project + PUT /:invoice
  console.log("\n  --- Test C: Order → invoice with hours-based line ---");
  const ordC = await post("/order", {
    customer: { id: custId },
    project: { id: projId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Prosjektarbeid",
      count: 10,  // total hours
      unitPriceExcludingVatCurrency: 5000,  // rate per hour
      vatType: { id: vatId },
    }],
  });
  console.log(`  Order: ${ordC.ok} ${ordC.status}`);
  if (ordC.ok) {
    const ordId = ordC.data.value.id;
    const invC = await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
    console.log(`  Invoice: ${invC.ok} ${invC.status}`);
    if (invC.ok) {
      const invId = invC.data.value.id;
      const read = await get(`/invoice/${invId}?fields=*,projectInvoiceDetails(*),orders(*,orderLines(*))`);
      const inv = read.data.value;
      console.log(`  amount: ${inv.amountExcludingVatCurrency}`);
      console.log(`  isApproved: ${inv.isApproved}`);
    }
  }
}

async function experiment12_supplierInvoiceVariations() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 12: Supplier invoice via all possible paths");
  console.log("=".repeat(70));

  // Check what the supplierInvoice endpoint actually needs
  console.log("\n  --- GET /supplierInvoice (list all) ---");
  const all = await get("/supplierInvoice?count=5&fields=*&invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01");
  console.log(`  Status: ${all.status}`);
  if (all.ok) {
    console.log(`  Count: ${all.data.values?.length}`);
    for (const si of all.data.values?.slice(0, 2) || []) {
      console.log(`    SI ${si.id}: supplier=${si.supplier?.id} amount=${si.amountCurrency} status=${si.status}`);
    }
  } else {
    console.log(`  Error: ${JSON.stringify(all.data).slice(0, 300)}`);
  }

  // Create supplier
  const supp = await post("/supplier", {
    name: `SuppInv ${RUN_ID}`,
    organizationNumber: "999999991",
    isSupplier: true,
  });
  const suppId = supp.data.value.id;
  track(`/supplier/${suppId}`);

  // Try POST /supplierInvoice with more fields
  console.log("\n  --- POST /supplierInvoice (detailed) ---");
  const si1 = await post("/supplierInvoice", {
    invoiceNumber: `SI-${RUN_ID}`,
    invoiceDate: TODAY,
    dueDate: TODAY,
    supplier: { id: suppId },
    amountCurrency: 56200,
    currency: { id: 1 },
  });
  console.log(`  Result: ${si1.ok} ${si1.status}`);
  if (!si1.ok) console.log(`  Error: ${JSON.stringify(si1.data).slice(0, 500)}`);
  else console.log(`  SI: ${JSON.stringify(si1.data.value).slice(0, 500)}`);

  // Try with createOnAccount header
  console.log("\n  --- POST /supplierInvoice with different content-type ---");
  const si2 = await fetch(`${BASE}/supplierInvoice`, {
    method: "POST",
    headers: { ...h, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      invoiceNumber: `SI2-${RUN_ID}`,
      invoiceDate: TODAY,
      dueDate: TODAY,
      supplier: { id: suppId },
      amountCurrency: 56200,
    }),
  });
  console.log(`  Result: ${si2.status}`);
  const si2data = await si2.json().catch(() => null);
  if (si2data) console.log(`  Data: ${JSON.stringify(si2data).slice(0, 300)}`);

  // Try GET /supplierInvoice to understand schema
  console.log("\n  --- GET /supplierInvoice schema via empty search ---");
  const schema = await get("/supplierInvoice?supplierId=-1&count=1&fields=*");
  console.log(`  Status: ${schema.status}`);
  if (schema.ok) console.log(`  Data: ${JSON.stringify(schema.data).slice(0, 300)}`);
}

async function experiment13_openApiCheck() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 13: Check OpenAPI spec for relevant endpoints");
  console.log("=".repeat(70));

  // Look for project-related POST endpoints we haven't tried
  const pathsToCheck = [
    "/project/import",
    "/project/orderline/list",
    "/project/cost",
    "/project/expense",
    "/project/supplierCost",
    "/project/budget",
    "/invoice/details",
  ];

  for (const p of pathsToCheck) {
    const getR = await get(`${p}?count=1`);
    console.log(`  GET ${p}: ${getR.status}`);
    if (getR.ok && getR.data.values?.length > 0) {
      console.log(`    Data: ${JSON.stringify(getR.data.values[0]).slice(0, 200)}`);
    }
  }

  // Check if POST /invoice supports direct project invoice details
  console.log("\n  --- Check invoice details endpoint ---");
  const detailsRes = await get("/invoice/details?count=5&fields=*");
  console.log(`  GET /invoice/details: ${detailsRes.status}`);
  if (detailsRes.ok && detailsRes.data.values?.length > 0) {
    console.log(`  Sample: ${JSON.stringify(detailsRes.data.values[0]).slice(0, 500)}`);
  }
}

async function main() {
  console.log(`\nSandbox T29 Experiments Round 3 — Run ID: ${RUN_ID}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  try {
    await experiment10_hourlyRatesCorrectFields();
    await experiment11_invoiceWithProjectDetails();
    await experiment12_supplierInvoiceVariations();
    await experiment13_openApiCheck();
  } finally {
    await cleanupAll();
  }
}

main().catch(e => { console.error("FATAL:", e.message, e.stack); process.exit(1); });
