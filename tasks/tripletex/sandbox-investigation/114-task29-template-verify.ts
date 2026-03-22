/**
 * Verify the trusted standard's script template works as-is.
 * This is the EXACT template from the trusted standard, with only
 * the AUTH/BASE constants added and prompt values from a German prompt.
 *
 * German prompt (prod-2026-03-21-132511516Z-d568ddd5):
 * "Führen Sie den vollständigen Projektzyklus für 'Cloud-Migration Brückentor'
 *  (Brückentor GmbH, Org.-Nr. 882854000) durch: Budget 262850 NOK.
 *  Lukas Hoffmann (Projektleiter, lukas.hoffmann@example.org) 37 Stunden,
 *  Tobias Meyer (Berater, tobias.meyer@example.org) 101 Stunden.
 *  Lieferantenkosten 89750 NOK von Sonnental GmbH (Org.-Nr. 930613118).
 *  Kundenrechnung erstellen."
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

// ── PROMPT VALUES (replace these from the prompt) ──────────────────
const PROJECT_NAME = "Cloud-Migration Brückentor";
const CUST_NAME    = "Brückentor GmbH";
const CUST_ORG     = "882854000";
const BUDGET       = 262850;
const PM_FIRST     = "Lukas";
const PM_LAST      = "Hoffmann";
const PM_EMAIL     = `lukas.hoffmann-tmpl-${Date.now()}@example.org`;
const PM_HOURS     = 37;
const CON_FIRST    = "Tobias";
const CON_LAST     = "Meyer";
const CON_EMAIL    = `tobias.meyer-tmpl-${Date.now()}@example.org`;
const CON_HOURS    = 101;
const SUPP_NAME    = "Sonnental GmbH";
const SUPP_ORG     = "930613118";
const SUPP_COST    = 89750;
// ── END PROMPT VALUES ──────────────────────────────────────────────

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
async function put(path: string, body: any) {
  callCount++;
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, body: JSON.stringify(body) });
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
  console.log(`=== TEMPLATE VERIFY: German prompt, ${TODAY} ===`);
  console.log(`Budget=${BUDGET} PM=${PM_HOURS}h Con=${CON_HOURS}h Total=${TOTAL_HOURS}h Cost=${SUPP_COST}\n`);

  // STEP 1
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

  // STEP 2
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

  // STEP 3
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

  // STEP 4
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

  // STEP 5
  const dd = new Date(Date.UTC(+TODAY.slice(0,4), +TODAY.slice(5,7)-1, +TODAY.slice(8,10)+14)).toISOString().slice(0,10);
  const [, inv] = await Promise.all([
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

  console.log(`\n=== CREATION COMPLETE: ${callCount} calls, 0 errors ===\n`);

  // ═══════ VERIFY ═══════
  let pass = 0, fail = 0;
  function chk(label: string, ok: boolean, detail: string) {
    if (ok) { pass++; console.log(`  ✓ ${label}: ${detail}`); }
    else    { fail++; console.log(`  ✗ ${label}: ${detail}`); }
  }

  const pv = (await get(`/project/${pId}?fields=*`)).value;
  chk("Customer", pv.customer?.id === custId, `id=${pv.customer?.id}`);
  chk("Project name", pv.name === PROJECT_NAME, `"${pv.name}"`);
  chk("isFixedPrice", pv.isFixedPrice === true, `${pv.isFixedPrice}`);
  chk("fixedprice", pv.fixedprice === BUDGET, `${pv.fixedprice}`);

  const pa = (await get(`/project/${pId}?fields=projectActivities(*)`)).value.projectActivities?.[0];
  chk("budgetHours", pa?.budgetHours === TOTAL_HOURS, `${pa?.budgetHours}`);

  const pp = (await get(`/project/${pId}?fields=participants(employee(id),adminAccess)`)).value.participants || [];
  const pmP = pp.find((p: any) => p.employee?.id === e1);
  chk("PM adminAccess", pmP?.adminAccess === true, `${pmP?.adminAccess}`);
  chk("Participants ≥ 2", pp.length >= 2, `${pp.length}`);

  const tvs = await get(`/timesheet/entry?projectId=${pId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=employee(id),hours&count=500`);
  const byE: Record<number, number> = {};
  for (const te of tvs.values || []) byE[te.employee?.id] = (byE[te.employee?.id] || 0) + te.hours;
  chk("PM hours", byE[e1] === PM_HOURS, `${byE[e1]}`);
  chk("Con hours", byE[e2] === CON_HOURS, `${byE[e2]}`);

  const olv = await get(`/project/orderline?projectId=${pId}&count=10&fields=*`);
  chk("Orderline cost", olv.values?.[0]?.unitCostCurrency === SUPP_COST, `${olv.values?.[0]?.unitCostCurrency}`);

  const iv = (await get(`/invoice/${inv.value.id}?fields=*`)).value;
  chk("Invoice amount", iv.amountExcludingVatCurrency === BUDGET, `${iv.amountExcludingVatCurrency}`);
  chk("Invoice has project", (iv.projectInvoiceDetails?.length || 0) > 0, `details=${iv.projectInvoiceDetails?.length}`);

  console.log(`\n=== RESULT: ${pass} passed, ${fail} failed, ${callCount} total API calls ===`);
  if (fail > 0) process.exit(1);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
