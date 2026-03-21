// Investigate task 11 - Part 13:
// Key insight: POST /supplierInvoice requires specific multipart format
// Also: must use VALID org numbers for EHF
// Focus: What EXACTLY is the content-type the supplierInvoice POST requires?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();
const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const ORG_NR = "976098897"; // Valid Norwegian org number
const SUPPLIER_NAME = `Test13 ${ts}`;
const INVOICE_NR = `INV-T13-${ts}`;
const DESCRIPTION = "kontortjenester";

// Create supplier
const supRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: ORG_NR }),
});
const supData = await supRes.json();
const supId = supData.value.id;
const supLedger = supData.value.ledgerAccount.id;
console.log("Supplier:", supId);

// Get account
const acctRes = await fetch(`${BASE}/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
const acctData = await acctRes.json();
const expAcctId = acctData.values[0].id;

// ============================================================
// Approach 1: POST /supplierInvoice with correct multipart format
// According to Tripletex docs, the format should be:
// - Content-Type: multipart/form-data
// - Part "body" with the JSON payload
// - Part "file" with the invoice file (optional?)
// ============================================================
console.log("\n=== Approach 1: POST /supplierInvoice with proper multipart ===");

// Try with explicit content-type for the body part
const fd1 = new FormData();
fd1.append("body", JSON.stringify({
  supplier: { id: supId },
  invoiceNumber: INVOICE_NR,
  invoiceDate: DATE,
  invoiceDueDate: DATE,
  amount: GROSS,
  amountCurrency: GROSS,
  currency: { id: 1 },
}));
// Add a real PDF-like file
const pdfContent = `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
xref
0 4
trailer
<< /Size 4 /Root 1 0 R >>
startxref
0
%%EOF`;
fd1.append("file", new Blob([pdfContent], { type: "application/pdf" }), "invoice.pdf");

const res1 = await fetch(`${BASE}/supplierInvoice`, {
  method: "POST",
  headers: { Authorization: AUTH },
  body: fd1,
});
console.log("Status:", res1.status);
const text1 = await res1.text();
console.log("Response:", text1.substring(0, 1000));

// ============================================================
// Approach 2: Try with application/octet-stream content type
// ============================================================
console.log("\n=== Approach 2: POST /supplierInvoice with octet-stream ===");
const fd2 = new FormData();
fd2.append("body", JSON.stringify({
  supplier: { id: supId },
  invoiceNumber: `${INVOICE_NR}-2`,
  invoiceDate: DATE,
  invoiceDueDate: DATE,
  amount: GROSS,
  amountCurrency: GROSS,
  currency: { id: 1 },
}));
fd2.append("file", new Blob([pdfContent], { type: "application/octet-stream" }), "invoice.pdf");

const res2 = await fetch(`${BASE}/supplierInvoice`, {
  method: "POST",
  headers: { Authorization: AUTH, Accept: "application/json" },
  body: fd2,
});
console.log("Status:", res2.status);
const text2 = await res2.text();
console.log("Response:", text2.substring(0, 1000));

// ============================================================
// Approach 3: Try with the body as a string field (not blob)
// ============================================================
console.log("\n=== Approach 3: body as string field ===");
const fd3 = new FormData();
// Try sending body as application/json explicitly
const bodyBlob = new Blob([JSON.stringify({
  supplier: { id: supId },
  invoiceNumber: `${INVOICE_NR}-3`,
  invoiceDate: DATE,
  invoiceDueDate: DATE,
  amount: GROSS,
  amountCurrency: GROSS,
  currency: { id: 1 },
})], { type: "application/json" });
fd3.append("body", bodyBlob, "body.json");
fd3.append("file", new Blob([pdfContent], { type: "application/pdf" }), "invoice.pdf");

const res3 = await fetch(`${BASE}/supplierInvoice`, {
  method: "POST",
  headers: { Authorization: AUTH },
  body: fd3,
});
console.log("Status:", res3.status);
const text3 = await res3.text();
console.log("Response:", text3.substring(0, 1000));

// ============================================================
// Approach 4: EHF import with VALID org number
// ============================================================
console.log("\n\n=== Approach 4: EHF import with valid org number ===");

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
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Co</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>Testveien 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>My Co</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
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
console.log("Import status:", importRes.status);
const importData = await importRes.json();

if (!importRes.ok) {
  console.log("Import failed:", JSON.stringify(importData, null, 2));
} else {
  const voucherId = importData.values[0].id;
  const vVersion = importData.values[0].version;
  console.log("Voucher:", voucherId, "version:", vVersion);

  // Set postings + book
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

  if (!putRes.ok) {
    console.log("PUT failed:", JSON.stringify(putData, null, 2));
  } else {
    const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
      method: "PUT", headers: H,
      body: JSON.stringify({ version: putData.value.version }),
    });
    const bookData = await bookRes.json();
    console.log("Booked, number:", bookData.value?.number);

    // NOW CHECK: the supplierInvoice with ALL fields
    console.log("\n--- SupplierInvoice FULL state ---");
    const siRes = await fetch(
      `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=*`,
      { headers: H }
    );
    const siData = await siRes.json();
    console.log("SI count:", siData.fullResultSize);

    if (siData.values?.length) {
      const si = siData.values[0];
      const siId = si.id;

      // Fetch with ALL related fields
      const siDetailRes = await fetch(
        `${BASE}/supplierInvoice/${siId}?fields=*,supplier(*),voucher(*),orderLines(*),payments(*)`,
        { headers: H }
      );
      const siDetail = await siDetailRes.json();
      console.log("\nFull SI:", JSON.stringify(siDetail.value, null, 2));

      // Try to approve
      console.log("\n--- Try approval ---");
      const approveRes = await fetch(
        `${BASE}/supplierInvoice/${siId}/:approve?invoiceIds=${siId}`,
        { method: "PUT", headers: H }
      );
      console.log("Approve status:", approveRes.status);
      const approveData = await approveRes.text();
      console.log("Approve response:", approveData.substring(0, 500));

      // Check if we can PUT to update the SI directly
      console.log("\n--- Try PUT /supplierInvoice ---");
      const siUpdateRes = await fetch(
        `${BASE}/supplierInvoice/${siId}`,
        {
          method: "PUT", headers: H,
          body: JSON.stringify({
            id: siId,
            version: siDetail.value?.version,
            supplier: { id: supId },
            invoiceNumber: INVOICE_NR,
            invoiceDate: DATE,
            invoiceDueDate: DATE,
          }),
        }
      );
      console.log("PUT SI status:", siUpdateRes.status);
      const siUpdateData = await siUpdateRes.text();
      console.log("PUT SI response:", siUpdateData.substring(0, 500));
    }

    // Also check the voucher
    const vRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=*,postings(*)`, { headers: H });
    const vData = await vRes.json();
    console.log("\n--- Voucher state ---");
    console.log("description:", vData.value?.description);
    console.log("vendorInvoiceNumber:", vData.value?.vendorInvoiceNumber);
    console.log("number:", vData.value?.number);
  }
}
