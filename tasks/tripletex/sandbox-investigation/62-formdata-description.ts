// Test: does adding "description" to FormData in importDocument change supplierInvoice state?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

async function api(method: string, path: string, body?: any) {
  const url = `${BASE}${path}`;
  const opts: RequestInit = { method, headers: H };
  if (body && !(body instanceof FormData)) opts.body = JSON.stringify(body);
  if (body instanceof FormData) { opts.body = body; opts.headers = { Authorization: AUTH }; }
  const res = await fetch(url, opts);
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  if (res.status >= 400) console.log(`${method} ${path} => ${res.status}\nERROR: ${JSON.stringify(json, null, 2).slice(0, 1200)}`);
  return { status: res.status, data: json };
}

function makeXml(invoiceNum: string, supplierName: string, org: string): string {
  const GROSS = 42100, NET = 33680, VAT = 8420, DATE = "2026-03-21";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNum}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${org}</cbc:EndpointID>
    <cac:PartyIdentification><cbc:ID schemeID="0192">${org}</cbc:ID></cac:PartyIdentification>
    <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Testveien 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${org}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>${supplierName}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${org}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
    <cac:PartyName><cbc:Name>My Company AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Gate 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>My Company AS</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID><cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity><cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Office services</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;
}

async function main() {
  const SUPPLIER_NAME = `Desc Test AS`;
  const ORG = "987654325";

  console.log("=== FORMDATA DESCRIPTION TEST ===\n");

  // 1. Create supplier
  console.log("--- Creating supplier ---");
  const supRes = await api("POST", "/supplier", { name: SUPPLIER_NAME, organizationNumber: ORG });
  const supplierId = supRes.data?.value?.id;
  console.log(`Supplier ID: ${supplierId}\n`);
  if (!supplierId) { console.log("FAIL: no supplier created", JSON.stringify(supRes.data, null, 2).slice(0, 500)); return; }

  // 2. Get expense account for postings later
  const accRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=id,number");
  const expenseAccountId = accRes.data?.values?.[0]?.id;
  console.log(`Expense account 6300 ID: ${expenseAccountId}\n`);

  // ========== IMPORT A: WITH description ==========
  console.log("========================================");
  console.log("IMPORT A: WITH description field");
  console.log("========================================\n");

  const xmlA = makeXml("INV-DESC-A", SUPPLIER_NAME, ORG);
  const formA = new FormData();
  formA.append("description", "import-INV-DESC-A");
  formA.append("file", new Blob([xmlA], { type: "application/xml" }), "INV-DESC-A.xml");

  const importA = await api("POST", "/ledger/voucher/importDocument", formA);
  const voucherIdA = importA.data?.value?.id ?? importA.data?.values?.[0]?.id;
  console.log(`Import A voucher ID: ${voucherIdA}`);
  if (!voucherIdA) { console.log("FAIL import A:", JSON.stringify(importA.data, null, 2).slice(0, 800)); return; }

  // Find SI for A
  const siSearchA = await api("GET", `/supplierInvoice?voucherId=${voucherIdA}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=id`);
  const siIdA = siSearchA.data?.values?.[0]?.id;
  console.log(`SI A ID: ${siIdA}\n`);

  // Full SI dump A
  console.log("--- supplierInvoice A (fields=*) ---");
  const siFullA = await api("GET", `/supplierInvoice/${siIdA}?fields=*`);
  const siA = siFullA.data?.value;
  console.log(JSON.stringify(siA, null, 2));

  // Full voucher dump A
  console.log("\n--- voucher A (fields=*) ---");
  const vchFullA = await api("GET", `/ledger/voucher/${voucherIdA}?fields=*`);
  const vchA = vchFullA.data?.value;
  console.log(JSON.stringify(vchA, null, 2));

  // ========== IMPORT B: WITHOUT description ==========
  console.log("\n========================================");
  console.log("IMPORT B: WITHOUT description field");
  console.log("========================================\n");

  const xmlB = makeXml("INV-NODESC-B", SUPPLIER_NAME, ORG);
  const formB = new FormData();
  formB.append("file", new Blob([xmlB], { type: "application/xml" }), "INV-NODESC-B.xml");

  const importB = await api("POST", "/ledger/voucher/importDocument", formB);
  const voucherIdB = importB.data?.value?.id ?? importB.data?.values?.[0]?.id;
  console.log(`Import B voucher ID: ${voucherIdB}`);
  if (!voucherIdB) { console.log("FAIL import B:", JSON.stringify(importB.data, null, 2).slice(0, 800)); return; }

  // Find SI for B
  const siSearchB = await api("GET", `/supplierInvoice?voucherId=${voucherIdB}&invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=id`);
  const siIdB = siSearchB.data?.values?.[0]?.id;
  console.log(`SI B ID: ${siIdB}\n`);

  // Full SI dump B
  console.log("--- supplierInvoice B (fields=*) ---");
  const siFullB = await api("GET", `/supplierInvoice/${siIdB}?fields=*`);
  const siB = siFullB.data?.value;
  console.log(JSON.stringify(siB, null, 2));

  // Full voucher dump B
  console.log("\n--- voucher B (fields=*) ---");
  const vchFullB = await api("GET", `/ledger/voucher/${voucherIdB}?fields=*`);
  const vchB = vchFullB.data?.value;
  console.log(JSON.stringify(vchB, null, 2));

  // ========== PUT POSTINGS ON BOTH ==========
  console.log("\n========================================");
  console.log("PUT POSTINGS ON BOTH (sendToLedger=false)");
  console.log("========================================\n");

  if (!siIdA || !siIdB || !siA || !siB) {
    console.log("ABORT: could not find both supplier invoices. Cannot proceed with PUT.");
    console.log(`siIdA=${siIdA}, siIdB=${siIdB}, siA=${!!siA}, siB=${!!siB}`);
    return;
  }

  // OrderLinePosting format (no vatType — let account defaults handle it)
  const makeOrderLinePostings = () => [
    {
      posting: {
        date: "2026-03-21",
        description: "Office services",
        account: { id: expenseAccountId },
        amount: 33680,
        amountCurrency: 33680,
        amountGross: 42100,
        amountGrossCurrency: 42100,
      },
    },
  ];

  // PUT postings A
  console.log("--- PUT postings A via /supplierInvoice/voucher/{id}/postings ---");
  const putA = await api("PUT", `/supplierInvoice/voucher/${voucherIdA}/postings?sendToLedger=false`, makeOrderLinePostings());
  console.log(`PUT A status: ${putA.status}`);
  if (putA.status >= 400) console.log(JSON.stringify(putA.data, null, 2).slice(0, 1000));
  else console.log(JSON.stringify(putA.data, null, 2).slice(0, 500));

  // PUT postings B
  console.log("\n--- PUT postings B via /supplierInvoice/voucher/{id}/postings ---");
  const putB = await api("PUT", `/supplierInvoice/voucher/${voucherIdB}/postings?sendToLedger=false`, makeOrderLinePostings());
  console.log(`PUT B status: ${putB.status}`);
  if (putB.status >= 400) console.log(JSON.stringify(putB.data, null, 2).slice(0, 1000));
  else console.log(JSON.stringify(putB.data, null, 2).slice(0, 500));

  // ========== RE-FETCH AFTER PUT ==========
  console.log("\n========================================");
  console.log("RE-FETCH AFTER PUT");
  console.log("========================================\n");

  console.log("--- supplierInvoice A after PUT (fields=*) ---");
  const siPostA = await api("GET", `/supplierInvoice/${siIdA}?fields=*`);
  const siAPost = siPostA.data?.value;
  console.log(JSON.stringify(siAPost, null, 2));

  console.log("\n--- supplierInvoice B after PUT (fields=*) ---");
  const siPostB = await api("GET", `/supplierInvoice/${siIdB}?fields=*`);
  const siBPost = siPostB.data?.value;
  console.log(JSON.stringify(siBPost, null, 2));

  console.log("\n--- voucher A after PUT (fields=*) ---");
  const vchPostA = await api("GET", `/ledger/voucher/${voucherIdA}?fields=*`);
  console.log(JSON.stringify(vchPostA.data?.value, null, 2));

  console.log("\n--- voucher B after PUT (fields=*) ---");
  const vchPostB = await api("GET", `/ledger/voucher/${voucherIdB}?fields=*`);
  console.log(JSON.stringify(vchPostB.data?.value, null, 2));

  // ========== FIELD-BY-FIELD COMPARISON ==========
  console.log("\n========================================");
  console.log("FIELD-BY-FIELD COMPARISON (after PUT)");
  console.log("========================================\n");

  const allKeys = new Set([...Object.keys(siAPost || {}), ...Object.keys(siBPost || {})]);
  const diffs: string[] = [];
  const same: string[] = [];
  for (const key of [...allKeys].sort()) {
    const valA = JSON.stringify(siAPost?.[key]);
    const valB = JSON.stringify(siBPost?.[key]);
    if (valA !== valB) {
      diffs.push(`  ${key}:\n    A: ${valA}\n    B: ${valB}`);
    } else {
      same.push(`  ${key}: ${valA}`);
    }
  }

  console.log("DIFFERENCES between A (with desc) and B (without desc):");
  if (diffs.length === 0) console.log("  (none -- identical!)");
  else diffs.forEach(d => console.log(d));

  console.log(`\nSAME FIELDS (${same.length}):`);
  same.forEach(s => console.log(s));

  // Also compare vouchers
  const vchAPost = vchPostA.data?.value;
  const vchBPost = vchPostB.data?.value;
  const vchKeys = new Set([...Object.keys(vchAPost || {}), ...Object.keys(vchBPost || {})]);
  const vchDiffs: string[] = [];
  for (const key of [...vchKeys].sort()) {
    const valA = JSON.stringify(vchAPost?.[key]);
    const valB = JSON.stringify(vchBPost?.[key]);
    if (valA !== valB) {
      vchDiffs.push(`  ${key}:\n    A: ${valA}\n    B: ${valB}`);
    }
  }
  console.log("\nVOUCHER DIFFERENCES:");
  if (vchDiffs.length === 0) console.log("  (none -- identical!)");
  else vchDiffs.forEach(d => console.log(d));

  // Focus fields
  console.log("\n========================================");
  console.log("FOCUS FIELDS SUMMARY");
  console.log("========================================");
  const focus = ["description", "vendorInvoiceNumber", "invoiceNumber", "supplier", "amount", "amountCurrency", "amountExcludingVat", "amountExcludingVatCurrency", "invoiceDate", "invoiceDueDate", "kidOrReceiverReference", "isCreditNote", "outstandingAmount"];
  for (const f of focus) {
    console.log(`\n${f}:`);
    console.log(`  A: ${JSON.stringify(siAPost?.[f])}`);
    console.log(`  B: ${JSON.stringify(siBPost?.[f])}`);
    console.log(`  match: ${JSON.stringify(siAPost?.[f]) === JSON.stringify(siBPost?.[f])}`);
  }

  // Voucher description comparison (this is where "description" FormData field matters)
  console.log("\n\n========================================");
  console.log("VOUCHER DESCRIPTION (key test)");
  console.log("========================================");
  console.log(`  A voucher.description: ${JSON.stringify(vchAPost?.description)}`);
  console.log(`  B voucher.description: ${JSON.stringify(vchBPost?.description)}`);
  console.log(`  A voucher.vendorInvoiceNumber: ${JSON.stringify(vchAPost?.vendorInvoiceNumber)}`);
  console.log(`  B voucher.vendorInvoiceNumber: ${JSON.stringify(vchBPost?.vendorInvoiceNumber)}`);
}

main().catch(e => console.error("FATAL:", e));
