/**
 * Task 29: Run a REAL production prompt against sandbox, following trusted standard exactly.
 *
 * Production prompt (Norwegian, from prod-2026-03-21-174545193Z-5c16a788):
 * "Gjennomfør hele prosjektsyklusen for 'ERP-implementering Havbris'
 *  (Havbris AS, org.nr 851704027): 1) Prosjektet har budsjett 418100 kr.
 *  2) Registrer timer: Sigurd Berg (prosjektleder, sigurd.berg@example.org)
 *  75 timer og Marte Johansen (konsulent, marte.johansen@example.org) 47 timer.
 *  3) Registrer leverandørkostnad 56200 kr fra Lysgård AS (org.nr 964716188).
 *  4) Opprett kundefaktura for prosjektet."
 *
 * Extracted parameters:
 *   Project: "ERP-implementering Havbris"
 *   Customer: Havbris AS, org 851704027
 *   Budget: 418100
 *   PM: Sigurd Berg (sigurd.berg@example.org) — 75 hours
 *   Consultant: Marte Johansen (marte.johansen@example.org) — 47 hours
 *   Supplier: Lysgård AS (org 964716188), cost 56200
 *   Invoice: unsent customer invoice for the project
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const RUN = `prod-sim-${Date.now()}`;
const TODAY = new Date().toISOString().slice(0, 10);

// --- Prompt parameters ---
const PROJECT_NAME = "ERP-implementering Havbris";
const CUST_NAME = "Havbris AS";
const CUST_ORG = "851704027";
const BUDGET = 418100;

const PM_FIRST = "Sigurd";
const PM_LAST = "Berg";
const PM_EMAIL = `sigurd.berg-${RUN}@example.org`;
const PM_HOURS = 75;

const CON_FIRST = "Marte";
const CON_LAST = "Johansen";
const CON_EMAIL = `marte.johansen-${RUN}@example.org`;
const CON_HOURS = 47;

const TOTAL_HOURS = PM_HOURS + CON_HOURS; // 122

const SUPP_NAME = "Lysgård AS";
const SUPP_ORG = "964716188";
const SUPP_COST = 56200;

// --- HTTP helpers ---
const h = { "Content-Type": "application/json", Authorization: AUTH };
let calls = 0;
let errors = 0;

async function get(path: string) {
  calls++;
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  const label = `[${calls}] GET ${path.split("?")[0]}`;
  if (!r.ok) { errors++; console.error(`${label} → ${r.status}`, JSON.stringify(b).slice(0, 200)); throw new Error(`${label} ${r.status}`); }
  console.log(`${label} → ${r.status}`);
  return b;
}
async function post(path: string, body: any) {
  calls++;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  const label = `[${calls}] POST ${path.split("?")[0]}`;
  if (!r.ok) { errors++; console.error(`${label} → ${r.status}`, JSON.stringify(b).slice(0, 200)); throw new Error(`${label} ${r.status}`); }
  console.log(`${label} → ${r.status}`);
  return b;
}
async function put(path: string, body: any) {
  calls++;
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  const label = `[${calls}] PUT ${path.split("?")[0]}`;
  if (!r.ok) { errors++; console.error(`${label} → ${r.status}`, JSON.stringify(b).slice(0, 200)); throw new Error(`${label} ${r.status}`); }
  console.log(`${label} → ${r.status}`);
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
  console.log("=== TASK 29 — PRODUCTION PROMPT SIMULATION ===");
  console.log(`Prompt: Norwegian (Havbris AS)`);
  console.log(`Run: ${RUN}  Date: ${TODAY}`);
  console.log(`Budget=${BUDGET} PM=${PM_HOURS}h Con=${CON_HOURS}h SupplierCost=${SUPP_COST}\n`);

  // ========== STEP 1: 6 parallel reads + customer ==========
  console.log("--- Step 1: Reads + customer (6 parallel) ---");
  const [dept, pm, acct, vt, vat, cust] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get("/ledger/voucherType?name=Leverandørfaktura&count=1&fields=id,name"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id,name,percentage"),
    post("/customer", { name: CUST_NAME, organizationNumber: CUST_ORG, isCustomer: true }),
  ]);

  const deptId = dept.values[0].id;
  const pmAssId = pm.values[0].id;
  const a1920 = acct.values.find((a: any) => a.number === 1920);
  const a6590 = acct.values.find((a: any) => a.number === 6590);
  const a2400 = acct.values.find((a: any) => a.number === 2400);
  const vtId = vt.values[0].id;
  const vatId = vat.values[0].id;
  const custId = cust.value.id;

  // ========== STEP 2: employees (batch) + project + bank fix ==========
  console.log("\n--- Step 2: Employees + project (2-3 parallel) ---");
  const s2: Promise<any>[] = [
    post("/employee/list", [
      { firstName: PM_FIRST, lastName: PM_LAST, email: PM_EMAIL, dateOfBirth: "1988-04-12", userType: "NO_ACCESS", department: { id: deptId } },
      { firstName: CON_FIRST, lastName: CON_LAST, email: CON_EMAIL, dateOfBirth: "1993-09-05", userType: "NO_ACCESS", department: { id: deptId } },
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
  const e1 = emps.values[0].id; // PM
  const e2 = emps.values[1].id; // Consultant
  const pId = proj.value.id;

  // ========== STEP 3: activity + participants ==========
  console.log("\n--- Step 3: Activity + participants (2 parallel) ---");
  const [act, parts] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: pId }, startDate: TODAY,
      budgetHours: TOTAL_HOURS, budgetFeeCurrency: BUDGET,
      activity: { name: "Prosjektaktivitet", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: false },
    }),
    post("/project/participant/list", [
      { project: { id: pId }, employee: { id: e1 }, adminAccess: true },
      { project: { id: pId }, employee: { id: e2 }, adminAccess: false },
    ]),
  ]);
  const actId = act.value.activity.id;

  // ========== STEP 4: timesheet + supplier + orderline ==========
  console.log("\n--- Step 4: Timesheet + supplier + orderline (3 parallel) ---");
  const ts1 = splitHours(PM_HOURS, TODAY).map(e => ({ employee: { id: e1 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours }));
  const ts2 = splitHours(CON_HOURS, TODAY).map(e => ({ employee: { id: e2 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours }));

  const [ts, supp, ol] = await Promise.all([
    post("/timesheet/entry/list", [...ts1, ...ts2]),
    post("/supplier", { name: SUPP_NAME, organizationNumber: SUPP_ORG, isSupplier: true }),
    post("/project/orderline", { project: { id: pId }, description: "Leverandørkostnad", date: TODAY, count: 1, unitCostCurrency: SUPP_COST, isChargeable: false }),
  ]);
  const sId = supp.value.id;

  // ========== STEP 5: voucher + invoice ==========
  console.log("\n--- Step 5: Voucher + invoice (2 parallel) ---");
  const dd = new Date(Date.UTC(+TODAY.slice(0,4), +TODAY.slice(5,7)-1, +TODAY.slice(8,10)+14)).toISOString().slice(0,10);

  const [vouch, inv] = await Promise.all([
    post("/ledger/voucher", {
      date: TODAY, description: "Leverandørkostnad", voucherType: { id: vtId },
      postings: [
        { row: 1, date: TODAY, description: "Leverandørkostnad", account: { id: a6590!.id }, amount: SUPP_COST, amountCurrency: SUPP_COST, amountGross: SUPP_COST, amountGrossCurrency: SUPP_COST, project: { id: pId } },
        { row: 2, date: TODAY, description: "Leverandørgjeld", account: { id: a2400!.id }, amount: -SUPP_COST, amountCurrency: -SUPP_COST, amountGross: -SUPP_COST, amountGrossCurrency: -SUPP_COST, supplier: { id: sId } },
      ],
    }),
    post("/invoice?sendToCustomer=false", {
      invoiceDate: TODAY, invoiceDueDate: dd, customer: { id: custId },
      orders: [{ customer: { id: custId }, project: { id: pId }, orderDate: TODAY, deliveryDate: TODAY,
        orderLines: [{ description: PROJECT_NAME, count: 1, unitPriceExcludingVatCurrency: BUDGET, vatType: { id: vatId } }],
      }],
    }),
  ]);

  console.log(`\nCreation done: ${calls} calls, ${errors} errors`);

  // ================================================================
  //  FULL VERIFICATION — check every field the scorer could look at
  // ================================================================
  console.log("\n\n╔══════════════════════════════════════╗");
  console.log("║         FULL VERIFICATION            ║");
  console.log("╚══════════════════════════════════════╝\n");

  let pass = 0, fail = 0;
  function chk(label: string, ok: boolean, detail: string) {
    if (ok) { pass++; console.log(`  ✓ ${label}: ${detail}`); }
    else    { fail++; console.log(`  ✗ ${label}: ${detail}`); }
  }

  // --- Customer ---
  const cv = (await get(`/customer/${custId}?fields=*`)).value;
  chk("Customer name", cv.name === CUST_NAME, `"${cv.name}" expected "${CUST_NAME}"`);
  chk("Customer org", cv.organizationNumber === CUST_ORG, `"${cv.organizationNumber}" expected "${CUST_ORG}"`);

  // --- Employees ---
  const ev1 = (await get(`/employee/${e1}?fields=*`)).value;
  const ev2 = (await get(`/employee/${e2}?fields=*`)).value;
  chk("PM firstName", ev1.firstName === PM_FIRST, `"${ev1.firstName}"`);
  chk("PM lastName", ev1.lastName === PM_LAST, `"${ev1.lastName}"`);
  chk("Consultant firstName", ev2.firstName === CON_FIRST, `"${ev2.firstName}"`);
  chk("Consultant lastName", ev2.lastName === CON_LAST, `"${ev2.lastName}"`);

  // --- Project ---
  const pv = (await get(`/project/${pId}?fields=*`)).value;
  chk("Project name", pv.name === PROJECT_NAME, `"${pv.name}"`);
  chk("Project customer", pv.customer?.id === custId, `customer.id=${pv.customer?.id}`);
  chk("Project isFixedPrice", pv.isFixedPrice === true, `${pv.isFixedPrice}`);
  chk("Project fixedprice", pv.fixedprice === BUDGET, `${pv.fixedprice} expected ${BUDGET}`);
  chk("Project startDate", pv.startDate === TODAY, `${pv.startDate}`);

  // --- Project Activity ---
  const pav = (await get(`/project/${pId}?fields=projectActivities(*)`)).value;
  const pa = pav.projectActivities?.[0];
  chk("Activity budgetHours", pa?.budgetHours === TOTAL_HOURS, `${pa?.budgetHours} expected ${TOTAL_HOURS}`);
  chk("Activity budgetFeeCurrency", pa?.budgetFeeCurrency === BUDGET, `${pa?.budgetFeeCurrency} expected ${BUDGET}`);

  // --- Participants ---
  const ppv = (await get(`/project/${pId}?fields=participants(employee(id,firstName,lastName,email),adminAccess)`)).value;
  const pparts = ppv.participants || [];
  const pmPart = pparts.find((p: any) => p.employee?.id === e1);
  const conPart = pparts.find((p: any) => p.employee?.id === e2);
  chk("PM is participant", !!pmPart, `found=${!!pmPart}`);
  chk("PM adminAccess=true", pmPart?.adminAccess === true, `${pmPart?.adminAccess}`);
  chk("Consultant is participant", !!conPart, `found=${!!conPart}`);
  chk("Consultant adminAccess=false", conPart?.adminAccess === false, `${conPart?.adminAccess}`);
  chk("Participant count >= 2", pparts.length >= 2, `count=${pparts.length}`);

  // --- Timesheet ---
  const tvs = await get(`/timesheet/entry?projectId=${pId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=employee(id,firstName,lastName),hours,date&count=500`);
  const byEmp: Record<number, { hours: number; entries: number }> = {};
  for (const te of tvs.values || []) {
    const eid = te.employee?.id;
    if (!byEmp[eid]) byEmp[eid] = { hours: 0, entries: 0 };
    byEmp[eid].hours += te.hours;
    byEmp[eid].entries++;
  }
  chk("PM total hours", byEmp[e1]?.hours === PM_HOURS, `${byEmp[e1]?.hours} expected ${PM_HOURS} (${byEmp[e1]?.entries} entries)`);
  chk("Consultant total hours", byEmp[e2]?.hours === CON_HOURS, `${byEmp[e2]?.hours} expected ${CON_HOURS} (${byEmp[e2]?.entries} entries)`);
  chk("Total hours", (byEmp[e1]?.hours || 0) + (byEmp[e2]?.hours || 0) === TOTAL_HOURS, `${(byEmp[e1]?.hours||0)+(byEmp[e2]?.hours||0)} expected ${TOTAL_HOURS}`);

  // --- Project Orderline (supplier cost) ---
  const olv = await get(`/project/orderline?projectId=${pId}&count=50&fields=*`);
  const costOl = olv.values?.find((o: any) => o.unitCostCurrency === SUPP_COST);
  chk("Orderline exists", !!costOl, `unitCostCurrency=${costOl?.unitCostCurrency}`);
  chk("Orderline count=1", costOl?.count === 1, `count=${costOl?.count}`);

  // --- Supplier ---
  const sv = (await get(`/supplier/${sId}?fields=*`)).value;
  chk("Supplier name", sv.name === SUPP_NAME, `"${sv.name}"`);
  chk("Supplier org", sv.organizationNumber === SUPP_ORG, `"${sv.organizationNumber}"`);

  // --- Voucher ---
  const vv = (await get(`/ledger/voucher/${vouch.value.id}?fields=*`)).value;
  chk("Voucher exists", !!vv.id, `id=${vv.id}`);
  chk("Voucher description", vv.description === "Leverandørkostnad", `"${vv.description}"`);

  // Voucher postings
  const postings = await get(`/ledger/posting?voucherId=${vv.id}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=*,account(number),project(id),supplier(id)&count=10`);
  const debit = postings.values?.find((p: any) => p.amount > 0);
  const credit = postings.values?.find((p: any) => p.amount < 0);
  chk("Voucher debit amount", debit?.amount === SUPP_COST, `${debit?.amount} expected ${SUPP_COST}`);
  chk("Voucher credit amount", credit?.amount === -SUPP_COST, `${credit?.amount} expected ${-SUPP_COST}`);
  chk("Voucher debit account=6590", debit?.account?.number === 6590, `account=${debit?.account?.number}`);
  chk("Voucher credit account=2400", credit?.account?.number === 2400, `account=${credit?.account?.number}`);
  chk("Voucher debit project linked", debit?.project?.id === pId, `project=${debit?.project?.id}`);
  chk("Voucher credit supplier linked", credit?.supplier?.id === sId, `supplier=${credit?.supplier?.id}`);

  // --- Invoice ---
  const iv = (await get(`/invoice/${inv.value.id}?fields=*`)).value;
  chk("Invoice exists", !!iv.id, `id=${iv.id}`);
  chk("Invoice amount", iv.amountExcludingVatCurrency === BUDGET, `${iv.amountExcludingVatCurrency} expected ${BUDGET}`);
  chk("Invoice customer", iv.customer?.id === custId, `customer=${iv.customer?.id}`);
  chk("Invoice not sent", !iv.sentDate, `sentDate=${iv.sentDate}`);
  chk("Invoice isCreditNote=false", iv.isCreditNote === false, `${iv.isCreditNote}`);
  chk("Invoice has project details", (iv.projectInvoiceDetails?.length || 0) > 0, `count=${iv.projectInvoiceDetails?.length}`);

  // Check the order behind the invoice
  const orders = await get(`/order?orderDateFrom=${TODAY}&orderDateTo=2027-01-01&customerId=${custId}&fields=*,orderLines(*)&count=10`);
  const projOrder = orders.values?.find((o: any) => o.project?.id === pId);
  chk("Order has project link", !!projOrder, `project=${projOrder?.project?.id}`);
  if (projOrder) {
    const line = projOrder.orderLines?.[0];
    chk("Order line description", line?.description === PROJECT_NAME, `"${line?.description}"`);
    chk("Order line amount", line?.unitPriceExcludingVatCurrency === BUDGET, `${line?.unitPriceExcludingVatCurrency}`);
  }

  // ================================================================
  //  SUMMARY
  // ================================================================
  console.log("\n╔══════════════════════════════════════╗");
  console.log("║            SUMMARY                   ║");
  console.log("╚══════════════════════════════════════╝");
  console.log(`  Creation: ${calls - (pass + fail)} API calls, ${errors} errors`);
  console.log(`  Verification: ${pass + fail} checks`);
  console.log(`    Passed: ${pass}`);
  console.log(`    Failed: ${fail}`);
  console.log(`  Sequential steps: 5`);
  console.log(`\n  IDs: customer=${custId} emp1=${e1} emp2=${e2} project=${pId}`);
  console.log(`       activity=${actId} supplier=${sId} voucher=${vouch.value.id} invoice=${inv.value.id}`);

  if (fail > 0) { console.log("\n  *** FAILURES DETECTED ***"); process.exit(1); }
  else { console.log("\n  *** ALL CHECKS PASSED ***"); }
}

main().catch(e => { console.error("\nFATAL:", e.message); process.exit(1); });
