// Full sandbox re-proof of the 5-call path with account 6540
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const SUPPLIER_NAME = "Sandbox Proof 6540 AS";
const ORG_NR = "987654325"; // Valid mod11 org number
const INVOICE_NR = "INV-SANDBOX-6540-PROOF";
const GROSS = 42100;
const NET = 33680;
const VAT_AMT = 8420;
const EXPENSE_ACCT = 6540;
const DESCRIPTION = "kontortjenester";
const DATE = "2026-03-21";

// Step 1: POST /supplier
console.log("=== Step 1: POST /supplier ===");
const supplierRes = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: H,
  body: JSON.stringify({ name: SUPPLIER_NAME, organizationNumber: ORG_NR }),
});
const supplierData = await supplierRes.json();
console.log("Status:", supplierRes.status);
if (!supplierRes.ok) { console.log(JSON.stringify(supplierData)); throw new Error("fail"); }
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
if (!acctRes.ok) { console.log(JSON.stringify(acctData)); throw new Error("fail"); }
const expenseAccountId = acctData.values[0].id;
console.log("Expense Account ID:", expenseAccountId, "Name:", acctData.values[0].name);

// Step 3: POST /ledger/voucher/importDocument
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
if (!importRes.ok) { console.log(JSON.stringify(importData)); throw new Error("fail"); }
const voucherId = importData.values[0].id;
const voucherVersion = importData.values[0].version;
console.log("Voucher ID:", voucherId, "Version:", voucherVersion);

// Step 4: PUT postings (sendToLedger=false)
console.log("\n=== Step 4: PUT postings (sendToLedger=false) ===");
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
if (!putRes.ok) { console.log(JSON.stringify(putData)); throw new Error("fail"); }
const newVersion = putData.value.version;
console.log("New version:", newVersion);

// Log key posting details
for (const p of putData.value.postings) {
  console.log(`  Row ${p.row}: account=${p.account.id} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id} supplier=${p.supplier?.id || '-'} sysGen=${p.systemGenerated}`);
}

// Step 5: PUT book (sendToLedger=true)
console.log("\n=== Step 5: PUT book (sendToLedger=true) ===");
const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
  method: "PUT",
  headers: H,
  body: JSON.stringify({ version: newVersion }),
});
const bookData = await bookRes.json();
console.log("Status:", bookRes.status);
if (!bookRes.ok) { console.log(JSON.stringify(bookData)); throw new Error("fail"); }
console.log("Voucher number:", bookData.value.number, "Version:", bookData.value.version);
console.log("\n=== DONE: 5 calls, 0 errors ===");
console.log("Supplier:", supplierId);
console.log("Voucher:", voucherId, "Number:", bookData.value.number);
