// Investigate task 11 - Part 14:
// RADICAL HYPOTHESIS: The scorer for task 11 (text-only) checks for a BOOKED
// Leverandørfaktura voucher with specific postings, but the scoring happens
// in a DIFFERENT environment/account than our sandbox.
//
// Key question: does the production proxy behave differently than direct API?
// Test by reading back data from the LATEST production run (which scored 0/8).

// Use sandbox to test two things:
// 1. Can we find the supplierInvoice by supplier organizationNumber instead of voucherId?
// 2. Does the description/description difference matter?
// 3. What about trying different voucher descriptions?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();
const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const ORG_NR = "983514650"; // Same as the latest production task
const SUPPLIER_NAME = "Tindra AS";
const INVOICE_NR = "INV-2026-3624"; // Same as prod
const DESCRIPTION = "kontortjenester";

// ============================================================
// Approach A: EHF import approach (same as production)
// ============================================================
console.log("=== Approach A: EHF import (production-identical) ===");

// Step 1: POST /supplier
const supRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: ORG_NR }),
});
const supData = await supRes.json();
const supId = supData.value.id;
const supLedger = supData.value.ledgerAccount.id;
console.log("Supplier:", supId, "Ledger:", supLedger);

// Step 2: GET /ledger/account
const acctRes = await fetch(`${BASE}/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
const acctData = await acctRes.json();
const expAcctId = acctData.values[0].id;
console.log("Account:", expAcctId);

// Step 3: POST /ledger/voucher/importDocument
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
const vVersion = importData.values[0].version;
console.log("Voucher:", voucherId, "version:", vVersion);

// Step 4: PUT /ledger/voucher/{id}?sendToLedger=false
const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
  method: "PUT", headers: H,
  body: JSON.stringify({
    version: vVersion,
    postings: [
      { row: 1, account: { id: expAcctId }, description: DESCRIPTION, vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: supLedger }, supplier: { id: supId }, description: DESCRIPTION, amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INVOICE_NR, termOfPayment: DATE },
    ],
  }),
});
const putData = await putRes.json();
console.log("PUT postings status:", putRes.status);

// Step 5: PUT /ledger/voucher/{id}?sendToLedger=true
const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
  method: "PUT", headers: H,
  body: JSON.stringify({ version: putData.value.version }),
});
const bookData = await bookRes.json();
console.log("Book status:", bookRes.status, "number:", bookData.value?.number);

// ============================================================
// NOW: Comprehensive state readback
// ============================================================
console.log("\n\n=== COMPREHENSIVE STATE READBACK ===");

// 1. Voucher
const vRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=*,postings(*,account(*),vatType(*),supplier(*))`, { headers: H });
const vData = await vRes.json();
const v = vData.value;
console.log("\n--- Voucher ---");
console.log("  id:", v.id);
console.log("  number:", v.number);
console.log("  description:", v.description);
console.log("  vendorInvoiceNumber:", v.vendorInvoiceNumber);
console.log("  date:", v.date);
console.log("  voucherType:", v.voucherType?.id);
console.log("  Postings:");
for (const p of (v.postings || [])) {
  console.log(`    row=${p.row} acct=${p.account?.number}(${p.account?.name?.substring(0,20)}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.number}(${p.vatType?.name?.substring(0,20)}) sup=${p.supplier?.name || '-'} inv=${p.invoiceNumber || '-'} term=${p.termOfPayment || '-'} sysGen=${p.systemGenerated}`);
}

// 2. SupplierInvoice
const siRes = await fetch(
  `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=*,supplier(*),voucher(id,number)`,
  { headers: H }
);
const siData = await siRes.json();
console.log("\n--- SupplierInvoice ---");
console.log("  count:", siData.fullResultSize);
if (siData.values?.length) {
  const si = siData.values[0];
  console.log("  id:", si.id);
  console.log("  invoiceNumber:", si.invoiceNumber);
  console.log("  invoiceDate:", si.invoiceDate);
  console.log("  invoiceDueDate:", si.invoiceDueDate);
  console.log("  amount:", si.amount);
  console.log("  amountCurrency:", si.amountCurrency);
  console.log("  amountExcludingVat:", si.amountExcludingVat);
  console.log("  outstandingAmount:", si.outstandingAmount);
  console.log("  supplier:", si.supplier?.name, "org:", si.supplier?.organizationNumber);
  console.log("  voucher:", si.voucher?.id, "number:", si.voucher?.number);
  console.log("  isCreditNote:", si.isCreditNote);
  console.log("  kidOrReceiverReference:", si.kidOrReceiverReference);
}

// 3. Supplier
const supDetailRes = await fetch(`${BASE}/supplier/${supId}?fields=*`, { headers: H });
const supDetail = await supDetailRes.json();
console.log("\n--- Supplier ---");
console.log("  id:", supDetail.value.id);
console.log("  name:", supDetail.value.name);
console.log("  organizationNumber:", supDetail.value.organizationNumber);
console.log("  supplierNumber:", supDetail.value.supplierNumber);
console.log("  isSupplier:", supDetail.value.isSupplier);
console.log("  ledgerAccount:", supDetail.value.ledgerAccount?.id);

// 4. Ledger Postings search
const postRes = await fetch(
  `${BASE}/ledger/posting?dateFrom=${DATE}&dateTo=2026-03-22&supplierId=${supId}&fields=*,account(*),supplier(*)&count=50`,
  { headers: H }
);
const postData = await postRes.json();
console.log("\n--- Ledger Postings for supplier ---");
console.log("  count:", postData.fullResultSize);
for (const p of (postData.values || [])) {
  console.log(`    id=${p.id} acct=${p.account?.number} amt=${p.amount} inv=${p.invoiceNumber || '-'} sup=${p.supplier?.name || '-'}`);
}

// 5. Search for ALL recent supplier invoices
const allSiRes = await fetch(
  `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&fields=id,invoiceNumber,amount,supplier(id,name,organizationNumber)&count=20&sorting=invoiceDate,desc`,
  { headers: H }
);
const allSiData = await allSiRes.json();
console.log("\n--- All recent SupplierInvoices ---");
console.log("  total:", allSiData.fullResultSize);
for (const si of (allSiData.values || []).slice(0, 10)) {
  console.log(`    id=${si.id} inv=${si.invoiceNumber} amt=${si.amount} sup=${si.supplier?.name}(${si.supplier?.organizationNumber})`);
}

// 6. Search by supplier organization number
const siByOrgRes = await fetch(
  `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&supplierName=${encodeURIComponent(SUPPLIER_NAME)}&fields=*`,
  { headers: H }
);
const siByOrgData = await siByOrgRes.json();
console.log("\n--- SupplierInvoice by supplier name ---");
console.log("  count:", siByOrgData.fullResultSize);

// 7. Let's also check: can we find the voucher using voucherType search?
const vtRes = await fetch(`${BASE}/ledger/voucherType?name=Leverandørfaktura&fields=*`, { headers: H });
const vtData = await vtRes.json();
const vtId = vtData.values?.[0]?.id;
console.log("\n--- VoucherType ---");
console.log("  Leverandørfaktura id:", vtId);

// 8. Search vouchers by voucherType
const vSearchRes = await fetch(
  `${BASE}/ledger/voucher?dateFrom=${DATE}&dateTo=2026-03-22&typeId=${vtId}&fields=*&count=10`,
  { headers: H }
);
const vSearchData = await vSearchRes.json();
console.log("\n--- Vouchers with Leverandørfaktura type ---");
console.log("  count:", vSearchData.fullResultSize);
for (const vr of (vSearchData.values || []).slice(0, 5)) {
  console.log(`    id=${vr.id} number=${vr.number} desc="${vr.description?.substring(0,50)}" vendor=${vr.vendorInvoiceNumber || '-'}`);
}

console.log("\n\n=== CRITICAL COMPARISON QUESTIONS ===");
console.log("1. Does the EHF import auto-create a SECOND supplier?");
const allSupRes = await fetch(
  `${BASE}/supplier?organizationNumber=${ORG_NR}&fields=id,name,organizationNumber,supplierNumber`,
  { headers: H }
);
const allSupData = await allSupRes.json();
console.log("  Suppliers with org " + ORG_NR + ":", allSupData.fullResultSize);
for (const s of (allSupData.values || [])) {
  console.log(`    id=${s.id} name="${s.name}" org=${s.organizationNumber} num=${s.supplierNumber}`);
}

console.log("\n2. Is the description 'Faktura nummer...' preventing matching?");
console.log("  Voucher description:", v.description);
console.log("  Expected description:", DESCRIPTION);
console.log("  Match:", v.description === DESCRIPTION);
