/**
 * Task 29 sandbox experiments — Round 2
 *
 * Round 1 findings:
 * - NO_ACCESS and STANDARD employees can't be PM (only account owner can)
 * - No separate "budget" field on project — fixedprice IS the budget field
 * - importDocument/supplierInvoice: 405/500 in sandbox
 * - No project invoice generation API exists
 *
 * Round 2 goals:
 * H6: Can we grant PM access to an employee? (company settings, access grants)
 * H7: Do project hourly rates matter for hours check?
 * H8: Does POST /order → PUT /order/:invoice vs POST /invoice matter?
 * H9: What does the full lifecycle readback look like? (compare our state to expected)
 * H10: Do we need to create the invoice differently (multiple lines, different amounts)?
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = `Basic ${Buffer.from(`0:${TOKEN}`).toString("base64")}`;
const RUN_ID = Date.now().toString(36);
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
async function put(path: string, body?: any) {
  const opts: any = { method: "PUT", headers: h };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const b = await r.json();
  return { ok: r.ok, status: r.status, data: b };
}
async function del(path: string) {
  const r = await fetch(`${BASE}${path}`, { method: "DELETE", headers: h });
  if (r.status === 204) return { ok: true, status: 204, data: null };
  const b = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data: b };
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

async function experiment6_grantPMAccess() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 6: Can we grant PM access to an employee?");
  console.log("=".repeat(70));

  const dept = await get("/department?isInactive=false&count=1&fields=*");
  const deptId = dept.data.values[0].id;

  // Create a STANDARD employee
  const emp = await post("/employee", {
    firstName: "GrantPM",
    lastName: `Test ${RUN_ID}`,
    email: `grantpm.${RUN_ID}@example.org`,
    dateOfBirth: "1988-01-01",
    userType: "STANDARD",
    department: { id: deptId },
  });
  if (!emp.ok) {
    console.log(`  Employee creation failed: ${JSON.stringify(emp.data).slice(0, 300)}`);
    return;
  }
  const empId = emp.data.value.id;
  track(`/employee/${empId}`);
  console.log(`  Employee created: ${empId}`);

  // Read full employee to see all fields
  const empFull = await get(`/employee/${empId}?fields=*`);
  const allKeys = Object.keys(empFull.data.value).sort();
  console.log(`  Employee keys: ${allKeys.join(', ')}`);
  const accessKeys = allKeys.filter(k =>
    k.toLowerCase().includes('access') ||
    k.toLowerCase().includes('permission') ||
    k.toLowerCase().includes('right') ||
    k.toLowerCase().includes('role') ||
    k.toLowerCase().includes('manager') ||
    k.toLowerCase().includes('admin') ||
    k.toLowerCase().includes('allow')
  );
  console.log(`  Access-related keys: ${accessKeys.join(', ')}`);
  for (const k of accessKeys) {
    console.log(`    ${k}: ${JSON.stringify(empFull.data.value[k])}`);
  }

  // Check if there's an employee access endpoint
  console.log("\n  --- Explore employee access endpoints ---");
  const accessEndpoints = [
    `/employee/${empId}/access`,
    `/employee/${empId}/permissions`,
    `/employee/${empId}/roles`,
    `/employee/access`,
    `/employee/accessType`,
    `/employee/projectManagerAccess`,
  ];
  for (const ep of accessEndpoints) {
    const r = await get(`${ep}?fields=*`);
    console.log(`  GET ${ep}: ${r.status} ${r.ok ? JSON.stringify(r.data).slice(0, 200) : ""}`);
  }

  // Try PUT to update employee with access fields
  console.log("\n  --- Try updating employee with access fields ---");
  // Try setting allowInformationRegistration which was in the keys
  const updateAttempts = [
    { allowInformationRegistration: true },
    { isContactPerson: true },
  ];
  for (const update of updateAttempts) {
    const r = await put(`/employee/${empId}`, { ...empFull.data.value, ...update });
    console.log(`  PUT with ${JSON.stringify(update)}: ${r.ok} ${r.status}`);
    if (!r.ok) console.log(`    Error: ${JSON.stringify(r.data).slice(0, 200)}`);
  }

  // Check company modules for project manager related settings
  console.log("\n  --- Check sales modules ---");
  const modules = await get("/company/salesmodules?count=200&fields=*");
  if (modules.ok) {
    const projModules = modules.data.values.filter((m: any) =>
      m.name?.toLowerCase().includes('project') ||
      m.name?.toLowerCase().includes('prosjekt') ||
      m.name?.toLowerCase().includes('manager') ||
      m.name?.toLowerCase().includes('leder')
    );
    console.log(`  Project-related modules (${projModules.length}):`);
    for (const m of projModules) {
      console.log(`    - ${m.name} (id=${m.id}) active=${m.isActive}`);
    }

    // List ALL modules to see what's available
    console.log(`\n  All modules (${modules.data.values.length}):`);
    for (const m of modules.data.values) {
      console.log(`    - ${m.name} active=${m.isActive}`);
    }
  }

  // Try: POST to /company/salesmodules to activate a project module
  // (This was identified as a hypothesis in the memory)
  console.log("\n  --- Try activating project modules ---");
  const modulesToTry = ["PROJECTMANAGER", "PROJECT_MANAGER", "PROSJEKTLEDER"];
  for (const name of modulesToTry) {
    const r = await post("/company/salesmodules", { name });
    console.log(`  POST salesmodules ${name}: ${r.ok} ${r.status}`);
    if (!r.ok) console.log(`    Error: ${JSON.stringify(r.data).slice(0, 200)}`);
  }
}

async function experiment7_hourlyRatesAndFullLifecycle() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 7: Full lifecycle with hourly rates + proper readback");
  console.log("=".repeat(70));

  const TODAY = new Date().toISOString().slice(0, 10);
  const dept = await get("/department?isInactive=false&count=1&fields=*");
  const deptId = dept.data.values[0].id;
  const pm = await get("/employee?assignableProjectManagers=true&count=1&fields=*");
  const pmId = pm.data.values[0].id;
  const vat = await get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=id,name,percentage`);
  const vatId = vat.data.values[0].id;
  const acct = await get("/ledger/account?number=1920&fields=id,number,bankAccountNumber");
  const bankAcct = acct.data.values[0];
  if (bankAcct && !bankAcct.bankAccountNumber) {
    await put(`/ledger/account/${bankAcct.id}`, { ...bankAcct, bankAccountNumber: "12345678903" });
  }

  // Create customer
  const cust = await post("/customer", {
    name: `Lifecycle7 ${RUN_ID}`,
    organizationNumber: "999999993",
    isCustomer: true,
  });
  const custId = cust.data.value.id;
  track(`/customer/${custId}`);

  // Create 2 employees
  const emps = await post("/employee/list", [
    { firstName: "PMTest", lastName: `A ${RUN_ID}`, email: `pm7.${RUN_ID}@example.org`, dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
    { firstName: "ConTest", lastName: `B ${RUN_ID}`, email: `con7.${RUN_ID}@example.org`, dateOfBirth: "1990-01-01", userType: "NO_ACCESS", department: { id: deptId } },
  ]);
  const e1 = emps.data.values[0].id;
  const e2 = emps.data.values[1].id;
  track(`/employee/${e1}`);
  track(`/employee/${e2}`);

  // Create project — isFixedPrice=true, fixedprice=418100
  const proj = await post("/project", {
    name: `Lifecycle7 ${RUN_ID}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 418100,
  });
  const projId = proj.data.value.id;
  track(`/project/${projId}`);

  // Create activity WITH chargeable=true this time, and set up hourly rates
  console.log("\n  --- Creating CHARGEABLE activity + hourly rates ---");
  const act = await post("/project/projectActivity", {
    project: { id: projId },
    startDate: TODAY,
    budgetHours: 122,
    budgetFeeCurrency: 418100,
    activity: {
      name: "Prosjektarbeid",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: true,  // TRY CHARGEABLE
    },
  });
  console.log(`  Activity (chargeable): ${act.ok} ${act.status}`);
  if (!act.ok) {
    console.log(`  Error: ${JSON.stringify(act.data).slice(0, 300)}`);
    // Fallback to non-chargeable
    const actFallback = await post("/project/projectActivity", {
      project: { id: projId },
      startDate: TODAY,
      budgetHours: 122,
      budgetFeeCurrency: 418100,
      activity: {
        name: "Prosjektarbeid",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    });
    if (!actFallback.ok) {
      console.log(`  Fallback also failed: ${JSON.stringify(actFallback.data).slice(0, 300)}`);
      return;
    }
  }
  const actId = act.ok ? act.data.value.activity.id : undefined;
  if (!actId) return;

  // Check project hourly rates
  console.log("\n  --- Project hourly rates ---");
  const rates = await get(`/project/hourlyRates?projectId=${projId}&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`);
  console.log(`  Hourly rates: ${rates.ok} ${rates.status}`);
  if (rates.ok) {
    console.log(`  Rate holders: ${rates.data.values?.length}`);
    for (const r of rates.data.values || []) {
      console.log(`    Holder ${r.id}: model=${r.hourlyRateModel} rates=${r.projectSpecificRates?.length}`);
    }

    // Try setting hourly rate model
    if (rates.data.values?.length > 0) {
      const holder = rates.data.values[0];
      console.log("\n  --- Setting project-specific hourly rate model ---");
      const rateUpdate = await put(`/project/hourlyRates/${holder.id}`, {
        ...holder,
        project: { id: projId },
        startDate: TODAY,
        hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
      });
      console.log(`  Rate model update: ${rateUpdate.ok} ${rateUpdate.status}`);
      if (!rateUpdate.ok) console.log(`  Error: ${JSON.stringify(rateUpdate.data).slice(0, 300)}`);

      // Try creating specific rates for each employee
      console.log("\n  --- Creating employee-specific rates ---");
      const rate1 = await post("/project/hourlyRates/projectSpecificRates", {
        hourlyRateModel: { id: holder.id },
        employee: { id: e1 },
        activity: { id: actId },
        hourlyRate: 3427,  // budget / total hours ≈ 418100 / 122
        hourlyRateCurrency: 3427,
      });
      console.log(`  Rate for PM: ${rate1.ok} ${rate1.status}`);
      if (!rate1.ok) console.log(`    Error: ${JSON.stringify(rate1.data).slice(0, 300)}`);

      const rate2 = await post("/project/hourlyRates/projectSpecificRates", {
        hourlyRateModel: { id: holder.id },
        employee: { id: e2 },
        activity: { id: actId },
        hourlyRate: 3427,
        hourlyRateCurrency: 3427,
      });
      console.log(`  Rate for consultant: ${rate2.ok} ${rate2.status}`);
      if (!rate2.ok) console.log(`    Error: ${JSON.stringify(rate2.data).slice(0, 300)}`);
    }
  }

  // Participants
  await post("/project/participant/list", [
    { project: { id: projId }, employee: { id: e1 }, adminAccess: true },
    { project: { id: projId }, employee: { id: e2 }, adminAccess: false },
  ]);

  // Register hours
  const ts1 = [{ employee: { id: e1 }, project: { id: projId }, activity: { id: actId }, date: TODAY, hours: 7.5 }];
  const ts2 = [{ employee: { id: e2 }, project: { id: projId }, activity: { id: actId }, date: TODAY, hours: 7.5 }];
  const tsRes = await post("/timesheet/entry/list", [...ts1, ...ts2]);
  console.log(`\n  Timesheet: ${tsRes.ok} ${tsRes.status}`);
  if (tsRes.ok) {
    for (const entry of tsRes.data.values || []) {
      console.log(`    Entry: hours=${entry.hours} chargeable=${entry.chargeable} hourlyRate=${entry.hourlyRate} employee=${entry.employee?.id}`);
    }
  }

  // Create invoice via POST /order → PUT /order/:invoice (the other method)
  console.log("\n  --- Invoice via POST /order → PUT /order/:invoice ---");
  const ord = await post("/order", {
    customer: { id: custId },
    project: { id: projId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Prosjektarbeid",
      count: 1,
      unitPriceExcludingVatCurrency: 418100,
      vatType: { id: vatId },
    }],
  });
  console.log(`  Order: ${ord.ok} ${ord.status}`);
  if (ord.ok) {
    const ordId = ord.data.value.id;
    const inv = await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
    console.log(`  Invoice via order: ${inv.ok} ${inv.status}`);
    if (inv.ok) {
      const invId = inv.data.value.id;
      const invRead = await get(`/invoice/${invId}?fields=*,orders(*,orderLines(*)),projectInvoiceDetails(*)`);
      const i = invRead.data.value;
      console.log(`  Invoice: amount=${i.amountExcludingVatCurrency} isApproved=${i.isApproved}`);
      console.log(`  projectInvoiceDetails: ${JSON.stringify(i.projectInvoiceDetails).slice(0, 300)}`);
    } else {
      console.log(`  Error: ${JSON.stringify(inv.data).slice(0, 300)}`);
    }
  }

  // FULL READBACK — see everything the scorer might check
  console.log("\n  === FULL READBACK ===");
  const projFull = await get(`/project/${projId}?fields=*`);
  const pf = projFull.data.value;
  console.log(`  Project: name=${pf.name} isFixedPrice=${pf.isFixedPrice} fixedprice=${pf.fixedprice}`);
  console.log(`    isInternal=${pf.isInternal} isClosed=${pf.isClosed} isOffer=${pf.isOffer}`);
  console.log(`    invoiceReserveTotalAmountCurrency=${pf.invoiceReserveTotalAmountCurrency}`);
  console.log(`    projectManager=${JSON.stringify(pf.projectManager)}`);
  console.log(`    projectCategory=${JSON.stringify(pf.projectCategory)}`);
  console.log(`    numberOfProjectParticipants=${pf.numberOfProjectParticipants}`);
  console.log(`    isReadyForInvoicing=${pf.isReadyForInvoicing}`);

  // Read activities
  const actFull = await get(`/project/projectActivity?projectId=${projId}&count=100&fields=*`);
  console.log(`\n  Activities: ${actFull.data.values?.length}`);
  for (const a of actFull.data.values || []) {
    console.log(`    - name=${a.activity?.name} budgetHours=${a.budgetHours} budgetFeeCurrency=${a.budgetFeeCurrency} isChargeable=${a.activity?.isChargeable}`);
  }

  // Read participants
  const parts = await get(`/project/participant?projectId=${projId}&count=100&fields=*,employee(id,firstName,lastName,email)`);
  console.log(`\n  Participants: ${parts.data.values?.length}`);
  for (const p of parts.data.values || []) {
    console.log(`    - ${p.employee?.firstName} ${p.employee?.lastName} adminAccess=${p.adminAccess}`);
  }

  // Read orderlines
  const ols = await get(`/project/orderline?projectId=${projId}&count=100&fields=*`);
  console.log(`\n  Orderlines: ${ols.data.values?.length}`);

  // Read timesheet
  const tsFull = await get(`/timesheet/entry?projectId=${projId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=*,employee(id,firstName,lastName)&count=100`);
  console.log(`\n  Timesheet entries: ${tsFull.data.values?.length}`);
  for (const ts of tsFull.data.values || []) {
    console.log(`    - ${ts.employee?.firstName} ${ts.employee?.lastName}: hours=${ts.hours} chargeable=${ts.chargeable} hourlyRate=${ts.hourlyRate}`);
  }
}

async function experiment8_overallStatus() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 8: Project overallStatus / summary endpoints");
  console.log("=".repeat(70));

  // Check if there are project summary/status endpoints
  const endpoints = [
    "/project/overallStatus",
    "/project/status",
    "/project/summary",
    "/project/result",
    "/project/report",
  ];

  for (const ep of endpoints) {
    const r = await get(`${ep}?count=1&fields=*`);
    console.log(`  GET ${ep}: ${r.status}`);
    if (r.ok) console.log(`    ${JSON.stringify(r.data).slice(0, 300)}`);
  }
}

async function experiment9_supplierInvoiceViaVoucher() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 9: Deeper supplier cost investigation");
  console.log("=".repeat(70));

  // Check what supplierInvoice endpoints exist
  const endpoints = [
    "/supplierInvoice?count=1&fields=*",
    "/supplierInvoice/importDocument",
    "/supplier?count=5&fields=*",
  ];

  for (const ep of endpoints) {
    const r = await get(ep);
    console.log(`  GET ${ep}: ${r.status}`);
    if (r.ok && r.data.values) {
      console.log(`    Count: ${r.data.values.length}`);
      if (r.data.values.length > 0) {
        console.log(`    First: ${JSON.stringify(r.data.values[0]).slice(0, 300)}`);
      }
    }
  }

  // Check existing vouchers
  const vouchers = await get("/ledger/voucher?count=5&fields=*,postings(*)&dateFrom=2025-01-01");
  console.log(`\n  Existing vouchers: ${vouchers.data.values?.length}`);
  for (const v of vouchers.data.values?.slice(0, 3) || []) {
    console.log(`    - id=${v.id} type=${v.voucherType?.id} desc=${v.description} postings=${v.postings?.length}`);
  }
}

async function main() {
  console.log(`\nSandbox T29 Experiments Round 2 — Run ID: ${RUN_ID}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  try {
    await experiment6_grantPMAccess();
    await experiment7_hourlyRatesAndFullLifecycle();
    await experiment8_overallStatus();
    await experiment9_supplierInvoiceViaVoucher();
  } finally {
    await cleanupAll();
  }
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
