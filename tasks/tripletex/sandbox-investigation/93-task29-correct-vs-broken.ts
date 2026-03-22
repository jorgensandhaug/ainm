// Task 29: Create CORRECT lifecycle following trusted standard exactly
// Then compare all scorer-visible fields vs the BAD lifecycle

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const TODAY = "2026-03-22";
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${JSON.stringify(b).slice(0, 200)}`);
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) throw new Error(`POST ${path} ${r.status}: ${JSON.stringify(b).slice(0, 200)}`);
  return b;
}

function splitHours(total: number, startDate: string): { date: string; hours: number }[] {
  const chunks: { date: string; hours: number }[] = [];
  const [y, m, d] = startDate.split("-").map(Number);
  let remaining = total;
  let offset = 0;
  while (remaining > 0) {
    const hrs = Math.min(remaining, 7.5);
    const dt = new Date(Date.UTC(y, m - 1, d + offset));
    chunks.push({ date: dt.toISOString().slice(0, 10), hours: hrs });
    remaining -= hrs;
    offset++;
  }
  return chunks;
}

async function createLifecycle(label: string, opts: {
  isFixedPrice: boolean;
  fixedprice: number;
  budgetHours: number;
  pmAdminAccess: boolean;
  includeOrderline: boolean;
  includeVoucher: boolean;
}) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Creating ${label} lifecycle`);
  console.log(`Options: ${JSON.stringify(opts)}`);
  console.log(`${"=".repeat(60)}`);

  const BUDGET = 396900;
  const PM_HOURS = 74;
  const CONSULTANT_HOURS = 85;
  const SUPPLIER_COST = 56750;

  // Step 1: Reads
  const [deptRes, pmRes, acctRes, vtRes, vatRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    get("/ledger/account?number=6590,2400&fields=id,number,name"),
    get("/ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id,name,percentage"),
  ]);

  const deptId = deptRes.values?.[0]?.id;
  const pmAssignableId = pmRes.values[0].id;
  const acc6590 = acctRes.values.find((a: any) => a.number === 6590);
  const acc2400 = acctRes.values.find((a: any) => a.number === 2400);
  const vtId = vtRes.values?.[0]?.id;
  const vatType = vatRes.values?.[0];

  // Step 2: Customer + Employees
  const custRes = await post("/customer", {
    name: `Northwave Ltd ${label}`,
    organizationNumber: "932075482",
    isCustomer: true,
  });
  const customerId = custRes.value.id;

  const empBatchRes = await post("/employee/list", [
    { firstName: "Samuel", lastName: "Brown", email: `samuel.brown-${label}@example.org`, dateOfBirth: "1985-06-15", userType: "NO_ACCESS", department: { id: deptId } },
    { firstName: "Sarah", lastName: "Lewis", email: `sarah.lewis-${label}@example.org`, dateOfBirth: "1990-03-22", userType: "NO_ACCESS", department: { id: deptId } },
  ]);
  const emp1Id = empBatchRes.values[0].id;
  const emp2Id = empBatchRes.values[1].id;

  // Step 3: Project
  const projPayload: any = {
    name: `Cloud Migration ${label}`,
    startDate: TODAY,
    customer: { id: customerId },
    projectManager: { id: pmAssignableId },
  };
  if (opts.isFixedPrice) {
    projPayload.isFixedPrice = true;
    projPayload.fixedprice = opts.fixedprice || BUDGET;
  }
  const projRes = await post("/project", projPayload);
  const projectId = projRes.value.id;
  console.log(`  Project ${projectId}: isFixedPrice=${projRes.value.isFixedPrice}, fixedprice=${projRes.value.fixedprice}`);

  // Step 4: Activity + Participants
  const actPayload: any = {
    project: { id: projectId },
    startDate: TODAY,
    budgetFeeCurrency: BUDGET,
    activity: {
      name: "Prosjektaktivitet",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  };
  if (opts.budgetHours > 0) {
    actPayload.budgetHours = opts.budgetHours;
  }

  const [actRes, partRes] = await Promise.all([
    post("/project/projectActivity", actPayload),
    post("/project/participant/list", [
      { project: { id: projectId }, employee: { id: emp1Id }, adminAccess: opts.pmAdminAccess },
      { project: { id: projectId }, employee: { id: emp2Id }, adminAccess: false },
    ]),
  ]);
  const activityId = actRes.value.activity.id;
  console.log(`  Activity ${activityId}: budgetHours=${actRes.value.budgetHours}`);

  // Step 5: Timesheet + Supplier + Orderline
  const entries1 = splitHours(PM_HOURS, TODAY).map(e => ({
    employee: { id: emp1Id }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours,
  }));
  const entries2 = splitHours(CONSULTANT_HOURS, TODAY).map(e => ({
    employee: { id: emp2Id }, project: { id: projectId }, activity: { id: activityId }, date: e.date, hours: e.hours,
  }));

  const parallelCalls: Promise<any>[] = [
    post("/timesheet/entry/list", [...entries1, ...entries2]),
    post("/supplier", { name: `Clearwater Ltd ${label}`, organizationNumber: "889264985", isSupplier: true }),
  ];
  if (opts.includeOrderline) {
    parallelCalls.push(post("/project/orderline", {
      project: { id: projectId },
      description: "Leverandørkostnad",
      date: TODAY,
      count: 1,
      unitCostCurrency: SUPPLIER_COST,
      isChargeable: false,
    }));
  }

  const step5Results = await Promise.all(parallelCalls);
  const suppId = step5Results[1].value.id;
  console.log(`  Timesheet entries: ${step5Results[0].values?.length}`);
  console.log(`  Supplier: ${suppId}`);
  if (opts.includeOrderline) {
    console.log(`  Orderline: ${step5Results[2].value.id} unitCost=${step5Results[2].value.unitCostCurrency}`);
  }

  // Step 6: Voucher + Invoice
  const dueDate = new Date(Date.UTC(2026, 2, 22 + 14)).toISOString().slice(0, 10);
  const step6Calls: Promise<any>[] = [];

  if (opts.includeVoucher) {
    step6Calls.push(post("/ledger/voucher", {
      date: TODAY,
      description: "Leverandørkostnad",
      voucherType: { id: vtId },
      postings: [
        { row: 1, date: TODAY, description: "Leverandørkostnad", account: { id: acc6590.id }, amount: SUPPLIER_COST, amountCurrency: SUPPLIER_COST, amountGross: SUPPLIER_COST, amountGrossCurrency: SUPPLIER_COST, project: { id: projectId } },
        { row: 2, date: TODAY, description: "Leverandørgjeld", account: { id: acc2400.id }, amount: -SUPPLIER_COST, amountCurrency: -SUPPLIER_COST, amountGross: -SUPPLIER_COST, amountGrossCurrency: -SUPPLIER_COST, supplier: { id: suppId } },
      ],
    }));
  }

  step6Calls.push(post("/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: dueDate,
    customer: { id: customerId },
    orders: [{
      customer: { id: customerId },
      project: { id: projectId },
      orderDate: TODAY,
      deliveryDate: TODAY,
      orderLines: [{
        description: `Cloud Migration ${label}`,
        count: 1,
        unitPriceExcludingVatCurrency: BUDGET,
        vatType: { id: vatType.id },
      }],
    }],
  }));

  const step6Results = await Promise.all(step6Calls);
  const invoiceRes = step6Results[step6Results.length - 1];
  console.log(`  Invoice: ${invoiceRes.value.id} amount=${invoiceRes.value.amountExcludingVatCurrency}`);

  // ====== VERIFY ALL SCORER-VISIBLE FIELDS ======
  console.log(`\n--- Verification for ${label} ---`);

  const proj = await get(`/project/${projectId}?fields=*,projectActivities(*),participants(employee(*),adminAccess)`);
  const pv = proj.value;

  console.log(`PROJECT:`);
  console.log(`  name: ${pv.name}`);
  console.log(`  isFixedPrice: ${pv.isFixedPrice}`);
  console.log(`  fixedprice: ${pv.fixedprice}`);
  console.log(`  invoiceReserveTotalAmountCurrency: ${pv.invoiceReserveTotalAmountCurrency}`);
  console.log(`  numberOfProjectParticipants: ${pv.numberOfProjectParticipants}`);
  console.log(`  projectManager.id: ${pv.projectManager?.id}`);

  console.log(`ACTIVITIES:`);
  for (const a of pv.projectActivities || []) {
    console.log(`  budgetHours: ${a.budgetHours}`);
    console.log(`  budgetFeeCurrency: ${a.budgetFeeCurrency}`);
  }

  console.log(`PARTICIPANTS:`);
  for (const pp of pv.participants || []) {
    console.log(`  ${pp.employee?.firstName} ${pp.employee?.lastName} (${pp.employee?.email}) adminAccess=${pp.adminAccess}`);
  }

  // Timesheet totals
  const ts = await get(`/timesheet/entry?projectId=${projectId}&dateFrom=${TODAY}&dateTo=2026-06-30&fields=employee(id),hours&count=200`);
  const byEmp: Record<number, number> = {};
  for (const te of ts.values || []) {
    byEmp[te.employee?.id] = (byEmp[te.employee?.id] || 0) + te.hours;
  }
  console.log(`TIMESHEET:`);
  console.log(`  emp1 (${emp1Id}): ${byEmp[emp1Id]} hours`);
  console.log(`  emp2 (${emp2Id}): ${byEmp[emp2Id]} hours`);
  console.log(`  total: ${Object.values(byEmp).reduce((a, b) => a + b, 0)} hours`);

  // Orderlines
  const ol = await get(`/project/orderline?projectId=${projectId}&count=50&fields=*`);
  console.log(`ORDERLINES:`);
  for (const o of ol.values || []) {
    console.log(`  ${o.id}: ${o.description} unitCost=${o.unitCostCurrency} count=${o.count}`);
  }
  if (!ol.values?.length) console.log(`  (none)`);

  // Invoice
  const inv = await get(`/invoice/${invoiceRes.value.id}?fields=*`);
  console.log(`INVOICE:`);
  console.log(`  amountExcludingVat: ${inv.value.amountExcludingVatCurrency}`);
  console.log(`  amount: ${inv.value.amount}`);
  console.log(`  customer.id: ${inv.value.customer?.id}`);

  return { projectId, customerId, emp1Id, emp2Id, suppId, invoiceId: invoiceRes.value.id };
}

async function main() {
  // CORRECT lifecycle (following trusted standard)
  const correct = await createLifecycle("CORRECT", {
    isFixedPrice: true,
    fixedprice: 396900,
    budgetHours: 159, // 74 + 85
    pmAdminAccess: true,
    includeOrderline: true,
    includeVoucher: true,
  });

  // BAD lifecycle (production approach, missing 4 fixes)
  const bad = await createLifecycle("BAD", {
    isFixedPrice: false,
    fixedprice: 0,
    budgetHours: 0,
    pmAdminAccess: false,
    includeOrderline: false,
    includeVoucher: true,
  });

  console.log("\n\n=== COMPARISON SUMMARY ===");
  console.log("Field                              CORRECT           BAD");
  console.log("------------------------------------------------------------");
  console.log("(Compare the verification output above)");
}

main().catch((e) => { console.error("FATAL:", e.message); process.exit(1); });
