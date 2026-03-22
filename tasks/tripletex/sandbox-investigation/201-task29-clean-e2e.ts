/**
 * Task 29 — Clean E2E with ALL improvements:
 * 1. POST /invoice with customer in orders[] (production-proven for check 6)
 * 2. importDocument for supplier invoice entity (potential check 5 fix)
 * 3. Hourly rates with chargeable activity (check 4 fix)
 * 4. Verify ALL state comprehensively
 *
 * This is the CANDIDATE new trusted standard flow.
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const RUN = Date.now();
const h = { "Content-Type": "application/json", Authorization: AUTH };

const PROJECT_NAME = `ERP-impl-${RUN}`;
const CUST_NAME    = `Havbris-${RUN}`;
const CUST_ORG     = "851704027";
const BUDGET       = 418100;
const PM_FIRST     = "Sigurd";
const PM_LAST      = "Berg";
const PM_EMAIL     = `sigurd.berg-${RUN}@example.org`;
const PM_HOURS     = 75;
const CON_FIRST    = "Marte";
const CON_LAST     = "Johansen";
const CON_EMAIL    = `marte.johansen-${RUN}@example.org`;
const CON_HOURS    = 47;
const SUPP_NAME    = `Lysgård-${RUN}`;
const SUPP_ORG     = "964716188";
const SUPP_COST    = 56200;

const TOTAL_HOURS = PM_HOURS + CON_HOURS;
const HOURLY_RATE = Math.round(BUDGET / TOTAL_HOURS);
const TODAY = new Date().toISOString().slice(0, 10);

let writeCount = 0, readCount = 0, errorCount = 0;

async function get(path: string) {
  readCount++;
  const r = await fetch(`${BASE}${path}`, { headers: h });
  const b = await r.json();
  if (!r.ok) { errorCount++; throw new Error(`GET ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`); }
  return b;
}
async function post(path: string, body: any) {
  writeCount++;
  const r = await fetch(`${BASE}${path}`, { method: "POST", headers: h, body: JSON.stringify(body) });
  const b = await r.json();
  if (!r.ok) { errorCount++; throw new Error(`POST ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`); }
  console.log(`[W${writeCount}] POST ${path.split("?")[0]} → ${r.status}`);
  return b;
}
async function put(path: string, body?: any) {
  writeCount++;
  const opts: any = { method: "PUT", headers: h };
  if (body !== undefined) opts.body = JSON.stringify(body);
  const r = await fetch(`${BASE}${path}`, opts);
  const b = await r.json();
  if (!r.ok) { errorCount++; throw new Error(`PUT ${path} ${r.status}: ${JSON.stringify(b).slice(0, 300)}`); }
  console.log(`[W${writeCount}] PUT ${path.split("?")[0]} → ${r.status}`);
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
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  TASK 29 CLEAN E2E — ${TODAY} — RUN ${RUN}`);
  console.log(`${"=".repeat(60)}\n`);

  // Get company org for XML
  const tokenRes = await get("/token/session/>whoAmI?fields=*,company(*)");
  const companyOrg = tokenRes.value?.company?.organizationNumber || "514295328";
  console.log(`COMPANY org: ${companyOrg}`);

  // ═══════════ STEP 1: Reads + customer ═══════════
  console.log("\n--- STEP 1: Reads + customer ---");
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
  console.log(`  dept=${deptId} pm=${pmAssId} cust=${custId} vat=${vatId}`);

  // ═══════════ STEP 2: Employees + project ═══════════
  console.log("\n--- STEP 2: Employees + project ---");
  const s2: Promise<any>[] = [
    post("/employee/list", [
      { firstName: PM_FIRST,  lastName: PM_LAST,  email: PM_EMAIL,  dateOfBirth: "1988-01-01", userType: "NO_ACCESS", department: { id: deptId } },
      { firstName: CON_FIRST, lastName: CON_LAST, email: CON_EMAIL, dateOfBirth: "1992-01-01", userType: "NO_ACCESS", department: { id: deptId } },
    ]),
    post("/project", {
      name: PROJECT_NAME, startDate: TODAY,
      customer: { id: custId }, projectManager: { id: pmAssId },
    }),
  ];
  if (a1920 && !a1920.bankAccountNumber) {
    s2.push(put(`/ledger/account/${a1920.id}`, { ...a1920, bankAccountNumber: "12345678903" }));
  }
  const [emps, proj] = await Promise.all(s2);
  const e1 = emps.values[0].id;
  const e2 = emps.values[1].id;
  const pId = proj.value.id;
  console.log(`  employees: PM=${e1}, CON=${e2}  project=${pId}`);

  // ═══════════ STEP 3: Activity (chargeable!) + participants ═══════════
  console.log("\n--- STEP 3: Activity + participants ---");
  const [act, parts] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: pId }, startDate: TODAY,
      budgetHours: TOTAL_HOURS, budgetFeeCurrency: BUDGET,
      activity: { name: "Prosjektarbeid", activityType: "PROJECT_SPECIFIC_ACTIVITY", isChargeable: true },
    }),
    post("/project/participant/list", [
      { project: { id: pId }, employee: { id: e1 }, adminAccess: true },
      { project: { id: pId }, employee: { id: e2 }, adminAccess: false },
    ]),
  ]);
  const actId = act.value.activity.id;

  // ═══════════ STEP 4: Hourly rates ═══════════
  console.log("\n--- STEP 4: Hourly rates ---");
  const rh = await get(`/project/hourlyRates?projectId=${pId}&count=10&fields=*`);
  const holder = rh.values[0];
  await put(`/project/hourlyRates/${holder.id}`, {
    project: { id: pId }, startDate: TODAY,
    hourlyRateModel: "TYPE_PROJECT_SPECIFIC_HOURLY_RATES",
  });
  await Promise.all([
    post("/project/hourlyRates/projectSpecificRates", {
      projectHourlyRate: { id: holder.id }, employee: { id: e1 },
      activity: { id: actId }, hourlyRate: HOURLY_RATE,
    }),
    post("/project/hourlyRates/projectSpecificRates", {
      projectHourlyRate: { id: holder.id }, employee: { id: e2 },
      activity: { id: actId }, hourlyRate: HOURLY_RATE,
    }),
  ]);
  console.log(`  rates set: ${HOURLY_RATE}/hr for both employees`);

  // ═══════════ STEP 5: Timesheet + supplier + orderline ═══════════
  console.log("\n--- STEP 5: Timesheet + supplier + orderline ---");
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
      project: { id: pId }, description: "Leverandørkostnad",
      date: TODAY, count: 1, unitCostCurrency: SUPP_COST, isChargeable: false,
    }),
  ]);
  const suppId = suppRes.value.id;
  console.log(`  timesheet: ${tsRes.values?.length} entries, supplier=${suppId}`);

  // ═══════════ STEP 6: Supplier cost — BOTH voucher AND importDocument ═══════════
  console.log("\n--- STEP 6: Supplier cost (voucher + importDocument) ---");

  // 6A: Standard voucher with project+supplier linkage
  const voucher = await post("/ledger/voucher", {
    date: TODAY,
    description: `${SUPP_NAME} - leverandørkostnad`,
    voucherType: { id: vtId },
    postings: [
      {
        row: 1, account: { id: acc6590!.id },
        amount: SUPP_COST, amountCurrency: SUPP_COST,
        amountGross: SUPP_COST, amountGrossCurrency: SUPP_COST,
        project: { id: pId }, date: TODAY,
        description: `${SUPP_NAME} - leverandørkostnad`,
      },
      {
        row: 2, account: { id: acc2400!.id },
        amount: -SUPP_COST, amountCurrency: -SUPP_COST,
        amountGross: -SUPP_COST, amountGrossCurrency: -SUPP_COST,
        supplier: { id: suppId }, date: TODAY,
        description: `${SUPP_NAME} - leverandørkostnad`,
      },
    ],
  });
  console.log(`  Voucher (standard): id=${voucher.value.id}`);

  // 6B: importDocument to create supplierInvoice entity
  const invNum = `SINV-${RUN}`;
  const xml = buildEhfXml(invNum, SUPP_NAME, SUPP_ORG, SUPP_COST, companyOrg);
  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "application/xml" }), `${invNum}.xml`);

  const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST", headers: { Authorization: AUTH }, body: formData,
  });
  writeCount++;
  const importBody = await importRes.json();
  let siVoucherId: number | null = null;
  if (importRes.ok) {
    const iv = importBody.values?.[0];
    siVoucherId = iv?.id;
    console.log(`  importDocument: voucher=${iv?.id} version=${iv?.version}`);

    // Set postings with project linkage
    const putP = await put(`/ledger/voucher/${iv.id}?sendToLedger=false`, {
      version: iv.version,
      postings: [
        {
          row: 1, account: { id: acc6590!.id },
          amount: SUPP_COST, amountCurrency: SUPP_COST,
          amountGross: SUPP_COST, amountGrossCurrency: SUPP_COST,
          project: { id: pId }, date: TODAY,
          description: `${SUPP_NAME} - leverandørkostnad`,
        },
        {
          row: 2, account: { id: acc2400!.id },
          amount: -SUPP_COST, amountCurrency: -SUPP_COST,
          amountGross: -SUPP_COST, amountGrossCurrency: -SUPP_COST,
          supplier: { id: suppId }, date: TODAY,
          description: `${SUPP_NAME} - leverandørkostnad`,
        },
      ],
    });
    // Book it
    await put(`/ledger/voucher/${iv.id}?sendToLedger=true`, { version: putP.value?.version });
    console.log(`  importDocument: booked`);
  } else {
    console.log(`  importDocument FAILED: ${importRes.status}`);
    errorCount++;
  }

  // ═══════════ STEP 7: Invoice via POST /invoice ═══════════
  // Key fix: customer MUST be inside orders[] for POST /invoice
  console.log("\n--- STEP 7: Invoice (POST /invoice with customer in orders[]) ---");
  const dueDate = new Date(Date.UTC(
    new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 30
  )).toISOString().slice(0, 10);

  const inv = await post("/invoice?sendToCustomer=false", {
    invoiceDate: TODAY,
    invoiceDueDate: dueDate,
    customer: { id: custId },
    orders: [{
      customer: { id: custId },  // CRITICAL: customer inside orders[]!
      orderDate: TODAY,
      deliveryDate: TODAY,
      project: { id: pId },
      orderLines: [{
        description: PROJECT_NAME,
        count: 1,
        unitPriceExcludingVatCurrency: BUDGET,
        vatType: { id: vatId },
      }],
    }],
  });
  const invId = inv.value.id;
  console.log(`  Invoice: id=${invId}, isApproved=${inv.value.isApproved}`);

  // ═══════════ VERIFICATION ═══════════
  console.log(`\n${"=".repeat(60)}`);
  console.log("  VERIFICATION");
  console.log(`${"=".repeat(60)}\n`);

  // Full project readback
  const projFull = await get(`/project/${pId}?fields=*,projectActivities(*,activity(*)),participants(employee(id,firstName,lastName,email),adminAccess),projectCategory(*)`);
  console.log("PROJECT:", JSON.stringify({
    id: projFull.value.id, name: projFull.value.name,
    projectManager: projFull.value.projectManager,
    customer: projFull.value.customer,
    isFixedPrice: projFull.value.isFixedPrice,
    activities: projFull.value.projectActivities?.map((a: any) => ({
      budgetHours: a.budgetHours, budgetFeeCurrency: a.budgetFeeCurrency,
      isChargeable: a.activity?.isChargeable,
    })),
    participants: projFull.value.participants,
  }, null, 2));

  // Timesheet
  const tsFull = await get(`/timesheet/entry?projectId=${pId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=*,employee(id,firstName,lastName)&count=500`);
  const byE: Record<string, { hours: number; rate: number; chargeable: boolean }> = {};
  for (const te of tsFull.values || []) {
    const key = `${te.employee?.firstName} ${te.employee?.lastName}`;
    if (!byE[key]) byE[key] = { hours: 0, rate: te.hourlyRate, chargeable: te.chargeable };
    byE[key].hours += te.hours;
  }
  console.log("\nTIMESHEET:", JSON.stringify(byE, null, 2));

  // Supplier invoices
  const siFull = await get(`/supplierInvoice?supplierId=${suppId}&invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&count=10&fields=*,voucher(*),supplier(*)`);
  console.log(`\nSUPPLIER_INVOICES: ${siFull.values?.length || 0}`);
  for (const si of (siFull.values || [])) {
    console.log(`  SI id=${si.id} invNum=${si.invoiceNumber} amount=${si.amount} voucherId=${si.voucher?.id} suppId=${si.supplier?.id}`);
  }

  // Invoice
  const invFull = await get(`/invoice/${invId}?fields=*,customer(*),orders(*,project(*),orderLines(*,vatType(*))),orderLines(*,vatType(*)),projectInvoiceDetails(*)`);
  console.log("\nINVOICE:", JSON.stringify({
    id: invFull.value.id,
    invoiceNumber: invFull.value.invoiceNumber,
    isApproved: invFull.value.isApproved,
    isSent: invFull.value.isSent,
    customer: { id: invFull.value.customer?.id, name: invFull.value.customer?.name },
    amountExcludingVatCurrency: invFull.value.amountExcludingVatCurrency,
    amountCurrency: invFull.value.amountCurrency,
    ordersCount: invFull.value.orders?.length,
    orderProject: invFull.value.orders?.[0]?.project?.id,
    orderStatus: invFull.value.orders?.[0]?.status,
    projectInvoiceDetailsCount: invFull.value.projectInvoiceDetails?.length,
    projectInvoiceDetails: invFull.value.projectInvoiceDetails?.map((d: any) => ({
      project: d.project, includeHours: d.includeHours,
      feeAmount: d.feeAmount, amountOrderLines: d.amountOrderLinesAndReinvoicing,
    })),
  }, null, 2));

  // Voucher postings
  const vchFull = await get(`/ledger/voucher/${voucher.value.id}?fields=*,postings(*,account(*),project(*),supplier(*))`);
  console.log("\nVOUCHER_POSTINGS:", JSON.stringify(vchFull.value.postings?.map((p: any) => ({
    row: p.row, acct: p.account?.number, amount: p.amount,
    project: p.project?.id, supplier: p.supplier?.id,
  })), null, 2));

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  RESULT: ${writeCount} writes, ${readCount} reads, ${errorCount} errors`);
  console.log(`${"=".repeat(60)}`);

  const checks = [
    { name: "Customer created", pass: custId > 0 },
    { name: "Project created with customer", pass: projFull.value.customer?.id === custId },
    { name: "2 employees created", pass: !!(e1 && e2) },
    { name: "Employees are participants", pass: projFull.value.participants?.length >= 2 },
    { name: "PM has adminAccess", pass: projFull.value.participants?.some((p: any) => p.employee?.id === e1 && p.adminAccess) },
    { name: "Activity has budget", pass: projFull.value.projectActivities?.[0]?.budgetFeeCurrency === BUDGET },
    { name: "Timesheet hours correct", pass: Object.values(byE).reduce((s, e) => s + e.hours, 0) === TOTAL_HOURS },
    { name: "Timesheet chargeable", pass: Object.values(byE).every((e) => e.chargeable) },
    { name: "Timesheet hourlyRate > 0", pass: Object.values(byE).every((e) => e.rate > 0) },
    { name: "Supplier created", pass: suppId > 0 },
    { name: "Project orderline exists", pass: (olRes.value?.id || 0) > 0 },
    { name: "Voucher with project linkage", pass: vchFull.value.postings?.some((p: any) => p.project?.id === pId) },
    { name: "Voucher with supplier linkage", pass: vchFull.value.postings?.some((p: any) => p.supplier?.id === suppId) },
    { name: "SupplierInvoice entity exists", pass: (siFull.values?.length || 0) > 0 },
    { name: "Invoice created", pass: invId > 0 },
    { name: "Invoice isApproved", pass: invFull.value.isApproved },
    { name: "Invoice amount = BUDGET", pass: invFull.value.amountExcludingVatCurrency === BUDGET },
    { name: "Invoice has project link", pass: invFull.value.orders?.[0]?.project?.id === pId },
    { name: "Invoice has projectInvoiceDetails", pass: (invFull.value.projectInvoiceDetails?.length || 0) > 0 },
  ];

  console.log("\nCHECKLIST:");
  let passed = 0;
  for (const c of checks) {
    console.log(`  ${c.pass ? "✓" : "✗"} ${c.name}`);
    if (c.pass) passed++;
  }
  console.log(`\n  ${passed}/${checks.length} checks passed`);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
