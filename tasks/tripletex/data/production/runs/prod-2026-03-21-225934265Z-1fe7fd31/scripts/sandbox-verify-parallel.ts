// Verify the optimized 4-step parallel layout for create-from-scratch variant
// Key claim: timesheet + invoice can run in parallel (step 4)
// Also: vatType + account can be moved to step 1 (no deps)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const UID = Date.now();

let callCount = 0;
async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { "Authorization": AUTH, "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  callCount++;
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (!r.ok) {
    console.error(`[${callCount}] ${method} ${path} → ${r.status}`, JSON.stringify(json).slice(0, 500));
    throw new Error(`${r.status} ${method} ${path}`);
  }
  console.log(`[${callCount}] ${method} ${path} → ${r.status}`);
  return json;
}

// ── Step 1: parallel (5 calls) — dept, customer, PM, vatType, account ──
const [deptRes, custRes, pmRes, vatRes, accRes] = await Promise.all([
  api("GET", "/department?isInactive=false&count=1&fields=*"),
  api("POST", "/customer", {
    name: `Sandbox Verify ${UID} GmbH`,
    organizationNumber: "839389701",
  }),
  api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
  api("GET", "/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber"),
]);

const deptId = deptRes.values[0].id;
const customerId = custRes.value.id;
const pmId = pmRes.values[0].id;
const vatTypeId = vatRes.values[0].id;
let bankAcc = accRes.values?.find((a: any) => a.number === 1920);
console.log(`dept=${deptId} customer=${customerId} pm=${pmId} vat=${vatTypeId} bankAcc=${bankAcc?.id} bankNum=${bankAcc?.bankAccountNumber}`);

// ── Step 2: parallel (2 calls) — employee + project ──
const totalHours = 33;
const rate = 900;
const budget = totalHours * rate; // 29700

const [empRes, projRes] = await Promise.all([
  api("POST", "/employee", {
    firstName: "Sandbox",
    lastName: `Verify ${UID}`,
    email: `sandbox.verify.${UID}@example.org`,
    dateOfBirth: "1985-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
  }),
  api("POST", "/project", {
    name: `Datenmigration ${UID}`,
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: budget,
  }),
]);

const empId = empRes.value.id;
const projectId = projRes.value.id;
console.log(`emp=${empId} project=${projectId}`);

// ── Step 3: parallel (2-3 calls) — activity + participant + optional bank fix ──
const step3Calls: Promise<any>[] = [
  api("POST", "/project/projectActivity", {
    project: { id: projectId },
    startDate: TODAY,
    budgetHours: totalHours,
    budgetFeeCurrency: budget,
    activity: {
      name: "Testing",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  }),
  api("POST", "/project/participant", {
    project: { id: projectId },
    employee: { id: empId },
    adminAccess: false,
  }),
];

// Bank fix if needed (runs in parallel with activity + participant)
if (bankAcc && !bankAcc.bankAccountNumber) {
  step3Calls.push(api("PUT", `/ledger/account/${bankAcc.id}`, {
    id: bankAcc.id,
    number: bankAcc.number,
    name: bankAcc.name,
    bankAccountNumber: "12345678903",
  }));
}

const step3Results = await Promise.all(step3Calls);
const actRes = step3Results[0];
const activityId = actRes.value.activity.id;
console.log(`activity=${activityId}`);

// ── Step 4: parallel (2 calls) — timesheet + invoice ──
// KEY CLAIM: invoice does NOT depend on timesheet entries existing
function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const entries: { date: string; hours: number }[] = [];
  const [y, m, d] = startDate.split("-").map(Number);
  let remaining = total;
  let offset = 0;
  while (remaining > 0) {
    const chunk = Math.min(remaining, 24);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    entries.push({ date: dt.toISOString().slice(0, 10), hours: chunk });
    remaining -= chunk;
    offset++;
  }
  return entries;
}

const chunks = splitHours(totalHours, TODAY);
const tsEntries = chunks.map(c => ({
  employee: { id: empId },
  project: { id: projectId },
  activity: { id: activityId },
  date: c.date,
  hours: c.hours,
}));

const [tsRes, invoiceRes] = await Promise.all([
  api("POST", "/timesheet/entry/list", tsEntries),
  api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-05",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: `Testing – Datenmigration (${totalHours}h × ${rate} NOK)`,
        count: totalHours,
        unitPriceExcludingVatCurrency: rate,
        vatType: { id: vatTypeId },
      }],
    }],
  }),
]);

console.log(`\n=== RESULTS ===`);
console.log(`Timesheet entries: ${tsRes.count}`);
tsRes.values.forEach((e: any) => console.log(`  entry: date=${e.date} hours=${e.hours}`));
console.log(`Invoice id: ${invoiceRes.value.id}`);
console.log(`Invoice amount: ${invoiceRes.value.amountExcludingVatCurrency}`);
console.log(`Invoice projectInvoiceDetails: ${invoiceRes.value.projectInvoiceDetails?.length}`);
console.log(`\nTotal calls: ${callCount}`);
console.log(`Sequential steps: 4`);
console.log(`Errors: 0`);
