/**
 * Task 29 — Comprehensive E2E sandbox test.
 *
 * Goals:
 * 1. Run the full project lifecycle with BOTH invoice approaches
 * 2. Test importDocument for supplier invoice (hypothesis for check 5)
 * 3. Verify EVERY possible field the scorer might check
 * 4. Compare results to identify what's missing
 *
 * Sandbox reset: uses unique timestamp-based names/emails per run.
 * Org numbers are reused (API allows duplicate customers/suppliers).
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const RUN = Date.now();
const h = { "Content-Type": "application/json", Authorization: AUTH };

// ── Prompt values (using the production prompt shape) ─────────────
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

let writeCount = 0;
let readCount = 0;
let errorCount = 0;

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
  console.log(`  TASK 29 COMPREHENSIVE E2E — ${TODAY} — RUN ${RUN}`);
  console.log(`${"=".repeat(60)}\n`);

  // ═══════════════════════════════════════════════════════════════
  // PHASE 0: Get company info (needed for importDocument)
  // ═══════════════════════════════════════════════════════════════
  // Use the "whoami" token info to get company ID, then fetch company
  const tokenRes = await get("/token/session/>whoAmI?fields=*,company(*)");
  const companyOrg = tokenRes.value?.company?.organizationNumber || "999999999";
  const companyId = tokenRes.value?.company?.id;
  console.log(`COMPANY: id=${companyId}, org=${companyOrg}, name=${tokenRes.value?.company?.name}`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 1: Frontload reads + create customer
  // ═══════════════════════════════════════════════════════════════
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
  console.log(`  dept=${deptId} pm=${pmAssId} cust=${custId} vat=${vatId} vt=${vtId}`);
  console.log(`  accounts: 1920=${a1920?.id}, 6590=${acc6590?.id}, 2400=${acc2400?.id}`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 2: Employees + project (NO isFixedPrice!)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n--- STEP 2: Employees + project ---");
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
      // NO isFixedPrice, NO fixedprice — budget on activity
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

  // ═══════════════════════════════════════════════════════════════
  // STEP 3: Activity (CHARGEABLE!) + participants
  // ═══════════════════════════════════════════════════════════════
  console.log("\n--- STEP 3: Activity + participants ---");
  const [act, parts] = await Promise.all([
    post("/project/projectActivity", {
      project: { id: pId },
      startDate: TODAY,
      budgetHours: TOTAL_HOURS,
      budgetFeeCurrency: BUDGET,
      activity: {
        name: "Prosjektarbeid",
        activityType: "PROJECT_SPECIFIC_ACTIVITY",
        isChargeable: true,  // MUST be true for hourly rates
      },
    }),
    post("/project/participant/list", [
      { project: { id: pId }, employee: { id: e1 }, adminAccess: true },
      { project: { id: pId }, employee: { id: e2 }, adminAccess: false },
    ]),
  ]);
  const actId = act.value.activity.id;
  console.log(`  activity=${actId} (chargeable=true)`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 4: Hourly rates (BEFORE timesheet!)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n--- STEP 4: Hourly rates ---");
  const rh = await get(`/project/hourlyRates?projectId=${pId}&count=10&fields=*`);
  const holder = rh.values[0];
  console.log(`  rate holder id=${holder.id}`);
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
  console.log(`  rate1=${rate1.value.id} rate2=${rate2.value.id} hourlyRate=${HOURLY_RATE}`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 5: Timesheet + supplier + orderline
  // ═══════════════════════════════════════════════════════════════
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
      project: { id: pId },
      description: "Leverandørkostnad",
      date: TODAY,
      count: 1,
      unitCostCurrency: SUPP_COST,
      isChargeable: false,
    }),
  ]);
  const suppId = suppRes.value.id;
  console.log(`  timesheet entries: ${tsRes.values?.length || 0}  supplier=${suppId}`);

  // ═══════════════════════════════════════════════════════════════
  // STEP 6: Supplier cost — TWO approaches:
  //   A) Standard voucher (current approach)
  //   B) importDocument (hypothesis for check 5)
  // ═══════════════════════════════════════════════════════════════
  console.log("\n--- STEP 6: Supplier cost ---");

  // Approach A: Standard voucher with project+supplier linkage
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
  console.log(`  Voucher A (standard): id=${voucher.value.id}`);

  // Approach B: importDocument to create a supplierInvoice entity
  console.log("\n--- STEP 6B: importDocument for supplier invoice entity ---");
  const invoiceNumber = `SINV-${RUN}`;
  const xml = buildEhfXml(invoiceNumber, SUPP_NAME, SUPP_ORG, SUPP_COST, companyOrg);

  // Create the import using multipart/form-data
  const formData = new FormData();
  const xmlBlob = new Blob([xml], { type: "application/xml" });
  formData.append("file", xmlBlob, `${invoiceNumber}.xml`);

  const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  writeCount++;
  const importBody = await importRes.json();
  if (!importRes.ok) {
    console.log(`  importDocument FAILED: ${importRes.status} ${JSON.stringify(importBody).slice(0, 300)}`);
    errorCount++;
  } else {
    console.log(`  importDocument OK: ${importRes.status}`);
    const importedVoucher = importBody.values?.[0];
    if (importedVoucher) {
      console.log(`  imported voucher id=${importedVoucher.id}, version=${importedVoucher.version}`);

      // Check if a supplierInvoice was created
      const siCheck = await get(`/supplierInvoice?supplierId=${suppId}&invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&count=10&fields=*`);
      console.log(`  supplierInvoice entities after import: ${siCheck.values?.length || 0}`);
      if (siCheck.values?.length > 0) {
        for (const si of siCheck.values) {
          console.log(`    SI id=${si.id} invoiceNumber=${si.invoiceNumber} amount=${si.amount} supplier=${si.supplier?.id}`);
        }
      }

      // Try to set postings with project linkage on the imported voucher
      console.log("\n  Setting postings on imported voucher with project linkage...");
      try {
        const putPostings = await put(`/ledger/voucher/${importedVoucher.id}?sendToLedger=false`, {
          version: importedVoucher.version,
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
        console.log(`  PUT postings (sendToLedger=false): OK, version=${putPostings.value?.version}`);

        // Book it
        const bookRes = await put(`/ledger/voucher/${importedVoucher.id}?sendToLedger=true`, {
          version: putPostings.value?.version,
        });
        console.log(`  PUT book (sendToLedger=true): OK`);

        // Re-check supplierInvoice after booking
        const siCheck2 = await get(`/supplierInvoice?supplierId=${suppId}&invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&count=10&fields=*`);
        console.log(`  supplierInvoice entities after booking: ${siCheck2.values?.length || 0}`);
      } catch (e: any) {
        console.log(`  Posting/booking failed: ${e.message}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // STEP 7: Invoice — BOTH approaches
  // ═══════════════════════════════════════════════════════════════
  console.log("\n--- STEP 7A: POST /invoice with embedded orders[] ---");
  let invAId: number | null = null;
  try {
    const invA = await post("/invoice?sendToCustomer=false", {
      invoiceDate: TODAY,
      invoiceDueDate: new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate() + 30)).toISOString().slice(0, 10),
      customer: { id: custId },
      orders: [{
        orderDate: TODAY, deliveryDate: TODAY,
        project: { id: pId },
        orderLines: [{
          description: PROJECT_NAME, count: 1,
          unitPriceExcludingVatCurrency: BUDGET,
          vatType: { id: vatId },
        }],
      }],
    });
    invAId = invA.value.id;
    console.log(`  Invoice A (POST /invoice): id=${invAId}, isApproved=${invA.value.isApproved}`);
  } catch (e: any) {
    console.log(`  Invoice A FAILED: ${e.message}`);
  }

  console.log("\n--- STEP 7B: POST /order → PUT /order/:invoice ---");
  let invBId: number | null = null;
  try {
    const ord = await post("/order", {
      customer: { id: custId }, project: { id: pId },
      orderDate: TODAY, deliveryDate: TODAY,
      orderLines: [{
        description: PROJECT_NAME + " (order path)", count: 1,
        unitPriceExcludingVatCurrency: BUDGET, vatType: { id: vatId },
      }],
    });
    const ordId = ord.value.id;
    const invB = await put(`/order/${ordId}/:invoice?invoiceDate=${TODAY}&sendToCustomer=false`);
    invBId = invB.value.id;
    console.log(`  Invoice B (order→:invoice): id=${invBId}, isApproved=${invB.value.isApproved}`);
  } catch (e: any) {
    console.log(`  Invoice B FAILED: ${e.message}`);
  }

  // ═══════════════════════════════════════════════════════════════
  // COMPREHENSIVE VERIFICATION
  // ═══════════════════════════════════════════════════════════════
  console.log(`\n${"=".repeat(60)}`);
  console.log("  COMPREHENSIVE VERIFICATION");
  console.log(`${"=".repeat(60)}\n`);

  // 1. PROJECT — all fields
  const projFull = await get(`/project/${pId}?fields=*,projectActivities(*,activity(*)),participants(employee(id,firstName,lastName,email),adminAccess),projectCategory(*)`);
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

  // 2. CUSTOMER
  const custFull = await get(`/customer/${custId}?fields=*`);
  console.log("\nCUSTOMER:", JSON.stringify({
    id: custFull.value.id, name: custFull.value.name,
    organizationNumber: custFull.value.organizationNumber,
    isCustomer: custFull.value.isCustomer,
  }, null, 2));

  // 3. EMPLOYEES
  const [emp1Full, emp2Full] = await Promise.all([
    get(`/employee/${e1}?fields=*,employments(*)`),
    get(`/employee/${e2}?fields=*,employments(*)`),
  ]);
  console.log("\nEMP PM:", JSON.stringify({
    id: emp1Full.value.id, firstName: emp1Full.value.firstName,
    lastName: emp1Full.value.lastName, email: emp1Full.value.email,
    userType: emp1Full.value.userType,
    dateOfBirth: emp1Full.value.dateOfBirth,
    department: emp1Full.value.department,
    employments: emp1Full.value.employments,
  }, null, 2));
  console.log("\nEMP CON:", JSON.stringify({
    id: emp2Full.value.id, firstName: emp2Full.value.firstName,
    lastName: emp2Full.value.lastName, email: emp2Full.value.email,
    userType: emp2Full.value.userType,
    dateOfBirth: emp2Full.value.dateOfBirth,
    department: emp2Full.value.department,
    employments: emp2Full.value.employments,
  }, null, 2));

  // 4. TIMESHEET — with hourly rate info!
  const tsFull = await get(`/timesheet/entry?projectId=${pId}&dateFrom=${TODAY}&dateTo=2027-01-01&fields=*,employee(id,firstName,lastName),activity(id,name)&count=500`);
  const byE: Record<string, { hours: number; entries: number; sampleRate: number; sampleChargeable: boolean }> = {};
  for (const te of tsFull.values || []) {
    const key = `${te.employee?.firstName} ${te.employee?.lastName} (${te.employee?.id})`;
    if (!byE[key]) byE[key] = { hours: 0, entries: 0, sampleRate: te.hourlyRate, sampleChargeable: te.chargeable };
    byE[key].hours += te.hours;
    byE[key].entries++;
  }
  console.log("\nTIMESHEET:", JSON.stringify(byE, null, 2));
  console.log(`  Total entries: ${tsFull.values?.length || 0}`);
  console.log(`  Sample entry:`, JSON.stringify(tsFull.values?.[0], null, 2));

  // 5. HOURLY RATES
  const rhFull = await get(`/project/hourlyRates?projectId=${pId}&count=10&fields=*,projectSpecificRates(*,employee(id,firstName,lastName),activity(id,name))`);
  console.log("\nHOURLY_RATES:", JSON.stringify(rhFull.values?.map((r: any) => ({
    id: r.id, hourlyRateModel: r.hourlyRateModel,
    rates: r.projectSpecificRates?.map((s: any) => ({
      id: s.id, employee: s.employee, activity: s.activity, hourlyRate: s.hourlyRate,
    })),
  })), null, 2));

  // 6. SUPPLIER
  const suppFull = await get(`/supplier/${suppId}?fields=*`);
  console.log("\nSUPPLIER:", JSON.stringify({
    id: suppFull.value.id, name: suppFull.value.name,
    organizationNumber: suppFull.value.organizationNumber,
    isSupplier: suppFull.value.isSupplier,
  }, null, 2));

  // 7. VOUCHER with postings
  const vchFull = await get(`/ledger/voucher/${voucher.value.id}?fields=*,postings(*,account(*),project(*),supplier(*))`);
  console.log("\nVOUCHER:", JSON.stringify({
    id: vchFull.value.id, date: vchFull.value.date,
    description: vchFull.value.description,
    voucherType: vchFull.value.voucherType,
    number: vchFull.value.number,
    postings: vchFull.value.postings?.map((p: any) => ({
      row: p.row,
      account: { id: p.account?.id, number: p.account?.number, name: p.account?.name },
      amount: p.amount, amountCurrency: p.amountCurrency,
      project: p.project ? { id: p.project.id, name: p.project.name } : null,
      supplier: p.supplier ? { id: p.supplier.id, name: p.supplier.name } : null,
      description: p.description,
    })),
  }, null, 2));

  // 8. ORDERLINES
  const olFull = await get(`/project/orderline?projectId=${pId}&count=10&fields=*`);
  console.log("\nORDERLINES:", JSON.stringify(olFull.values?.map((ol: any) => ({
    id: ol.id, description: ol.description,
    unitCostCurrency: ol.unitCostCurrency,
    vendor: ol.vendor, project: ol.project,
    isChargeable: ol.isChargeable,
  })), null, 2));

  // 9. SUPPLIER INVOICES (the key test!)
  const siFull = await get(`/supplierInvoice?supplierId=${suppId}&invoiceDateFrom=2025-01-01&invoiceDateTo=2027-01-01&count=10&fields=*`);
  console.log("\nSUPPLIER_INVOICES: count=" + (siFull.values?.length || 0));
  if (siFull.values?.length > 0) {
    for (const si of siFull.values) {
      console.log(`  SI id=${si.id} invNum=${si.invoiceNumber} amount=${si.amount} voucher=${si.voucher?.id} supplier=${si.supplier?.id}`);
    }
  }

  // 10. INVOICE A (POST /invoice path)
  if (invAId) {
    const invAFull = await get(`/invoice/${invAId}?fields=*,customer(*),orders(*,project(*),orderLines(*,vatType(*))),orderLines(*,vatType(*)),projectInvoiceDetails(*)`);
    console.log("\nINVOICE_A (POST /invoice):", JSON.stringify({
      id: invAFull.value.id,
      invoiceNumber: invAFull.value.invoiceNumber,
      isApproved: invAFull.value.isApproved,
      isSent: invAFull.value.isSent,
      customer: invAFull.value.customer ? { id: invAFull.value.customer.id, name: invAFull.value.customer.name } : null,
      amountExcludingVatCurrency: invAFull.value.amountExcludingVatCurrency,
      amountCurrency: invAFull.value.amountCurrency,
      amountCurrencyOutstanding: invAFull.value.amountCurrencyOutstanding,
      orders: invAFull.value.orders?.map((o: any) => ({
        id: o.id, status: o.status, project: o.project,
        orderLines: o.orderLines?.map((ol: any) => ({
          description: ol.description, count: ol.count,
          unitPriceExcludingVatCurrency: ol.unitPriceExcludingVatCurrency,
          vatType: ol.vatType,
        })),
      })),
      projectInvoiceDetails: invAFull.value.projectInvoiceDetails,
    }, null, 2));
  }

  // 11. INVOICE B (order→:invoice path)
  if (invBId) {
    const invBFull = await get(`/invoice/${invBId}?fields=*,customer(*),orders(*,project(*),orderLines(*,vatType(*))),orderLines(*,vatType(*)),projectInvoiceDetails(*)`);
    console.log("\nINVOICE_B (order→:invoice):", JSON.stringify({
      id: invBFull.value.id,
      invoiceNumber: invBFull.value.invoiceNumber,
      isApproved: invBFull.value.isApproved,
      isSent: invBFull.value.isSent,
      customer: invBFull.value.customer ? { id: invBFull.value.customer.id, name: invBFull.value.customer.name } : null,
      amountExcludingVatCurrency: invBFull.value.amountExcludingVatCurrency,
      amountCurrency: invBFull.value.amountCurrency,
      amountCurrencyOutstanding: invBFull.value.amountCurrencyOutstanding,
      orders: invBFull.value.orders?.map((o: any) => ({
        id: o.id, status: o.status, project: o.project,
        orderLines: o.orderLines?.map((ol: any) => ({
          description: ol.description, count: ol.count,
          unitPriceExcludingVatCurrency: ol.unitPriceExcludingVatCurrency,
          vatType: ol.vatType,
        })),
      })),
      projectInvoiceDetails: invBFull.value.projectInvoiceDetails,
    }, null, 2));
  }

  // 12. LEDGER POSTINGS for the project
  const postings = await get(`/ledger/posting?projectId=${pId}&dateFrom=2025-01-01&dateTo=2027-01-01&count=100&fields=*,account(*),project(*),supplier(*),customer(*)`);
  console.log(`\nLEDGER_POSTINGS for project: ${postings.values?.length || 0} entries`);
  for (const p of (postings.values || []).slice(0, 20)) {
    console.log(`  row=${p.row} acct=${p.account?.number}/${p.account?.name} amt=${p.amount} proj=${p.project?.id} supp=${p.supplier?.id} cust=${p.customer?.id} desc=${p.description}`);
  }

  // 13. Project period/budget summary
  try {
    const periodInv = await get(`/project/${pId}/period/invoicingReserve?dateFrom=${TODAY}&dateTo=2027-01-01`);
    console.log("\nPROJECT_INVOICING_RESERVE:", JSON.stringify(periodInv, null, 2));
  } catch (e: any) {
    console.log("\nPROJECT_INVOICING_RESERVE: " + e.message.slice(0, 200));
  }

  try {
    const periodHours = await get(`/project/${pId}/period/hourlistReport?dateFrom=${TODAY}&dateTo=2027-01-01`);
    console.log("\nPROJECT_HOURLIST_REPORT:", JSON.stringify(periodHours, null, 2));
  } catch (e: any) {
    console.log("\nPROJECT_HOURLIST_REPORT: " + e.message.slice(0, 200));
  }

  // SUMMARY
  console.log(`\n${"=".repeat(60)}`);
  console.log(`  SUMMARY: ${writeCount} writes, ${readCount} reads, ${errorCount} errors`);
  console.log(`${"=".repeat(60)}`);
  console.log(`
KEY FINDINGS:
- isFixedPrice on project: ${projFull.value.isFixedPrice}
- Activity chargeable: ${projFull.value.projectActivities?.[0]?.activity?.isChargeable}
- Budget hours: ${projFull.value.projectActivities?.[0]?.budgetHours}
- Budget fee: ${projFull.value.projectActivities?.[0]?.budgetFeeCurrency}
- Hourly rate model: ${rhFull.values?.[0]?.hourlyRateModel}
- Sample timesheet hourlyRate: ${tsFull.values?.[0]?.hourlyRate}
- Sample timesheet chargeable: ${tsFull.values?.[0]?.chargeable}
- Supplier invoices created: ${siFull.values?.length || 0}
- Invoice A (POST /invoice) isApproved: ${invAId ? "created" : "failed"}
- Invoice B (order→:invoice) isApproved: ${invBId ? "created" : "failed"}
- Voucher has project linkage: ${vchFull.value.postings?.some((p: any) => p.project?.id === pId)}
- Voucher has supplier linkage: ${vchFull.value.postings?.some((p: any) => p.supplier?.id === suppId)}
  `);
}

main().catch(e => { console.error("FATAL:", e.message); process.exit(1); });
