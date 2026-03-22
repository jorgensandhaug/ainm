const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "5h9SSTNfBESKVQzhWc_4imdg9WNCoDK-n8JYYpwEc_0";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const DUE = "2026-04-22";

async function api(method: string, path: string, body?: any) {
  const url = BASE + path;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(json).slice(0, 500)); }
  return { status: r.status, data: json };
}

async function main() {
  // Step 1+2: GET employee + GET project (parallel)
  const [empRes, projRes] = await Promise.all([
    api("GET", "/employee?email=ingrid.nilsen@example.org&count=10&fields=*"),
    api("GET", "/project?name=Plattformintegrasjon&count=50&fields=*,customer(*)"),
  ]);

  const employees = empRes.data?.values || [];
  const emp = employees.find((e: any) => e.email === "ingrid.nilsen@example.org");
  if (!emp) { console.log("Employee not found"); return; }
  console.log("Employee:", emp.id, emp.firstName, emp.lastName);

  const projects = projRes.data?.values || [];
  const proj = projects.find((p: any) => p.name === "Plattformintegrasjon");
  if (!proj) { console.log("Project not found"); return; }
  console.log("Project:", proj.id, proj.name);

  const customer = proj.customer;
  if (!customer) { console.log("No customer on project"); return; }
  console.log("Customer:", customer.id, customer.name, customer.organizationNumber);

  // Step 3: GET activity for timesheet
  const actRes = await api("GET", `/activity/%3EforTimeSheet?projectId=${proj.id}&employeeId=${emp.id}&date=${TODAY}&query=Analyse&filterExistingHours=false&count=50&fields=*`);
  const activities = actRes.data?.values || [];
  const act = activities.find((a: any) => a.name === "Analyse");
  if (!act) { console.log("Activity not found"); return; }
  console.log("Activity:", act.id, act.name, "isChargeable:", act.isChargeable);

  // Step 4: POST timesheet entry (5 hours <= 24, single entry)
  const tsRes = await api("POST", "/timesheet/entry", {
    employee: { id: emp.id },
    project: { id: proj.id },
    activity: { id: act.id },
    date: TODAY,
    hours: 5,
    projectChargeableHours: 5,
  });
  const ts = tsRes.data?.value;
  console.log("Timesheet:", ts?.id, "hours:", ts?.hours, "chargeable:", ts?.chargeable, "hourlyRate:", ts?.hourlyRate);

  // Step 5: GET vatType + GET bank account (parallel, free)
  const [vatRes, bankRes] = await Promise.all([
    api("GET", "/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=*"),
    api("GET", "/ledger/account?isBankAccount=true&fields=*"),
  ]);

  // Find 25% outgoing VAT
  const vatTypes = vatRes.data?.values || [];
  const vat25 = vatTypes.find((v: any) => v.percentage === 25);
  const vatId = vat25 ? vat25.id : 3; // fallback to hardcoded 3
  console.log("VAT type:", vatId, vat25?.name, vat25?.percentage + "%");

  // Check bank account
  const accounts = bankRes.data?.values || [];
  const invoiceAcct = accounts.find((a: any) => a.number === 1920 || a.isInvoiceAccount);
  if (invoiceAcct && !invoiceAcct.bankAccountNumber) {
    console.log("Bank account missing, fixing...");
    await api("PUT", `/ledger/account/${invoiceAcct.id}`, {
      ...invoiceAcct,
      bankAccountNumber: "12345678903",
    });
  }

  // Step 6: POST invoice with embedded order
  const invRes = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: DUE,
    customer: { id: customer.id },
    orders: [{
      customer: { id: customer.id },
      project: { id: proj.id },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: "Analyse",
        count: 5,
        unitPriceExcludingVatCurrency: 1400,
        vatType: { id: vatId },
      }],
    }],
  });
  const inv = invRes.data?.value;
  console.log("Invoice:", inv?.id, "number:", inv?.invoiceNumber);
  console.log("amountExcludingVat:", inv?.amountExcludingVatCurrency);
  console.log("amountCurrency:", inv?.amountCurrency);
  console.log("outstanding:", inv?.amountCurrencyOutstanding);

  // Verification GETs (free)
  const [tsVerify, invVerify] = await Promise.all([
    api("GET", `/timesheet/entry?employeeId=${emp.id}&projectId=${proj.id}&activityId=${act.id}&dateFrom=${TODAY}&dateTo=${TODAY}&fields=*`),
    api("GET", `/invoice/${inv?.id}?fields=*,orders(*,project(*),orderLines(*,product(*))),customer(*),projectInvoiceDetails(*)`),
  ]);

  const tsEntries = tsVerify.data?.values || [];
  console.log("\n=== Timesheet Verification ===");
  for (const e of tsEntries) {
    console.log("  entry:", e.id, "hours:", e.hours, "projectChargeableHours:", e.projectChargeableHours,
      "activity:", e.activity?.id, "project:", e.project?.id, "chargeable:", e.chargeable, "hourlyRate:", e.hourlyRate);
  }

  const invData = invVerify.data?.value;
  console.log("\n=== Invoice Verification ===");
  console.log("  invoiceNumber:", invData?.invoiceNumber);
  console.log("  customer:", invData?.customer?.id, invData?.customer?.name);
  console.log("  amountExcludingVat:", invData?.amountExcludingVatCurrency);
  console.log("  amountCurrency:", invData?.amountCurrency);
  console.log("  outstanding:", invData?.amountCurrencyOutstanding);
  console.log("  orders:", invData?.orders?.length);
  if (invData?.orders?.[0]) {
    const o = invData.orders[0];
    console.log("  order[0].id:", o.id, "project:", o.project?.id, o.project?.name);
    const lines = o.orderLines || invData?.orderLines || [];
    for (const l of lines) {
      console.log("    line:", l.description, "count:", l.count, "unitPrice:", l.unitPriceExcludingVatCurrency, "vatType:", l.vatType?.id);
    }
  }
  console.log("  projectInvoiceDetails:", invData?.projectInvoiceDetails?.length);
  if (invData?.projectInvoiceDetails) {
    for (const d of invData.projectInvoiceDetails) {
      console.log("    detail:", d);
    }
  }
}

main().catch(e => { console.error(e); process.exit(1); });
