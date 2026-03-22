/**
 * Task 29 Round 5: supplierInvoice with invoiceDueDate + importDocument with project
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

async function experiment17_supplierInvoiceCorrectDueDate() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 17: POST /supplierInvoice with invoiceDueDate");
  console.log("=".repeat(70));

  const supp = await post("/supplier", {
    name: `SI5 ${RUN_ID}`,
    organizationNumber: "999999988",
    isSupplier: true,
  });
  const suppId = supp.data.value.id;
  track(`/supplier/${suppId}`);

  // Try with invoiceDueDate (the field name from existing SIs)
  console.log("\n  --- Try: invoiceDueDate ---");
  const si = await post("/supplierInvoice", {
    invoiceNumber: `SI5-${RUN_ID}`,
    invoiceDate: TODAY,
    invoiceDueDate: TODAY,
    supplier: { id: suppId },
    amountCurrency: 56200,
  });
  console.log(`  Result: ${si.ok} ${si.status}`);
  if (!si.ok) {
    console.log(`  Error: ${JSON.stringify(si.data).slice(0, 500)}`);
  } else {
    console.log(`  Created SI: ${JSON.stringify(si.data.value).slice(0, 500)}`);
    track(`/supplierInvoice/${si.data.value.id}`);

    // Read it back
    const read = await get(`/supplierInvoice/${si.data.value.id}?fields=*`);
    if (read.ok) {
      const v = read.data.value;
      console.log(`\n  Readback:`);
      console.log(`    invoiceNumber: ${v.invoiceNumber}`);
      console.log(`    invoiceDate: ${v.invoiceDate}`);
      console.log(`    invoiceDueDate: ${v.invoiceDueDate}`);
      console.log(`    amountCurrency: ${v.amountCurrency}`);
      console.log(`    supplier: ${JSON.stringify(v.supplier)}`);
      console.log(`    voucher: ${JSON.stringify(v.voucher)}`);
      console.log(`    orderLines: ${JSON.stringify(v.orderLines)}`);
    }
  }

  // If direct POST doesn't work, try importDocument for SI
  if (!si.ok) {
    console.log("\n  --- Try: importDocument ---");
    // importDocument might need multipart form data or EHF XML
    // Let's try the JSON path that T11 uses
    const imp = await post("/supplierInvoice/importDocument", {
      invoiceNumber: `IMP5-${RUN_ID}`,
      invoiceDate: TODAY,
      invoiceDueDate: TODAY,
      supplier: { id: suppId },
      amountCurrency: 56200,
    });
    console.log(`  importDocument: ${imp.ok} ${imp.status}`);
    if (!imp.ok) {
      console.log(`  Error: ${JSON.stringify(imp.data).slice(0, 500)}`);
    } else {
      console.log(`  Created: ${JSON.stringify(imp.data).slice(0, 500)}`);
    }
  }
}

async function experiment18_fullLifecycleWithRates() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 18: Full lifecycle with hourly rates");
  console.log("=".repeat(70));

  const dept = await get("/department?isInactive=false&count=1&fields=*");
  const deptId = dept.data.values[0].id;
  const pmAssignable = await get("/employee?assignableProjectManagers=true&count=1&fields=*");
  const pmId = pmAssignable.data.values[0].id;
  const vat = await get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=id,name,percentage`);
  const vatId = vat.data.values[0].id;
  const acctRes = await get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber");
  const a1920 = acctRes.data.values.find((a: any) => a.number === 1920);
  const acc6590 = acctRes.data.values.find((a: any) => a.number === 6590);
  const acc2400 = acctRes.data.values.find((a: any) => a.number === 2400);
  if (a1920 && !a1920.bankAccountNumber) {
    await put(`/ledger/account/${a1920.id}`, { ...a1920, bankAccountNumber: "12345678903" });
  }
  const vtRes = await get("/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name");
  const vtId = vtRes.data.values[0].id;

  // Prompt-like values
  const BUDGET = 418100;
  const PM_HOURS = 75;
  const CON_HOURS = 47;
  const TOTAL_HOURS = PM_HOURS + CON_HOURS; // 122
  const HOURLY_RATE = Math.round(BUDGET / TOTAL_HOURS); // 3427
  const SUPP_COST = 56200;

  console.log(`  Budget: ${BUDGET}, Hours: ${TOTAL_HOURS}, Rate: ${HOURLY_RATE}/hr`);

  // Step 1: Customer
  const cust = await post("/customer", {
    name: `FullLC ${RUN_ID}`,
    organizationNumber: "999999987",
    isCustomer: true,
  });
  const custId = cust.data.value.id;
  track(`/customer/${custId}`);

  // Step 2: Employees + project
  const emps = await post("/employee/list", [
    { firstName: "PMFull", lastName: `Test ${RUN_ID}`, email: `pmfull.${RUN_ID}@example.org`, dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
    { firstName: "ConFull", lastName: `Test ${RUN_ID}`, email: `confull.${RUN_ID}@example.org`, dateOfBirth: "1990-01-01", userType: "NO_ACCESS", department: { id: deptId } },
  ]);
  const e1 = emps.data.values[0].id;
  const e2 = emps.data.values[1].id;
  track(`/employee/${e1}`);
  track(`/employee/${e2}`);

  const proj = await post("/project", {
    name: `FullLifecycle ${RUN_ID}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: BUDGET,
  });
  const projId = proj.data.value.id;
  track(`/project/${projId}`);

  // Step 3: Activity (CHARGEABLE) + participants
  const act = await post("/project/projectActivity", {
    project: { id: projId },
    startDate: TODAY,
    budgetHours: TOTAL_HOURS,
    budgetFeeCurrency: BUDGET,
    activity: {
      name: "Prosjektarbeid",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: true,
    },
  });
  const actId = act.data.value.activity.id;

  await post("/project/participant/list", [
    { project: { id: projId }, employee: { id: e1 }, adminAccess: true },
    { project: { id: projId }, employee: { id: e2 }, adminAccess: false },
  ]);

  // Step 4: Set up hourly rates
  console.log("\n  --- Setting up hourly rates ---");
  const rh = await get(`/project/hourlyRates?projectId=${projId}&count=10&fields=*`);
  const holder = rh.data.values?.[0];
  if (holder) {
    // Switch to project-specific rates
    await put(`/project/hourlyRates/${holder.id}`, {
      project: { id: projId },
      startDate: TODAY,
      hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
    });

    // Set rates for both employees
    const [r1, r2] = await Promise.all([
      post("/project/hourlyRates/projectSpecificRates", {
        projectHourlyRate: { id: holder.id },
        employee: { id: e1 },
        activity: { id: actId },
        hourlyRate: HOURLY_RATE,
      }),
      post("/project/hourlyRates/projectSpecificRates", {
        projectHourlyRate: { id: holder.id },
        employee: { id: e2 },
        activity: { id: actId },
        hourlyRate: HOURLY_RATE,
      }),
    ]);
    console.log(`  Rate PM: ${r1.ok} ${r1.status} hourlyRate=${r1.data.value?.hourlyRate}`);
    console.log(`  Rate Con: ${r2.ok} ${r2.status} hourlyRate=${r2.data.value?.hourlyRate}`);
  }

  // Step 5: Register hours (split across dates)
  function splitHours(total: number, start: string): { date: string; hours: number }[] {
    const [y, m, d] = start.split("-").map(Number);
    const out: { date: string; hours: number }[] = [];
    let rem = total, off = 0;
    while (rem > 0) {
      const hrs = Math.min(rem, 7.5);
      out.push({ date: new Date(Date.UTC(y, m - 1, d + off)).toISOString().slice(0, 10), hours: hrs });
      rem -= hrs; off++;
    }
    return out;
  }

  const ts1 = splitHours(PM_HOURS, TODAY).map(e => ({
    employee: { id: e1 }, project: { id: projId }, activity: { id: actId }, date: e.date, hours: e.hours,
  }));
  const ts2 = splitHours(CON_HOURS, TODAY).map(e => ({
    employee: { id: e2 }, project: { id: projId }, activity: { id: actId }, date: e.date, hours: e.hours,
  }));
  const tsRes = await post("/timesheet/entry/list", [...ts1, ...ts2]);
  console.log(`\n  Timesheet: ${tsRes.ok} entries=${tsRes.data.values?.length}`);
  // Check first and last entry for rates
  const entries = tsRes.data.values || [];
  if (entries.length > 0) {
    console.log(`    First: hours=${entries[0].hours} chargeable=${entries[0].chargeable} hourlyRate=${entries[0].hourlyRate}`);
    console.log(`    Last:  hours=${entries[entries.length-1].hours} chargeable=${entries[entries.length-1].chargeable} hourlyRate=${entries[entries.length-1].hourlyRate}`);
  }

  // Step 6: Supplier + orderline + voucher
  const supp = await post("/supplier", {
    name: `SuppLC ${RUN_ID}`,
    organizationNumber: "999999986",
    isSupplier: true,
  });
  const suppId = supp.data.value.id;
  track(`/supplier/${suppId}`);

  await post("/project/orderline", {
    project: { id: projId },
    description: "Leverandørkostnad",
    date: TODAY,
    count: 1,
    unitCostCurrency: SUPP_COST,
    isChargeable: false,
  });

  await post("/ledger/voucher", {
    date: TODAY,
    description: `Leverandørkostnad`,
    voucherType: { id: vtId },
    postings: [
      { row: 1, account: { id: acc6590!.id }, amount: SUPP_COST, amountCurrency: SUPP_COST, amountGross: SUPP_COST, amountGrossCurrency: SUPP_COST, project: { id: projId }, date: TODAY },
      { row: 2, account: { id: acc2400!.id }, amount: -SUPP_COST, amountCurrency: -SUPP_COST, amountGross: -SUPP_COST, amountGrossCurrency: -SUPP_COST, supplier: { id: suppId }, date: TODAY },
    ],
  });

  // Step 7: Invoice — POST /order → PUT /order/:invoice
  const ord = await post("/order", {
    customer: { id: custId },
    project: { id: projId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Prosjektarbeid",
      count: 1,
      unitPriceExcludingVatCurrency: BUDGET,
      vatType: { id: vatId },
    }],
  });
  const ordId = ord.data.value.id;
  const inv = await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  const invId = inv.data.value.id;

  // === FULL READBACK ===
  console.log("\n  === FULL READBACK (with hourly rates) ===");

  const [projFull, invFull, tsFull] = await Promise.all([
    get(`/project/${projId}?fields=*`),
    get(`/invoice/${invId}?fields=*,projectInvoiceDetails(*),orders(*,orderLines(*))`),
    get(`/timesheet/entry?projectId=${projId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=employee(id,firstName,lastName),hours,chargeable,hourlyRate&count=500`),
  ]);

  const pf = projFull.data.value;
  console.log(`  Project: isFixedPrice=${pf.isFixedPrice} fixedprice=${pf.fixedprice}`);
  console.log(`    invoiceReserveTotalAmountCurrency=${pf.invoiceReserveTotalAmountCurrency}`);
  console.log(`    isReadyForInvoicing=${pf.isReadyForInvoicing}`);

  const invV = invFull.data.value;
  console.log(`  Invoice: amount=${invV.amountExcludingVatCurrency} isApproved=${invV.isApproved}`);
  console.log(`    projectInvoiceDetails: feeAmount=${invV.projectInvoiceDetails?.[0]?.feeAmount}`);
  console.log(`    includeHours=${invV.projectInvoiceDetails?.[0]?.includeHours}`);

  // Count total hours and check rates
  let totalHours = 0;
  let allChargeable = true;
  let allHaveRate = true;
  for (const ts of tsFull.data.values || []) {
    totalHours += ts.hours;
    if (!ts.chargeable) allChargeable = false;
    if (ts.hourlyRate === 0) allHaveRate = false;
  }
  console.log(`  Timesheet: totalHours=${totalHours} entries=${tsFull.data.values?.length} allChargeable=${allChargeable} allHaveRate=${allHaveRate}`);

  // Read project hourly rates
  const ratesFull = await get(`/project/hourlyRates?projectId=${projId}&count=10&fields=*,projectSpecificRates(*,employee(*),activity(*))`);
  console.log(`  Rates: model=${ratesFull.data.values?.[0]?.hourlyRateModel} specificRates=${ratesFull.data.values?.[0]?.projectSpecificRates?.length}`);
  for (const r of ratesFull.data.values?.[0]?.projectSpecificRates || []) {
    console.log(`    - employee=${r.employee?.firstName} ${r.employee?.lastName} activity=${r.activity?.name} rate=${r.hourlyRate}`);
  }

  // Read project overallStatus if available
  const status = await get(`/project/overallStatus?projectId=${projId}&count=1&fields=*`);
  if (status.ok && status.data.values?.length > 0) {
    console.log(`  OverallStatus: ${JSON.stringify(status.data.values[0]).slice(0, 400)}`);
  }
}

async function main() {
  console.log(`\nSandbox T29 Experiments Round 5 — Run ID: ${RUN_ID}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  try {
    await experiment17_supplierInvoiceCorrectDueDate();
    await experiment18_fullLifecycleWithRates();
  } finally {
    await cleanupAll();
  }
}

main().catch(e => { console.error("FATAL:", e.message, e.stack); process.exit(1); });
