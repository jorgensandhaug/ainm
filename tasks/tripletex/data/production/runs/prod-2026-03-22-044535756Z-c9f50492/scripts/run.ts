const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const AUTH = "Basic " + btoa("0:Tlyac0MmlwasEA5JjDDg-q84iU0ravcb4eEH_JFGiw4");

// ── PROMPT VALUES ──────────────────
const PROJECT_NAME = "Plataforma Datos Montaña";
const CUST_NAME    = "Montaña SL";
const CUST_ORG     = "806602094";
const BUDGET       = 200900;
const PM_FIRST     = "Pablo";
const PM_LAST      = "Rodríguez";
const PM_EMAIL     = "pablo.rodriguez@example.org";
const PM_HOURS     = 56;
const CON_FIRST    = "Ricardo";
const CON_LAST     = "Rodríguez";
const CON_EMAIL    = "ricardo.rodriguez@example.org";
const CON_HOURS    = 52;
const SUPP_NAME    = "Río Verde SL";
const SUPP_ORG     = "806237310";
const SUPP_COST    = 98700;
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
async function put(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
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
  // STEP 1: Frontload ALL reads + create customer  (6 parallel)
  // ═══════════════════════════════════════════════════════════════
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

  console.log("STEP 1 done:", { deptId, pmAssId, vtId, vatId, custId, a1920: a1920?.id, a6590: a6590?.id, a2400: a2400?.id });

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

  console.log("STEP 2 done:", { e1, e2, pId });

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

  console.log("STEP 3 done:", { actId });

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Timesheet + supplier + orderline  (3 parallel)
  // ═══════════════════════════════════════════════════════════════
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

  console.log("STEP 4 done:", { timesheetEntries: ts.values?.length, sId });

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Voucher + invoice  (2 parallel)
  // ═══════════════════════════════════════════════════════════════
  const dd = new Date(Date.UTC(+TODAY.slice(0,4), +TODAY.slice(5,7)-1, +TODAY.slice(8,10)+14)).toISOString().slice(0,10);
  const [voucher, invoice] = await Promise.all([
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
    post("/invoice?sendToCustomer=false", {
      invoiceDate: TODAY, invoiceDueDate: dd, customer: { id: custId },
      orders: [{
        customer: { id: custId },
        project: { id: pId },
        orderDate: TODAY, deliveryDate: TODAY,
        orderLines: [{
          description: PROJECT_NAME,
          count: 1,
          unitPriceExcludingVatCurrency: BUDGET,
          vatType: { id: vatId },
        }],
      }],
    }),
  ]);

  console.log("STEP 5 done:", { voucherId: voucher.value?.id, invoiceId: invoice.value?.id });
  console.log("ALL DONE — project lifecycle complete");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
