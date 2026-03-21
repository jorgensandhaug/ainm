// Investigate task 11 - Part 7:
// Test the supplierInvoice/voucher/{id}/postings endpoint with correct vatType
// The error was "Mva-type på rad 0 er ugyldig" - vatType id 1 seems wrong for THIS endpoint

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();

// Create new supplier + import + test the dedicated endpoint
const SUPPLIER_NAME = `SIPost ${ts}`;
const ORG_NR = "976098897";
const INVOICE_NR = `INV-SIP-${ts}`;
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const DATE = "2026-03-21";

// Create supplier
const supRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: ORG_NR }),
});
const supData = await supRes.json();
const supId = supData.value.id;
const supLedger = supData.value.ledgerAccount.id;
console.log("Supplier:", supId);

// Get expense account
const acctRes = await fetch(`${BASE}/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
const acctData = await acctRes.json();
const expAcctId = acctData.values[0].id;

// Import EHF
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
      <cac:PostalAddress><cbc:StreetName>Hovedgata 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyTaxScheme><cbc:CompanyID>NO${ORG_NR}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
      <cac:PartyLegalEntity><cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG_NR}</cbc:CompanyID></cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress><cbc:StreetName>Testveien 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
      <cac:PartyLegalEntity><cbc:RegistrationName>My Company</cbc:RegistrationName><cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
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
    <cac:Item><cbc:Name>kontortjenester</cbc:Name><cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory></cac:Item>
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
const voucherId = importData.values[0].id;
console.log("Voucher:", voucherId);

// Get available vatTypes for INCOMING_INVOICE (not just INCOMING)
console.log("\n=== Check vatTypes for INCOMING_INVOICE ===");
const vatRes = await fetch(`${BASE}/ledger/vatType?typeOfVat=INCOMING_INVOICE&vatDate=${DATE}&fields=*`, { headers: H });
const vatData = await vatRes.json();
console.log("INCOMING_INVOICE vatTypes count:", vatData.fullResultSize);
for (const vt of (vatData.values || []).slice(0, 5)) {
  console.log(`  id=${vt.id} number=${vt.number} name=${vt.name} percentage=${vt.percentage}`);
}

// Also check INCOMING
const vatRes2 = await fetch(`${BASE}/ledger/vatType?typeOfVat=INCOMING&vatDate=${DATE}&fields=*`, { headers: H });
const vatData2 = await vatRes2.json();
console.log("\nINCOMING vatTypes count:", vatData2.fullResultSize);
for (const vt of (vatData2.values || []).slice(0, 5)) {
  console.log(`  id=${vt.id} number=${vt.number} name=${vt.name} percentage=${vt.percentage}`);
}

// ============================================================
// Try the dedicated endpoint with vatType from INCOMING_INVOICE
// ============================================================
console.log("\n=== Try putPostings with INCOMING_INVOICE vatType ===");

// First try with vatType from INCOMING_INVOICE (if available)
const incomingInvoiceVat = vatData.values?.find((v: any) => v.percentage === 25);
const vatTypeId = incomingInvoiceVat?.id || 1;
console.log("Using vatType id:", vatTypeId);

const test1Res = await fetch(`${BASE}/supplierInvoice/voucher/${voucherId}/postings?sendToLedger=false`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify([
    {
      posting: {
        account: { id: expAcctId },
        vatType: { id: vatTypeId },
        amount: NET,
        amountGross: GROSS,
        amountCurrency: NET,
        amountGrossCurrency: GROSS,
      },
    },
  ]),
});
console.log("Status:", test1Res.status);
const test1Data = await test1Res.json();
console.log("Response:", JSON.stringify(test1Data, null, 2));

// Try without vatType altogether
console.log("\n=== Try putPostings WITHOUT vatType ===");
const test2Res = await fetch(`${BASE}/supplierInvoice/voucher/${voucherId}/postings?sendToLedger=false`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify([
    {
      posting: {
        account: { id: expAcctId },
        amount: NET,
        amountGross: GROSS,
      },
    },
  ]),
});
console.log("Status:", test2Res.status);
const test2Data = await test2Res.json();
console.log("Response:", JSON.stringify(test2Data, null, 2));

// Try with just the orderLine data (not wrapping in posting)
console.log("\n=== Try putPostings with orderLine wrapper ===");
const test3Res = await fetch(`${BASE}/supplierInvoice/voucher/${voucherId}/postings?sendToLedger=false`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify([
    {
      orderLine: {
        description: "kontortjenester",
        count: 1,
        unitCostCurrency: GROSS,
        unitPriceExcludingVatCurrency: NET,
        vatType: { id: 1 },
        amountExcludingVatCurrency: NET,
        amountIncludingVatCurrency: GROSS,
      },
      posting: {
        account: { id: expAcctId },
      },
    },
  ]),
});
console.log("Status:", test3Res.status);
const test3Data = await test3Res.json();
console.log("Response:", JSON.stringify(test3Data, null, 2));

// Let's try the simplest possible format
console.log("\n=== Try simplest format ===");
const test4Res = await fetch(`${BASE}/supplierInvoice/voucher/${voucherId}/postings?sendToLedger=false`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify([
    {
      posting: {
        account: { id: expAcctId },
      },
      orderLine: {
        vatType: { id: 1 },
      },
    },
  ]),
});
console.log("Status:", test4Res.status);
const test4Data = await test4Res.json();
console.log("Response:", JSON.stringify(test4Data, null, 2));

// If all else fails, try just with the standard voucher PUT approach
// and then check if there is something about the supplierInvoice object that's wrong
console.log("\n=== Fallback: Standard voucher PUT + detailed SI check ===");
const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify({
    version: importData.values[0].version,
    postings: [
      { row: 1, account: { id: expAcctId }, description: "kontortjenester", vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: supLedger }, supplier: { id: supId }, description: "kontortjenester", amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INVOICE_NR, termOfPayment: DATE },
    ],
  }),
});
const putData = await putRes.json();
console.log("Voucher PUT:", putRes.status);

const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
  method: "PUT", headers: H,
  body: JSON.stringify({ version: putData.value.version }),
});
const bookData = await bookRes.json();
console.log("Book:", bookRes.status, "number:", bookData.value?.number);

// Now check the supplierInvoice - look at ALL fields
const siRes = await fetch(
  `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=*,supplier(*),voucher(*),orderLines(*),currency(*)`,
  { headers: H }
);
const siData = await siRes.json();
const si = siData.values?.[0];
if (si) {
  console.log("\n=== Full SupplierInvoice object ===");
  console.log(JSON.stringify(si, null, 2));

  // Check order lines in detail
  if (si.orderLines) {
    for (const ol of si.orderLines) {
      const olRes = await fetch(`${BASE}/order/orderline/${ol.id}?fields=*`, { headers: H });
      const olData = await olRes.json();
      console.log("\n=== OrderLine detail ===");
      console.log(JSON.stringify(olData.value, null, 2));
    }
  }

  // Check the voucher postings
  const vpRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=*,postings(*)`, { headers: H });
  const vpData = await vpRes.json();
  console.log("\n=== Voucher postings ===");
  for (const p of (vpData.value?.postings || [])) {
    console.log(JSON.stringify(p, null, 2));
  }
}
