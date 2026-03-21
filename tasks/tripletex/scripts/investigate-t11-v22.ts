// Investigate task 11 - Part 22:
// HYPOTHESIS: Maybe the scorer checks BOTH the supplierInvoice AND the voucher,
// but the importDocument approach creates them in a way that doesn't satisfy
// all checks. Let me try a COMPLETELY DIFFERENT approach:
//
// 1. POST /supplier (same)
// 2. GET /ledger/account (same)
// 3. POST /ledger/voucher/importDocument (same)
// 4. DON'T PUT postings — let importDocument's auto-postings stand
// 5. Just book the voucher as-is
//
// Maybe the issue is that our PUT postings OVERWRITES some auto-generated
// data that the scorer expects?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();
const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const ORG_NR = "890838634";
const SUPPLIER_NAME = `NoPostings ${ts}`;
const INVOICE_NR = `INV-NP-${ts}`;
const DESCRIPTION = "kontortjenester";

// Step 1: Create supplier
const supRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: ORG_NR }),
});
const supData = await supRes.json();
const supId = supData.value.id;
console.log("Supplier:", supId);

// Step 2: importDocument
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
      <cac:PostalAddress><cbc:StreetName>G1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
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
console.log("Import status:", importRes.status);
const voucherId = importData.values[0].id;
const version = importData.values[0].version;
console.log("Voucher:", voucherId, "version:", version);

// Check what postings importDocument created
console.log("\n=== Voucher IMMEDIATELY after import (no postings added) ===");
const vDetail = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=*,postings(*,account(number,name),vatType(number,name,percentage),supplier(id,name))`, { headers: H });
const vDetailData = await vDetail.json();
console.log("Postings count:", vDetailData.value.postings?.length);
for (const p of (vDetailData.value.postings || [])) {
  console.log(`  row=${p.row} acct=${p.account?.number}(${p.account?.name?.substring(0,20)}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.number}/${p.vatType?.name?.substring(0,20)}/${p.vatType?.percentage}% sup=${p.supplier?.name || '-'} inv=${p.invoiceNumber || '-'} sysGen=${p.systemGenerated}`);
}

// Try to book directly WITHOUT setting postings
console.log("\n=== Try to book without setting postings ===");
const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
  method: "PUT", headers: H,
  body: JSON.stringify({ version }),
});
console.log("Book status:", bookRes.status);
const bookData = await bookRes.json();
if (bookRes.ok) {
  console.log("Booked! number:", bookData.value?.number);
} else {
  console.log("Book FAILED:", JSON.stringify(bookData).substring(0, 500));
}

// Check the supplierInvoice
console.log("\n=== SupplierInvoice ===");
const si = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=*,supplier(id,name,organizationNumber)`, { headers: H });
const siData = await si.json();
if (siData.values?.length) {
  const s = siData.values[0];
  console.log("  invoiceNumber:", s.invoiceNumber);
  console.log("  amount:", s.amount);
  console.log("  supplier:", s.supplier?.id, s.supplier?.name, s.supplier?.organizationNumber);
}
