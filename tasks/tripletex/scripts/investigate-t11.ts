// Investigate task 11 (register supplier invoice, text-only)
// Test both EHF import approach AND direct POST /supplierInvoice approach

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

// ============================================================
// PART 1: Check if POST /supplierInvoice endpoint exists
// ============================================================
console.log("=== PART 1: Check POST /supplierInvoice ===");

// First, let's see what endpoints exist for supplierInvoice
const siListRes = await fetch(`${BASE}/supplierInvoice?count=1&fields=id,invoiceNumber,amount,amountCurrency,supplier(id,name,organizationNumber),voucher(id,number)`, { headers: H });
console.log("GET /supplierInvoice status:", siListRes.status);
const siListData = await siListRes.json();
console.log("Existing supplier invoices count:", siListData.fullResultSize);
if (siListData.values && siListData.values.length > 0) {
  console.log("Sample supplierInvoice:", JSON.stringify(siListData.values[0], null, 2));
}

// ============================================================
// PART 2: Do the EHF import flow and inspect the supplierInvoice
// ============================================================
console.log("\n=== PART 2: EHF Import Flow ===");

const ts = Date.now();
const SUPPLIER_NAME = `T11 Test ${ts}`;
const ORG_NR = "987654325";
const INVOICE_NR = `INV-T11-${ts}`;
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const EXPENSE_ACCT = 6540;
const DESCRIPTION = "kontortjenester";
const DATE = "2026-03-21";

// Step 1: POST /supplier
console.log("\n--- Step 1: POST /supplier ---");
const supplierRes = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: ORG_NR }),
});
const supplierData = await supplierRes.json();
console.log("Status:", supplierRes.status);
if (!supplierRes.ok) { console.log(JSON.stringify(supplierData)); throw new Error("Supplier creation failed"); }
const supplierId = supplierData.value.id;
const supplierLedgerAccountId = supplierData.value.ledgerAccount.id;
console.log("Supplier ID:", supplierId, "Ledger Account ID:", supplierLedgerAccountId);

// Step 2: GET /ledger/account
console.log("\n--- Step 2: GET /ledger/account ---");
const acctRes = await fetch(
  `${BASE}/ledger/account?number=${EXPENSE_ACCT}&isApplicableForSupplierInvoice=true&fields=*`,
  { headers: H }
);
const acctData = await acctRes.json();
const expenseAccountId = acctData.values[0].id;
console.log("Expense Account ID:", expenseAccountId);

// Step 3: POST /ledger/voucher/importDocument
console.log("\n--- Step 3: POST /ledger/voucher/importDocument ---");
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
      <cac:PostalAddress>
        <cbc:StreetName>Hovedgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NR}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${ORG_NR}</cbc:CompanyID>
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
      <cbc:Name>${DESCRIPTION}</cbc:Name>
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
console.log("Status:", importRes.status);
if (!importRes.ok) { console.log(JSON.stringify(importData)); throw new Error("Import failed"); }
const voucherId = importData.values[0].id;
const voucherVersion = importData.values[0].version;
console.log("Voucher ID:", voucherId, "Version:", voucherVersion);

// Step 4: PUT postings (sendToLedger=false)
console.log("\n--- Step 4: PUT postings (sendToLedger=false) ---");
const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify({
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: DESCRIPTION,
        vatType: { id: 1 },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description: DESCRIPTION,
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
const putData = await putRes.json();
console.log("Status:", putRes.status);
if (!putRes.ok) { console.log(JSON.stringify(putData)); throw new Error("PUT failed"); }
const newVersion = putData.value.version;
console.log("New version:", newVersion);

// Step 5: PUT book (sendToLedger=true)
console.log("\n--- Step 5: PUT book (sendToLedger=true) ---");
const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify({ version: newVersion }),
});
const bookData = await bookRes.json();
console.log("Status:", bookRes.status);
if (!bookRes.ok) { console.log(JSON.stringify(bookData)); throw new Error("Booking failed"); }
console.log("Voucher booked, number:", bookData.value.number);

// ============================================================
// PART 3: Inspect the supplierInvoice object created by import
// ============================================================
console.log("\n=== PART 3: Inspect supplierInvoice object ===");

// Search for supplier invoices linked to our supplier
const siRes = await fetch(
  `${BASE}/supplierInvoice?supplierId=${supplierId}&count=10&fields=*,supplier(id,name,organizationNumber),voucher(id,number,date)`,
  { headers: H }
);
const siData = await siRes.json();
console.log("GET /supplierInvoice by supplierId:", siRes.status, "count:", siData.fullResultSize);
if (siData.values && siData.values.length > 0) {
  for (const si of siData.values) {
    console.log("\n--- SupplierInvoice ---");
    console.log(JSON.stringify(si, null, 2));
  }
} else {
  console.log("NO supplier invoices found for supplierId", supplierId);

  // Try broader search
  const siBroadRes = await fetch(
    `${BASE}/supplierInvoice?count=5&sorting=-id&fields=*,supplier(id,name,organizationNumber),voucher(id,number,date)`,
    { headers: H }
  );
  const siBroadData = await siBroadRes.json();
  console.log("\nBroad search (latest 5):", siBroadRes.status, "count:", siBroadData.fullResultSize);
  for (const si of (siBroadData.values || [])) {
    console.log("\n  SI id:", si.id, "invoiceNumber:", si.invoiceNumber, "amount:", si.amount, "supplier:", si.supplier?.name, "supplierId:", si.supplier?.id, "voucher:", si.voucher?.id, "voucherNumber:", si.voucher?.number);
  }
}

// ============================================================
// PART 4: Check for duplicate suppliers with same org number
// ============================================================
console.log("\n=== PART 4: Check for duplicate suppliers ===");
const dupRes = await fetch(`${BASE}/supplier?organizationNumber=${ORG_NR}&fields=id,name,organizationNumber`, { headers: H });
const dupData = await dupRes.json();
console.log("Suppliers with org", ORG_NR, ":", dupData.fullResultSize);
for (const s of (dupData.values || [])) {
  console.log("  Supplier id:", s.id, "name:", s.name, "org:", s.organizationNumber);
}

// ============================================================
// PART 5: Check if there's a POST /supplierInvoice endpoint
// ============================================================
console.log("\n=== PART 5: Test POST /supplierInvoice ===");
const postSiRes = await fetch(`${BASE}/supplierInvoice`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    supplier: { id: supplierId },
    invoiceNumber: "TEST-DIRECT-POST",
    invoiceDate: DATE,
    dueDate: DATE,
    amount: -GROSS,
    amountCurrency: -GROSS,
    currency: { id: 1 },
  }),
});
console.log("POST /supplierInvoice status:", postSiRes.status);
const postSiData = await postSiRes.json();
console.log("Response:", JSON.stringify(postSiData, null, 2));
