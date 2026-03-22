/**
 * Task 29: Combines voucher (from 4/11 runs) with all other fixes.
 * Goal: get voucher check to pass while keeping isFixedPrice/fixedprice/budgetHours/orderline.
 * Also tests POST /invoice vs POST /order → PUT /order/:invoice to see if either affects scoring.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const RUN = Date.now();
const PROJECT_NAME = `VchFix-${RUN}`;
const CUST_NAME    = `VchCust-${RUN}`;
const CUST_ORG     = "882854000";
const BUDGET       = 229500;
const PM_FIRST     = "Catarina";
const PM_LAST      = "Martins";
const PM_EMAIL     = `catarina.martins-${RUN}@example.org`;
const PM_HOURS     = 37;
const CON_FIRST    = "João";
const CON_LAST     = "Martins";
const CON_EMAIL    = `joao.martins-${RUN}@example.org`;
const CON_HOURS    = 62;
const SUPP_NAME    = `VchSupp-${RUN}`;
const SUPP_ORG     = "930613118";
const SUPP_COST    = 56300;

const TOTAL_HOURS = PM_HOURS + CON_HOURS;
const TODAY = new Date().toISOString().slice(0, 10);
const h = { "Content-Type": "application/json", Authorization: AUTH };

let callCount = 0;
async function get(path: string) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`);
  console.log(`[${callCount}] GET ${path.split("?")[0]} → ${r.status}`);
  return b;
}
async function post(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) throw new Error(`POST ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`);
  console.log(`[${callCount}] POST ${path.split("?")[0]} → ${r.status}`);
  return b;
}
async function put(path: string, body?: any) {
  callCount++;
  const opts: any = { method: "PUT", headers: h };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const b = await r.json();
  if (!r.ok) throw new Error(`PUT ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`);
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
  console.log(`=== VOUCHER + FIXES TEST: ${TODAY} ===\n`);

  // STEP 1: Frontload reads + customer (5 parallel)
  const [dept, pm, acct, vat, vtRes, cust] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id,name,percentage"),
    get("/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
    post("/customer", { name: CUST_NAME, organizationNumber: CUST_ORG, isCustomer: true }),
  ]);
  const deptId  = dept.values[0].id;
  const pmAssId = pm.values[0].id;
  const a1920   = acct.values.find((a: any) => a.number === 1920);
  const acc6590 = acct.values.find((a: any) => a.number === 6590);
  const acc2400 = acct.values.find((a: any) => a.number === 2400);
  const vatId   = vat.values[0].id;
  const vtId    = vtRes.values[0].id;
  const custId  = cust.value.id;
  console.log(`  dept=${deptId} pmAss=${pmAssId} vatId=${vatId} vtId=${vtId} custId=${custId}`);
  console.log(`  acc6590=${acc6590?.id} acc2400=${acc2400?.id} a1920=${a1920?.id}`);

  // STEP 2: Employees + project (+bank fix if needed)
  const s2: Promise<any>[] = [
    post("/employee/list", [
      { firstName: PM_FIRST,  lastName: PM_LAST,  email: PM_EMAIL,  dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
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
  console.log(`  e1=${e1} e2=${e2} pId=${pId}`);

  // STEP 3: Activity + participants
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
  console.log(`  actId=${actId}`);

  // STEP 4: Timesheet + supplier + orderline (3 parallel)
  const ts1 = splitHours(PM_HOURS, TODAY).map(e => ({
    employee: { id: e1 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours,
  }));
  const ts2 = splitHours(CON_HOURS, TODAY).map(e => ({
    employee: { id: e2 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours,
  }));
  const [tsRes, suppRes, olRes] = await Promise.all([
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
  const suppId = suppRes.value.id;
  console.log(`  supplier=${suppId} timesheet entries=${tsRes.values?.length}`);

  // STEP 5: Voucher for supplier cost (accounting linkage)
  const voucher = await post("/ledger/voucher", {
    date: TODAY,
    description: `${SUPP_NAME} - leverandørkostnad`,
    voucherType: { id: vtId },
    postings: [
      {
        row: 1,
        account: { id: acc6590!.id },
        amount: SUPP_COST,
        amountCurrency: SUPP_COST,
        amountGross: SUPP_COST,
        amountGrossCurrency: SUPP_COST,
        project: { id: pId },
        date: TODAY,
        description: `${SUPP_NAME} - leverandørkostnad`,
      },
      {
        row: 2,
        account: { id: acc2400!.id },
        amount: -SUPP_COST,
        amountCurrency: -SUPP_COST,
        amountGross: -SUPP_COST,
        amountGrossCurrency: -SUPP_COST,
        supplier: { id: suppId },
        date: TODAY,
        description: `${SUPP_NAME} - leverandørkostnad`,
      },
    ],
  });
  console.log(`  voucher=${voucher.value.id}`);

  // STEP 6: Order → Invoice
  const ord = await post("/order", {
    customer: { id: custId },
    project: { id: pId },
    orderDate: TODAY, deliveryDate: TODAY,
    orderLines: [{
      description: PROJECT_NAME,
      count: 1,
      unitPriceExcludingVatCurrency: BUDGET,
      vatType: { id: vatId },
    }],
  });
  const ordId = ord.value.id;

  const inv = await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  const invId = inv.value.id;

  console.log(`\n=== CREATION: ${callCount} calls, 0 errors ===\n`);

  // ═══════ VERIFY ═══════
  let pass = 0, fail = 0;
  function chk(label: string, ok: boolean, detail: string) {
    if (ok) { pass++; console.log(`  ✓ ${label}: ${detail}`); }
    else    { fail++; console.log(`  ✗ ${label}: ${detail}`); }
  }

  // Project
  const pv = (await get(`/project/${pId}?fields=*`)).value;
  chk("isFixedPrice", pv.isFixedPrice === true, `${pv.isFixedPrice}`);
  chk("fixedprice", pv.fixedprice === BUDGET, `${pv.fixedprice}`);

  // Activity
  const pa = (await get(`/project/${pId}?fields=projectActivities(*)`)).value.projectActivities?.[0];
  chk("budgetHours", pa?.budgetHours === TOTAL_HOURS, `${pa?.budgetHours}`);

  // Participants
  const pp = (await get(`/project/${pId}?fields=participants(employee(id),adminAccess)`)).value.participants || [];
  chk("PM adminAccess", pp.some((p: any) => p.employee?.id === e1 && p.adminAccess === true), "PM has admin");
  chk("Participants ≥ 2", pp.length >= 2, `${pp.length}`);

  // Timesheet
  const tvs = await get(`/timesheet/entry?projectId=${pId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=employee(id),hours&count=500`);
  const byE: Record<number, number> = {};
  for (const te of tvs.values || []) byE[te.employee?.id] = (byE[te.employee?.id] || 0) + te.hours;
  chk("PM hours", byE[e1] === PM_HOURS, `${byE[e1]}`);
  chk("Con hours", byE[e2] === CON_HOURS, `${byE[e2]}`);

  // Orderline
  const olv = await get(`/project/orderline?projectId=${pId}&count=10&fields=*`);
  chk("Orderline cost", olv.values?.[0]?.unitCostCurrency === SUPP_COST, `${olv.values?.[0]?.unitCostCurrency}`);
  chk("Orderline vendor", olv.values?.[0]?.vendor !== null, `${JSON.stringify(olv.values?.[0]?.vendor)}`);

  // Voucher
  const vchId = voucher.value.id;
  const vch = (await get(`/ledger/voucher/${vchId}?fields=*`)).value;
  chk("Voucher exists", !!vch, `id=${vchId}`);
  const postings = (await get(`/ledger/voucher/${vchId}?fields=postings(*)`)).value.postings || [];
  chk("Debit has project", postings.some((p: any) => p.project?.id === pId && p.amount > 0), "project linked");
  chk("Posting has supplier", postings.some((p: any) => p.supplier?.id === suppId), "supplier linked");

  // Invoice
  const iv = (await get(`/invoice/${invId}?fields=*`)).value;
  chk("Invoice amount", iv.amountExcludingVatCurrency === BUDGET, `${iv.amountExcludingVatCurrency}`);
  chk("Invoice isApproved", iv.isApproved === true, `${iv.isApproved}`);

  // Order
  const orderFull = (await get(`/order/${ordId}?fields=*`)).value;
  chk("Order INVOICED", orderFull.status === "INVOICED", `${orderFull.status}`);

  // Supplier invoice? (probably none since we didn't use importDocument)
  const si = await get(`/supplierInvoice?supplierId=${suppId}&count=10&fields=*`);
  chk("SupplierInvoice exists?", (si.values?.length || 0) > 0, `count=${si.values?.length || 0}`);

  // Project invoice details on invoice
  const invFull = (await get(`/invoice/${invId}?fields=projectInvoiceDetails(*)`)).value;
  chk("projectInvoiceDetails", (invFull.projectInvoiceDetails?.length || 0) > 0, `count=${invFull.projectInvoiceDetails?.length || 0}`);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed, ${callCount} total calls ===`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
