// Sandbox test: Can we skip GET /ledger/account by using account number directly?
// If this works, we can do a 3-call path instead of 4.

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

const SUPPLIER_NAME = "Sandbox 3Call Test Ltd";
const ORG_NUMBER = "987328696"; // Valid Norwegian org number
const INVOICE_NUMBER = "INV-SANDBOX-3CALL-001";
const GROSS = 25000;
const NET = 20000;
const VAT_AMOUNT = 5000;
const DESCRIPTION = "Office services test";
const DATE = "2026-03-21";

// Step 1: POST /supplier
console.log("=== Step 1: POST /supplier ===");
const supplierRes = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers,
  body: JSON.stringify({
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NUMBER,
  }),
});
const supplierData = await supplierRes.json();
console.log("Status:", supplierRes.status);
if (!supplierRes.ok) { console.error("FAILED:", JSON.stringify(supplierData)); process.exit(1); }
const supplierId = supplierData.value.id;
const supplierLedgerAccountId = supplierData.value.ledgerAccount.id;
console.log("Supplier ID:", supplierId);
console.log("Supplier Ledger Account ID:", supplierLedgerAccountId);

// Step 2: POST /ledger/voucher/importDocument (skip GET /ledger/account)
console.log("\n=== Step 2: POST /ledger/voucher/importDocument ===");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NUMBER}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NUMBER}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Test Gate 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${ORG_NUMBER}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${SUPPLIER_NAME}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${ORG_NUMBER}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Gate 1</cbc:StreetName>
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
    <cbc:TaxAmount currencyID="NOK">${VAT_AMOUNT}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT_AMOUNT}</cbc:TaxAmount>
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
formData.append("file", new Blob([xml], { type: "application/xml" }), `${INVOICE_NUMBER}.xml`);

const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
  method: "POST",
  headers: { Authorization: AUTH },
  body: formData,
});
const importData = await importRes.json();
console.log("Status:", importRes.status);
if (!importRes.ok) { console.error("FAILED:", JSON.stringify(importData)); process.exit(1); }
const voucherId = importData.values[0].id;
const voucherVersion = importData.values[0].version;
console.log("Voucher ID:", voucherId);
console.log("Voucher Version:", voucherVersion);

// Step 3: PUT /ledger/voucher/{id}?sendToLedger=false
// Try using account: { number: 6300 } instead of account: { id: ... }
console.log("\n=== Step 3: PUT with account number (no GET account) ===");
const putBody1 = {
  version: voucherVersion,
  postings: [
    {
      row: 1,
      account: { number: 6300 },
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
      invoiceNumber: INVOICE_NUMBER,
      termOfPayment: DATE,
    },
  ],
};

const putRes1 = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
  method: "PUT",
  headers,
  body: JSON.stringify(putBody1),
});
const putData1 = await putRes1.json();
console.log("Status:", putRes1.status);
console.log("Response:", JSON.stringify(putData1, null, 2));

if (putRes1.ok) {
  console.log("\n*** SUCCESS! account: { number: ... } WORKS! 3-call path is possible! ***");
} else {
  console.log("\n*** FAILED — account: { number: ... } does NOT work. Trying account: { number: 6300, name: 'Kontorkostnader' } ***");

  // Try with number + name
  const putBody2 = {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { number: 6300, name: "Kontorkostnader" },
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
        invoiceNumber: INVOICE_NUMBER,
        termOfPayment: DATE,
      },
    ],
  };

  const putRes2 = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
    method: "PUT",
    headers,
    body: JSON.stringify(putBody2),
  });
  const putData2 = await putRes2.json();
  console.log("Status:", putRes2.status);
  console.log("Response:", JSON.stringify(putData2, null, 2));

  if (putRes2.ok) {
    console.log("\n*** SUCCESS with number + name! But need to know account name in advance. ***");
  } else {
    console.log("\n*** account by number+name also FAILED. 4-call path is truly minimal. ***");
  }
}
