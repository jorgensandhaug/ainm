const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const AUTH = "Basic " + btoa("0:k_uEqqpyDjMtqEfwP0kxiRSRaYiPswEfzowQx3m3wWc");

// ── PROMPT VALUES ──────────────────
const PROJECT_NAME = "Migração Cloud Horizonte";
const CUST_NAME    = "Horizonte Lda";
const CUST_ORG     = "857400526";
const BUDGET       = 229500;
const PM_FIRST     = "Catarina";
const PM_LAST      = "Martins";
const PM_EMAIL     = "catarina.martins@example.org";
const PM_HOURS     = 37;
const CON_FIRST    = "João";
const CON_LAST     = "Martins";
const CON_EMAIL    = "joao.martins@example.org";
const CON_HOURS    = 62;
const SUPP_NAME    = "Oceano Lda";
const SUPP_ORG     = "941830420";
const SUPP_COST    = 56300;
// ── END PROMPT VALUES ──────────────────────────────────────────────

const TOTAL_HOURS = PM_HOURS + CON_HOURS;
const TODAY = new Date().toISOString().slice(0, 10);
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
async function put(path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const b = await r.json();
  if (!r.ok) throw new Error(`PUT ${path} ${r.status}: ${JSON.stringify(b).slice(0, 200)}`);
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
  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Frontload ALL reads + create customer  (5 parallel)
  // ═══════════════════════════════════════════════════════════════
  const [dept, pm, acct, vat, cust] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    get("/ledger/account?number=1920&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id,name,percentage"),
    post("/customer", { name: CUST_NAME, organizationNumber: CUST_ORG, isCustomer: true }),
  ]);
  const deptId  = dept.values[0].id;
  const pmAssId = pm.values[0].id;
  const a1920   = acct.values.find((a: any) => a.number === 1920);
  const vatId   = vat.values[0].id;
  const custId  = cust.value.id;
  console.log("Step 1 done: deptId=%d pmAssId=%d custId=%d vatId=%d", deptId, pmAssId, custId, vatId);

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Batch employees + project  (2-3 parallel)
  // ═══════════════════════════════════════════════════════════════
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
  console.log("Step 2 done: e1=%d e2=%d pId=%d", e1, e2, pId);

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Activity + participants  (2 parallel)
  // ═══════════════════════════════════════════════════════════════
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
  console.log("Step 3 done: actId=%d", actId);

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Timesheet + supplier + orderline  (3 parallel)
  // ═══════════════════════════════════════════════════════════════
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
      project: { id: pId },
      description: "Leverandørkostnad",
      date: TODAY,
      count: 1,
      unitCostCurrency: SUPP_COST,
      isChargeable: false,
    }),
  ]);
  console.log("Step 4 done: timesheet + supplier + orderline");

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Create order
  // ═══════════════════════════════════════════════════════════════
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
  console.log("Step 5 done: ordId=%d", ordId);

  // ═══════════════════════════════════════════════════════════════
  // STEP 6: Convert order → invoice
  // ═══════════════════════════════════════════════════════════════
  await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  console.log("Step 6 done: invoice created via order/:invoice");
  console.log("ALL DONE — 14 calls, project lifecycle complete");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
