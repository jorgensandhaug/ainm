const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "WW6VGNNBb13NGOBRFsGWZqfDSzG7JweEGBl7JUnMmeE";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const SUPPLIER_NAME = "Tindra AS";
const ORG_NR = "983514650";
const INVOICE_NR = "INV-2026-3624";
const GROSS = 42100;
const NET = 33680; // 42100 / 1.25
const VAT_AMT = 8420;
const EXPENSE_ACCT = 6540;
const DESCRIPTION = "kontortjenester";
const DATE = "2026-03-21";

// Step 1: POST /supplier
console.log("=== Step 1: POST /supplier ===");
const supplierRes = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NR,
  }),
});
const supplierData = await supplierRes.json();
console.log("Status:", supplierRes.status);
console.log("Response:", JSON.stringify(supplierData, null, 2));
if (!supplierRes.ok) throw new Error("Supplier creation failed");
const supplierId = supplierData.value.id;
const supplierLedgerAccountId = supplierData.value.ledgerAccount.id;
console.log("Supplier ID:", supplierId, "Ledger Account ID:", supplierLedgerAccountId);

// Step 2: GET /ledger/account
console.log("\n=== Step 2: GET /ledger/account ===");
const acctRes = await fetch(
  `${BASE}/ledger/account?number=${EXPENSE_ACCT}&isApplicableForSupplierInvoice=true&fields=*`,
  { headers: H }
);
const acctData = await acctRes.json();
console.log("Status:", acctRes.status);
if (!acctRes.ok) throw new Error("Account lookup failed");
const expenseAccountId = acctData.values[0].id;
console.log("Expense Account ID:", expenseAccountId);

// Step 3: POST /ledger/voucher/importDocument (EHF XML)
console.log("\n=== Step 3: POST /ledger/voucher/importDocument ===");
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
console.log("Response:", JSON.stringify(importData, null, 2));
if (!importRes.ok) throw new Error("Import failed");
const voucherId = importData.values[0].id;
const voucherVersion = importData.values[0].version;
console.log("Voucher ID:", voucherId, "Version:", voucherVersion);

// Step 4: PUT /ledger/voucher/{id}?sendToLedger=false (set postings)
console.log("\n=== Step 4: PUT /ledger/voucher (postings, sendToLedger=false) ===");
const putPostingsRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
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
const putPostingsData = await putPostingsRes.json();
console.log("Status:", putPostingsRes.status);
console.log("Response:", JSON.stringify(putPostingsData, null, 2));
if (!putPostingsRes.ok) throw new Error("PUT postings failed");
const newVersion = putPostingsData.value.version;
console.log("New version:", newVersion);

// Step 5: PUT /ledger/voucher/{id}?sendToLedger=true (book the voucher)
console.log("\n=== Step 5: PUT /ledger/voucher (sendToLedger=true, book) ===");
const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify({ version: newVersion }),
});
const bookData = await bookRes.json();
console.log("Status:", bookRes.status);
console.log("Response:", JSON.stringify(bookData, null, 2));
if (!bookRes.ok) throw new Error("Booking failed");
console.log("Voucher number:", bookData.value.number);
console.log("\n=== DONE ===");
console.log("Supplier:", supplierId);
console.log("Voucher:", voucherId, "Number:", bookData.value.number);
