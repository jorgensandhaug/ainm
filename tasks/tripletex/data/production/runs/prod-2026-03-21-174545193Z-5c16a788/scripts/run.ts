const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "iq3Pp1Tts6lwgI6-mF8c7dLeBZyZpzFfhGrPoFyzKsc";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

async function get(p: string) {
  const r = await fetch(`${BASE}${p}`, { headers: H });
  const b = await r.json();
  if (!r.ok) { console.error(`GET ${p} → ${r.status}:`, JSON.stringify(b)); throw new Error(`GET ${p} ${r.status}`); }
  return b;
}
async function post(p: string, body: any) {
  const r = await fetch(`${BASE}${p}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.error(`POST ${p} → ${r.status}:`, JSON.stringify(b)); throw new Error(`POST ${p} ${r.status}`); }
  return b;
}
async function put(p: string, body: any) {
  const r = await fetch(`${BASE}${p}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { console.error(`PUT ${p} → ${r.status}:`, JSON.stringify(b)); throw new Error(`PUT ${p} ${r.status}`); }
  return b;
}

function splitHours(total: number, start: string): { date: string; hours: number }[] {
  const out: { date: string; hours: number }[] = [];
  let rem = total;
  const d = new Date(start + "T00:00:00");
  while (rem > 0) {
    const h = Math.min(rem, 7.5);
    out.push({ date: d.toISOString().slice(0, 10), hours: h });
    rem -= h;
    d.setDate(d.getDate() + 1);
  }
  return out;
}

async function main() {
  const today = "2026-03-21";

  // Step 1: dept + div + customer (parallel)
  const [deptR, divR, custR] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/division?count=1&fields=*"),
    post("/customer", { name: "Havbris AS", organizationNumber: "851704027", isCustomer: true }),
  ]);
  let deptId = deptR.values?.[0]?.id;
  const divId = divR.values?.[0]?.id;
  const custId = custR.value.id;
  console.log("cust:", custId, "dept:", deptId, "div:", divId);

  if (!deptId) {
    const nd = await post("/department", { name: "Avdeling" });
    deptId = nd.value.id;
    console.log("created dept:", deptId);
  }

  // Step 2: employee 1 (Sigurd Berg)
  const empBase = (fn: string, ln: string, email: string, dob: string) => ({
    firstName: fn, lastName: ln, email, dateOfBirth: dob, userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{ startDate: today, ...(divId ? { division: { id: divId } } : {}) }],
  });
  const e1R = await post("/employee", empBase("Sigurd", "Berg", "sigurd.berg@example.org", "1985-06-15"));
  const e1 = e1R.value.id;
  console.log("emp1 Sigurd:", e1);

  // Step 3: assignable manager + employee 2 (Marte Johansen) (parallel)
  const [mgrR, e2R] = await Promise.all([
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    post("/employee", empBase("Marte", "Johansen", "marte.johansen@example.org", "1990-03-22")),
  ]);
  const mgrId = mgrR.values[0].id;
  const e2 = e2R.value.id;
  console.log("mgr:", mgrId, "emp2 Marte:", e2);

  // Step 4: project
  const projR = await post("/project", {
    name: "ERP-implementering Havbris", startDate: today,
    customer: { id: custId }, projectManager: { id: mgrId },
  });
  const projId = projR.value.id;
  console.log("project:", projId);

  // Step 5: project activity with budget
  const actR = await post("/project/projectActivity", {
    project: { id: projId }, startDate: today, budgetFeeCurrency: 418100,
    activity: { name: "Prosjektaktivitet", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false },
  });
  const actId = actR.value.activity.id;
  console.log("activity:", actId, "budget:", actR.value.budgetFeeCurrency);

  // Step 6: timesheet batch + supplier (parallel)
  const s1 = splitHours(75, today);
  const s2 = splitHours(47, today);
  const entries = [
    ...s1.map(c => ({ employee: { id: e1 }, project: { id: projId }, activity: { id: actId }, date: c.date, hours: c.hours })),
    ...s2.map(c => ({ employee: { id: e2 }, project: { id: projId }, activity: { id: actId }, date: c.date, hours: c.hours })),
  ];

  const [tsR, supR] = await Promise.all([
    post("/timesheet/entry/list", entries),
    post("/supplier", { name: "Lysgård AS", organizationNumber: "964716188", isSupplier: true }),
  ]);
  console.log("timesheet:", tsR.values?.length, "entries");
  console.log("supplier:", supR.value.id);

  // Step 7: orderline + vatType + bank account (parallel)
  const [olR, vatR, bankR] = await Promise.all([
    post("/project/orderline", {
      project: { id: projId }, description: "Leverandørkostnad Lysgård AS",
      date: today, count: 1, unitCostCurrency: 56200, isChargeable: false,
    }),
    get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${today}&fields=*`),
    get("/ledger/account?isBankAccount=true&fields=*"),
  ]);
  console.log("orderline:", olR.value.id);
  const vatId = vatR.values[0].id;
  const bank = bankR.values[0];
  console.log("vat:", vatId, "bank:", bank.id, "num:", bank.bankAccountNumber);

  // Step 8: fix bank account if needed
  if (!bank.bankAccountNumber) {
    await put(`/ledger/account/${bank.id}`, {
      id: bank.id, number: bank.number, name: bank.name, bankAccountNumber: "12345678903",
    });
    console.log("fixed bank account");
  }

  // Step 9: invoice
  const invR = await post("/invoice?sendToCustomer=false", {
    invoiceDate: today, invoiceDueDate: "2026-04-20",
    customer: { id: custId },
    orders: [{
      customer: { id: custId }, project: { id: projId },
      orderDate: today, deliveryDate: today,
      orderLines: [{
        description: "ERP-implementering Havbris", count: 1,
        unitPriceExcludingVatCurrency: 418100, vatType: { id: vatId },
      }],
    }],
  });
  console.log("invoice:", invR.value.id, "num:", invR.value.invoiceNumber);
  console.log("amount:", invR.value.amountExcludingVatCurrency);
  console.log("projDetails:", invR.value.projectInvoiceDetails?.length);
  console.log("DONE");
}

main().catch(e => { console.error(e); process.exit(1); });
