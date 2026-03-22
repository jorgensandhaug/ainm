const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");

const TS = Date.now();
const PROJECT_NAME = `Lifecycle Sandbox ${TS}`;
const CUST_NAME    = `Sandbox Customer ${TS}`;
const CUST_ORG     = "999" + String(TS).slice(-6);
const BUDGET       = 433850;
const PM_HOURS     = 47;
const CON_HOURS    = 124;
const SUPP_NAME    = `Sandbox Supplier ${TS}`;
const SUPP_ORG     = "888" + String(TS).slice(-6);
const SUPP_COST    = 98650;

const TOTAL_HOURS = PM_HOURS + CON_HOURS;
const TODAY = new Date().toISOString().slice(0, 10);
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) throw new Error(`GET ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`);
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) throw new Error(`POST ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`);
  return b;
}
async function put(path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const b = await r.json();
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
  console.log("=== STEP 1: Frontload reads + create customer ===");
  const [dept, pm, acct, vat, vtRes] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id,name,percentage"),
    get("/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
  ]);
  console.log("DEPT:", JSON.stringify(dept.values[0], null, 2));
  console.log("PM:", JSON.stringify(pm.values[0], null, 2));
  console.log("ACCOUNTS:", JSON.stringify(acct.values, null, 2));
  console.log("VAT:", JSON.stringify(vat.values, null, 2));
  console.log("VOUCHERTYPE:", JSON.stringify(vtRes.values[0], null, 2));

  const deptId  = dept.values[0].id;
  const pmAssId = pm.values[0].id;
  const a1920   = acct.values.find((a: any) => a.number === 1920);
  const acc6590 = acct.values.find((a: any) => a.number === 6590);
  const acc2400 = acct.values.find((a: any) => a.number === 2400);
  const vatId   = vat.values[0].id;
  const vtId    = vtRes.values[0].id;

  // POST customer
  const cust = await post("/customer", { name: CUST_NAME, organizationNumber: CUST_ORG, isCustomer: true });
  console.log("\nCUST CREATE RESPONSE:", JSON.stringify(cust.value, null, 2));
  const custId = cust.value.id;

  // GET readback
  const custRead = await get(`/customer/${custId}?fields=*`);
  console.log("CUST READBACK:", JSON.stringify(custRead.value, null, 2));

  console.log("\n=== STEP 2: Employees + project ===");
  const emps = await post("/employee/list", [
    { firstName: "Diego", lastName: "Martínez", email: `diego.${TS}@example.org`, dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
    { firstName: "Fernando", lastName: "Pérez", email: `fernando.${TS}@example.org`, dateOfBirth: "1992-01-01", userType: "NO_ACCESS", department: { id: deptId } },
  ]);
  console.log("EMPS CREATE:", JSON.stringify(emps.values?.map((e: any) => ({ id: e.id, firstName: e.firstName, lastName: e.lastName, email: e.email, userType: e.userType })), null, 2));
  const e1 = emps.values[0].id;
  const e2 = emps.values[1].id;

  // GET readback employees
  const [emp1Read, emp2Read] = await Promise.all([
    get(`/employee/${e1}?fields=*`),
    get(`/employee/${e2}?fields=*`),
  ]);
  console.log("EMP1 READBACK:", JSON.stringify({ id: emp1Read.value.id, firstName: emp1Read.value.firstName, lastName: emp1Read.value.lastName, email: emp1Read.value.email, department: emp1Read.value.department, userType: emp1Read.value.userType }, null, 2));
  console.log("EMP2 READBACK:", JSON.stringify({ id: emp2Read.value.id, firstName: emp2Read.value.firstName, lastName: emp2Read.value.lastName, email: emp2Read.value.email, department: emp2Read.value.department, userType: emp2Read.value.userType }, null, 2));

  const proj = await post("/project", {
    name: PROJECT_NAME,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmAssId },
    isFixedPrice: true,
    fixedprice: BUDGET,
  });
  console.log("\nPROJECT CREATE:", JSON.stringify(proj.value, null, 2));
  const pId = proj.value.id;

  // GET readback project
  const projRead = await get(`/project/${pId}?fields=*,customer(*),projectManager(*)`);
  console.log("PROJECT READBACK:", JSON.stringify({
    id: projRead.value.id,
    name: projRead.value.name,
    startDate: projRead.value.startDate,
    isFixedPrice: projRead.value.isFixedPrice,
    fixedprice: projRead.value.fixedprice,
    customer: projRead.value.customer,
    projectManager: projRead.value.projectManager,
    isInternal: projRead.value.isInternal,
    projectCategory: projRead.value.projectCategory,
    budgetHours: projRead.value.budgetHours,
    budgetFeeCurrency: projRead.value.budgetFeeCurrency,
  }, null, 2));

  console.log("\n=== STEP 3: Activity + participants ===");
  const act = await post("/project/projectActivity", {
    project: { id: pId },
    startDate: TODAY,
    budgetHours: TOTAL_HOURS,
    budgetFeeCurrency: BUDGET,
    activity: {
      name: "Prosjektaktivitet",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: false,
    },
  });
  console.log("ACTIVITY CREATE:", JSON.stringify(act.value, null, 2));
  const actId = act.value.activity.id;

  const parts = await post("/project/participant/list", [
    { project: { id: pId }, employee: { id: e1 }, adminAccess: true },
    { project: { id: pId }, employee: { id: e2 }, adminAccess: false },
  ]);
  console.log("PARTICIPANTS CREATE:", JSON.stringify(parts.values?.map((p: any) => ({
    id: p.id, employee: p.employee, adminAccess: p.adminAccess,
  })), null, 2));

  // GET readback project with activities and participants
  const projRead2 = await get(`/project/${pId}?fields=*,projectActivities(*,activity(*)),participants(employee(id,firstName,lastName,email),adminAccess)`);
  console.log("PROJECT AFTER ACTIVITY+PARTS:", JSON.stringify({
    id: projRead2.value.id,
    name: projRead2.value.name,
    isFixedPrice: projRead2.value.isFixedPrice,
    fixedprice: projRead2.value.fixedprice,
    budgetHours: projRead2.value.budgetHours,
    budgetFeeCurrency: projRead2.value.budgetFeeCurrency,
    activities: projRead2.value.projectActivities,
    participants: projRead2.value.participants,
  }, null, 2));

  console.log("\n=== STEP 4: Timesheet + supplier + orderline ===");
  const ts1 = splitHours(PM_HOURS, TODAY).map(e => ({
    employee: { id: e1 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours,
  }));
  const ts2 = splitHours(CON_HOURS, TODAY).map(e => ({
    employee: { id: e2 }, project: { id: pId }, activity: { id: actId }, date: e.date, hours: e.hours,
  }));

  const tsRes = await post("/timesheet/entry/list", [...ts1, ...ts2]);
  console.log("TIMESHEET ENTRIES CREATED:", tsRes.values?.length);

  const suppRes = await post("/supplier", { name: SUPP_NAME, organizationNumber: SUPP_ORG, isSupplier: true });
  console.log("SUPPLIER CREATE:", JSON.stringify({ id: suppRes.value.id, name: suppRes.value.name, organizationNumber: suppRes.value.organizationNumber, ledgerAccount: suppRes.value.ledgerAccount }, null, 2));
  const suppId = suppRes.value.id;

  // GET readback supplier
  const suppRead = await get(`/supplier/${suppId}?fields=*`);
  console.log("SUPPLIER READBACK:", JSON.stringify({ id: suppRead.value.id, name: suppRead.value.name, organizationNumber: suppRead.value.organizationNumber, isSupplier: suppRead.value.isSupplier }, null, 2));

  const olRes = await post("/project/orderline", {
    project: { id: pId },
    description: "Leverandørkostnad",
    date: TODAY,
    count: 1,
    unitCostCurrency: SUPP_COST,
    isChargeable: false,
  });
  console.log("ORDERLINE CREATE:", JSON.stringify(olRes.value, null, 2));

  // GET readback timesheet
  const tsRead = await get(`/timesheet/entry?projectId=${pId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=employee(id,firstName,lastName),hours,date&count=500`);
  const byE: Record<string, number> = {};
  for (const te of tsRead.values || []) {
    const key = `${te.employee?.firstName} ${te.employee?.lastName} (${te.employee?.id})`;
    byE[key] = (byE[key] || 0) + te.hours;
  }
  console.log("TIMESHEET READBACK:", JSON.stringify(byE, null, 2));

  console.log("\n=== STEP 5+6: Voucher + order ===");
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
  console.log("VOUCHER CREATE:", JSON.stringify(voucher.value, null, 2));

  // GET readback voucher with postings
  const vchRead = await get(`/ledger/voucher/${voucher.value.id}?fields=*,postings(*,account(*),project(*),supplier(*))`);
  console.log("VOUCHER READBACK:", JSON.stringify({
    id: vchRead.value.id,
    date: vchRead.value.date,
    description: vchRead.value.description,
    number: vchRead.value.number,
    voucherType: vchRead.value.voucherType,
    postings: vchRead.value.postings?.map((p: any) => ({
      row: p.row,
      account: { id: p.account?.id, number: p.account?.number, name: p.account?.name },
      amount: p.amount,
      amountCurrency: p.amountCurrency,
      amountGross: p.amountGross,
      project: p.project ? { id: p.project.id, name: p.project.name } : null,
      supplier: p.supplier ? { id: p.supplier.id, name: p.supplier.name } : null,
      description: p.description,
    })),
  }, null, 2));

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
  console.log("\nORDER CREATE:", JSON.stringify(ord.value, null, 2));
  const ordId = ord.value.id;

  // GET readback order
  const ordRead = await get(`/order/${ordId}?fields=*,orderLines(*,vatType(*))`);
  console.log("ORDER READBACK:", JSON.stringify({
    id: ordRead.value.id,
    status: ordRead.value.status,
    customer: ordRead.value.customer,
    project: ordRead.value.project,
    orderLines: ordRead.value.orderLines?.map((ol: any) => ({
      id: ol.id, description: ol.description, count: ol.count,
      unitPriceExcludingVatCurrency: ol.unitPriceExcludingVatCurrency,
      vatType: ol.vatType,
    })),
  }, null, 2));

  console.log("\n=== STEP 7: Order → Invoice ===");
  const inv = await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  console.log("INVOICE CREATE:", JSON.stringify(inv.value, null, 2));
  const invId = inv.value.id;

  // GET readback invoice with full expansion
  const invRead = await get(`/invoice/${invId}?fields=*,customer(*),orders(*,project(*),orderLines(*,vatType(*))),orderLines(*,vatType(*))`);
  console.log("INVOICE READBACK:", JSON.stringify({
    id: invRead.value.id,
    invoiceNumber: invRead.value.invoiceNumber,
    invoiceDate: invRead.value.invoiceDate,
    customer: invRead.value.customer ? { id: invRead.value.customer.id, name: invRead.value.customer.name, organizationNumber: invRead.value.customer.organizationNumber } : null,
    amountExcludingVatCurrency: invRead.value.amountExcludingVatCurrency,
    amountIncludingVatCurrency: invRead.value.amountIncludingVatCurrency,
    amountCurrencyOutstanding: invRead.value.amountCurrencyOutstanding,
    isApproved: invRead.value.isApproved,
    isCredited: invRead.value.isCredited,
    isSent: invRead.value.isSent,
    orders: invRead.value.orders?.map((o: any) => ({
      id: o.id,
      project: o.project ? { id: o.project.id, name: o.project.name } : null,
      orderLines: o.orderLines?.map((ol: any) => ({
        description: ol.description, count: ol.count,
        unitPriceExcludingVatCurrency: ol.unitPriceExcludingVatCurrency,
        vatType: ol.vatType ? { id: ol.vatType.id, percentage: ol.vatType.percentage } : null,
      })),
    })),
    projectInvoiceDetails: invRead.value.projectInvoiceDetails,
  }, null, 2));

  // Also check: does the project now show budgetHours at the top level?
  const projFinal = await get(`/project/${pId}?fields=*,customer(*),projectManager(*),projectActivities(*,activity(*))`);
  console.log("\nFINAL PROJECT:", JSON.stringify({
    id: projFinal.value.id,
    name: projFinal.value.name,
    isFixedPrice: projFinal.value.isFixedPrice,
    fixedprice: projFinal.value.fixedprice,
    budgetHours: projFinal.value.budgetHours,
    budgetFeeCurrency: projFinal.value.budgetFeeCurrency,
    customer: projFinal.value.customer ? { id: projFinal.value.customer.id, name: projFinal.value.customer.name } : null,
    projectManager: projFinal.value.projectManager ? { id: projFinal.value.projectManager.id, firstName: projFinal.value.projectManager.firstName, lastName: projFinal.value.projectManager.lastName, email: projFinal.value.projectManager.email } : null,
    activities: projFinal.value.projectActivities,
  }, null, 2));

  // Check project period data
  try {
    const period = await get(`/project/${pId}/period/invoicingReserve?periodDateFrom=${TODAY}&periodDateTo=2027-01-01`);
    console.log("\nPROJECT PERIOD RESERVE:", JSON.stringify(period, null, 2));
  } catch (e: any) { console.log("Period reserve error:", e.message); }

  try {
    const hourlist = await get(`/project/${pId}/period/hourlistReport?periodDateFrom=${TODAY}&periodDateTo=2027-01-01`);
    console.log("\nPROJECT HOURLIST:", JSON.stringify(hourlist, null, 2));
  } catch (e: any) { console.log("Hourlist error:", e.message); }

  // Check ledger postings for the project
  const projPostings = await get(`/ledger/posting?projectId=${pId}&dateFrom=${TODAY}&dateTo=2027-01-01&count=100&fields=*,account(*)`);
  console.log("\nPROJECT LEDGER POSTINGS:", projPostings.values?.length, "entries");
  for (const p of (projPostings.values || []).slice(0, 5)) {
    console.log(`  acct ${p.account?.number} ${p.account?.name}: ${p.amount} (${p.description})`);
  }

  console.log("\n=== DONE ===");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
