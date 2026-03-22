const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "AwNPhBnolLISA_4rAKncBI3lp-05MaS-oDlkdB07lWA";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const DATE = "2026-03-22";

const h = { Authorization: AUTH, "Content-Type": "application/json" };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  if (!r.ok) throw new Error(`GET ${path} → ${r.status} ${await r.text()}`);
  return r.json();
}

async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`POST ${path} → ${r.status} ${txt}`);
  return JSON.parse(txt);
}

async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const txt = await r.text();
  if (!r.ok) throw new Error(`PUT ${path} → ${r.status} ${txt}`);
  return JSON.parse(txt);
}

async function main() {
  // ── Step 1: 4 parallel free GETs ──
  const [empRes, projRes, vatRes, bankRes] = await Promise.all([
    get(`/employee?email=${encodeURIComponent("ines.rodrigues@example.org")}&count=10&fields=*`),
    get(`/project?name=${encodeURIComponent("Redesign do site")}&count=50&fields=*,customer(*)`),
    get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${DATE}&fields=*`),
    get(`/ledger/account?isBankAccount=true&fields=*`),
  ]);

  // Exact-match employee by email
  const emp = empRes.values.find((e: any) => e.email === "ines.rodrigues@example.org");
  if (!emp) throw new Error("Employee not found");
  console.log(`Employee: id=${emp.id} ${emp.firstName} ${emp.lastName}`);

  // Exact-match project by name + customer org
  const proj = projRes.values.find((p: any) => p.name === "Redesign do site");
  if (!proj) throw new Error("Project not found");
  const cust = proj.customer;
  console.log(`Project: id=${proj.id} "${proj.name}" customer=${cust.id} "${cust.name}" org=${cust.organizationNumber}`);
  if (cust.organizationNumber !== "930325325") {
    // Try broader match
    const proj2 = projRes.values.find((p: any) => p.name === "Redesign do site" && p.customer?.organizationNumber === "930325325");
    if (proj2) {
      Object.assign(proj, proj2);
      Object.assign(cust, proj2.customer);
    }
  }

  // VAT type
  const vatTypes = vatRes.values;
  console.log(`VAT types: ${vatTypes.map((v: any) => `id=${v.id} ${v.name} ${v.percentage}%`).join(", ")}`);
  const vatType = vatTypes[0]; // Use first outgoing VAT type

  // Bank account check
  const bankAcct = bankRes.values.find((a: any) => a.isBankAccount);
  const needsBankFix = bankAcct && !bankAcct.bankAccountNumber;
  console.log(`Bank account: id=${bankAcct?.id} bankAccountNumber=${bankAcct?.bankAccountNumber} needsFix=${needsBankFix}`);

  // ── Step 2: activity GET + optional bank fix (parallel) ──
  const step2: Promise<any>[] = [
    get(`/activity/%3EforTimeSheet?projectId=${proj.id}&employeeId=${emp.id}&date=${DATE}&query=${encodeURIComponent("Design")}&filterExistingHours=false&count=50&fields=*`),
  ];
  if (needsBankFix) {
    step2.push(put(`/ledger/account/${bankAcct.id}`, { id: bankAcct.id, version: bankAcct.version, name: bankAcct.name, number: bankAcct.number, bankAccountNumber: "12345678903" }));
  }
  const [actRes, bankFixRes] = await Promise.all(step2);

  const activity = actRes.values.find((a: any) => a.name === "Design");
  if (!activity) throw new Error("Activity 'Design' not found");
  console.log(`Activity: id=${activity.id} "${activity.name}" isChargeable=${activity.isChargeable}`);

  // ── Step 2b: chargeable branch ──
  if (activity.isChargeable) {
    console.log("Activity is chargeable — managing hourly rates...");
    const ratesRes = await get(`/project/hourlyRates?projectId=${proj.id}&count=100&fields=*,projectSpecificRates(*,employee(*),activity(*))`);
    const rates = ratesRes.values;
    let holder = rates?.[0];

    if (!holder) {
      // Create holder
      const holderRes = await post(`/project/hourlyRates`, { project: { id: proj.id }, startDate: DATE, hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES" });
      holder = holderRes.value;
      console.log(`Created hourly rate holder: id=${holder.id}`);
    } else if (holder.hourlyRateModel !== "TYPE_PROJECT_SPECIFIC_HOURLY_RATES") {
      // Switch model
      const switchRes = await put(`/project/hourlyRates/${holder.id}`, { id: holder.id, version: holder.version, project: { id: proj.id }, startDate: holder.startDate || DATE, hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES" });
      holder = switchRes.value;
      console.log(`Switched hourly rate model: id=${holder.id}`);
    }

    // Check for existing exact rate
    const existingRate = holder.projectSpecificRates?.find((r: any) => r.employee?.id === emp.id && r.activity?.id === activity.id);
    if (existingRate && existingRate.hourlyRate === 1000) {
      console.log(`Exact rate already exists: id=${existingRate.id} rate=${existingRate.hourlyRate}`);
    } else if (existingRate) {
      const updRes = await put(`/project/hourlyRates/projectSpecificRates/${existingRate.id}`, { id: existingRate.id, version: existingRate.version, projectHourlyRate: { id: holder.id }, employee: { id: emp.id }, activity: { id: activity.id }, hourlyRate: 1000 });
      console.log(`Updated rate: id=${updRes.value.id} rate=${updRes.value.hourlyRate}`);
    } else {
      const createRes = await post(`/project/hourlyRates/projectSpecificRates`, { projectHourlyRate: { id: holder.id }, employee: { id: emp.id }, activity: { id: activity.id }, hourlyRate: 1000 });
      console.log(`Created rate: id=${createRes.value.id} rate=${createRes.value.hourlyRate}`);
    }
  }

  // ── Step 3: parallel timesheet + invoice ──
  const [tsRes, invRes] = await Promise.all([
    post(`/timesheet/entry`, {
      employee: { id: emp.id },
      project: { id: proj.id },
      activity: { id: activity.id },
      date: DATE,
      hours: 11,
      projectChargeableHours: 11,
    }),
    post(`/invoice?sendToCustomer=false`, {
      invoiceDate: DATE,
      invoiceDueDate: "2026-04-22",
      customer: { id: cust.id },
      orders: [{
        customer: { id: cust.id },
        project: { id: proj.id },
        orderDate: DATE,
        deliveryDate: DATE,
        orderLines: [{
          description: "Design",
          count: 11,
          unitPriceExcludingVatCurrency: 1000,
          vatType: { id: vatType.id },
        }],
      }],
    }),
  ]);

  // Log timesheet result
  const ts = tsRes.value;
  console.log(`\nTimesheet: id=${ts.id} hours=${ts.hours} projectChargeableHours=${ts.projectChargeableHours} chargeable=${ts.chargeable} hourlyRate=${ts.hourlyRate} activity.id=${ts.activity?.id} project.id=${ts.project?.id}`);

  // Log invoice result
  const inv = invRes.value;
  console.log(`Invoice: id=${inv.id} invoiceNumber=${inv.invoiceNumber} amountExcludingVatCurrency=${inv.amountExcludingVatCurrency} amountCurrencyOutstanding=${inv.amountCurrencyOutstanding}`);
  console.log(`  customer: id=${inv.customer?.id} "${inv.customer?.name}"`);
  console.log(`  orders: ${inv.orders?.length}`);
  if (inv.orders?.[0]) {
    const o = inv.orders[0];
    console.log(`  order[0]: id=${o.id} project.id=${o.project?.id}`);
    if (o.orderLines) {
      for (const ol of o.orderLines) {
        console.log(`    orderLine: description="${ol.description}" count=${ol.count} unitPrice=${ol.unitPriceExcludingVatCurrency} vatType.id=${ol.vatType?.id}`);
      }
    }
  }
  console.log(`  projectInvoiceDetails: ${JSON.stringify(inv.projectInvoiceDetails)}`);

  // ── Verification GETs (free) ──
  const nextDay = "2026-03-23";
  const [tsVerify, invVerify] = await Promise.all([
    get(`/timesheet/entry?employeeId=${emp.id}&projectId=${proj.id}&activityId=${activity.id}&dateFrom=${DATE}&dateTo=${nextDay}&fields=*`),
    get(`/invoice/${inv.id}?fields=*,orders(*,project(*),orderLines(*,product(*))),customer(*),projectInvoiceDetails(*)`),
  ]);

  console.log(`\n── Verification ──`);
  console.log(`Timesheet entries: ${tsVerify.values?.length}`);
  for (const e of tsVerify.values || []) {
    console.log(`  id=${e.id} hours=${e.hours} pch=${e.projectChargeableHours} chargeable=${e.chargeable} hourlyRate=${e.hourlyRate} activity=${e.activity?.id} project=${e.project?.id}`);
  }
  const iv = invVerify.value;
  console.log(`Invoice verified: id=${iv.id} invoiceNumber=${iv.invoiceNumber} amountExVat=${iv.amountExcludingVatCurrency} outstanding=${iv.amountCurrencyOutstanding}`);
  console.log(`  customer: id=${iv.customer?.id} "${iv.customer?.name}"`);
  console.log(`  orders: ${iv.orders?.length}`);
  if (iv.orders?.[0]) {
    console.log(`  order[0].id=${iv.orders[0].id} project=${iv.orders[0].project?.id}`);
    for (const ol of iv.orders[0].orderLines || []) {
      console.log(`    line: "${ol.description}" count=${ol.count} unit=${ol.unitPriceExcludingVatCurrency} vat=${ol.vatType?.id}`);
    }
  }
  console.log(`  projectInvoiceDetails: ${JSON.stringify(iv.projectInvoiceDetails)}`);

  console.log("\nDone.");
}

main().catch(e => { console.error(e); process.exit(1); });
