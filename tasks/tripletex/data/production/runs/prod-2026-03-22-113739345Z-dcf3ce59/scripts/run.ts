const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "9dg99QEBe_Hue_vpLV5jeL9buX6sI5fEGAbQfn8teuM";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-22";

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  if (!r.ok) { const t = await r.text(); throw new Error(`GET ${path} → ${r.status}: ${t}`); }
  return r.json();
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`POST ${path} → ${r.status}: ${t}`); }
  return r.json();
}
async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  if (!r.ok) { const t = await r.text(); throw new Error(`PUT ${path} → ${r.status}: ${t}`); }
  return r.json();
}

// ── Step 1: 4 parallel free GETs ──
const [empRes, projRes, vatRes, bankRes] = await Promise.all([
  get("/employee?email=silje.strand@example.org&count=10&fields=*"),
  get("/project?name=Skytjeneste-oppsett&count=50&fields=*,customer(*)"),
  get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + DATE + "&fields=*"),
  get("/ledger/account?isBankAccount=true&fields=*"),
]);

// Resolve employee
const emp = empRes.values?.find((e: any) => e.email === "silje.strand@example.org");
if (!emp) throw new Error("Employee not found");
console.log("Employee:", emp.id, emp.firstName, emp.lastName);

// Resolve project + customer
const proj = projRes.values?.find((p: any) => p.name === "Skytjeneste-oppsett");
if (!proj) throw new Error("Project not found");
const cust = proj.customer;
if (!cust) throw new Error("Customer not found on project");
console.log("Project:", proj.id, proj.name);
console.log("Customer:", cust.id, cust.name, cust.organizationNumber);
if (cust.organizationNumber !== "912074005") {
  // Try to match by org number if name match fails
  const proj2 = projRes.values?.find((p: any) => p.customer?.organizationNumber === "912074005");
  if (proj2) {
    console.log("Matched project by customer orgNr instead:", proj2.id, proj2.name);
  }
}

// Resolve VAT type
const vatTypes = vatRes.values || [];
const vat25 = vatTypes.find((v: any) => v.percentage === 25) || vatTypes[0];
console.log("VAT type:", vat25?.id, vat25?.name, vat25?.percentage + "%");

// Resolve bank account
const bankAcct = bankRes.values?.find((a: any) => a.isBankAccount);
const needBankFix = bankAcct && !bankAcct.bankAccountNumber;
console.log("Bank account:", bankAcct?.id, bankAcct?.number, "needsFix:", needBankFix);

// ── Step 2: activity GET + optional bank fix ──
const step2: Promise<any>[] = [
  get(`/activity/%3EforTimeSheet?projectId=${proj.id}&employeeId=${emp.id}&date=${DATE}&query=Design&filterExistingHours=false&count=50&fields=*`),
];
if (needBankFix) {
  step2.push(put(`/ledger/account/${bankAcct.id}`, { id: bankAcct.id, number: bankAcct.number, name: bankAcct.name, bankAccountNumber: "12345678903" }));
}
const [actRes, bankFixRes] = await Promise.all(step2);
if (bankFixRes) console.log("Bank fix applied:", bankFixRes.value?.id);

const activity = actRes.values?.find((a: any) => a.name === "Design");
if (!activity) throw new Error("Activity 'Design' not found");
console.log("Activity:", activity.id, activity.name, "isChargeable:", activity.isChargeable);

// ── Chargeable branch handling ──
let chargeableSetup = false;
if (activity.isChargeable) {
  console.log("Activity is chargeable — checking hourly rates...");
  const hrRes = await get(`/project/hourlyRates?projectId=${proj.id}&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`);
  const holders = hrRes.values || [];
  let holder = holders[0];

  if (!holder) {
    // Create holder
    const created = await post("/project/hourlyRates", {
      project: { id: proj.id },
      startDate: DATE,
      hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
    });
    holder = created.value;
    console.log("Created hourly rate holder:", holder.id);
  } else if (holder.hourlyRateModel !== "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
    // Switch model
    const switched = await put(`/project/hourlyRates/${holder.id}`, {
      id: holder.id,
      project: { id: proj.id },
      startDate: holder.startDate || DATE,
      hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
    });
    holder = switched.value;
    console.log("Switched hourly rate model:", holder.id);
  }

  // Check existing rates
  const existingRates = holder.projectSpecificRates || [];
  const exactRate = existingRates.find((r: any) =>
    r.employee?.id === emp.id && r.activity?.id === activity.id && r.hourlyRate === 1750
  );
  if (exactRate) {
    console.log("Exact rate already exists:", exactRate.id);
  } else {
    const wrongRate = existingRates.find((r: any) =>
      r.employee?.id === emp.id && r.activity?.id === activity.id
    );
    if (wrongRate) {
      await put(`/project/hourlyRates/projectSpecificRates/${wrongRate.id}`, {
        id: wrongRate.id,
        projectHourlyRate: { id: holder.id },
        employee: { id: emp.id },
        activity: { id: activity.id },
        hourlyRate: 1750,
      });
      console.log("Updated rate to 1750");
    } else {
      await post("/project/hourlyRates/projectSpecificRates", {
        projectHourlyRate: { id: holder.id },
        employee: { id: emp.id },
        activity: { id: activity.id },
        hourlyRate: 1750,
      });
      console.log("Created rate 1750");
    }
  }
  chargeableSetup = true;
}

// ── Step 3: parallel timesheet + invoice ──
const vatId = vat25?.id;
const [tsRes, invRes] = await Promise.all([
  post("/timesheet/entry", {
    employee: { id: emp.id },
    project: { id: proj.id },
    activity: { id: activity.id },
    date: DATE,
    hours: 5,
    projectChargeableHours: 5,
  }),
  post("/invoice?sendToCustomer=false", {
    invoiceDate: DATE,
    invoiceDueDate: "2026-04-21",
    customer: { id: cust.id },
    orders: [{
      customer: { id: cust.id },
      project: { id: proj.id },
      orderDate: DATE,
      deliveryDate: DATE,
      orderLines: [{
        description: "Design",
        count: 5,
        unitPriceExcludingVatCurrency: 1750,
        vatType: { id: vatId },
      }],
    }],
  }),
]);

console.log("\n=== Timesheet Entry ===");
const ts = tsRes.value;
console.log("ID:", ts.id);
console.log("Hours:", ts.hours);
console.log("ProjectChargeableHours:", ts.projectChargeableHours);
console.log("Chargeable:", ts.chargeable);
console.log("HourlyRate:", ts.hourlyRate);
console.log("Activity:", ts.activity?.id);
console.log("Project:", ts.project?.id);

console.log("\n=== Invoice ===");
const inv = invRes.value;
console.log("ID:", inv.id);
console.log("InvoiceNumber:", inv.invoiceNumber);
console.log("Customer:", inv.customer?.id, inv.customer?.name);
console.log("AmountExVat:", inv.amountExcludingVatCurrency);
console.log("AmountOutstanding:", inv.amountCurrencyOutstanding);
console.log("Orders:", inv.orders?.length);
if (inv.orders?.[0]) {
  console.log("Order ID:", inv.orders[0].id);
  console.log("OrderLines:", inv.orders[0].orderLines?.length);
}
console.log("ProjectInvoiceDetails:", inv.projectInvoiceDetails?.length);

// ── Verification GETs (free) ──
const nextDay = "2026-03-23";
const [tsVerify, invVerify] = await Promise.all([
  get(`/timesheet/entry?employeeId=${emp.id}&projectId=${proj.id}&activityId=${activity.id}&dateFrom=${DATE}&dateTo=${nextDay}&fields=*`),
  get(`/invoice/${inv.id}?fields=*,orders(*,project(*),orderLines(*,product(*))),customer(*),projectInvoiceDetails(*)`),
]);

console.log("\n=== Timesheet Verification ===");
for (const e of (tsVerify.values || [])) {
  console.log(`  Entry ${e.id}: hours=${e.hours} projChargeable=${e.projectChargeableHours} chargeable=${e.chargeable} hourlyRate=${e.hourlyRate} activity=${e.activity?.id} project=${e.project?.id}`);
}

console.log("\n=== Invoice Verification ===");
const iv = invVerify.value;
console.log("InvoiceNumber:", iv.invoiceNumber);
console.log("Customer:", iv.customer?.id, iv.customer?.name, iv.customer?.organizationNumber);
console.log("AmountExVat:", iv.amountExcludingVatCurrency);
console.log("AmountOutstanding:", iv.amountCurrencyOutstanding);
if (iv.orders?.[0]) {
  console.log("Order ID:", iv.orders[0].id);
  console.log("Project on order:", iv.orders[0].project?.id, iv.orders[0].project?.name);
  for (const ol of (iv.orders[0].orderLines || [])) {
    console.log(`  OrderLine: desc="${ol.description}" count=${ol.count} unitPrice=${ol.unitPriceExcludingVatCurrency} vatType=${ol.vatType?.id}`);
  }
}
if (iv.projectInvoiceDetails) {
  for (const pid of iv.projectInvoiceDetails) {
    console.log(`  ProjectInvoiceDetail: project=${pid.project?.id} amountOrderLines=${pid.amountOrderLinesAndReinvoicingCurrency} includeHours=${pid.includeHours}`);
  }
}

console.log("\nDone.");
