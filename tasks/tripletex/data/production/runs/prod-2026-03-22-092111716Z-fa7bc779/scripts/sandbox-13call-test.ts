// End-to-end test: 13-call flow (hardcoded vatType=3 instead of GET)
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");

const PROJECT_NAME = "Test13Call Prosjekt";
const CUST_NAME    = "TestKunde AS";
const CUST_ORG     = "999888777";
const BUDGET       = 100000;
const PM_FIRST     = "TestPM";
const PM_LAST      = "Testson";
const PM_EMAIL     = "testpm13@test.org";
const PM_HOURS     = 10;
const CON_FIRST    = "TestCon";
const CON_LAST     = "Testson";
const CON_EMAIL    = "testcon13@test.org";
const CON_HOURS    = 15;
const SUPP_NAME    = "TestLev AS";
const SUPP_ORG     = "888777666";
const SUPP_COST    = 20000;

const TOTAL_HOURS = PM_HOURS + CON_HOURS;
const TODAY = new Date().toISOString().slice(0, 10);
const h = { "Content-Type": "application/json", Authorization: AUTH };
let callCount = 0;

async function get(path: string) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  console.log(`[${callCount}] GET ${path} → ${r.status}`);
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`);
  return b;
}
async function post(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  console.log(`[${callCount}] POST ${path} → ${r.status}`);
  if (!r.ok) throw new Error(`POST ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`);
  return b;
}
async function put(path: string, body?: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const b = await r.json();
  console.log(`[${callCount}] PUT ${path} → ${r.status}`);
  if (!r.ok) throw new Error(`PUT ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`);
  return b;
}

function splitHours(total: number, start: string): { date: string; hours: number }[] {
  const [y, m, d] = start.split("-").map(Number);
  const out: { date: string; hours: number }[] = [];
  let rem = total, off = 0;
  while (rem > 0) {
    const hrs = Math.min(rem, 7.5);
    out.push({ date: new Date(Date.UTC(y, m - 1, d + off)).toISOString().slice(0, 10), hours: hrs });
    rem -= hrs; off++;
  }
  return out;
}

async function main() {
  // STEP 1: 4 parallel calls (was 5 — removed GET /ledger/vatType)
  const [dept, pm, acct, cust] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    get("/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber"),
    post("/customer", { name: CUST_NAME, organizationNumber: CUST_ORG, isCustomer: true }),
  ]);
  const deptId  = dept.values[0].id;
  const pmAssId = pm.values[0].id;
  const a1920   = acct.values.find((a: any) => a.number === 1920);
  const custId  = cust.value.id;
  const vatId   = 3; // HARDCODED — always "Utgående avgift, høy sats" (25%)
  console.log("Step 1: deptId=%d pmAssId=%d custId=%d vatId=%d (hardcoded)", deptId, pmAssId, custId, vatId);

  // STEP 2: Batch employees + project (+ conditional bank acct fix)
  const s2: Promise<any>[] = [
    post("/employee/list", [
      { firstName: PM_FIRST, lastName: PM_LAST, email: PM_EMAIL, dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
      { firstName: CON_FIRST, lastName: CON_LAST, email: CON_EMAIL, dateOfBirth: "1992-01-01", userType: "NO_ACCESS", department: { id: deptId } },
    ]),
    post("/project", {
      name: PROJECT_NAME, startDate: TODAY, customer: { id: custId },
      projectManager: { id: pmAssId }, isFixedPrice: true, fixedprice: BUDGET,
    }),
  ];
  if (a1920 && !a1920.bankAccountNumber) {
    s2.push(put(`/ledger/account/${a1920.id}`, { ...a1920, bankAccountNumber: "12345678903" }));
  }
  const [emps, proj] = await Promise.all(s2);
  const e1 = emps.values[0].id;
  const e2 = emps.values[1].id;
  const pId = proj.value.id;
  console.log("Step 2: e1=%d e2=%d pId=%d", e1, e2, pId);

  // STEP 3: Activity + participants
  const [act] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: pId }, startDate: TODAY, budgetHours: TOTAL_HOURS, budgetFeeCurrency: BUDGET,
      activity: { name: "Prosjektaktivitet", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false },
    }),
    post("/project/participant/list", [
      { project: { id: pId }, employee: { id: e1 }, adminAccess: true },
      { project: { id: pId }, employee: { id: e2 }, adminAccess: false },
    ]),
  ]);
  const actId = act.value.activity.id;
  console.log("Step 3: actId=%d", actId);

  // STEP 4: Timesheet + supplier + orderline
  const ts1 = splitHours(PM_HOURS, TODAY).map(e => ({
    employee: { id: e1 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours,
  }));
  const ts2 = splitHours(CON_HOURS, TODAY).map(e => ({
    employee: { id: e2 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours,
  }));
  await Promise.all([
    post("/timesheet/entry/list", [...ts1, ...ts2]),
    post("/supplier", { name: SUPP_NAME, organizationNumber: SUPP_ORG, isSupplier: true }),
    post("/project/orderline", {
      project: { id: pId }, description: "Leverandørkostnad", date: TODAY,
      count: 1, unitCostCurrency: SUPP_COST, isChargeable: false,
    }),
  ]);
  console.log("Step 4: timesheet + supplier + orderline");

  // STEP 5: Create order (with hardcoded vatType=3)
  const ord = await post("/order", {
    customer: { id: custId }, project: { id: pId },
    orderDate: TODAY, deliveryDate: TODAY,
    orderLines: [{
      description: PROJECT_NAME, count: 1,
      unitPriceExcludingVatCurrency: BUDGET,
      vatType: { id: vatId },
    }],
  });
  const ordId = ord.value.id;
  console.log("Step 5: ordId=%d", ordId);

  // STEP 6: Convert order → invoice
  const inv = await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  console.log("Step 6: invoice created");

  // Verify invoice
  const invId = inv.value.id;
  const invCheck = await get(`/invoice/${invId}?fields=id,isApproved`);
  console.log("Verification: isApproved=%s", invCheck.value.isApproved);

  console.log("\nTOTAL API CALLS: %d (excluding verification GET)", callCount - 1);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
