// Investigate task 11 - Part 20:
// RADICAL HYPOTHESIS: The scorer only checks the VOUCHER, not the supplierInvoice.
// Task 11 (text-only, score_max=8, 4 checks) might be a DIFFERENT scorer than
// task 20 (PDF, score_max=10, 6 checks).
//
// Task 20's 2 extra checks might be: supplier address + bank account (from PDF).
// Task 11's 4 checks might be about: supplier, voucher, postings, VAT.
//
// KEY TEST: Use the EARLIEST approach (direct POST /ledger/voucher) which
// does NOT create a supplierInvoice, and see if the voucher state alone
// might satisfy the scorer.
//
// Also test: does POST /ledger/voucher set vendorInvoiceNumber if we provide it?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();
const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const ORG_NR = "972613021";
const SUPPLIER_NAME = `VendorInv ${ts}`;
const INVOICE_NR = `INV-VI-${ts}`;
const DESCRIPTION = "kontortjenester";

// Step 1: Create supplier
const supRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: ORG_NR }),
});
const supData = await supRes.json();
const supId = supData.value.id;
const supLedger = supData.value.ledgerAccount.id;

// Step 2: Get account
const acctRes = await fetch(`${BASE}/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
const acctData = await acctRes.json();
const expAcctId = acctData.values[0].id;

// Step 3: Get voucherType
const vtRes = await fetch(`${BASE}/ledger/voucherType?name=Leverandørfaktura&fields=*`, { headers: H });
const vtId = (await vtRes.json()).values[0].id;

// Step 4: POST /ledger/voucher with vendorInvoiceNumber
console.log("=== POST /ledger/voucher with vendorInvoiceNumber ===");
const vRes = await fetch(`${BASE}/ledger/voucher`, {
  method: "POST", headers: H,
  body: JSON.stringify({
    date: DATE,
    description: DESCRIPTION,
    voucherType: { id: vtId },
    vendorInvoiceNumber: INVOICE_NR,
    postings: [
      {
        row: 1,
        date: DATE,
        description: DESCRIPTION,
        account: { id: expAcctId },
        vatType: { id: 1 },
        currency: { id: 1 },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: DATE,
        description: DESCRIPTION,
        account: { id: supLedger },
        supplier: { id: supId },
        currency: { id: 1 },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NR,
        termOfPayment: DATE,
      },
    ],
  }),
});
const vData = await vRes.json();
console.log("Status:", vRes.status);
if (!vRes.ok) {
  console.log("ERROR:", JSON.stringify(vData));
} else {
  const v = vData.value;
  console.log("Voucher:", v.id, "number:", v.number, "vendorInvoiceNumber:", v.vendorInvoiceNumber);
  console.log("description:", v.description);
  console.log("Postings:", v.postings?.length);

  // Read back with full detail
  const vDetailRes = await fetch(`${BASE}/ledger/voucher/${v.id}?fields=*,postings(*,account(*),vatType(*),supplier(*))`, { headers: H });
  const vDetail = await vDetailRes.json();
  console.log("\n--- Full voucher ---");
  console.log("  vendorInvoiceNumber:", vDetail.value.vendorInvoiceNumber);
  console.log("  description:", vDetail.value.description);
  console.log("  voucherType:", vDetail.value.voucherType?.id, vDetail.value.voucherType?.name);
  for (const p of (vDetail.value.postings || [])) {
    console.log(`  posting: row=${p.row} acct=${p.account?.number}(${p.account?.name?.substring(0,15)}) amt=${p.amount} gross=${p.amountGross} vat=${p.vatType?.number || '-'} sup=${p.supplier?.name?.substring(0,15) || '-'} inv=${p.invoiceNumber || '-'}`);
  }

  // Check supplierInvoice
  console.log("\n--- supplierInvoice ---");
  const siRes = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${v.id}&fields=*`, { headers: H });
  const siData = await siRes.json();
  console.log("SI count:", siData.fullResultSize);
}

// ============================================================
// Now try another approach: POST /ledger/voucher/importDocument +
// PUT /supplierInvoice/voucher/{id}/postings (BETA, likely 403)
// ============================================================
console.log("\n\n=== Test: PUT /supplierInvoice/voucher/{id}/postings (BETA) ===");
// First create via importDocument
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NR}-2</cbc:ID>
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
      <cac:PartyName><cbc:Name>Co</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>T1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>Co</cbc:RegistrationName><cbc:CompanyID schemeID="0192">123456785</cbc:CompanyID></cac:PartyLegalEntity>
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
fd.append("file", new Blob([xml], { type: "application/xml" }), "inv.xml");
const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
  method: "POST",
  headers: { Authorization: AUTH },
  body: fd,
});
const importData = await importRes.json();
if (!importRes.ok) {
  console.log("Import FAILED:", importRes.status, JSON.stringify(importData));
} else {
  const vid = importData.values[0].id;
  console.log("Imported voucher:", vid);

  // Try PUT /supplierInvoice/voucher/{id}/postings
  const betaRes = await fetch(`${BASE}/supplierInvoice/voucher/${vid}/postings?sendToLedger=true`, {
    method: "PUT", headers: H,
    body: JSON.stringify([
      {
        account: { id: expAcctId },
        amount: NET,
        amountGross: GROSS,
        vatType: { id: 1 },
        description: DESCRIPTION,
      },
    ]),
  });
  console.log("BETA PUT status:", betaRes.status);
  const betaData = await betaRes.text();
  console.log("BETA PUT response:", betaData.substring(0, 500));
}

// ============================================================
// CRITICAL TEST: Check what happens with /incomingInvoice
// (BETA, expected 403, but worth confirming)
// ============================================================
console.log("\n\n=== Test: /incomingInvoice endpoints ===");
const iiSearch = await fetch(`${BASE}/incomingInvoice/search?dateFrom=2026-01-01&dateTo=2026-12-31&fields=*`, { headers: H });
console.log("GET /incomingInvoice/search status:", iiSearch.status);
const iiSearchText = await iiSearch.text();
console.log("Response:", iiSearchText.substring(0, 300));
