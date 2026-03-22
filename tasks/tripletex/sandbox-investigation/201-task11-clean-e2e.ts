/**
 * Task 11 CLEAN END-TO-END test
 *
 * Simulates a production T11 prompt exactly:
 *   "Nous avons reçu la facture INV-2026-XXXX du fournisseur <Name> (nº org. <orgnum>)
 *    de <gross> NOK TTC. Le montant concerne des <description> (compte <acct>).
 *    Enregistrez la facture fournisseur avec la TVA déductible correcte (25 %)."
 *
 * Flow: POST supplier → GET account → POST importDocument → GET SI → PUT postings (sendToLedger=false) → verifications
 *
 * ALL FIXES applied:
 * 1. PaymentMeans + PaymentID in XML → sets kidOrReceiverReference
 * 2. DueDate = issueDate + 30 days
 * 3. physicalAddress on supplier (same as postalAddress)
 * 4. DO NOT BOOK (sendToLedger=false only)
 * 5. buyer org = 987654325 (valid mod11)
 * 6. .values[0] for importDocument response
 * 7. vatLocked check on account
 */

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

// Simulate production prompt values
const TS = Date.now();
const INVOICE_NUM = `INV-2026-E2E-${TS}`;
const SUPPLIER_NAME = `E2E Test Supplier ${TS}`;
const ORG_NUM = "987654325"; // valid mod11
const GROSS = 72350;
const NET = 57880; // 72350 / 1.25
const VAT_AMT = 14470; // 72350 - 57880
const EXPENSE_ACCT = 6300;
const DESCRIPTION = "services de bureau";
const DATE = "2026-03-22";
const DUE_DATE = "2026-04-21"; // +30 days

async function api(method: string, path: string, body?: any): Promise<{status: number, data: any}> {
  const url = `${BASE}${path}`;
  const opts: any = { method, headers: { Authorization: AUTH, "Content-Type": "application/json" } };
  if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
  if (body instanceof FormData) { opts.body = body; opts.headers = { Authorization: AUTH }; }
  const res = await fetch(url, opts);
  const text = await res.text();
  let data: any;
  try { data = JSON.parse(text); } catch { data = text; }
  const label = `${method} ${path}`;
  if (res.status >= 400) {
    console.log(`\n❌ ${label} => ${res.status}`);
    console.log(JSON.stringify(data, null, 2).slice(0, 1000));
  } else {
    console.log(`\n✅ ${label} => ${res.status}`);
  }
  return { status: res.status, data };
}

function makeXml(): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NUM}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE_DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${ORG_NUM}</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">${ORG_NUM}</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Storgata 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0155</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${ORG_NUM}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG_NUM}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">987654325</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">987654325</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>Buyer Company AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Gate 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Buyer Company AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">987654325</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>${INVOICE_NUM}</cbc:PaymentID>
    <cac:PayeeFinancialAccount><cbc:ID>NO0000000000000</cbc:ID></cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${VAT_AMT.toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET.toFixed(2)}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT_AMT.toFixed(2)}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET.toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET.toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS.toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS.toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${NET.toFixed(2)}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${DESCRIPTION}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET.toFixed(2)}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  console.log("=" .repeat(70));
  console.log("  TASK 11: CLEAN E2E TEST (ALL FIXES, NO BOOKING)");
  console.log("=" .repeat(70));
  console.log(`  Invoice: ${INVOICE_NUM}`);
  console.log(`  Supplier: ${SUPPLIER_NAME} (${ORG_NUM})`);
  console.log(`  Gross: ${GROSS}, Net: ${NET}, VAT: ${VAT_AMT}`);
  console.log(`  Account: ${EXPENSE_ACCT}, Description: ${DESCRIPTION}`);
  console.log(`  Date: ${DATE}, DueDate: ${DUE_DATE} (+30 days)`);

  let errors = 0;

  // ===== STEP 1: POST /supplier =====
  console.log("\n" + "=".repeat(50));
  console.log("STEP 1: POST /supplier");
  const supRes = await api("POST", "/supplier", {
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NUM,
    postalAddress: {
      addressLine1: "Storgata 1",
      postalCode: "0155",
      city: "Oslo",
      country: { id: 161 },
    },
    physicalAddress: {
      addressLine1: "Storgata 1",
      postalCode: "0155",
      city: "Oslo",
      country: { id: 161 },
    },
  });
  if (supRes.status >= 400) { console.log("FATAL: Supplier creation failed"); return; }
  const supplier = supRes.data?.value;
  const supplierId = supplier?.id;
  const supplierLedgerAccountId = supplier?.ledgerAccount?.id;
  console.log(`  supplierId=${supplierId} ledgerAccountId=${supplierLedgerAccountId}`);

  // ===== STEP 2: GET /ledger/account =====
  console.log("\n" + "=".repeat(50));
  console.log(`STEP 2: GET /ledger/account?number=${EXPENSE_ACCT}`);
  const accRes = await api("GET", `/ledger/account?number=${EXPENSE_ACCT}&fields=id,number,vatLocked,legalVatTypes`);
  const expenseAccount = accRes.data?.values?.[0];
  const expenseAccountId = expenseAccount?.id;
  const vatLocked = expenseAccount?.vatLocked;
  console.log(`  accountId=${expenseAccountId} number=${expenseAccount?.number} vatLocked=${vatLocked}`);
  if (!expenseAccountId) { console.log("FATAL: Account not found"); return; }

  // ===== STEP 3: POST importDocument =====
  console.log("\n" + "=".repeat(50));
  console.log("STEP 3: POST /ledger/voucher/importDocument");
  const xml = makeXml();
  const form = new FormData();
  form.append("file", new Blob([xml], { type: "application/xml" }), `${INVOICE_NUM}.xml`);
  const importRes = await api("POST", "/ledger/voucher/importDocument", form);
  if (importRes.status >= 400) { console.log("FATAL: importDocument failed"); return; }
  // CRITICAL: response is .values[0] NOT .value
  const importedVoucher = importRes.data?.values?.[0];
  const voucherId = importedVoucher?.id;
  let voucherVersion = importedVoucher?.version;
  console.log(`  voucherId=${voucherId} version=${voucherVersion} number=${importedVoucher?.number}`);
  if (!voucherId) { console.log("FATAL: importDocument returned no voucher"); return; }

  // ===== STEP 4: GET /supplierInvoice (verify SI was created) =====
  console.log("\n" + "=".repeat(50));
  console.log("STEP 4: GET /supplierInvoice (verify SI created by importDocument)");
  const siRes = await api("GET", `/supplierInvoice?voucherId=${voucherId}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=*`);
  const siList = siRes.data?.values || [];
  console.log(`  Found ${siList.length} supplier invoice(s)`);
  if (siList.length === 0) { console.log("FATAL: No SI created by importDocument"); return; }
  const siId = siList[0].id;
  console.log(`  siId=${siId}`);

  // ===== STEP 5: PUT postings (sendToLedger=false) =====
  console.log("\n" + "=".repeat(50));
  console.log("STEP 5: PUT /ledger/voucher (sendToLedger=false, set postings)");
  const postingsBody: any = {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        date: DATE,
        description: DESCRIPTION,
        account: { id: expenseAccountId },
        vatType: { id: 1 }, // 25% incoming VAT, hardcoded
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: DATE,
        description: DESCRIPTION,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NUM,
        termOfPayment: DUE_DATE,
      },
    ],
  };
  const putRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, postingsBody);
  if (putRes.status >= 400) { errors++; console.log("ERROR: PUT postings failed"); return; }
  voucherVersion = putRes.data?.value?.version;
  console.log(`  version=${voucherVersion} number=${putRes.data?.value?.number}`);
  console.log("  ** NO BOOKING — DONE WITH WRITES **");

  // ===== VERIFICATION: Full state readback =====
  console.log("\n" + "=" .repeat(70));
  console.log("  VERIFICATION — ALL FIELDS READBACK");
  console.log("=" .repeat(70));

  // V1: Voucher with expanded postings
  console.log("\n--- V1: GET /ledger/voucher (with postings(*)) ---");
  const vRes = await api("GET", `/ledger/voucher/${voucherId}?fields=id,number,date,description,voucherType(*),postings(*)`);
  const voucher = vRes.data?.value;
  console.log(JSON.stringify(voucher, null, 2));

  // V2: Supplier readback
  console.log("\n--- V2: GET /supplier ---");
  const supReadback = await api("GET", `/supplier/${supplierId}?fields=*`);
  console.log(JSON.stringify(supReadback.data?.value, null, 2));

  // V3: Supplier invoice with order lines
  console.log("\n--- V3: GET /supplierInvoice (with orderLines(*)) ---");
  const siReadback = await api("GET", `/supplierInvoice/${siId}?fields=*,orderLines(*)`);
  console.log(JSON.stringify(siReadback.data?.value, null, 2));

  // ===== EXPECTED vs ACTUAL comparison =====
  console.log("\n" + "=" .repeat(70));
  console.log("  CHECK COMPARISON");
  console.log("=" .repeat(70));

  const si = siReadback.data?.value;
  const sup = supReadback.data?.value;

  const checks = [
    // SupplierInvoice fields
    { name: "SI exists", expected: true, actual: !!si },
    { name: "SI.invoiceNumber", expected: INVOICE_NUM, actual: si?.invoiceNumber },
    { name: "SI.invoiceDate", expected: DATE, actual: si?.invoiceDate },
    { name: "SI.invoiceDueDate", expected: DUE_DATE, actual: si?.invoiceDueDate },
    { name: "SI.amount", expected: -GROSS, actual: si?.amount },
    { name: "SI.amountExcludingVat", expected: -NET, actual: si?.amountExcludingVat },
    { name: "SI.outstandingAmount", expected: GROSS, actual: si?.outstandingAmount },
    { name: "SI.kidOrReceiverReference", expected: INVOICE_NUM, actual: si?.kidOrReceiverReference },
    { name: "SI.supplier.id", expected: supplierId, actual: si?.supplier?.id },
    { name: "SI.isCreditNote", expected: false, actual: si?.isCreditNote },
    // Supplier fields
    { name: "Supplier.name", expected: SUPPLIER_NAME, actual: sup?.name },
    { name: "Supplier.orgNum", expected: ORG_NUM, actual: sup?.organizationNumber },
    { name: "Supplier.postalAddress", expected: "Storgata 1", actual: sup?.postalAddress?.addressLine1 },
    { name: "Supplier.physicalAddress", expected: "Storgata 1", actual: sup?.physicalAddress?.addressLine1 },
    // Voucher fields
    { name: "Voucher.number (UNBOOKED=0)", expected: 0, actual: voucher?.number },
    { name: "Voucher.description", expected: `Faktura nummer ${INVOICE_NUM} fra ${SUPPLIER_NAME}`, actual: voucher?.description },
    { name: "Voucher.date", expected: DATE, actual: voucher?.date },
  ];

  // Order line check
  const orderLines = si?.orderLines || [];
  checks.push({ name: "SI.orderLines.length", expected: 1, actual: orderLines.length });
  if (orderLines.length > 0) {
    checks.push({ name: "SI.orderLines[0].description", expected: DESCRIPTION, actual: orderLines[0]?.description });
    checks.push({ name: "SI.orderLines[0].amountExcludingVat", expected: NET, actual: Math.abs(orderLines[0]?.amountExcludingVat || 0) });
  }

  // Posting checks
  const postings = voucher?.postings || [];
  checks.push({ name: "Voucher.postings.length (3=debit+credit+vat)", expected: 3, actual: postings.length });

  const expensePosting = postings.find((p: any) => p.row === 1);
  const supplierPosting = postings.find((p: any) => p.row === 2);
  const vatPosting = postings.find((p: any) => p.row === 0);

  if (expensePosting) {
    checks.push({ name: "Posting.expense.account", expected: EXPENSE_ACCT, actual: expensePosting.account?.number });
    checks.push({ name: "Posting.expense.amount", expected: NET, actual: expensePosting.amount });
    checks.push({ name: "Posting.expense.amountGross", expected: GROSS, actual: expensePosting.amountGross });
    checks.push({ name: "Posting.expense.vatType", expected: 1, actual: expensePosting.vatType?.id });
  }
  if (supplierPosting) {
    checks.push({ name: "Posting.supplier.account", expected: 2400, actual: supplierPosting.account?.number });
    checks.push({ name: "Posting.supplier.amount", expected: -GROSS, actual: supplierPosting.amount });
    checks.push({ name: "Posting.supplier.invoiceNumber", expected: INVOICE_NUM, actual: supplierPosting.invoiceNumber });
    checks.push({ name: "Posting.supplier.termOfPayment", expected: DUE_DATE, actual: supplierPosting.termOfPayment });
    checks.push({ name: "Posting.supplier.supplierId", expected: supplierId, actual: supplierPosting.supplier?.id });
  }
  if (vatPosting) {
    checks.push({ name: "Posting.vat.account", expected: 2710, actual: vatPosting.account?.number });
    checks.push({ name: "Posting.vat.amount", expected: VAT_AMT, actual: vatPosting.amount });
  }

  let passed = 0;
  let failed = 0;
  for (const c of checks) {
    const match = JSON.stringify(c.expected) === JSON.stringify(c.actual);
    const icon = match ? "✅" : "❌";
    if (!match) failed++;
    else passed++;
    console.log(`  ${icon} ${c.name.padEnd(45)} expected=${JSON.stringify(c.expected)} actual=${JSON.stringify(c.actual)}`);
  }

  console.log("\n" + "=" .repeat(70));
  console.log(`  RESULT: ${passed}/${checks.length} checks passed, ${failed} failed`);
  console.log(`  API CALLS: 3 writes + 4 verification GETs = 7 total`);
  console.log(`  ERRORS: ${errors}`);
  console.log("=" .repeat(70));
}

main().catch(e => { console.error("FATAL:", e); process.exit(1); });
