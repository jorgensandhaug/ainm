// Investigate task 11 - Part 18:
// Try POST /supplierInvoice using curl command for proper multipart handling
// Also try creating invoice via PUT /supplierInvoice/{id} on existing SI

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();
const DATE = "2026-03-21";
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const ORG_NR = "986576883"; // Valid org
const SUPPLIER_NAME = `CurlTest ${ts}`;
const INVOICE_NR = `INV-CURL-${ts}`;
const DESCRIPTION = "kontortjenester";

// Step 1: Create supplier
const supRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: ORG_NR }),
});
const supData = await supRes.json();
const supId = supData.value.id;
console.log("Supplier:", supId);

// Step 2: Use child_process to call curl for proper multipart
import { execSync } from "child_process";

// Create a JSON file for the body
const bodyJson = JSON.stringify({
  supplier: { id: supId },
  invoiceNumber: INVOICE_NR,
  invoiceDate: DATE,
  invoiceDueDate: DATE,
  amount: GROSS,
  amountCurrency: GROSS,
  currency: { id: 1 },
});

console.log("\n=== Test 1: curl POST /supplierInvoice with -F body=... ===");
try {
  const result1 = execSync(`curl -s -w "\\n---STATUS:%{http_code}---" \
    -X POST "${BASE}/supplierInvoice" \
    -H "Authorization: ${AUTH}" \
    -F 'body=${bodyJson};type=application/json' \
    -F 'file=@/dev/null;type=application/pdf;filename=invoice.pdf'`,
    { encoding: "utf-8", timeout: 15000 });
  console.log("Response:", result1.substring(0, 1000));
} catch (e: any) {
  console.log("Error:", e.stderr?.substring(0, 500) || e.message);
}

console.log("\n=== Test 2: curl POST /supplierInvoice with just body, no file ===");
try {
  const result2 = execSync(`curl -s -w "\\n---STATUS:%{http_code}---" \
    -X POST "${BASE}/supplierInvoice" \
    -H "Authorization: ${AUTH}" \
    -F 'body=${bodyJson};type=application/json'`,
    { encoding: "utf-8", timeout: 15000 });
  console.log("Response:", result2.substring(0, 1000));
} catch (e: any) {
  console.log("Error:", e.stderr?.substring(0, 500) || e.message);
}

// Create a minimal PDF for a real file
const pdfPath = "/tmp/test-invoice-" + ts + ".pdf";
execSync(`echo '%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >> endobj
xref
0 4
trailer << /Size 4 /Root 1 0 R >>
startxref
0
%%EOF' > ${pdfPath}`);

console.log("\n=== Test 3: curl POST /supplierInvoice with real PDF file ===");
try {
  const result3 = execSync(`curl -s -w "\\n---STATUS:%{http_code}---" \
    -X POST "${BASE}/supplierInvoice" \
    -H "Authorization: ${AUTH}" \
    -F 'body=${bodyJson};type=application/json' \
    -F 'file=@${pdfPath};type=application/pdf'`,
    { encoding: "utf-8", timeout: 15000 });
  console.log("Response:", result3.substring(0, 1000));
} catch (e: any) {
  console.log("Error:", e.stderr?.substring(0, 500) || e.message);
}

console.log("\n=== Test 4: curl POST /supplierInvoice with body as plain string ===");
try {
  // Escape the JSON for the curl command
  const bodyFile = "/tmp/si-body-" + ts + ".json";
  const { writeFileSync } = await import("fs");
  writeFileSync(bodyFile, bodyJson);

  const result4 = execSync(`curl -s -w "\\n---STATUS:%{http_code}---" \
    -X POST "${BASE}/supplierInvoice" \
    -H "Authorization: ${AUTH}" \
    -F 'body=<${bodyFile};type=application/json' \
    -F 'file=@${pdfPath};type=application/pdf'`,
    { encoding: "utf-8", timeout: 15000 });
  console.log("Response:", result4.substring(0, 1000));
} catch (e: any) {
  console.log("Error:", e.stderr?.substring(0, 500) || e.message);
}

// Also try with an actual EHF XML as "file" instead of PDF
console.log("\n=== Test 5: curl POST /supplierInvoice with EHF XML as file ===");
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

const xmlPath = "/tmp/test-invoice-" + ts + ".xml";
const { writeFileSync: ws } = await import("fs");
ws(xmlPath, xml);

try {
  const result5 = execSync(`curl -s -w "\\n---STATUS:%{http_code}---" \
    -X POST "${BASE}/supplierInvoice" \
    -H "Authorization: ${AUTH}" \
    -F 'body=<${"/tmp/si-body-" + ts + ".json"};type=application/json' \
    -F 'file=@${xmlPath};type=application/xml'`,
    { encoding: "utf-8", timeout: 15000 });
  console.log("Response:", result5.substring(0, 1000));
} catch (e: any) {
  console.log("Error:", e.stderr?.substring(0, 500) || e.message);
}

// Clean up
execSync(`rm -f ${pdfPath} ${xmlPath} /tmp/si-body-${ts}.json`);
