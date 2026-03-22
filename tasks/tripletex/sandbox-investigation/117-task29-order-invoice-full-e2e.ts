/**
 * Full end-to-end test with the CORRECTED flow:
 * POST /order → PUT /order/{id}/:invoice (instead of POST /invoice)
 *
 * This is the same flow the tripletex2 strategy uses, and it produces
 * isApproved=true and order status=INVOICED (vs false/NOT_CHOSEN).
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const RUN = Date.now();
const PROJECT_NAME = `Lifecycle-${RUN}`;
const CUST_NAME    = `TestCust-${RUN}`;
const CUST_ORG     = "882854000";
const BUDGET       = 262850;
const PM_FIRST     = "Lukas";
const PM_LAST      = "Hoffmann";
const PM_EMAIL     = `lukas.hoffmann-${RUN}@example.org`;
const PM_HOURS     = 37;
const CON_FIRST    = "Tobias";
const CON_LAST     = "Meyer";
const CON_EMAIL    = `tobias.meyer-${RUN}@example.org`;
const CON_HOURS    = 101;
const SUPP_NAME    = `TestSupp-${RUN}`;
const SUPP_ORG     = "930613118";
const SUPP_COST    = 89750;

const TOTAL_HOURS = PM_HOURS + CON_HOURS;
const TODAY = new Date().toISOString().slice(0, 10);
const h = { "Content-Type": "application/json", Authorization: AUTH };

let callCount = 0;
async function get(path: string) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${JSON.stringify(b).slice(0, 200)}`);
  console.log(`[${callCount}] GET ${path.split("?")[0]} → ${r.status}`);
  return b;
}
async function post(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) throw new Error(`POST ${path} ${r.status}: ${JSON.stringify(b).slice(0, 200)}`);
  console.log(`[${callCount}] POST ${path.split("?")[0]} → ${r.status}`);
  return b;
}
async function put(path: string, body?: any) {
  callCount++;
  const opts: any = { method: "PUT", headers: h };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const b = await r.json();
  if (!r.ok) throw new Error(`PUT ${path} ${r.status}: ${JSON.stringify(b).slice(0, 200)}`);
  console.log(`[${callCount}] PUT ${path.split("?")[0]} → ${r.status}`);
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
  console.log(`=== FULL E2E: order→:invoice flow, ${TODAY} ===`);
  console.log(`Budget=${BUDGET} PM=${PM_HOURS}h Con=${CON_HOURS}h Total=${TOTAL_HOURS}h Cost=${SUPP_COST}\n`);

  // STEP 1: Frontload reads + customer (6 parallel)
  const [dept, pm, acct, vt, vat, cust] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get("/ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id,name,percentage"),
    post("/customer", { name: CUST_NAME, organizationNumber: CUST_ORG, isCustomer: true }),
  ]);
  const deptId  = dept.values[0].id;
  const pmAssId = pm.values[0].id;
  const a1920   = acct.values.find((a: any) => a.number === 1920);
  const a6590   = acct.values.find((a: any) => a.number === 6590);
  const a2400   = acct.values.find((a: any) => a.number === 2400);
  const vtId    = vt.values[0].id;
  const vatId   = vat.values[0].id;
  const custId  = cust.value.id;

  // STEP 2: Batch employees + project (2-3 parallel)
  const s2: Promise<any>[] = [
    post("/employee/list", [
      { firstName: PM_FIRST, lastName: PM_LAST, email: PM_EMAIL, dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
      { firstName: CON_FIRST, lastName: CON_LAST, email: CON_EMAIL, dateOfBirth: "1992-01-01", userType: "NO_ACCESS", department: { id: deptId } },
    ]),
    post("/project", {
      name: PROJECT_NAME,
      startDate: TODAY,
      customer: { id: custId },
      projectManager: { id: pmAssId },
      isFixedPrice: true,
      fixedprice: BUDGET,
    }),
  ];
  if (a1920 && !a1920.bankAccountNumber) {
    s2.push(put(`/ledger/account/${a1920.id}`, { ...a1920, bankAccountNumber: "12345678903" }));
  }
  const [emps, proj] = await Promise.all(s2);
  const e1 = emps.values[0].id;
  const e2 = emps.values[1].id;
  const pId = proj.value.id;

  // STEP 3: Activity + participants (2 parallel)
  const [act, parts] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: pId },
      startDate: TODAY,
      budgetHours: TOTAL_HOURS,
      budgetFeeCurrency: BUDGET,
      activity: {
        name: "Prosjektaktivitet",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: false,
      },
    }),
    post("/project/participant/list", [
      { project: { id: pId }, employee: { id: e1 }, adminAccess: true },
      { project: { id: pId }, employee: { id: e2 }, adminAccess: false },
    ]),
  ]);
  const actId = act.value.activity.id;

  // STEP 4: Timesheet + supplier + orderline (3 parallel)
  const ts1 = splitHours(PM_HOURS, TODAY).map(e => ({
    employee: { id: e1 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours,
  }));
  const ts2 = splitHours(CON_HOURS, TODAY).map(e => ({
    employee: { id: e2 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours,
  }));
  const [ts, supp, ol] = await Promise.all([
    post("/timesheet/entry/list", [...ts1, ...ts2]),
    post("/supplier", { name: SUPP_NAME, organizationNumber: SUPP_ORG, isSupplier: true }),
    post("/project/orderline", {
      project: { id: pId },
      description: "Leverandørkostnad",
      date: TODAY,
      count: 1,
      unitCostCurrency: SUPP_COST,
      isChargeable: false,
    }),
  ]);
  const sId = supp.value.id;

  // STEP 5: Voucher + ORDER (not invoice!) (2 parallel)
  // Then STEP 6: PUT /order/:invoice to convert order to invoice
  const [, ord] = await Promise.all([
    post("/ledger/voucher", {
      date: TODAY, description: "Leverandørkostnad", voucherType: { id: vtId },
      postings: [
        { row: 1, date: TODAY, description: "Leverandørkostnad", account: { id: a6590!.id },
          amount: SUPP_COST, amountCurrency: SUPP_COST, amountGross: SUPP_COST, amountGrossCurrency: SUPP_COST,
          project: { id: pId } },
        { row: 2, date: TODAY, description: "Leverandørgjeld", account: { id: a2400!.id },
          amount: -SUPP_COST, amountCurrency: -SUPP_COST, amountGross: -SUPP_COST, amountGrossCurrency: -SUPP_COST,
          supplier: { id: sId } },
      ],
    }),
    post("/order", {
      customer: { id: custId },
      project: { id: pId },
      orderDate: TODAY, deliveryDate: TODAY,
      orderLines: [{
        description: PROJECT_NAME,
        count: 1,
        unitPriceExcludingVatCurrency: BUDGET,
        vatType: { id: vatId },
      }],
    }),
  ]);
  const ordId = ord.value.id;

  // STEP 6: Convert order to invoice
  const inv = await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);

  console.log(`\n=== CREATION COMPLETE: ${callCount} calls, 0 errors ===\n`);

  // ═══════ VERIFY ═══════
  let pass = 0, fail = 0;
  function chk(label: string, ok: boolean, detail: string) {
    if (ok) { pass++; console.log(`  ✓ ${label}: ${detail}`); }
    else    { fail++; console.log(`  ✗ ${label}: ${detail}`); }
  }

  // Verify project
  const pv = (await get(`/project/${pId}?fields=*`)).value;
  chk("Project name", pv.name === PROJECT_NAME, `"${pv.name}"`);
  chk("Customer", pv.customer?.id === custId, `id=${pv.customer?.id}`);
  chk("isFixedPrice", pv.isFixedPrice === true, `${pv.isFixedPrice}`);
  chk("fixedprice", pv.fixedprice === BUDGET, `${pv.fixedprice}`);

  // Verify activity
  const pa = (await get(`/project/${pId}?fields=projectActivities(*)`)).value.projectActivities?.[0];
  chk("budgetHours", pa?.budgetHours === TOTAL_HOURS, `${pa?.budgetHours}`);

  // Verify participants
  const pp = (await get(`/project/${pId}?fields=participants(employee(id),adminAccess)`)).value.participants || [];
  const pmP = pp.find((p: any) => p.employee?.id === e1);
  chk("PM adminAccess", pmP?.adminAccess === true, `${pmP?.adminAccess}`);
  chk("Participants ≥ 2", pp.length >= 2, `${pp.length}`);

  // Verify timesheet
  const tvs = await get(`/timesheet/entry?projectId=${pId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=employee(id),hours&count=500`);
  const byE: Record<number, number> = {};
  for (const te of tvs.values || []) byE[te.employee?.id] = (byE[te.employee?.id] || 0) + te.hours;
  chk("PM hours", byE[e1] === PM_HOURS, `${byE[e1]}`);
  chk("Con hours", byE[e2] === CON_HOURS, `${byE[e2]}`);

  // Verify orderline
  const olv = await get(`/project/orderline?projectId=${pId}&count=10&fields=*`);
  chk("Orderline cost", olv.values?.[0]?.unitCostCurrency === SUPP_COST, `${olv.values?.[0]?.unitCostCurrency}`);

  // Verify invoice — CRITICAL: must be approved and order INVOICED
  const invId = inv.value.id;
  const iv = (await get(`/invoice/${invId}?fields=*`)).value;
  chk("Invoice amount", iv.amountExcludingVatCurrency === BUDGET, `${iv.amountExcludingVatCurrency}`);
  chk("Invoice isApproved", iv.isApproved === true, `isApproved=${iv.isApproved}`);
  chk("Invoice has project", (iv.projectInvoiceDetails?.length || 0) > 0, `details=${iv.projectInvoiceDetails?.length}`);

  // Verify order status
  const orderFull = (await get(`/order/${ordId}?fields=*`)).value;
  chk("Order status INVOICED", orderFull.status === "INVOICED", `status=${orderFull.status}`);
  chk("Order isClosed", orderFull.isClosed === true, `isClosed=${orderFull.isClosed}`);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed, ${callCount} total API calls ===`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
