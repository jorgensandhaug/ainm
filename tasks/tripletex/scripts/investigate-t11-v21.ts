// Investigate task 11 - Part 21:
// FINAL HYPOTHESIS: Maybe the scorer for task 11 checks a DIFFERENT
// set of things than task 20. Let me check if maybe the issue is
// that our importDocument creates a supplierInvoice with the WRONG
// supplier ID (e.g., auto-created by import instead of our POST'd supplier).
//
// Also test: does the importDocument response show the CORRECT supplier
// on the auto-created supplierInvoice?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();
const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const ORG_NR = "196001336"; // Valid mod11 org number
const SUPPLIER_NAME = `FreshTest ${ts}`;
const INVOICE_NR = `INV-FRESH-${ts}`;
const DESCRIPTION = "kontortjenester";

// Simulate FRESH account behavior:
// Check how many suppliers exist with this org BEFORE
const beforeSupRes = await fetch(`${BASE}/supplier?organizationNumber=${ORG_NR}&fields=id,name,organizationNumber`, { headers: H });
const beforeSupData = await beforeSupRes.json();
console.log("Suppliers with org", ORG_NR, "BEFORE:", beforeSupData.fullResultSize);

// Step 1: POST /supplier
const supRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: ORG_NR }),
});
const supData = await supRes.json();
const supId = supData.value.id;
const supLedger = supData.value.ledgerAccount.id;
console.log("Created supplier:", supId, "name:", supData.value.name, "ledger:", supLedger);

// Step 2: GET /ledger/account
const acctRes = await fetch(`${BASE}/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
const acctData = await acctRes.json();
const expAcctId = acctData.values[0].id;

// Step 3: importDocument
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NR}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NR}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>Gate 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>NO${ORG_NR}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG_NR}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PartyName><cbc:Name>Buyer</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>T1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>Buyer</cbc:RegistrationName><cbc:CompanyID schemeID="0192">123456785</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount><cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory></cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${NET}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${GROSS}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${GROSS}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${NET}</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>${DESCRIPTION}</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

const fd = new FormData();
fd.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
  method: "POST", headers: { Authorization: AUTH },
  body: fd,
});
const importData = await importRes.json();
console.log("\nImport status:", importRes.status);
const voucherId = importData.values[0].id;
const version = importData.values[0].version;
console.log("Voucher:", voucherId, "version:", version);

// IMMEDIATELY check the supplierInvoice BEFORE setting postings
console.log("\n=== SupplierInvoice BEFORE postings ===");
const si1 = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=*,supplier(id,name,organizationNumber),voucher(id,number,voucherType(id,name)),orderLines(*)`, { headers: H });
const si1Data = await si1.json();
console.log("Count:", si1Data.fullResultSize);
if (si1Data.values?.length) {
  const si = si1Data.values[0];
  console.log("  SI id:", si.id);
  console.log("  invoiceNumber:", si.invoiceNumber);
  console.log("  invoiceDate:", si.invoiceDate);
  console.log("  invoiceDueDate:", si.invoiceDueDate);
  console.log("  amount:", si.amount);
  console.log("  amountCurrency:", si.amountCurrency);
  console.log("  amountExcludingVat:", si.amountExcludingVat);
  console.log("  outstandingAmount:", si.outstandingAmount);
  console.log("  supplier:", si.supplier?.id, si.supplier?.name, si.supplier?.organizationNumber);
  console.log("  OUR supplier id:", supId);
  console.log("  SUPPLIER MATCH?", si.supplier?.id === supId);
  console.log("  isCreditNote:", si.isCreditNote);
  console.log("  voucher:", si.voucher?.id, "number:", si.voucher?.number, "type:", si.voucher?.voucherType?.name);
  console.log("  orderLines count:", si.orderLines?.length);
}

// Step 4: PUT postings
const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
  method: "PUT", headers: H,
  body: JSON.stringify({
    version,
    postings: [
      { row: 1, account: { id: expAcctId }, description: DESCRIPTION, vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: supLedger }, supplier: { id: supId }, description: DESCRIPTION, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INVOICE_NR, termOfPayment: DATE },
    ],
  }),
});
const putData = await putRes.json();
console.log("\nPUT postings status:", putRes.status);

// Step 5: Book
const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
  method: "PUT", headers: H,
  body: JSON.stringify({ version: putData.value.version }),
});
const bookData = await bookRes.json();
console.log("Book status:", bookRes.status, "number:", bookData.value?.number);

// Check supplierInvoice AFTER booking
console.log("\n=== SupplierInvoice AFTER booking ===");
const si2 = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=*,supplier(id,name,organizationNumber),voucher(id,number,voucherType(id,name))`, { headers: H });
const si2Data = await si2.json();
if (si2Data.values?.length) {
  const si = si2Data.values[0];
  console.log("  SI id:", si.id);
  console.log("  invoiceNumber:", si.invoiceNumber);
  console.log("  invoiceDate:", si.invoiceDate);
  console.log("  amount:", si.amount);
  console.log("  amountExcludingVat:", si.amountExcludingVat);
  console.log("  outstandingAmount:", si.outstandingAmount);
  console.log("  supplier:", si.supplier?.id, si.supplier?.name, si.supplier?.organizationNumber);
  console.log("  SUPPLIER MATCH?", si.supplier?.id === supId);
  console.log("  voucher number:", si.voucher?.number, "type:", si.voucher?.voucherType?.name);
}

// Also check supplier count with this org
console.log("\n=== Suppliers with org", ORG_NR, "AFTER ===");
const afterSupRes = await fetch(`${BASE}/supplier?organizationNumber=${ORG_NR}&fields=id,name,organizationNumber,supplierNumber`, { headers: H });
const afterSupData = await afterSupRes.json();
console.log("Count:", afterSupData.fullResultSize);
for (const s of (afterSupData.values || [])) {
  console.log(`  id=${s.id} name="${s.name}" org=${s.organizationNumber} num=${s.supplierNumber}`);
}
console.log("OUR supplier id:", supId);

// CRITICAL: Check ledger/posting for this voucher to see account numbers
console.log("\n=== Postings on booked voucher ===");
const postRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=*,postings(*,account(number,name),vatType(number,name,percentage),supplier(id,name))`, { headers: H });
const postData = await postRes.json();
for (const p of (postData.value.postings || [])) {
  console.log(`  row=${p.row} acct=${p.account?.number}(${p.account?.name?.substring(0,20)}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.number}/${p.vatType?.name?.substring(0,20)}/${p.vatType?.percentage}% sup=${p.supplier?.name || '-'} inv=${p.invoiceNumber || '-'} sysGen=${p.systemGenerated}`);
}
