const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const AUTH = "Basic " + btoa("0:3LWHqLDfX8Q1Npc6doyZmrKZrSRi-NT38V8mwaJEYEg");

// ── PROMPT VALUES ──────────────────────────────────────────────
const PROJECT_NAME = "Plataforma Datos Dorada";
const CUST_NAME    = "Dorada SL";
const CUST_ORG     = "970096531";
const BUDGET       = 265000;
const PM_FIRST     = "Alejandro";
const PM_LAST      = "González";
const PM_EMAIL     = "alejandro.gonzalez@example.org";
const PM_HOURS     = 26;
const CON_FIRST    = "Lucía";
const CON_LAST     = "Sánchez";
const CON_EMAIL    = "lucia.sanchez@example.org";
const CON_HOURS    = 134;
const SUPP_NAME    = "Montaña SL";
const SUPP_ORG     = "804473823";
const SUPP_COST    = 26800;
// ── END PROMPT VALUES ──────────────────────────────────────────

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

  console.log("STEP1:", { deptId, pmAssId, a1920: a1920?.id, acc6590: acc6590?.id, acc2400: acc2400?.id, vatId, vtId, custId });

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

  console.log("STEP2:", { e1, e2, pId });

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

  console.log("STEP3:", { actId, participants: parts.values?.length });

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Timesheet + supplier + orderline  (3 parallel)
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

  console.log("STEP4:", { timesheetEntries: tsRes.values?.length, suppId });

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Supplier cost voucher  (accounting linkage)
  // ═══════════════════════════════════════════════════════════════
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

  console.log("STEP5: voucher", voucher.value.id);

  // ═══════════════════════════════════════════════════════════════
  // STEP 6: Create order
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

  console.log("STEP6: order", ordId);

  // ═══════════════════════════════════════════════════════════════
  // STEP 7: Convert order → invoice
  // ═══════════════════════════════════════════════════════════════
  const inv = await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  const invId = inv.value.id;

  console.log("STEP7: invoice", invId);

  // ═══════════════════════════════════════════════════════════════
  // DIAGNOSTIC: Read back all entities
  // ═══════════════════════════════════════════════════════════════
  console.log("\n=== DIAGNOSTIC READBACK ===\n");

  const [projFull, invFull, orderFull, custFull, suppFull, emp1Full, emp2Full] = await Promise.all([
    get(`/project/${pId}?fields=*,projectActivities(*),participants(employee(id,firstName,lastName,email),adminAccess)`),
    get(`/invoice/${invId}?fields=*`),
    get(`/order/${ordId}?fields=*`),
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
    amountIncludingVatCurrency: invFull.value.amountIncludingVatCurrency,
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
  const tsFull = await get(`/timesheet/entry?projectId=${pId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=employee(id,firstName,lastName),hours,date&count=500`);
  const byE: Record<string, number> = {};
  for (const te of tsFull.values || []) {
    const key = `${te.employee?.firstName} ${te.employee?.lastName} (${te.employee?.id})`;
    byE[key] = (byE[key] || 0) + te.hours;
  }
  console.log("\nTIMESHEET:", JSON.stringify(byE, null, 2));

  // Voucher and postings
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

  // Supplier invoice search
  const siFull = await get(`/supplierInvoice?supplierId=${suppId}&invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&count=10&fields=*`);
  console.log("\nSUPPLIER_INVOICES:", JSON.stringify(siFull.values?.length || 0));

  console.log("\n=== END DIAGNOSTIC ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
