const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "G15I9kHWAwvEwD4e5WuUn255YBvmDp7SeWU13karSMQ";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const headers = { Authorization: AUTH, "Content-Type": "application/json" };

const SUPPLIER_NAME = "Brightstone Ltd";
const ORG_NUMBER = "890932991";
const INVOICE_NUMBER = "INV-2026-9075";
const GROSS = 59800;
const NET = 47840; // 59800 / 1.25
const VAT_AMOUNT = 11960;
const EXPENSE_ACCOUNT = 6300;
const DESCRIPTION = "Office services";
const DATE = "2026-03-21";
const DUE_DATE = "2026-03-21";

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
console.log("Response:", JSON.stringify(supplierData, null, 2));
if (!supplierRes.ok) { console.error("FAILED to create supplier"); process.exit(1); }
const supplierId = supplierData.value.id;
const supplierLedgerAccountId = supplierData.value.ledgerAccount.id;
console.log("Supplier ID:", supplierId);
console.log("Supplier Ledger Account ID:", supplierLedgerAccountId);

// Step 2: GET /ledger/account
console.log("\n=== Step 2: GET /ledger/account ===");
const accountRes = await fetch(
  `${BASE}/ledger/account?number=${EXPENSE_ACCOUNT}&isApplicableForSupplierInvoice=true&fields=*`,
  { headers }
);
const accountData = await accountRes.json();
console.log("Status:", accountRes.status);
if (!accountRes.ok) { console.error("FAILED to get account"); process.exit(1); }
const expenseAccountId = accountData.values[0].id;
console.log("Expense Account ID:", expenseAccountId);

// Step 3: POST /ledger/voucher/importDocument
console.log("\n=== Step 3: POST /ledger/voucher/importDocument ===");

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NUMBER}</cbc:ID>
  <cbc:IssueDate>${DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE_DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NUMBER}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Unknown</cbc:StreetName>
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
console.log("Response:", JSON.stringify(importData, null, 2));
if (!importRes.ok) { console.error("FAILED to import document"); process.exit(1); }

// CRITICAL: response is { values: [...] }, NOT { value: {...} }
const voucherId = importData.values[0].id;
const voucherVersion = importData.values[0].version;
console.log("Voucher ID:", voucherId);
console.log("Voucher Version:", voucherVersion);

// Step 4: PUT /ledger/voucher/{id}?sendToLedger=false
console.log("\n=== Step 4: PUT /ledger/voucher ===");
const putBody = {
  version: voucherVersion,
  postings: [
    {
      row: 1,
      account: { id: expenseAccountId },
      description: DESCRIPTION,
      vatType: { id: 1 }, // 25% incoming VAT, hard-coded
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
      termOfPayment: DUE_DATE,
    },
  ],
};

const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
  method: "PUT",
  headers,
  body: JSON.stringify(putBody),
});
const putData = await putRes.json();
console.log("Status:", putRes.status);
console.log("Response:", JSON.stringify(putData, null, 2));
if (!putRes.ok) { console.error("FAILED to update voucher"); process.exit(1); }

console.log("\n=== DONE ===");
console.log("Supplier ID:", supplierId);
console.log("Voucher ID:", voucherId);
console.log("4 API calls total, 0 errors.");
