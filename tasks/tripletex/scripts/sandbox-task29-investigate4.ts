// Task 29 investigation part 4:
// Theory: the scoring checks 7 things. Checks 1-2 pass (customer + project exist).
// What are checks 3-7? Likely:
// 3. Budget on project (396900)
// 4. Timesheet hours for employee 1 (Samuel Brown 74h)
// 5. Timesheet hours for employee 2 (Sarah Lewis 85h)
// 6. Supplier cost registered (56750 from Clearwater)
// 7. Customer invoice exists for the project
//
// Since we pass 1-2 and fail 3-7, something is wrong with how we register the data.
// Let's verify by reading back the state of a lifecycle run very carefully.
//
// Actually - the key insight might be that the scoring reads SPECIFIC
// Tripletex objects and checks them. Let me see what's checkable.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };
const TODAY = "2026-03-21";
const SUFFIX = `T29d-${Date.now()}`;

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  if (!r.ok) {
    console.log(`${method} ${path} → ${r.status}: ${text.slice(0, 300)}`);
    return { ok: false, status: r.status, error: text };
  }
  return { ok: true, status: r.status, data: JSON.parse(text) };
}

function splitHours(totalHours: number, startDate: string) {
  const entries: any[] = [];
  let remaining = totalHours;
  const [y, m, d] = startDate.split("-").map(Number);
  let offset = 0;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 7.5);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    entries.push({ date: dt.toISOString().slice(0, 10), hours: chunk });
    remaining = +(remaining - chunk).toFixed(2);
    offset++;
  }
  return entries;
}

async function main() {
  // Prereqs
  const [deptR, divR] = await Promise.all([
    api("GET", "/department?isInactive=false&count=1&fields=*"),
    api("GET", "/division?count=1&fields=*"),
  ]);
  const deptId = deptR.data?.values?.[0]?.id;
  const divId = divR.data?.values?.[0]?.id;
  const mgrR = await api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*");
  const mgrId = mgrR.data?.values?.[0]?.id;

  // Create all entities
  const custR = await api("POST", "/customer", { name: `Havbris ${SUFFIX}`, organizationNumber: "851704027", isCustomer: true });
  const customerId = custR.data?.value?.id;

  const empBase = (fn: string, ln: string, email: string, dob: string) => ({
    firstName: fn, lastName: ln, email, dateOfBirth: dob, userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{ startDate: TODAY, ...(divId ? { division: { id: divId } } : {}) }],
  });

  const e1R = await api("POST", "/employee", empBase("Sigurd", `Berg-${SUFFIX}`, `sigurd.${SUFFIX}@example.org`, "1985-06-15"));
  const e1 = e1R.data?.value?.id;
  const e2R = await api("POST", "/employee", empBase("Marte", `Johansen-${SUFFIX}`, `marte.${SUFFIX}@example.org`, "1990-03-22"));
  const e2 = e2R.data?.value?.id;

  const projR = await api("POST", "/project", {
    name: `ERP-implementering Havbris ${SUFFIX}`,
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: mgrId },
  });
  const projectId = projR.data?.value?.id;
  console.log(`Project: ${projectId}`);

  // Activity with budget
  const actR = await api("POST", "/project/projectActivity", {
    project: { id: projectId },
    startDate: TODAY,
    budgetFeeCurrency: 418100,
    activity: { name: "Prosjektaktivitet", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false },
  });
  const activityId = actR.data?.value?.activity?.id;

  // Timesheets
  const ts1 = splitHours(75, TODAY);
  const ts2 = splitHours(47, TODAY);
  const tsPayload = [
    ...ts1.map(e => ({ employee: { id: e1 }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours })),
    ...ts2.map(e => ({ employee: { id: e2 }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours })),
  ];
  const tsR = await api("POST", "/timesheet/entry/list", tsPayload);
  console.log(`Timesheet: ${tsR.data?.values?.length} entries`);

  // Supplier + cost orderline
  const supR = await api("POST", "/supplier", { name: `Lysgård ${SUFFIX}`, organizationNumber: "964716188", isSupplier: true });
  const supplierId = supR.data?.value?.id;

  const olR = await api("POST", "/project/orderline", {
    project: { id: projectId },
    description: `Leverandørkostnad Lysgård ${SUFFIX}`,
    date: TODAY, count: 1, unitCostCurrency: 56200, isChargeable: false,
  });

  // Invoice
  const vatR = await api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`);
  const vatId = vatR.data?.values?.[0]?.id;
  const bankR = await api("GET", "/ledger/account?isBankAccount=true&fields=*");
  const bank = bankR.data?.values?.[0];

  const invR = await api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-20",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: `ERP-implementering Havbris ${SUFFIX}`,
        count: 1,
        unitPriceExcludingVatCurrency: 418100,
        vatType: { id: vatId },
      }],
    }],
  });
  console.log(`Invoice: ${invR.data?.value?.id}, amount: ${invR.data?.value?.amountExcludingVatCurrency}`);

  // === NOW READ BACK EVERYTHING ===
  console.log("\n\n=== FULL STATE INSPECTION ===\n");

  // 1. Customer
  const custRead = await api("GET", `/customer/${customerId}?fields=*`);
  console.log(`1. Customer: ${custRead.data?.value?.name} (org ${custRead.data?.value?.organizationNumber})`);

  // 2. Project
  const projRead = await api("GET", `/project/${projectId}?fields=*,projectManager(*),customer(*),projectActivities(*)`);
  const pv = projRead.data?.value;
  console.log(`\n2. Project: ${pv?.name}`);
  console.log(`   projectManager: ${pv?.projectManager?.firstName} ${pv?.projectManager?.lastName}`);
  console.log(`   customer: ${pv?.customer?.name}`);
  console.log(`   All non-null/empty fields:`);
  for (const [k, v] of Object.entries(pv || {}).sort()) {
    if (v !== null && v !== undefined && v !== "" && v !== 0 && v !== false &&
        !['url', 'version', 'changes', 'id'].includes(k)) {
      const vs = JSON.stringify(v);
      if (vs.length < 200) console.log(`     ${k}: ${vs}`);
      else console.log(`     ${k}: ${vs.slice(0, 100)}...`);
    }
  }

  // 3. Employees
  console.log(`\n3. Employees:`);
  const emp1Read = await api("GET", `/employee/${e1}?fields=*`);
  const emp2Read = await api("GET", `/employee/${e2}?fields=*`);
  console.log(`   ${emp1Read.data?.value?.firstName} ${emp1Read.data?.value?.lastName} (id=${e1})`);
  console.log(`   ${emp2Read.data?.value?.firstName} ${emp2Read.data?.value?.lastName} (id=${e2})`);

  // 4. Timesheet summary
  const tsRead = await api("GET", `/timesheet/entry?projectId=${projectId}&count=1000&fields=*,employee(*)`);
  const tsByEmp: Record<string, number> = {};
  for (const e of tsRead.data?.values || []) {
    const key = `${e.employee?.firstName} ${e.employee?.lastName} (id=${e.employee?.id})`;
    tsByEmp[key] = (tsByEmp[key] || 0) + e.hours;
  }
  console.log(`\n4. Timesheet hours:`);
  for (const [name, hours] of Object.entries(tsByEmp)) {
    console.log(`   ${name}: ${hours}h`);
  }

  // 5. Project orderlines (costs)
  const olRead = await api("GET", `/project/orderline?projectId=${projectId}&fields=*`);
  console.log(`\n5. Project orderlines:`);
  for (const ol of olRead.data?.values || []) {
    console.log(`   id=${ol.id} desc="${ol.description}" cost=${ol.unitCostCurrency} vendor=${JSON.stringify(ol.vendor)}`);
  }

  // 6. Supplier invoice check
  const siRead = await api("GET", `/supplierInvoice?invoiceDateFrom=2000-01-01&invoiceDateTo=2026-12-31&supplierId=${supplierId}&fields=*`);
  console.log(`\n6. Supplier invoices for supplier ${supplierId}:`);
  if (siRead.data?.values?.length > 0) {
    for (const si of siRead.data.values) {
      console.log(`   id=${si.id} number=${si.invoiceNumber} amount=${si.amount}`);
    }
  } else {
    console.log(`   NONE FOUND — the project/orderline does NOT create a supplier invoice!`);
  }

  // 7. Customer invoice
  const invRead = await api("GET", `/invoice/${invR.data?.value?.id}?fields=*,customer(*),orders(*,orderLines(*)),projectInvoiceDetails(*)`);
  const iv = invRead.data?.value;
  console.log(`\n7. Invoice:`);
  console.log(`   id=${iv?.id} number=${iv?.invoiceNumber}`);
  console.log(`   customer: ${iv?.customer?.name}`);
  console.log(`   amountExcludingVatCurrency: ${iv?.amountExcludingVatCurrency}`);
  console.log(`   projectInvoiceDetails: ${JSON.stringify(iv?.projectInvoiceDetails)}`);

  // 8. Check project participants
  const partRead = await api("GET", `/project/participant?projectId=${projectId}&fields=*,employee(*)`);
  console.log(`\n8. Project participants:`);
  for (const p of partRead.data?.values || []) {
    console.log(`   id=${p.id} emp=${p.employee?.firstName} ${p.employee?.lastName} (empId=${p.employee?.id}) admin=${p.adminAccess}`);
  }

  console.log("\n\n=== HYPOTHESIS: Scoring may check supplier invoice, not just project orderline ===");
  console.log("=== The project/orderline creates a cost but NOT a supplier invoice object ===");
  console.log("=== If scoring checks /supplierInvoice, it will find nothing ===");
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
