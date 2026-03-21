const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "0hPsgxjWKjFmkUAkBkzPBL1htOhfVavdvLNv2ppGtbo";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-21";

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
    console.log("ERROR:", JSON.stringify(json).slice(0, 500));
    throw new Error(`${method} ${path} ${r.status}`);
  }
  if (json.values !== undefined) return json.values;
  if (json.value !== undefined) return json.value;
  return json;
}

// Already created from previous run:
const customerId = 108370935;
const deptId = 938894;

// Step 2: POST employee (Hannah Weber)
const emp1 = await api("POST", "/employee", {
  firstName: "Hannah",
  lastName: "Weber",
  email: "hannah.weber@example.org",
  dateOfBirth: "1988-05-15",
  userType: "NO_ACCESS",
  department: { id: deptId },
  employments: [{ startDate: TODAY }],
});
const emp1Id = emp1.id;
console.log("employee1 (Hannah):", emp1Id);

// Step 3: GET assignable managers + POST employee (Marie Fischer) (parallel)
const [managers, emp2] = await Promise.all([
  api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  api("POST", "/employee", {
    firstName: "Marie",
    lastName: "Fischer",
    email: "marie.fischer@example.org",
    dateOfBirth: "1992-08-22",
    userType: "NO_ACCESS",
    department: { id: deptId },
    employments: [{ startDate: TODAY }],
  }),
]);

const managerId = managers[0]?.id;
const emp2Id = emp2.id;
console.log("manager:", managerId, "employee2 (Marie):", emp2Id);

// Step 4: POST project
const project = await api("POST", "/project", {
  name: "Cloud-Migration Eichenhof",
  startDate: TODAY,
  customer: { id: customerId },
  projectManager: { id: managerId },
});
const projectId = project.id;
console.log("project:", projectId);

// Step 5: POST project activity with budget
const projActivity = await api("POST", "/project/projectActivity", {
  project: { id: projectId },
  startDate: TODAY,
  budgetFeeCurrency: 253000,
  activity: {
    name: "Cloud-Migration Eichenhof",
    activityType: "PROJECT_SPECIFIC_ACTIVITY",
    isChargeable: false,
  },
});
const activityId = projActivity.activity.id;
console.log("projectActivity:", projActivity.id, "activityId:", activityId, "budget:", projActivity.budgetFeeCurrency);

// Step 6: POST timesheet/entry/list + POST supplier (parallel)
function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const chunks: { date: string; hours: number }[] = [];
  let remaining = total;
  const d = new Date(startDate);
  while (remaining > 0) {
    const h = Math.min(remaining, 7.5);
    chunks.push({ date: d.toISOString().slice(0, 10), hours: h });
    remaining -= h;
    d.setDate(d.getDate() + 1);
  }
  return chunks;
}

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

const [tsEntries, supplier] = await Promise.all([
  api("POST", "/timesheet/entry/list", timesheetEntries),
  api("POST", "/supplier", {
    name: "Silberberg GmbH",
    organizationNumber: "823323948",
    isSupplier: true,
  }),
]);

const supplierId = supplier.id;
console.log("timesheet entries:", tsEntries.length, "supplier:", supplierId);
const totalHannah = tsEntries.filter((e: any) => e.employee?.id === emp1Id).reduce((s: number, e: any) => s + e.hours, 0);
const totalMarie = tsEntries.filter((e: any) => e.employee?.id === emp2Id).reduce((s: number, e: any) => s + e.hours, 0);
console.log("Hannah hours:", totalHannah, "Marie hours:", totalMarie);

// Step 7: POST project/orderline + GET vatType + GET bank account (parallel)
const [costLine, vatTypes, bankAccounts] = await Promise.all([
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

console.log("costLine:", costLine.id);

const vat25 = vatTypes.find((v: any) => v.percentage === 25);
console.log("vatType 25%:", vat25?.id);

let bankAccount = bankAccounts.find((a: any) => a.bankAccountNumber);
if (!bankAccount && bankAccounts.length > 0) {
  bankAccount = bankAccounts[0];
  console.log("Bank account needs number, updating:", bankAccount.id);
  bankAccount = await api("PUT", `/ledger/account/${bankAccount.id}`, {
    ...bankAccount,
    bankAccountNumber: "12345678901",
  });
}
console.log("bankAccount:", bankAccount?.id, "number:", bankAccount?.bankAccountNumber);

// Step 9: POST invoice
const dueDate = "2026-04-20";
const invoice = await api("POST", "/invoice?sendToCustomer=false", {
  invoiceDate: TODAY,
  invoiceDueDate: dueDate,
  customer: { id: customerId },
  orders: [{
    customer: { id: customerId },
    project: { id: projectId },
    orderDate: TODAY,
    deliveryDate: TODAY,
    orderLines: [{
      description: "Cloud-Migration Eichenhof - Projektleistungen",
      count: 1,
      unitPriceExcludingVatCurrency: 253000,
      vatType: { id: vat25.id },
    }],
  }],
});

console.log("INVOICE:", JSON.stringify(invoice, null, 2).slice(0, 2000));
console.log("\n=== DONE ===");
console.log("Customer:", customerId);
console.log("Employee Hannah:", emp1Id);
console.log("Employee Marie:", emp2Id);
console.log("Project:", projectId);
console.log("Budget:", 253000);
console.log("Hours Hannah:", totalHannah);
console.log("Hours Marie:", totalMarie);
console.log("Supplier:", supplierId);
console.log("Cost:", 47050);
console.log("Invoice ID:", invoice.id);
console.log("Invoice Number:", invoice.invoiceNumber);
