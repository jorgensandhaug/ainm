const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";

let callCount = 0;
let errorCount = 0;

async function api(method: string, path: string, body?: any) {
  callCount++;
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
    errorCount++;
    console.error(`[${callCount}] ${method} ${path} → ${r.status}`, JSON.stringify(json).slice(0, 400));
    throw new Error(`${r.status} ${method} ${path}`);
  }
  console.log(`[${callCount}] ${method} ${path} → ${r.status}`);
  return json;
}

// =========================================
// OPTIMIZED 5-STEP FLOW
// =========================================

// STEP 1 (6 parallel): all reads + customer create
console.log("=== STEP 1: Frontloaded reads + customer ===");
const [deptRes, custRes, pmRes, accRes, vtRes, vatRes] = await Promise.all([
  api("GET", "/department?isInactive=false&count=1&fields=*"),
  api("POST", "/customer", { name: "OptFlow Test AS", organizationNumber: "999999999" }),
  api("GET", "/employee?assignableProjectManagers=true&count=1&fields=*"),
  api("GET", "/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
  api("GET", "/ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name"),
  api("GET", `/ledger/vatType?typeOfVat=OUTGOING&vatDate=${TODAY}&fields=*`),
]);

const deptId = deptRes.values[0].id;
const customerId = custRes.value.id;
const pmId = pmRes.values[0].id;
const accounts = accRes.values as any[];
const acc1920 = accounts.find((a: any) => a.number === 1920);
const acc6590 = accounts.find((a: any) => a.number === 6590);
const acc2400 = accounts.find((a: any) => a.number === 2400);
const voucherTypeId = vtRes.values[0].id;
const vatTypeId = vatRes.values.find((v: any) => v.percentage === 25)?.id || vatRes.values[0].id;

// STEP 2 (3-4 parallel): employees + project + bank fix
console.log("\n=== STEP 2: Employees + project + bank fix ===");
const step2Promises: Promise<any>[] = [
  api("POST", "/employee", {
    firstName: "OptFlowPM",
    lastName: "Testsen",
    email: "optflow-pm@example.org",
    dateOfBirth: "1985-01-15",
    userType: "NO_ACCESS",
    department: { id: deptId },
  }),
  api("POST", "/employee", {
    firstName: "OptFlowDev",
    lastName: "Testsen",
    email: "optflow-dev@example.org",
    dateOfBirth: "1985-02-20",
    userType: "NO_ACCESS",
    department: { id: deptId },
  }),
  api("POST", "/project", {
    name: "OptFlow Test Project",
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: pmId },
    isFixedPrice: true,
    fixedprice: 200000,
  }),
];
let bankFixNeeded = false;
if (acc1920 && !acc1920.bankAccountNumber) {
  bankFixNeeded = true;
  step2Promises.push(
    api("PUT", `/ledger/account/${acc1920.id}`, {
      id: acc1920.id,
      number: acc1920.number,
      name: acc1920.name,
      bankAccountNumber: "12345678903",
    })
  );
}
const step2Results = await Promise.all(step2Promises);
const emp1Id = step2Results[0].value.id;
const emp2Id = step2Results[1].value.id;
const projectId = step2Results[2].value.id;

// STEP 3 (3 parallel): projectActivity + 2 participants
console.log("\n=== STEP 3: Activity + participants ===");
const [paRes] = await Promise.all([
  api("POST", "/project/projectActivity", {
    project: { id: projectId },
    startDate: TODAY,
    budgetHours: 50,
    budgetFeeCurrency: 200000,
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

// STEP 4 (3 parallel): timesheet + supplier + orderline
console.log("\n=== STEP 4: Timesheet + supplier + orderline ===");
const timesheetEntries = [
  { employee: { id: emp1Id }, project: { id: projectId }, activity: { id: activityId }, date: TODAY, hours: 21 },
  { employee: { id: emp2Id }, project: { id: projectId }, activity: { id: activityId }, date: TODAY, hours: 24 },
  { employee: { id: emp2Id }, project: { id: projectId }, activity: { id: activityId }, date: "2026-03-23", hours: 5 },
];

const [tsRes, suppRes, olRes] = await Promise.all([
  api("POST", "/timesheet/entry/list", timesheetEntries),
  api("POST", "/supplier", { name: "OptFlow Supplier AS", organizationNumber: "999999999" }),
  api("POST", "/project/orderline", {
    project: { id: projectId },
    description: "Leverandørkostnad fra OptFlow Supplier AS",
    date: TODAY,
    count: 1,
    unitCostCurrency: 50000,
    isChargeable: false,
  }),
]);
const suppId = suppRes.value.id;

// STEP 5 (2 parallel): voucher + invoice
console.log("\n=== STEP 5: Voucher + invoice (PARALLEL) ===");
const [vouchRes, invRes] = await Promise.all([
  api("POST", "/ledger/voucher", {
    date: TODAY,
    description: "Leverandørkostnad fra OptFlow Supplier AS",
    voucherType: { id: voucherTypeId },
    postings: [
      {
        row: 1, date: TODAY, description: "Leverandørkostnad",
        account: { id: acc6590!.id },
        amount: 50000, amountCurrency: 50000, amountGross: 50000, amountGrossCurrency: 50000,
        project: { id: projectId },
      },
      {
        row: 2, date: TODAY, description: "Leverandørgjeld",
        account: { id: acc2400!.id },
        amount: -50000, amountCurrency: -50000, amountGross: -50000, amountGrossCurrency: -50000,
        supplier: { id: suppId },
      },
    ],
  }),
  api("POST", "/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: "2026-04-05",
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: "2026-03-26",
      orderLines: [{
        description: "OptFlow Test Project",
        count: 1,
        unitPriceExcludingVatCurrency: 200000,
        vatType: { id: vatTypeId },
      }],
    }],
  }),
]);

console.log("\n=== RESULTS ===");
console.log(`Total calls: ${callCount}, Errors: ${errorCount}`);
console.log(`Bank fix needed: ${bankFixNeeded}`);
console.log(`Sequential steps: 5`);
console.log(`Project: ${projectId}, fixedprice: ${step2Results[2].value.fixedprice}, isFixedPrice: ${step2Results[2].value.isFixedPrice}`);
console.log(`Activity budgetHours: ${paRes.value.budgetHours}`);
console.log(`Timesheet entries: ${tsRes.values?.length}`);
console.log(`Invoice: ${invRes.value?.id}, amount: ${invRes.value?.amountExcludingVatCurrency}`);
console.log(`Project invoice details: ${invRes.value?.projectInvoiceDetails?.length}`);
console.log(`Voucher: ${vouchRes.value?.id}`);
console.log(`Orderline: ${olRes.value?.id}`);
