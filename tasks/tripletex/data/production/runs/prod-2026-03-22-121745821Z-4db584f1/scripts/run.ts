const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const AUTH = "Basic " + btoa("0:eDttACLmvk2nRnG8qWyV3tHHJhsvUhTGPJ09rlukCtk");

// ── PROMPT VALUES ──────────────────────────────────────────────
const PROJECT_NAME = "Cloud Migration Northwave";
const CUST_NAME    = "Northwave Ltd";
const CUST_ORG     = "932075482";
const BUDGET       = 396900;
const PM_FIRST     = "Samuel";
const PM_LAST      = "Brown";
const PM_EMAIL     = "samuel.brown@example.org";
const PM_HOURS     = 74;
const CON_FIRST    = "Sarah";
const CON_LAST     = "Lewis";
const CON_EMAIL    = "sarah.lewis@example.org";
const CON_HOURS    = 85;
const SUPP_NAME    = "Clearwater Ltd";
const SUPP_ORG     = "889264985";
const SUPP_COST    = 56750;
// ── END PROMPT VALUES ──────────────────────────────────────────

const TOTAL_HOURS = PM_HOURS + CON_HOURS;
const HOURLY_RATE = Math.round(BUDGET / TOTAL_HOURS);  // per-employee rate
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
  // STEP 1: Frontload ALL reads + create customer  (6 parallel)
  // ═══════════════════════════════════════════════════════════════
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

  console.log("STEP1 done:", { deptId, pmAssId, a1920: a1920?.id, acc6590: acc6590?.id, acc2400: acc2400?.id, vatId, vtId, custId });

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
    }),
  ];
  if (a1920 && !a1920.bankAccountNumber) {
    s2.push(put(`/ledger/account/${a1920.id}`, { ...a1920, bankAccountNumber: "12345678903" }));
  }
  const [emps, proj] = await Promise.all(s2);
  const e1 = emps.values[0].id;
  const e2 = emps.values[1].id;
  const pId = proj.value.id;

  console.log("STEP2 done:", { e1, e2, pId });

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Activity (CHARGEABLE) + participants  (2 parallel)
  // ═══════════════════════════════════════════════════════════════
  const [act, parts] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: pId },
      startDate: TODAY,
      budgetHours: TOTAL_HOURS,
      budgetFeeCurrency: BUDGET,
      activity: {
        name: "Prosjektarbeid",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: true,
      },
    }),
    post("/project/participant/list", [
      { project: { id: pId }, employee: { id: e1 }, adminAccess: true },
      { project: { id: pId }, employee: { id: e2 }, adminAccess: false },
    ]),
  ]);
  const actId = act.value.activity.id;

  console.log("STEP3 done:", { actId });

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Set up hourly rates (MUST be before timesheet!)
  // ═══════════════════════════════════════════════════════════════
  const rh = await get(`/project/hourlyRates?projectId=${pId}&count=10&fields=*`);
  const holder = rh.values[0];
  await put(`/project/hourlyRates/${holder.id}`, {
    project: { id: pId },
    startDate: TODAY,
    hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
  });
  const [rate1, rate2] = await Promise.all([
    post("/project/hourlyRates/projectSpecificRates", {
      projectHourlyRate: { id: holder.id },
      employee: { id: e1 },
      activity: { id: actId },
      hourlyRate: HOURLY_RATE,
    }),
    post("/project/hourlyRates/projectSpecificRates", {
      projectHourlyRate: { id: holder.id },
      employee: { id: e2 },
      activity: { id: actId },
      hourlyRate: HOURLY_RATE,
    }),
  ]);

  console.log("STEP4 done: hourlyRate =", HOURLY_RATE);

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Timesheet + supplier + orderline  (3 parallel)
  // ═══════════════════════════════════════════════════════════════
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

  console.log("STEP5 done:", { suppId, tsEntries: tsRes.values?.length });

  // ═══════════════════════════════════════════════════════════════
  // STEP 6+7: Supplier cost voucher + order  (2 parallel)
  // ═══════════════════════════════════════════════════════════════
  const [voucher, ord] = await Promise.all([
    post("/ledger/voucher", {
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

  console.log("STEP6+7 done:", { voucherId: voucher.value.id, ordId });

  // ═══════════════════════════════════════════════════════════════
  // STEP 8: Convert order → invoice
  // ═══════════════════════════════════════════════════════════════
  const inv = await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  const invId = inv.value.id;

  console.log("STEP8 done:", { invId });

  // ═══════════════════════════════════════════════════════════════
  // DIAGNOSTIC READBACK (GETs are free)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n=== DIAGNOSTIC READBACK ===\n");

  const [projFull, invFull, orderFull, custFull, suppFull, emp1Full, emp2Full] = await Promise.all([
    get(`/project/${pId}?fields=*,projectActivities(*,activity(*)),participants(employee(id,firstName,lastName,email),adminAccess)`),
    get(`/invoice/${invId}?fields=*,customer(*),orders(*,project(*),orderLines(*,vatType(*))),orderLines(*,vatType(*)),projectInvoiceDetails(*)`),
    get(`/order/${ordId}?fields=*,orderLines(*,vatType(*))`),
    get(`/customer/${custId}?fields=*`),
    get(`/supplier/${suppId}?fields=*`),
    get(`/employee/${e1}?fields=*`),
    get(`/employee/${e2}?fields=*`),
  ]);

  console.log("PROJECT:", JSON.stringify({
    id: projFull.value.id,
    name: projFull.value.name,
    projectManager: projFull.value.projectManager,
    customer: projFull.value.customer,
    isFixedPrice: projFull.value.isFixedPrice,
    fixedprice: projFull.value.fixedprice,
    startDate: projFull.value.startDate,
    isClosed: projFull.value.isClosed,
    isInternal: projFull.value.isInternal,
    projectCategory: projFull.value.projectCategory,
    activities: projFull.value.projectActivities?.map((a: any) => ({
      id: a.id,
      budgetHours: a.budgetHours,
      budgetFeeCurrency: a.budgetFeeCurrency,
      activity: a.activity,
    })),
    participants: projFull.value.participants,
  }, null, 2));

  console.log("\nINVOICE:", JSON.stringify({
    id: invFull.value.id,
    invoiceNumber: invFull.value.invoiceNumber,
    customer: invFull.value.customer,
    invoiceDate: invFull.value.invoiceDate,
    invoiceDueDate: invFull.value.invoiceDueDate,
    amountExcludingVatCurrency: invFull.value.amountExcludingVatCurrency,
    amountCurrency: invFull.value.amountCurrency,
    amountCurrencyOutstanding: invFull.value.amountCurrencyOutstanding,
    isApproved: invFull.value.isApproved,
    isCredited: invFull.value.isCredited,
    isSent: invFull.value.isSent,
    orders: invFull.value.orders,
    projectInvoiceDetails: invFull.value.projectInvoiceDetails,
  }, null, 2));

  console.log("\nORDER:", JSON.stringify({
    id: orderFull.value.id,
    status: orderFull.value.status,
    customer: orderFull.value.customer,
    project: orderFull.value.project,
    orderLines: orderFull.value.orderLines,
  }, null, 2));

  console.log("\nCUSTOMER:", JSON.stringify({
    id: custFull.value.id,
    name: custFull.value.name,
    organizationNumber: custFull.value.organizationNumber,
    isCustomer: custFull.value.isCustomer,
  }, null, 2));

  console.log("\nSUPPLIER:", JSON.stringify({
    id: suppFull.value.id,
    name: suppFull.value.name,
    organizationNumber: suppFull.value.organizationNumber,
    isSupplier: suppFull.value.isSupplier,
  }, null, 2));

  console.log("\nEMPLOYEE PM:", JSON.stringify({
    id: emp1Full.value.id,
    firstName: emp1Full.value.firstName,
    lastName: emp1Full.value.lastName,
    email: emp1Full.value.email,
  }, null, 2));

  console.log("\nEMPLOYEE CON:", JSON.stringify({
    id: emp2Full.value.id,
    firstName: emp2Full.value.firstName,
    lastName: emp2Full.value.lastName,
    email: emp2Full.value.email,
  }, null, 2));

  // Timesheet summary
  const tsFull = await get(`/timesheet/entry?projectId=${pId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=employee(id,firstName,lastName),hours,date,hourlyRate,chargeable&count=500`);
  const byE: Record<string, { hours: number; hourlyRate: number; chargeable: boolean }> = {};
  for (const te of tsFull.values || []) {
    const key = `${te.employee?.firstName} ${te.employee?.lastName} (${te.employee?.id})`;
    if (!byE[key]) byE[key] = { hours: 0, hourlyRate: te.hourlyRate, chargeable: true };
    byE[key].hours += te.hours;
    if (!te.chargeable) byE[key].chargeable = false;
  }
  console.log("\nTIMESHEET:", JSON.stringify(byE, null, 2));

  // Hourly rates
  const ratesFull = await get(`/project/hourlyRates?projectId=${pId}&count=10&fields=*,projectSpecificRates(*,employee(id,firstName,lastName),activity(id,name))`);
  console.log("\nHOURLY_RATES:", JSON.stringify({
    model: ratesFull.values?.[0]?.hourlyRateModel,
    rates: ratesFull.values?.[0]?.projectSpecificRates?.map((r: any) => ({
      employee: `${r.employee?.firstName} ${r.employee?.lastName}`,
      activity: r.activity?.name,
      hourlyRate: r.hourlyRate,
    })),
  }, null, 2));

  // Voucher
  const vchFull = await get(`/ledger/voucher/${voucher.value.id}?fields=*,postings(*)`);
  console.log("\nVOUCHER:", JSON.stringify({
    id: vchFull.value.id,
    date: vchFull.value.date,
    description: vchFull.value.description,
    voucherType: vchFull.value.voucherType,
    postings: vchFull.value.postings?.map((p: any) => ({
      row: p.row,
      account: p.account,
      amount: p.amount,
      amountCurrency: p.amountCurrency,
      project: p.project,
      supplier: p.supplier,
      description: p.description,
    })),
  }, null, 2));

  // Orderlines
  const olFull = await get(`/project/orderline?projectId=${pId}&count=10&fields=*`);
  console.log("\nORDERLINES:", JSON.stringify(olFull.values?.map((ol: any) => ({
    id: ol.id,
    description: ol.description,
    unitCostCurrency: ol.unitCostCurrency,
    vendor: ol.vendor,
    project: ol.project,
  })), null, 2));

  console.log("\n=== END DIAGNOSTIC ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
