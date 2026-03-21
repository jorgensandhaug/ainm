const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "RfxCaxHgJAU6jo5e2cPD57I5nuP0RWDZuSzt361ICy4";
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
  if (!r.ok) {
    console.error(`${method} ${path} → ${r.status}`, JSON.stringify(json).slice(0, 500));
    throw new Error(`${r.status} ${method} ${path}`);
  }
  console.log(`${method} ${path} → ${r.status}`);
  return json;
}

// Step 1 (3 calls): department + customer + assignable PM
const [deptRes, custRes, pmRes] = await Promise.all([
  api("GET", "/department?isInactive=false&count=1&fields=*"),
  api("POST", "/customer", {
    name: "Brattli AS",
    organizationNumber: "937190808",
  }),
  api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
]);

let deptId: number;
if (deptRes.values && deptRes.values.length > 0) {
  deptId = deptRes.values[0].id;
} else {
  const newDept = await api("POST", "/department", { name: "Avdeling" });
  deptId = newDept.value.id;
}
const customerId = custRes.value.id;
const pmId = pmRes.values[0].id;

// Step 2 (3 calls): 2 employees + project
const [emp1Res, emp2Res, projRes] = await Promise.all([
  api("POST", "/employee", {
    firstName: "Hilde",
    lastName: "Ødegård",
    email: "hilde.degard@example.org",
    dateOfBirth: "1985-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
  }),
  api("POST", "/employee", {
    firstName: "Lars",
    lastName: "Johansen",
    email: "lars.johansen@example.org",
    dateOfBirth: "1985-02-20",
    userType: "NO_ACCESS",
    department: { id: deptId },
  }),
  api("POST", "/project", {
    name: "Dataplattform Brattli",
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 349100,
  }),
]);

const emp1Id = emp1Res.value.id; // Hilde — prosjektleder
const emp2Id = emp2Res.value.id; // Lars — konsulent
const projectId = projRes.value.id;

// Step 3 (3 calls): project activity + 2 participants
const totalHours = 21 + 141; // 162
const [paRes] = await Promise.all([
  api("POST", "/project/projectActivity", {
    project: { id: projectId },
    startDate: TODAY,
    budgetHours: totalHours,
    budgetFeeCurrency: 349100,
    activity: {
      name: "Prosjektaktivitet",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  }),
  api("POST", "/project/participant", {
    project: { id: projectId },
    employee: { id: emp1Id },
    adminAccess: true,
  }),
  api("POST", "/project/participant", {
    project: { id: projectId },
    employee: { id: emp2Id },
    adminAccess: false,
  }),
]);

const activityId = paRes.value.activity.id;

// Build timesheet entries — UTC-safe date arithmetic
function splitHours(empId: number, hours: number, projId: number, actId: number, start: string): any[] {
  const entries: any[] = [];
  const [y, m, d] = start.split("-").map(Number);
  let remaining = hours;
  let offset = 0;
  while (remaining > 0) {
    const h = Math.min(remaining, 24);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    const dateStr = dt.toISOString().slice(0, 10);
    entries.push({
      employee: { id: empId },
      project: { id: projId },
      activity: { id: actId },
      date: dateStr,
      hours: h,
    });
    remaining -= h;
    offset++;
  }
  return entries;
}

const timesheetEntries = [
  ...splitHours(emp1Id, 21, projectId, activityId, TODAY),
  ...splitHours(emp2Id, 141, projectId, activityId, TODAY),
];

// Step 4 (4 calls): timesheet batch + supplier + accounts + voucherType
const [tsRes, suppRes, accRes, vtRes] = await Promise.all([
  api("POST", "/timesheet/entry/list", timesheetEntries),
  api("POST", "/supplier", {
    name: "Lysgård AS",
    organizationNumber: "898870936",
  }),
  api("GET", "/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
  api("GET", "/ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name"),
]);

const suppId = suppRes.value.id;
const accounts = accRes.values as any[];
const acc1920 = accounts.find((a: any) => a.number === 1920);
const acc6590 = accounts.find((a: any) => a.number === 6590);
const acc2400 = accounts.find((a: any) => a.number === 2400);
const voucherTypeId = vtRes.values[0].id;

// Step 5 (3 calls): orderline + voucher + VAT type
const [olRes, vouchRes, vatRes] = await Promise.all([
  api("POST", "/project/orderline", {
    project: { id: projectId },
    description: "Leverandørkostnad fra Lysgård AS",
    date: TODAY,
    count: 1,
    unitCostCurrency: 71800,
    isChargeable: false,
  }),
  api("POST", "/ledger/voucher", {
    date: TODAY,
    description: "Leverandørkostnad fra Lysgård AS",
    voucherType: { id: voucherTypeId },
    postings: [
      {
        row: 1,
        date: TODAY,
        description: "Leverandørkostnad",
        account: { id: acc6590!.id },
        amount: 71800,
        amountCurrency: 71800,
        amountGross: 71800,
        amountGrossCurrency: 71800,
        project: { id: projectId },
      },
      {
        row: 2,
        date: TODAY,
        description: "Leverandørgjeld",
        account: { id: acc2400!.id },
        amount: -71800,
        amountCurrency: -71800,
        amountGross: -71800,
        amountGrossCurrency: -71800,
        supplier: { id: suppId },
      },
    ],
  }),
  api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
]);

// Step 6 (0-1 calls): bank account fix if needed
if (acc1920 && !acc1920.bankAccountNumber) {
  await api("PUT", `/ledger/account/${acc1920.id}`, {
    id: acc1920.id,
    number: acc1920.number,
    name: acc1920.name,
    bankAccountNumber: "12345678903",
  });
}

// Step 7 (1 call): direct invoice
const vatTypeId = vatRes.values.find((v: any) => v.percentage === 25)?.id || vatRes.values[0].id;
const invRes = await api("POST", "/invoice?sendToCustomer=false", {
  invoiceDate: TODAY,
  invoiceDueDate: "2026-04-04",
  customer: { id: customerId },
  orders: [
    {
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: "2026-03-25",
      orderLines: [
        {
          description: "Dataplattform Brattli",
          count: 1,
          unitPriceExcludingVatCurrency: 349100,
          vatType: { id: vatTypeId },
        },
      ],
    },
  ],
});

console.log("\n=== DONE ===");
console.log("Customer:", customerId);
console.log("Employees:", emp1Id, "(Hilde PM)", emp2Id, "(Lars)");
console.log("Project:", projectId, "fixedprice:", projRes.value.fixedprice, "isFixedPrice:", projRes.value.isFixedPrice);
console.log("Activity:", activityId, "budgetHours:", paRes.value.budgetHours);
console.log("Timesheet entries:", tsRes.values?.length);
console.log("Supplier:", suppId);
console.log("Orderline:", olRes.value?.id);
console.log("Voucher:", vouchRes.value?.id);
console.log("Invoice:", invRes.value?.id, "number:", invRes.value?.invoiceNumber);
console.log("Invoice amount excl VAT:", invRes.value?.amountExcludingVatCurrency);
console.log("Project invoice details:", invRes.value?.projectInvoiceDetails?.length);
