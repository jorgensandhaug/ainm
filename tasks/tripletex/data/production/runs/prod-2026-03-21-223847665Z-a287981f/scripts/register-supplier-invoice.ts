const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "kwGM5i-4OitQ2PNDnfJOJD7Y6Yyitg3_C9aqbZy9kl4";
const AUTH = "Basic " + btoa("0:" + TOKEN);

const h = { Authorization: AUTH, "Content-Type": "application/json" };

const SUPPLIER_NAME = "Fossekraft AS";
const ORG_NR = "949805727";
const INV_NR = "INV-2026-4995";
const GROSS = 62850;
const NET = GROSS / 1.25; // 50280
const VAT_AMT = GROSS - NET; // 12570
const ACCT_NR = 7000;
const DESC = "kontortenester";
const INV_DATE = "2026-03-21";
const DUE_DATE = "2026-03-21";

// Step 1: POST /supplier
console.log("=== Step 1: POST /supplier ===");
const supRes = await fetch(`${BASE}/supplier`, {
  method: "POST",
  headers: h,
  body: JSON.stringify({
    name: SUPPLIER_NAME,
    organizationNumber: ORG_NR,
  }),
});
const supData = await supRes.json();
console.log("Status:", supRes.status);
console.log("Supplier:", JSON.stringify(supData, null, 2));
if (!supRes.ok) throw new Error("Supplier creation failed");
const supplierId = supData.value.id;
const supplierLedgerAccountId = supData.value.ledgerAccount.id;
console.log("supplierId:", supplierId, "ledgerAcctId:", supplierLedgerAccountId);

// Step 2: GET /ledger/account
console.log("\n=== Step 2: GET /ledger/account ===");
const acctRes = await fetch(
  `${BASE}/ledger/account?number=${ACCT_NR}&isApplicableForSupplierInvoice=true&fields=*`,
  { headers: h }
);
const acctData = await acctRes.json();
console.log("Status:", acctRes.status);
if (!acctRes.ok || acctData.count === 0) throw new Error("Account lookup failed");
const expenseAccountId = acctData.values[0].id;
console.log("expenseAccountId:", expenseAccountId);

// Step 3: POST /ledger/voucher/importDocument
console.log("\n=== Step 3: POST /ledger/voucher/importDocument ===");
const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INV_NR}</cbc:ID>
  <cbc:IssueDate>${INV_DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE_DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NR}</cbc:EndpointID>
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
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Kundevei 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Mitt Selskap AS</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">123456785</cbc:CompanyID>
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
      <cbc:Name>${DESC}</cbc:Name>
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
console.log("Import:", JSON.stringify(importData, null, 2));
if (!importRes.ok) throw new Error("Import failed");
const voucherId = importData.values[0].id;
const voucherVersion = importData.values[0].version;
console.log("voucherId:", voucherId, "version:", voucherVersion);

// Step 4: PUT /ledger/voucher/{id}?sendToLedger=false (postings)
console.log("\n=== Step 4: PUT postings (sendToLedger=false) ===");
const putPostingsRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
  method: "PUT",
  headers: h,
  body: JSON.stringify({
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: DESC,
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
        description: DESC,
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INV_NR,
        termOfPayment: DUE_DATE,
      },
    ],
  }),
});
const putPostingsData = await putPostingsRes.json();
console.log("Status:", putPostingsRes.status);
console.log("Postings PUT:", JSON.stringify(putPostingsData, null, 2));
if (!putPostingsRes.ok) throw new Error("Postings PUT failed");
const voucherVersion2 = putPostingsData.value.version;
console.log("version after postings:", voucherVersion2);

// Step 5: PUT /ledger/voucher/{id}?sendToLedger=true (booking, only version)
console.log("\n=== Step 5: PUT booking (sendToLedger=true) ===");
const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
  method: "PUT",
  headers: h,
  body: JSON.stringify({ version: voucherVersion2 }),
});
const bookData = await bookRes.json();
console.log("Status:", bookRes.status);
console.log("Booking PUT:", JSON.stringify(bookData, null, 2));
if (!bookRes.ok) throw new Error("Booking PUT failed");
console.log("Voucher number:", bookData.value.number);
console.log("\n=== DONE — 5 calls, 0 errors expected ===");
