const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";
const TAG = "lifecycle-sbx-" + Date.now().toString(36);

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: any = {
    method,
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
  };
  if (body) opts.body = JSON.stringify(body);
  const r = await fetch(url, opts);
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`${method} ${path} → ${r.status}`);
  if (r.status >= 400) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 800));
  }
  if (json.values !== undefined) return { _status: r.status, data: json.values };
  if (json.value !== undefined) return { _status: r.status, data: json.value };
  return { _status: r.status, data: json };
}

function addDays(base: string, n: number): string {
  const [y, m, d] = base.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const chunks: { date: string; hours: number }[] = [];
  let remaining = total;
  let dayOffset = 0;
  while (remaining > 0) {
    const h = Math.min(remaining, 7.5);
    chunks.push({ date: addDays(startDate, dayOffset), hours: h });
    remaining = +(remaining - h).toFixed(2);
    dayOffset++;
  }
  return chunks;
}

console.log("=== FULL LIFECYCLE SANDBOX PROOF ===");
console.log("Tag:", TAG);

// Step 1: GET department + GET division + POST customer (parallel)
const [deptRes, divRes, custRes] = await Promise.all([
  api("GET", "/department?isInactive=false&count=1&fields=*"),
  api("GET", "/division?count=1&fields=*"),
  api("POST", "/customer", {
    name: `Eichenhof Sandbox ${TAG}`,
    organizationNumber: "986645888",
    isCustomer: true,
  }),
]);

const deptId = deptRes.data[0]?.id;
const divId = divRes.data[0]?.id;
const customerId = custRes.data.id;
console.log("dept:", deptId, "div:", divId, "customer:", customerId);

if (!deptId) {
  console.log("No department, creating one...");
  const deptCreate = await api("POST", "/department", { name: "Avdeling" });
  console.log("Created department:", deptCreate.data.id);
}

// Build employment row: only include division if it exists
const empRow = (start: string) => {
  const row: any = { startDate: start };
  if (divId) row.division = { id: divId };
  return row;
};

// Step 2: POST employee (Hannah)
const emp1Res = await api("POST", "/employee", {
  firstName: "Hannah",
  lastName: `Weber ${TAG}`,
  email: `hannah.${TAG}@example.org`,
  dateOfBirth: "1988-05-15",
  userType: "NO_ACCESS",
  department: { id: deptId },
  employments: [empRow(TODAY)],
});
const emp1Id = emp1Res.data.id;
console.log("emp1 (Hannah):", emp1Id, "status:", emp1Res._status);

// Step 3: GET assignable managers + POST employee (Marie) (parallel)
const [mgrRes, emp2Res] = await Promise.all([
  api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  api("POST", "/employee", {
    firstName: "Marie",
    lastName: `Fischer ${TAG}`,
    email: `marie.${TAG}@example.org`,
    dateOfBirth: "1992-08-22",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [empRow(TODAY)],
  }),
]);

const managerId = mgrRes.data[0]?.id;
const emp2Id = emp2Res.data.id;
console.log("manager:", managerId, "emp2 (Marie):", emp2Id);

// Step 4: POST project
const projRes = await api("POST", "/project", {
  name: `Cloud-Migration ${TAG}`,
  startDate: TODAY,
  customer: { id: customerId },
  projectManager: { id: managerId },
});
const projectId = projRes.data.id;
console.log("project:", projectId);

// Step 5: POST project activity with budget
const actRes = await api("POST", "/project/projectActivity", {
  project: { id: projectId },
  startDate: TODAY,
  budgetFeeCurrency: 253000,
  activity: {
    name: `Cloud-Migration ${TAG}`,
    activityType: "PROJECT_SPECIFIC_ACTIVITY",
    isChargeable: false,
  },
});
const activityId = actRes.data.activity?.id;
console.log("projectActivity:", actRes.data.id, "activityId:", activityId, "budget:", actRes.data.budgetFeeCurrency);

// Step 6: POST timesheet/entry/list + POST supplier (parallel)
const hannahChunks = splitHours(34, TODAY);
const marieChunks = splitHours(118, TODAY);

const timesheetEntries = [
  ...hannahChunks.map(c => ({
    employee: { id: emp1Id },
    project: { id: projectId },
    activity: { id: activityId },
    date: c.date,
    hours: c.hours,
  })),
  ...marieChunks.map(c => ({
    employee: { id: emp2Id },
    project: { id: projectId },
    activity: { id: activityId },
    date: c.date,
    hours: c.hours,
  })),
];

console.log("Timesheet entries count:", timesheetEntries.length);

const [tsRes, supRes] = await Promise.all([
  api("POST", "/timesheet/entry/list", timesheetEntries),
  api("POST", "/supplier", {
    name: `Silberberg Sandbox ${TAG}`,
    organizationNumber: "823323948",
    isSupplier: true,
  }),
]);

console.log("timesheet:", tsRes._status, "entries:", Array.isArray(tsRes.data) ? tsRes.data.length : "N/A");
console.log("supplier:", supRes._status, supRes.data?.id);

if (tsRes._status === 201 && Array.isArray(tsRes.data)) {
  const totalH = tsRes.data.filter((e: any) => e.employee?.id === emp1Id).reduce((s: number, e: any) => s + e.hours, 0);
  const totalM = tsRes.data.filter((e: any) => e.employee?.id === emp2Id).reduce((s: number, e: any) => s + e.hours, 0);
  console.log("Hannah hours:", totalH, "Marie hours:", totalM);
}

// Step 7: POST project/orderline + GET vatType + GET bank account (parallel)
const [costRes, vatRes, bankRes] = await Promise.all([
  api("POST", "/project/orderline", {
    project: { id: projectId },
    description: "Lieferantenkosten Silberberg GmbH",
    date: TODAY,
    count: 1,
    unitCostCurrency: 47050,
    isChargeable: false,
  }),
  api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
  api("GET", "/ledger/account?isBankAccount=true&fields=*"),
]);

console.log("costLine:", costRes._status, costRes.data?.id);

const vat25 = vatRes.data.find((v: any) => v.percentage === 25);
console.log("vatType 25%:", vat25?.id);

let bankAccount = bankRes.data.find((a: any) => a.bankAccountNumber);
console.log("Bank accounts found:", bankRes.data.length);
if (bankAccount) {
  console.log("Bank account with number:", bankAccount.id, bankAccount.bankAccountNumber);
} else {
  console.log("No bank account with number. First bank account:", bankRes.data[0]?.id, bankRes.data[0]?.number);
  // Step 8: PUT with valid MOD11 number
  const acctToUpdate = bankRes.data[0];
  const putRes = await api("PUT", `/ledger/account/${acctToUpdate.id}`, {
    ...acctToUpdate,
    bankAccountNumber: "12345678903",
  });
  console.log("Bank account PUT:", putRes._status, putRes.data?.bankAccountNumber);
  bankAccount = putRes.data;
}

// Step 9: POST invoice
const dueDate = "2026-04-20";
const invRes = await api("POST", "/invoice?sendToCustomer=false", {
  invoiceDate: TODAY,
  invoiceDueDate: dueDate,
  customer: { id: customerId },
  orders: [{
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Cloud-Migration - Projektleistungen",
      count: 1,
      unitPriceExcludingVatCurrency: 253000,
      vatType: { id: vat25.id },
    }],
  }],
});

console.log("Invoice:", invRes._status);
if (invRes._status === 201) {
  console.log("Invoice ID:", invRes.data.id);
  console.log("Invoice Number:", invRes.data.invoiceNumber);
  console.log("Amount excl VAT:", invRes.data.amountExcludingVatCurrency);
  console.log("Amount incl VAT:", invRes.data.amountRoundoffCurrency !== undefined ? invRes.data.amount : "N/A");
  console.log("projectInvoiceDetails:", JSON.stringify(invRes.data.projectInvoiceDetails)?.slice(0, 500));
} else {
  console.log("Invoice body:", JSON.stringify(invRes.data).slice(0, 1000));
}

// Count total calls
let callCount = 3; // step 1
callCount += 1; // step 2
callCount += 2; // step 3
callCount += 1; // step 4
callCount += 1; // step 5
callCount += 2; // step 6
callCount += 3; // step 7
if (!bankRes.data.find((a: any) => a.bankAccountNumber)) callCount += 1; // step 8
callCount += 1; // step 9
console.log("\n=== TOTAL API CALLS:", callCount, "===");
