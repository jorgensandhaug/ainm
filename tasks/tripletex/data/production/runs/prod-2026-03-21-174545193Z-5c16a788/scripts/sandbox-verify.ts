// Sandbox verification: full 14-call lifecycle path with correct UTC date splitting
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

let callCount = 0;
let errorCount = 0;

async function get(p: string) {
  callCount++;
  const r = await fetch(`${BASE}${p}`, { headers: H });
  const b = await r.json();
  console.log(`[${callCount}] GET ${p} → ${r.status}`);
  if (!r.ok) { errorCount++; console.error(JSON.stringify(b)); throw new Error(`GET ${p} ${r.status}`); }
  return b;
}
async function post(p: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${p}`, { method: "POST", headers: H, body: JSON.stringify(body) });
  const b = await r.json();
  console.log(`[${callCount}] POST ${p} → ${r.status}`);
  if (!r.ok) { errorCount++; console.error(JSON.stringify(b)); throw new Error(`POST ${p} ${r.status}`); }
  return b;
}
async function put(p: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${p}`, { method: "PUT", headers: H, body: JSON.stringify(body) });
  const b = await r.json();
  console.log(`[${callCount}] PUT ${p} → ${r.status}`);
  if (!r.ok) { errorCount++; console.error(JSON.stringify(b)); throw new Error(`PUT ${p} ${r.status}`); }
  return b;
}

// CORRECT: UTC-safe date arithmetic
function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return dt.toISOString().slice(0, 10);
}

function splitHours(total: number, start: string): { date: string; hours: number }[] {
  const out: { date: string; hours: number }[] = [];
  let rem = total;
  let day = 0;
  while (rem > 0) {
    const h = Math.min(rem, 7.5);
    out.push({ date: addDays(start, day), hours: h });
    rem -= h;
    day++;
  }
  return out;
}

const uid = Math.floor(Math.random() * 100000000);

async function main() {
  const today = "2026-03-21";

  // Step 1 (3 calls): dept + div + customer
  const [deptR, divR, custR] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/division?count=1&fields=*"),
    post("/customer", { name: `SandboxVerify ${uid} AS`, organizationNumber: "851704027", isCustomer: true }),
  ]);
  let deptId = deptR.values?.[0]?.id;
  const divId = divR.values?.[0]?.id;
  const custId = custR.value.id;
  console.log("  cust:", custId, "dept:", deptId, "div:", divId);

  if (!deptId) {
    const nd = await post("/department", { name: "Avdeling" });
    deptId = nd.value.id;
  }

  // Step 2 (1 call): employee 1
  const empBase = (fn: string, ln: string, email: string, dob: string) => ({
    firstName: fn, lastName: ln, email, dateOfBirth: dob, userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{ startDate: today, ...(divId ? { division: { id: divId } } : {}) }],
  });
  const e1R = await post("/employee", empBase("Sigurd", "Berg", `sigurd${uid}@example.org`, "1985-06-15"));
  const e1 = e1R.value.id;

  // Step 3 (2 calls): mgr + employee 2
  const [mgrR, e2R] = await Promise.all([
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    post("/employee", empBase("Marte", "Johansen", `marte${uid}@example.org`, "1990-03-22")),
  ]);
  const mgrId = mgrR.values[0].id;
  const e2 = e2R.value.id;

  // Step 4 (1 call): project
  const projR = await post("/project", {
    name: `ERP-implementering SandboxVerify ${uid}`, startDate: today,
    customer: { id: custId }, projectManager: { id: mgrId },
  });
  const projId = projR.value.id;

  // Step 5 (1 call): project activity with budget
  const actR = await post("/project/projectActivity", {
    project: { id: projId }, startDate: today, budgetFeeCurrency: 418100,
    activity: { name: "Prosjektaktivitet", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false },
  });
  const actId = actR.value.activity.id;
  console.log("  activity:", actId, "budget:", actR.value.budgetFeeCurrency);

  // Step 6 (2 calls): timesheet batch + supplier
  const s1 = splitHours(75, today);
  const s2 = splitHours(47, today);
  console.log("  Sigurd first date:", s1[0].date, "last:", s1[s1.length-1].date);
  console.log("  Marte first date:", s2[0].date, "last:", s2[s2.length-1].date);

  const entries = [
    ...s1.map(c => ({ employee: { id: e1 }, project: { id: projId }, activity: { id: actId }, date: c.date, hours: c.hours })),
    ...s2.map(c => ({ employee: { id: e2 }, project: { id: projId }, activity: { id: actId }, date: c.date, hours: c.hours })),
  ];

  const [tsR, supR] = await Promise.all([
    post("/timesheet/entry/list", entries),
    post("/supplier", { name: `Lysgård ${uid} AS`, organizationNumber: "964716188", isSupplier: true }),
  ]);
  console.log("  timesheet entries:", tsR.values?.length);

  // Step 7 (3 calls): orderline + vatType + bank account
  const [olR, vatR, bankR] = await Promise.all([
    post("/project/orderline", {
      project: { id: projId }, description: "Leverandørkostnad",
      date: today, count: 1, unitCostCurrency: 56200, isChargeable: false,
    }),
    get(`/ledger/vatType?typeOfVat=OUTGOING&vatDate=${today}&fields=*`),
    get("/ledger/account?isBankAccount=true&fields=*"),
  ]);
  const vatId = vatR.values[0].id;
  const bank = bankR.values[0];
  console.log("  vat:", vatId, "bank:", bank.id, "num:", bank.bankAccountNumber);

  // Step 8: fix bank if needed
  if (!bank.bankAccountNumber) {
    await put(`/ledger/account/${bank.id}`, {
      id: bank.id, number: bank.number, name: bank.name, bankAccountNumber: "12345678903",
    });
    console.log("  fixed bank account");
  }

  // Step 9 (1 call): invoice
  const invR = await post("/invoice?sendToCustomer=false", {
    invoiceDate: today, invoiceDueDate: "2026-04-20",
    customer: { id: custId },
    orders: [{
      customer: { id: custId }, project: { id: projId },
      orderDate: today, deliveryDate: today,
      orderLines: [{
        description: "ERP-implementering", count: 1,
        unitPriceExcludingVatCurrency: 418100, vatType: { id: vatId },
      }],
    }],
  });
  console.log("  invoice:", invR.value.id, "num:", invR.value.invoiceNumber);
  console.log("  amount:", invR.value.amountExcludingVatCurrency);
  console.log("  projDetails:", invR.value.projectInvoiceDetails?.length);

  console.log(`\n=== RESULT: ${callCount} API calls, ${errorCount} errors ===`);
}

main().catch(e => { console.error(e); process.exit(1); });
