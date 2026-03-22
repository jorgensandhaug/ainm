/**
 * Task 29 sandbox experiments — Round 4
 *
 * Key finding: existing supplierInvoices EXIST in sandbox (ids: 2147547151, 2147583219)
 * POST /supplierInvoice failed because 'dueDate' is not a valid field.
 * Round 4: read existing SI schema, then POST with correct fields.
 * Also: fix hourlyRates field names.
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

async function experiment14_readExistingSI() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 14: Read existing supplier invoices to learn schema");
  console.log("=".repeat(70));

  // Read a specific SI with all fields
  const si = await get("/supplierInvoice/2147547151?fields=*");
  console.log(`  SI 2147547151: ${si.ok} ${si.status}`);
  if (si.ok) {
    const v = si.data.value;
    console.log("  All fields:");
    for (const [k, val] of Object.entries(v).sort()) {
      if (val !== null && val !== undefined && val !== "" && val !== false && val !== 0) {
        console.log(`    ${k}: ${JSON.stringify(val).slice(0, 200)}`);
      }
    }
    // Also show null/zero fields that might be required
    console.log("\n  All keys:");
    console.log(`    ${Object.keys(v).sort().join(', ')}`);
  }

  // Read another one
  const si2 = await get("/supplierInvoice/2147583219?fields=*");
  console.log(`\n  SI 2147583219: ${si2.ok} ${si2.status}`);
  if (si2.ok) {
    const v = si2.data.value;
    console.log("  Key fields:");
    console.log(`    invoiceNumber: ${v.invoiceNumber}`);
    console.log(`    invoiceDate: ${v.invoiceDate}`);
    console.log(`    paymentDueDate: ${v.paymentDueDate}`);
    console.log(`    amountCurrency: ${v.amountCurrency}`);
    console.log(`    supplier: ${JSON.stringify(v.supplier)}`);
    console.log(`    voucher: ${JSON.stringify(v.voucher)}`);
    console.log(`    project: ${JSON.stringify(v.project)}`);
    console.log(`    category: ${v.category}`);
    console.log(`    kidOrReceiverReference: ${v.kidOrReceiverReference}`);
  }

  // List a few more
  const siList = await get("/supplierInvoice?count=10&fields=id,invoiceNumber,invoiceDate,amountCurrency,supplier(id,name),voucher(id),project(id,name)&invoiceDateFrom=2020-01-01&invoiceDateTo=2027-01-01");
  console.log(`\n  All SIs: ${siList.data.values?.length}`);
  for (const s of siList.data.values || []) {
    console.log(`    - id=${s.id} num=${s.invoiceNumber} amount=${s.amountCurrency} supplier=${s.supplier?.name?.slice(0, 30)} project=${s.project?.name?.slice(0, 30) ?? 'none'}`);
  }
}

async function experiment15_createSupplierInvoice() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 15: Create supplier invoice with correct fields");
  console.log("=".repeat(70));

  // Create supplier
  const supp = await post("/supplier", {
    name: `SITest ${RUN_ID}`,
    organizationNumber: "999999990",
    isSupplier: true,
  });
  const suppId = supp.data.value.id;
  track(`/supplier/${suppId}`);

  // Try POST /supplierInvoice WITHOUT dueDate (use paymentDueDate instead)
  console.log("\n  --- Try 1: with paymentDueDate ---");
  const si1 = await post("/supplierInvoice", {
    invoiceNumber: `SI-${RUN_ID}-1`,
    invoiceDate: TODAY,
    paymentDueDate: TODAY,
    supplier: { id: suppId },
    amountCurrency: 56200,
  });
  console.log(`  Result: ${si1.ok} ${si1.status}`);
  if (!si1.ok) {
    console.log(`  Error: ${JSON.stringify(si1.data).slice(0, 500)}`);
  } else {
    console.log(`  Created: ${JSON.stringify(si1.data.value).slice(0, 500)}`);
    if (si1.data.value?.id) track(`/supplierInvoice/${si1.data.value.id}`);
  }

  // Try without any due date
  console.log("\n  --- Try 2: no due date at all ---");
  const si2 = await post("/supplierInvoice", {
    invoiceNumber: `SI-${RUN_ID}-2`,
    invoiceDate: TODAY,
    supplier: { id: suppId },
    amountCurrency: 56200,
  });
  console.log(`  Result: ${si2.ok} ${si2.status}`);
  if (!si2.ok) {
    console.log(`  Error: ${JSON.stringify(si2.data).slice(0, 500)}`);
  } else {
    console.log(`  Created: ${JSON.stringify(si2.data.value).slice(0, 500)}`);
    if (si2.data.value?.id) track(`/supplierInvoice/${si2.data.value.id}`);
  }

  // Try with minimal fields
  console.log("\n  --- Try 3: absolute minimum ---");
  const si3 = await post("/supplierInvoice", {
    supplier: { id: suppId },
  });
  console.log(`  Result: ${si3.ok} ${si3.status}`);
  if (!si3.ok) {
    console.log(`  Error: ${JSON.stringify(si3.data).slice(0, 500)}`);
  } else {
    console.log(`  Created: ${JSON.stringify(si3.data.value).slice(0, 500)}`);
    if (si3.data.value?.id) track(`/supplierInvoice/${si3.data.value.id}`);
  }

  // Try with currency ref
  console.log("\n  --- Try 4: with currency ---");
  const si4 = await post("/supplierInvoice", {
    invoiceNumber: `SI-${RUN_ID}-4`,
    invoiceDate: TODAY,
    supplier: { id: suppId },
    amountCurrency: 56200,
    currency: { id: 1 },
  });
  console.log(`  Result: ${si4.ok} ${si4.status}`);
  if (!si4.ok) {
    console.log(`  Error: ${JSON.stringify(si4.data).slice(0, 500)}`);
  } else {
    console.log(`  Created: ${JSON.stringify(si4.data.value).slice(0, 500)}`);
    if (si4.data.value?.id) track(`/supplierInvoice/${si4.data.value.id}`);
  }
}

async function experiment16_hourlyRatesFromOpenAPI() {
  console.log("\n" + "=".repeat(70));
  console.log("EXPERIMENT 16: Read hourly rate schema from existing data");
  console.log("=".repeat(70));

  // Read an existing project's hourly rates with full expansion
  const rates = await get("/project/hourlyRates?count=5&fields=*,projectSpecificRates(*)");
  console.log(`  Rate holders: ${rates.data.values?.length}`);

  for (const r of rates.data.values?.slice(0, 3) || []) {
    console.log(`\n  Holder ${r.id}:`);
    for (const [k, v] of Object.entries(r).sort()) {
      console.log(`    ${k}: ${JSON.stringify(v).slice(0, 200)}`);
    }

    // Read specific rates
    if (r.projectSpecificRates?.length > 0) {
      const rateId = r.projectSpecificRates[0].id || r.projectSpecificRates[0];
      const rateDetail = await get(`/project/hourlyRates/projectSpecificRates/${typeof rateId === 'object' ? rateId.id : rateId}?fields=*`);
      if (rateDetail.ok) {
        console.log(`\n  Specific rate ${typeof rateId === 'object' ? rateId.id : rateId}:`);
        for (const [k, v] of Object.entries(rateDetail.data.value).sort()) {
          console.log(`    ${k}: ${JSON.stringify(v).slice(0, 200)}`);
        }
      }
    }
  }

  // Try creating a rate with just the documented fields
  const dept = await get("/department?isInactive=false&count=1&fields=*");
  const deptId = dept.data.values[0].id;
  const pm = await get("/employee?assignableProjectManagers=true&count=1&fields=*");
  const pmId = pm.data.values[0].id;

  const cust = await post("/customer", {
    name: `RateTest ${RUN_ID}`,
    organizationNumber: "999999989",
    isCustomer: true,
  });
  const custId = cust.data.value.id;
  track(`/customer/${custId}`);

  const emp = await post("/employee", {
    firstName: "Rate",
    lastName: `Test ${RUN_ID}`,
    email: `rate.${RUN_ID}@example.org`,
    dateOfBirth: "1990-01-01",
    userType: "NO_ACCESS",
    department: { id: deptId },
  });
  const empId = emp.data.value.id;
  track(`/employee/${empId}`);

  const proj = await post("/project", {
    name: `RateProject ${RUN_ID}`,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmId },
  });
  const projId = proj.data.value.id;
  track(`/project/${projId}`);

  const act = await post("/project/projectActivity", {
    project: { id: projId },
    startDate: TODAY,
    budgetHours: 10,
    activity: {
      name: "Test",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: true,
    },
  });
  const actId = act.data.value.activity.id;

  // Get the auto-created rate holder
  const rh = await get(`/project/hourlyRates?projectId=${projId}&count=10&fields=*,projectSpecificRates(*)`);
  console.log(`\n  New project rate holders: ${rh.data.values?.length}`);
  const holder = rh.data.values?.[0];
  if (!holder) return;
  console.log(`  Holder: id=${holder.id} model=${holder.hourlyRateModel}`);
  console.log(`  Holder keys: ${Object.keys(holder).join(', ')}`);

  // Switch model
  await put(`/project/hourlyRates/${holder.id}`, {
    project: { id: projId },
    startDate: TODAY,
    hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
  });

  // Try creating specific rate without hourlyRateCurrency
  console.log("\n  --- Creating specific rate (no hourlyRateCurrency) ---");
  const r1 = await post("/project/hourlyRates/projectSpecificRates", {
    projectHourlyRate: { id: holder.id },
    employee: { id: empId },
    activity: { id: actId },
    hourlyRate: 1500,
  });
  console.log(`  Result: ${r1.ok} ${r1.status}`);
  if (!r1.ok) {
    console.log(`  Error: ${JSON.stringify(r1.data).slice(0, 300)}`);

    // Try other field patterns
    const attempts = [
      { employee: { id: empId }, activity: { id: actId }, fixedRate: 1500 },
      { employee: { id: empId }, activity: { id: actId }, hourlyRate: 1500, hourlyRateModel: { id: holder.id } },
    ];
    for (const body of attempts) {
      const r = await post("/project/hourlyRates/projectSpecificRates", body);
      console.log(`  Try ${JSON.stringify(body).slice(0, 100)}: ${r.ok} ${r.status}`);
      if (r.ok) {
        console.log(`    Created: ${JSON.stringify(r.data.value).slice(0, 200)}`);
        break;
      } else {
        console.log(`    Error: ${JSON.stringify(r.data).slice(0, 200)}`);
      }
    }
  } else {
    console.log(`  Created: ${JSON.stringify(r1.data.value).slice(0, 300)}`);

    // Now register hours and check if hourlyRate is populated
    const ts = await post("/timesheet/entry", {
      employee: { id: empId },
      project: { id: projId },
      activity: { id: actId },
      date: TODAY,
      hours: 5,
    });
    console.log(`\n  Timesheet: hours=${ts.data.value?.hours} chargeable=${ts.data.value?.chargeable} hourlyRate=${ts.data.value?.hourlyRate}`);
  }
}

async function main() {
  console.log(`\nSandbox T29 Experiments Round 4 — Run ID: ${RUN_ID}`);
  console.log(`Time: ${new Date().toISOString()}\n`);

  try {
    await experiment14_readExistingSI();
    await experiment15_createSupplierInvoice();
    await experiment16_hourlyRatesFromOpenAPI();
  } finally {
    await cleanupAll();
  }
}

main().catch(e => { console.error("FATAL:", e.message, e.stack); process.exit(1); });
