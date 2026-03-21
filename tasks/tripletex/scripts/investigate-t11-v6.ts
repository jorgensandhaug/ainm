// Investigate task 11 - Part 6:
// 1. Check if importDocument creates a duplicate supplier
// 2. Test the putPostings endpoint with OrderLinePosting format
// 3. Test POST /supplierInvoice with a document file

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const ts = Date.now();
const DATE = "2026-03-21";

// ============================================================
// TEST 1: Check if importDocument linked to the RIGHT supplier
// ============================================================
console.log("=== TEST 1: Check supplier linkage in supplierInvoice ===");

// Let's use a UNIQUE org number for this test to avoid confusion
const UNIQUE_ORG = "976098897"; // Valid mod11
const SUPPLIER_NAME = `UniqueOrg ${ts}`;
const INVOICE_NR = `INV-UNIQUE-${ts}`;
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;

// Step 1: Create supplier with this unique org
console.log("--- Create supplier ---");
const supRes = await fetch(`${BASE}/supplier`, {
  method: "POST", headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: UNIQUE_ORG }),
});
const supData = await supRes.json();
const supId = supData.value.id;
const supLedger = supData.value.ledgerAccount.id;
console.log("Supplier:", supId, "name:", supData.value.name, "org:", supData.value.organizationNumber);

// Step 2: Get expense account
const acctRes = await fetch(`${BASE}/ledger/account?number=6540&isApplicableForSupplierInvoice=true&fields=*`, { headers: H });
const acctData = await acctRes.json();
const expAcctId = acctData.values[0].id;

// Step 3: Import EHF with this org number
console.log("--- Import EHF ---");
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
      <cbc:EndpointID schemeID="0192">${UNIQUE_ORG}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Hovedgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${UNIQUE_ORG}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${UNIQUE_ORG}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>My Company</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT_AMT}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
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
    <cac:Item>
      <cbc:Name>kontortjenester</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${NET}</cbc:PriceAmount>
    </cac:Price>
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
const voucherId = importData.values[0].id;
console.log("Voucher:", voucherId);

// Check how many suppliers have this org number AFTER import
console.log("\n--- Check suppliers with org", UNIQUE_ORG, "AFTER import ---");
const dupRes = await fetch(`${BASE}/supplier?organizationNumber=${UNIQUE_ORG}&fields=id,name,organizationNumber`, { headers: H });
const dupData = await dupRes.json();
console.log("Count:", dupData.fullResultSize);
for (const s of (dupData.values || [])) {
  console.log("  Supplier id:", s.id, "name:", s.name);
}

// Check the supplierInvoice - which supplier is linked?
console.log("\n--- Check supplierInvoice supplier linkage ---");
const siRes = await fetch(
  `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=*,supplier(id,name,organizationNumber)`,
  { headers: H }
);
const siData = await siRes.json();
console.log("SupplierInvoice count:", siData.fullResultSize);
for (const si of (siData.values || [])) {
  console.log("  SI id:", si.id, "supplier:", si.supplier?.id, "name:", si.supplier?.name, "org:", si.supplier?.organizationNumber);
  console.log("  amount:", si.amount, "invoiceNumber:", si.invoiceNumber);
  console.log("  Is our supplier?", si.supplier?.id === supId);
}

// ============================================================
// TEST 2: putPostings with OrderLinePosting format
// ============================================================
console.log("\n\n=== TEST 2: putPostings with OrderLinePosting format ===");

// The schema says OrderLinePosting has { posting, orderLine }
// Let's try wrapping our postings in that format
const olpRes = await fetch(`${BASE}/supplierInvoice/voucher/${voucherId}/postings?sendToLedger=false`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify([
    {
      posting: {
        account: { id: expAcctId },
        description: "kontortjenester",
        vatType: { id: 1 },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
    },
    {
      posting: {
        account: { id: supLedger },
        supplier: { id: supId },
        description: "kontortjenester",
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NR,
        termOfPayment: DATE,
      },
    },
  ]),
});
console.log("Status:", olpRes.status);
const olpData = await olpRes.json();
console.log("Response:", JSON.stringify(olpData, null, 2));

// If that didn't work, try with just the posting fields directly
if (!olpRes.ok) {
  console.log("\n--- Try just expense posting ---");
  const olp2Res = await fetch(`${BASE}/supplierInvoice/voucher/${voucherId}/postings?sendToLedger=false`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify([
      {
        posting: {
          account: { id: expAcctId },
          vatType: { id: 1 },
          amount: NET,
          amountGross: GROSS,
        },
      },
    ]),
  });
  console.log("Status:", olp2Res.status);
  const olp2Data = await olp2Res.json();
  console.log("Response:", JSON.stringify(olp2Data, null, 2));
}

// ============================================================
// TEST 3: Use the generic voucher PUT, then check if voucher has correct number
// ============================================================
console.log("\n\n=== TEST 3: Standard approach: PUT /ledger/voucher, then inspect ===");

// Standard approach that we know works mechanically
const voucherVersion = importData.values[0].version;
const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify({
    version: voucherVersion,
    postings: [
      { row: 1, account: { id: expAcctId }, description: "kontortjenester", vatType: { id: 1 }, amount: NET, amountCurrency: NET, amountGross: GROSS, amountGrossCurrency: GROSS },
      { row: 2, account: { id: supLedger }, supplier: { id: supId }, description: "kontortjenester", amount: -GROSS, amountCurrency: -GROSS, amountGross: -GROSS, amountGrossCurrency: -GROSS, invoiceNumber: INVOICE_NR, termOfPayment: DATE },
    ],
  }),
});
const putData = await putRes.json();
console.log("PUT status:", putRes.status);

if (putRes.ok) {
  const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({ version: putData.value.version }),
  });
  const bookData = await bookRes.json();
  console.log("Book status:", bookRes.status, "number:", bookData.value?.number);

  // Check voucher details
  console.log("\n--- Full voucher details ---");
  const vRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=*`, { headers: H });
  const vData = await vRes.json();
  console.log("Voucher type:", vData.value?.voucherType?.id, vData.value?.voucherType?.name);
  console.log("Number:", vData.value?.number);
  console.log("Date:", vData.value?.date);
  console.log("Description:", vData.value?.description);

  // Check postings
  for (const p of (vData.value?.postings || [])) {
    console.log(`  Posting row=${p.row} acct=${p.account?.id}(${p.account?.number}) amt=${p.amount} amtGross=${p.amountGross} vatType=${p.vatType?.id} supplier=${p.supplier?.id}`);
  }

  // Check supplierInvoice AFTER booking
  console.log("\n--- SupplierInvoice AFTER booking ---");
  const siAfterRes = await fetch(
    `${BASE}/supplierInvoice?invoiceDateFrom=2026-01-01&invoiceDateTo=2026-12-31&voucherId=${voucherId}&fields=*,supplier(id,name,organizationNumber)`,
    { headers: H }
  );
  const siAfterData = await siAfterRes.json();
  for (const si of (siAfterData.values || [])) {
    console.log("  SI id:", si.id);
    console.log("  supplier:", si.supplier?.id, "name:", si.supplier?.name, "org:", si.supplier?.organizationNumber);
    console.log("  invoiceNumber:", si.invoiceNumber);
    console.log("  invoiceDate:", si.invoiceDate);
    console.log("  invoiceDueDate:", si.invoiceDueDate);
    console.log("  amount:", si.amount);
    console.log("  amountExcludingVat:", si.amountExcludingVat);
    console.log("  outstandingAmount:", si.outstandingAmount);
    console.log("  isCreditNote:", si.isCreditNote);
    console.log("  voucher:", si.voucher?.id);
    console.log("  orderLines:", si.orderLines?.length);

    // Check orderLines details
    if (si.orderLines && si.orderLines.length > 0) {
      for (const ol of si.orderLines) {
        const olRes = await fetch(`${BASE}/order/orderline/${ol.id}?fields=*`, { headers: H });
        const olData = await olRes.json();
        console.log("  OrderLine:", JSON.stringify(olData.value, null, 2));
      }
    }
  }
} else {
  console.log("PUT failed:", JSON.stringify(putData));
}
