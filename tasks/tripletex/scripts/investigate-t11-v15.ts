// Investigate task 11 - Part 15:
// KEY QUESTION: Does importDocument auto-create a SECOND supplier
// when we already created one with the same org number?
// Use a unique org number to avoid sandbox pollution.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();
const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;

// Use a UNIQUE org number we've never used before (valid mod11)
const ORG_NR = "979442459";
const SUPPLIER_NAME = `UniqueSupp ${ts}`;
const INVOICE_NR = `INV-UNIQ-${ts}`;
const DESCRIPTION = "kontortjenester";

// Check suppliers with this org BEFORE
console.log("=== BEFORE: suppliers with org", ORG_NR, "===");
const beforeRes = await fetch(`${BASE}/supplier?organizationNumber=${ORG_NR}&fields=id,name,organizationNumber,supplierNumber`, { headers: H });
const beforeData = await beforeRes.json();
console.log("Count:", beforeData.fullResultSize);
for (const s of (beforeData.values || [])) {
  console.log(`  id=${s.id} name="${s.name}" num=${s.supplierNumber}`);
}

// Step 1: POST /supplier
console.log("\n=== POST /supplier ===");
const supRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: ORG_NR }),
});
const supData = await supRes.json();
const supId = supData.value.id;
const supLedger = supData.value.ledgerAccount.id;
console.log("Created supplier:", supId, "num:", supData.value.supplierNumber);

// Check suppliers AFTER POST
console.log("\n=== AFTER POST: suppliers with org", ORG_NR, "===");
const afterPostRes = await fetch(`${BASE}/supplier?organizationNumber=${ORG_NR}&fields=id,name,organizationNumber,supplierNumber`, { headers: H });
const afterPostData = await afterPostRes.json();
console.log("Count:", afterPostData.fullResultSize);
for (const s of (afterPostData.values || [])) {
  console.log(`  id=${s.id} name="${s.name}" num=${s.supplierNumber}`);
}

// Step 2: GET /ledger/account
const acctRes = await fetch(`${BASE}/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
const acctData = await acctRes.json();
const expAcctId = acctData.values[0].id;

// Step 3: POST /ledger/voucher/importDocument
console.log("\n=== POST /ledger/voucher/importDocument ===");
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
      <cac:PartyName><cbc:Name>My Co</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>T 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>My Co</cbc:RegistrationName><cbc:CompanyID schemeID="0192">123456785</cbc:CompanyID></cac:PartyLegalEntity>
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

const formData = new FormData();
formData.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");
const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
  method: "POST",
  headers: { Authorization: AUTH },
  body: formData,
});
const importData = await importRes.json();
console.log("Import status:", importRes.status);

if (!importRes.ok) {
  console.log("Import FAILED:", JSON.stringify(importData));
  process.exit(1);
}

const voucherId = importData.values[0].id;

// Check suppliers AFTER IMPORT
console.log("\n=== AFTER IMPORT: suppliers with org", ORG_NR, "===");
const afterImportRes = await fetch(`${BASE}/supplier?organizationNumber=${ORG_NR}&fields=id,name,organizationNumber,supplierNumber`, { headers: H });
const afterImportData = await afterImportRes.json();
console.log("Count:", afterImportData.fullResultSize);
for (const s of (afterImportData.values || [])) {
  console.log(`  id=${s.id} name="${s.name}" num=${s.supplierNumber}`);
}

// Check supplierInvoice immediately after import
console.log("\n=== SupplierInvoice AFTER IMPORT (before PUT) ===");
const siRes = await fetch(
  `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=*,supplier(id,name,organizationNumber)`,
  { headers: H }
);
const siData = await siRes.json();
console.log("SI count:", siData.fullResultSize);
if (siData.values?.length) {
  const si = siData.values[0];
  console.log("  SI supplier id:", si.supplier?.id, "name:", si.supplier?.name, "org:", si.supplier?.organizationNumber);
  console.log("  MATCHES our created supplier?", si.supplier?.id === supId);
  console.log("  Our supplier id:", supId);
}

// Now set postings and book
const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
  method: "PUT", headers: H,
  body: JSON.stringify({
    version: importData.values[0].version,
    postings: [
      { row: 1, account: { id: expAcctId }, description: DESCRIPTION, vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: supLedger }, supplier: { id: supId }, description: DESCRIPTION, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INVOICE_NR, termOfPayment: DATE },
    ],
  }),
});
const putData = await putRes.json();

const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
  method: "PUT", headers: H,
  body: JSON.stringify({ version: putData.value.version }),
});
const bookData = await bookRes.json();
console.log("\nBooked, number:", bookData.value?.number);

// Check supplierInvoice AFTER booking
console.log("\n=== SupplierInvoice AFTER BOOKING ===");
const siRes2 = await fetch(
  `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=*,supplier(id,name,organizationNumber)`,
  { headers: H }
);
const siData2 = await siRes2.json();
if (siData2.values?.length) {
  const si = siData2.values[0];
  console.log("  SI supplier id:", si.supplier?.id, "name:", si.supplier?.name, "org:", si.supplier?.organizationNumber);
  console.log("  MATCHES our created supplier?", si.supplier?.id === supId);
}

// Final suppliers check
console.log("\n=== FINAL: suppliers with org", ORG_NR, "===");
const finalRes = await fetch(`${BASE}/supplier?organizationNumber=${ORG_NR}&fields=id,name,organizationNumber,supplierNumber`, { headers: H });
const finalData = await finalRes.json();
console.log("Count:", finalData.fullResultSize);
for (const s of (finalData.values || [])) {
  console.log(`  id=${s.id} name="${s.name}" num=${s.supplierNumber}`);
}
console.log("\nDUPLICATE SUPPLIER?", (finalData.fullResultSize || 0) > 1 ? "YES - PROBLEM!" : "NO - OK");
