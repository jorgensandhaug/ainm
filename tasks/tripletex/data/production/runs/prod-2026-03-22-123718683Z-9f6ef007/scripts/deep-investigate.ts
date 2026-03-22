// Deep investigation: create full project lifecycle in sandbox and examine ALL entities
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const AUTH = "Basic " + btoa("0:eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9");

const TS = Date.now();
const PROJECT_NAME = `LifecycleTest-${TS}`;
const CUST_NAME = `TestCust-${TS}`;
const CUST_ORG = "851704027";  // using same org as production task
const BUDGET = 418100;
const PM_FIRST = "TestPM";
const PM_LAST = "User";
const PM_EMAIL = `pm-${TS}@example.org`;
const PM_HOURS = 75;
const CON_FIRST = "TestCon";
const CON_LAST = "User";
const CON_EMAIL = `con-${TS}@example.org`;
const CON_HOURS = 47;
const SUPP_NAME = `TestSupp-${TS}`;
const SUPP_ORG = "964716188";
const SUPP_COST = 56200;

const TOTAL_HOURS = PM_HOURS + CON_HOURS;
const HOURLY_RATE = Math.round(BUDGET / TOTAL_HOURS);
const TODAY = new Date().toISOString().slice(0, 10);
const SI_INV_NUM = `SINV-${TS}`;
const h = { "Content-Type": "application/json", Authorization: AUTH };

async function get(path: string) {
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  console.log(`GET ${path} -> ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(b).slice(0, 500)); throw new Error(`GET ${path} ${r.status}`); }
  return b;
}
async function post(path: string, body: any) {
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  console.log(`POST ${path} -> ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(b).slice(0, 500)); throw new Error(`POST ${path} ${r.status}`); }
  return b;
}
async function put(path: string, body?: any) {
  const r = await fetch(`${BASE}${path}`, { method: "PUT", headers: h, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  const b = await r.json();
  console.log(`PUT ${path} -> ${r.status}`);
  if (!r.ok) { console.log("ERROR:", JSON.stringify(b).slice(0, 500)); throw new Error(`PUT ${path} ${r.status}`); }
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

function buildEhfXml(invoiceNumber: string, supplierName: string, supplierOrg: string, amount: number, custOrg: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
  xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
  xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>${TODAY}</cbc:IssueDate>
  <cbc:DueDate>${TODAY}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${supplierOrg}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${supplierOrg}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${supplierOrg}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${custOrg}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Firmagate 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${custOrg}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${custOrg}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${invoiceNumber}</cbc:PaymentID>
    <cac:PayeeFinancialAccount><cbc:ID>12345678903</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">0</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${amount}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">0</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>Z</cbc:ID>
        <cbc:Percent>0</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${amount}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${amount}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${amount}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${amount}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${amount}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>Leverandørkostnad</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>Z</cbc:ID>
        <cbc:Percent>0</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${amount}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  console.log("=== DEEP INVESTIGATION: Full Project Lifecycle ===");
  console.log("TODAY:", TODAY, "HOURLY_RATE:", HOURLY_RATE, "TOTAL_HOURS:", TOTAL_HOURS);

  // STEP 1: Frontload ALL reads + create customer
  const [dept, pm, acct, vat, vtRes, whoAmI] = await Promise.all([
    get("/department?isInactive=false&count=1&fields=*"),
    get("/employee?assignableProjectManagers=true&count=1&fields=*"),
    get("/ledger/account?number=1920,6590,2400&fields=id,number,name,isBankAccount,bankAccountNumber"),
    get("/ledger/vatType?typeOfVat=OUTGOING&vatDate=" + TODAY + "&fields=id,name,percentage"),
    get("/ledger/voucherType?name=Leverand%C3%B8rfaktura&count=1&fields=id,name"),
    get("/token/session/>whoAmI?fields=*,company(*)"),
  ]);

  const cust = await post("/customer", { name: CUST_NAME, organizationNumber: CUST_ORG, isCustomer: true });

  const deptId  = dept.values[0].id;
  const pmAssId = pm.values[0].id;
  const a1920   = acct.values.find((a: any) => a.number === 1920);
  const acc6590 = acct.values.find((a: any) => a.number === 6590);
  const acc2400 = acct.values.find((a: any) => a.number === 2400);
  const vatId   = vat.values[0].id;
  const vtId    = vtRes.values[0].id;
  const custId  = cust.value.id;
  const companyOrg = whoAmI.value?.company?.organizationNumber || CUST_ORG;

  console.log("STEP1:", { deptId, pmAssId, custId, vatId, vtId, companyOrg });

  // STEP 2: Employees + project
  const emps = await post("/employee/list", [
    { firstName: PM_FIRST, lastName: PM_LAST, email: PM_EMAIL, dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
    { firstName: CON_FIRST, lastName: CON_LAST, email: CON_EMAIL, dateOfBirth: "1992-01-01", userType: "NO_ACCESS", department: { id: deptId } },
  ]);
  const e1 = emps.values[0].id;
  const e2 = emps.values[1].id;

  const proj = await post("/project", {
    name: PROJECT_NAME,
    startDate: TODAY,
    customer: { id: custId },
    projectManager: { id: pmAssId },
  });
  const pId = proj.value.id;
  console.log("STEP2:", { e1, e2, pId });

  // STEP 3: Activity + participants
  const act = await post("/project/projectActivity", {
    project: { id: pId },
    startDate: TODAY,
    budgetHours: TOTAL_HOURS,
    budgetFeeCurrency: BUDGET,
    activity: {
      name: "Prosjektarbeid",
      activityType: "PROJECT_SPECIFIC_ACTIVITY",
      isChargeable: true,
    },
  });
  const actId = act.value.activity.id;

  await post("/project/participant/list", [
    { project: { id: pId }, employee: { id: e1 }, adminAccess: true },
    { project: { id: pId }, employee: { id: e2 }, adminAccess: false },
  ]);
  console.log("STEP3:", { actId });

  // STEP 4: Hourly rates
  const rh = await get(`/project/hourlyRates?projectId=${pId}&count=10&fields=*`);
  const holder = rh.values[0];
  await put(`/project/hourlyRates/${holder.id}`, {
    project: { id: pId },
    startDate: TODAY,
    hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
  });
  await Promise.all([
    post("/project/hourlyRates/projectSpecificRates", {
      projectHourlyRate: { id: holder.id },
      employee: { id: e1 }, activity: { id: actId }, hourlyRate: HOURLY_RATE,
    }),
    post("/project/hourlyRates/projectSpecificRates", {
      projectHourlyRate: { id: holder.id },
      employee: { id: e2 }, activity: { id: actId }, hourlyRate: HOURLY_RATE,
    }),
  ]);
  console.log("STEP4: rates set at", HOURLY_RATE);

  // STEP 5: Timesheet + supplier + orderline
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
      project: { id: pId }, description: "Leverandørkostnad", date: TODAY,
      count: 1, unitCostCurrency: SUPP_COST, isChargeable: false,
    }),
  ]);
  const suppId = suppRes.value.id;
  console.log("STEP5:", { timesheetEntries: tsRes.values?.length, suppId });

  // STEP 6+7: Voucher + order
  const [voucher, ord] = await Promise.all([
    post("/ledger/voucher", {
      date: TODAY, description: `${SUPP_NAME} - leverandørkostnad`,
      voucherType: { id: vtId },
      postings: [
        { row: 1, account: { id: acc6590!.id }, amount: SUPP_COST, amountCurrency: SUPP_COST, amountGross: SUPP_COST, amountGrossCurrency: SUPP_COST, project: { id: pId }, date: TODAY, description: `${SUPP_NAME} - leverandørkostnad` },
        { row: 2, account: { id: acc2400!.id }, amount: -SUPP_COST, amountCurrency: -SUPP_COST, amountGross: -SUPP_COST, amountGrossCurrency: -SUPP_COST, supplier: { id: suppId }, date: TODAY, description: `${SUPP_NAME} - leverandørkostnad` },
      ],
    }),
    post("/order", {
      customer: { id: custId }, project: { id: pId },
      orderDate: TODAY, deliveryDate: TODAY,
      orderLines: [{ description: PROJECT_NAME, count: 1, unitPriceExcludingVatCurrency: BUDGET, vatType: { id: vatId } }],
    }),
  ]);
  const ordId = ord.value.id;
  console.log("STEP6+7:", { voucherId: voucher.value?.id, ordId });

  // STEP 6B: importDocument
  const xml = buildEhfXml(SI_INV_NUM, SUPP_NAME, SUPP_ORG, SUPP_COST, companyOrg);
  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), `${SI_INV_NUM}.xml`);
  const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST", headers: { Authorization: AUTH }, body: formData,
  });
  const importBody = await importRes.json();
  let importVoucherId: number | null = null;
  if (importRes.ok) {
    const iv = importBody.values[0];
    importVoucherId = iv.id;
    const putP = await put(`/ledger/voucher/${iv.id}?sendToLedger=false`, {
      version: iv.version,
      postings: [
        { row: 1, account: { id: acc6590!.id }, amount: SUPP_COST, amountCurrency: SUPP_COST, amountGross: SUPP_COST, amountGrossCurrency: SUPP_COST, project: { id: pId }, date: TODAY, description: `${SUPP_NAME} - leverandørkostnad` },
        { row: 2, account: { id: acc2400!.id }, amount: -SUPP_COST, amountCurrency: -SUPP_COST, amountGross: -SUPP_COST, amountGrossCurrency: -SUPP_COST, supplier: { id: suppId }, date: TODAY, description: `${SUPP_NAME} - leverandørkostnad` },
      ],
    });
    await put(`/ledger/voucher/${iv.id}?sendToLedger=true`, { version: putP.value?.version });
    console.log("importDocument OK:", iv.id);
  } else {
    console.log("importDocument FAILED:", importRes.status, JSON.stringify(importBody).slice(0, 300));
  }

  // STEP 8: Invoice
  const inv = await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
  const invId = inv.value.id;
  console.log("STEP8: invoiceId=", invId);

  // ══════════════════════════════════════════════════════════════
  // EXHAUSTIVE READBACK: Check EVERY possible entity the scorer might look at
  // ══════════════════════════════════════════════════════════════
  console.log("\n\n═══════════════ EXHAUSTIVE READBACK ═══════════════\n");

  // 1. Project - full state with ALL expansions
  const projFull = await get(`/project/${pId}?fields=*,customer(*),projectManager(*),projectActivities(*,activity(*)),participants(*,employee(*)),projectHourlyRates(*)`);
  console.log("\n=== PROJECT (full) ===");
  console.log(JSON.stringify(projFull.value, null, 2));

  // 2. Project period data - invoicing reserve, hourlist report
  try {
    const reserve = await get(`/project/${pId}/period/invoicingReserve?periodDateFrom=${TODAY}&periodDateTo=2027-01-01`);
    console.log("\n=== PROJECT INVOICING RESERVE ===");
    console.log(JSON.stringify(reserve, null, 2));
  } catch (e: any) { console.log("Reserve failed:", e.message); }

  try {
    const hourlist = await get(`/project/${pId}/period/hourlistReport?periodDateFrom=${TODAY}&periodDateTo=2027-01-01`);
    console.log("\n=== PROJECT HOURLIST REPORT ===");
    console.log(JSON.stringify(hourlist, null, 2));
  } catch (e: any) { console.log("Hourlist failed:", e.message); }

  try {
    const overallStatus = await get(`/project/${pId}/period/overallStatus?periodDateFrom=${TODAY}&periodDateTo=2027-01-01&fields=*`);
    console.log("\n=== PROJECT OVERALL STATUS ===");
    console.log(JSON.stringify(overallStatus, null, 2));
  } catch (e: any) { console.log("overallStatus failed:", e.message); }

  // 3. Customer full state
  const custFull = await get(`/customer/${custId}?fields=*`);
  console.log("\n=== CUSTOMER ===");
  console.log(JSON.stringify(custFull.value, null, 2));

  // 4. Employees full state
  const [emp1, emp2] = await Promise.all([
    get(`/employee/${e1}?fields=*`),
    get(`/employee/${e2}?fields=*`),
  ]);
  console.log("\n=== EMPLOYEE PM ===");
  console.log(JSON.stringify(emp1.value, null, 2));
  console.log("\n=== EMPLOYEE CON ===");
  console.log(JSON.stringify(emp2.value, null, 2));

  // 5. Timesheet entries - all details
  const tsFullRes = await get(`/timesheet/entry?projectId=${pId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=*,employee(*),activity(*),project(*)&count=500`);
  console.log("\n=== TIMESHEET ENTRIES (summary) ===");
  const byEmp: Record<string, any> = {};
  for (const te of tsFullRes.values || []) {
    const key = `${te.employee?.firstName} ${te.employee?.lastName}`;
    if (!byEmp[key]) byEmp[key] = { totalHours: 0, hourlyRate: te.hourlyRate, chargeable: te.chargeable, entries: 0 };
    byEmp[key].totalHours += te.hours;
    byEmp[key].entries++;
  }
  console.log(JSON.stringify(byEmp, null, 2));

  // 6. Supplier full state
  const suppFull = await get(`/supplier/${suppId}?fields=*`);
  console.log("\n=== SUPPLIER ===");
  console.log(JSON.stringify(suppFull.value, null, 2));

  // 7. Voucher - full postings with account expansion
  const vchFull = await get(`/ledger/voucher/${voucher.value.id}?fields=*,postings(*,account(*),project(*),supplier(*))`);
  console.log("\n=== VOUCHER (direct) ===");
  console.log(JSON.stringify(vchFull.value, null, 2));

  // 8. Import voucher if exists
  if (importVoucherId) {
    const ivFull = await get(`/ledger/voucher/${importVoucherId}?fields=*,postings(*,account(*),project(*),supplier(*))`);
    console.log("\n=== IMPORT VOUCHER ===");
    console.log(JSON.stringify(ivFull.value, null, 2));
  }

  // 9. Supplier invoices
  const siRes = await get(`/supplierInvoice?supplierId=${suppId}&invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&count=10&fields=*,supplier(*),voucher(*)`);
  console.log("\n=== SUPPLIER INVOICES ===");
  console.log(JSON.stringify(siRes.values, null, 2));

  // 10. Invoice - full state with all expansions
  const invFull = await get(`/invoice/${invId}?fields=*,customer(*),orders(*,project(*),orderLines(*,vatType(*))),orderLines(*,vatType(*)),projectInvoiceDetails(*,project(*))`);
  console.log("\n=== INVOICE ===");
  console.log(JSON.stringify(invFull.value, null, 2));

  // 11. Order - full state
  const ordFull = await get(`/order/${ordId}?fields=*,orderLines(*,vatType(*)),project(*)`);
  console.log("\n=== ORDER ===");
  console.log(JSON.stringify(ordFull.value, null, 2));

  // 12. Project orderlines
  const olRes2 = await get(`/project/orderline?projectId=${pId}&count=10&fields=*,vendor(*),project(*)`);
  console.log("\n=== PROJECT ORDERLINES ===");
  console.log(JSON.stringify(olRes2.values, null, 2));

  // 13. Project activity details
  const paRes = await get(`/project/projectActivity?projectId=${pId}&count=10&fields=*,activity(*)`);
  console.log("\n=== PROJECT ACTIVITIES ===");
  console.log(JSON.stringify(paRes.values, null, 2));

  // 14. Project hourly rates details
  const hrRes = await get(`/project/hourlyRates?projectId=${pId}&count=10&fields=*,projectSpecificRates(*,employee(*),activity(*))`);
  console.log("\n=== HOURLY RATES ===");
  console.log(JSON.stringify(hrRes.values, null, 2));

  // 15. Project participants details
  const partRes = await get(`/project/participant?projectId=${pId}&count=10&fields=*,employee(*)`);
  console.log("\n=== PARTICIPANTS ===");
  console.log(JSON.stringify(partRes.values, null, 2));

  // 16. Balance sheet for relevant accounts
  try {
    const bs = await get(`/balanceSheet?dateFrom=${TODAY}&dateTo=${TODAY}&accountNumberFrom=1500&accountNumberTo=9999&fields=*`);
    console.log("\n=== BALANCE SHEET (summary of non-zero) ===");
    for (const entry of bs.values || []) {
      if (entry.closingBalance !== 0 || entry.sumAmount !== 0) {
        console.log(`  ${entry.account?.number} ${entry.account?.name}: closing=${entry.closingBalance}, sum=${entry.sumAmount}`);
      }
    }
  } catch (e: any) { console.log("Balance sheet failed:", e.message); }

  // 17. Ledger postings for project
  const lpRes = await get(`/ledger/posting?projectId=${pId}&dateFrom=${TODAY}&dateTo=2027-01-01&count=100&fields=*,account(*),project(*),supplier(*),customer(*)`);
  console.log("\n=== LEDGER POSTINGS (for project) ===");
  for (const p of lpRes.values || []) {
    console.log(`  row=${p.row} acc=${p.account?.number}(${p.account?.name}) amount=${p.amount} project=${p.project?.name} supplier=${p.supplier?.name} customer=${p.customer?.name} desc=${p.description}`);
  }

  // 18. Invoice voucher postings
  const invVoucherRes = await get(`/invoice/${invId}?fields=voucher(id)`);
  if (invVoucherRes.value?.voucher?.id) {
    const invVch = await get(`/ledger/voucher/${invVoucherRes.value.voucher.id}?fields=*,postings(*,account(*),project(*),customer(*))`);
    console.log("\n=== INVOICE VOUCHER ===");
    console.log(JSON.stringify(invVch.value, null, 2));
  }

  console.log("\n\n═══════════════ END EXHAUSTIVE READBACK ═══════════════");
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
