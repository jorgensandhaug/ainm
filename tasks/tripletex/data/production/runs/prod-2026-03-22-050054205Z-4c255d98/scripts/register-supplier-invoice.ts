const BASE = "https://tx-proxy-jwanbnu3pq-lz.a.run.app/v2";
const TOKEN = "as-4lt1QPfxfWk6Bn0VlTuEXbkfZuyTcE4PSmN5OZvY";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);
const H = { "Content-Type": "application/json", Authorization: AUTH };

const SUPPLIER_NAME = "Rio Azul Lda";
const ORG_NUMBER = "834732092";
const STREET = "Parkveien 1";
const POSTAL_CODE = "0182";
const CITY = "Oslo";
const BANK_ACCOUNT = "11287374218";

const INVOICE_NUMBER = "INV-2026-6669";
const INVOICE_DATE = "2026-04-29";
const DUE_DATE = "2026-05-29";
const DESCRIPTION = "IT-konsulenttjenester";

const NET = 22050;
const VAT_AMOUNT = 5512;
const GROSS = 27562;
const EXPENSE_ACCOUNT_NR = 6300;

let supplierId: number;
let supplierLedgerAccountId: number;
let expenseAccountId: number;
let voucherId: number;

async function main() {
  // Step 1: POST /supplier
  console.log("=== Step 1: POST /supplier ===");
  const supplierRes = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers: H,
    body: JSON.stringify({
      name: SUPPLIER_NAME,
      organizationNumber: ORG_NUMBER,
      postalAddress: {
        addressLine1: STREET,
        postalCode: POSTAL_CODE,
        city: CITY,
        country: { id: 161 },
      },
      physicalAddress: {
        addressLine1: STREET,
        postalCode: POSTAL_CODE,
        city: CITY,
        country: { id: 161 },
      },
      bankAccountPresentation: [{ bban: BANK_ACCOUNT }],
    }),
  });
  const supplierData = await supplierRes.json();
  if (!supplierRes.ok) { console.error("FAIL:", JSON.stringify(supplierData).slice(0, 500)); throw new Error("Step 1 failed"); }
  supplierId = supplierData.value.id;
  supplierLedgerAccountId = supplierData.value.ledgerAccount.id;
  console.log(`  supplierId=${supplierId}, ledgerAccountId=${supplierLedgerAccountId}, status=${supplierRes.status}`);

  // Step 2: GET /ledger/account for expense account
  console.log("=== Step 2: GET /ledger/account ===");
  const acctRes = await fetch(
    `${BASE}/ledger/account?number=${EXPENSE_ACCOUNT_NR}&isApplicableForSupplierInvoice=true&fields=*`,
    { headers: H }
  );
  const acctData = await acctRes.json();
  if (!acctRes.ok || !acctData.values?.length) { console.error("FAIL:", JSON.stringify(acctData).slice(0, 500)); throw new Error("Step 2 failed"); }
  expenseAccountId = acctData.values[0].id;
  console.log(`  expenseAccountId=${expenseAccountId} (${acctData.values[0].name}), status=${acctRes.status}`);

  // Step 3: POST /ledger/voucher/importDocument with EHF XML
  console.log("=== Step 3: POST /ledger/voucher/importDocument ===");
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${INVOICE_NUMBER}</cbc:ID>
  <cbc:IssueDate>${INVOICE_DATE}</cbc:IssueDate>
  <cbc:DueDate>${DUE_DATE}</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${ORG_NUMBER}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${SUPPLIER_NAME}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>${STREET}</cbc:StreetName>
        <cbc:CityName>${CITY}</cbc:CityName>
        <cbc:PostalZone>${POSTAL_CODE}</cbc:PostalZone>
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
      <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
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
  formData.append("file", new Blob([xml], { type: "text/xml" }), `${INVOICE_NUMBER}.xml`);
  const importRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST",
    headers: { Authorization: AUTH },
    body: formData,
  });
  const importData = await importRes.json();
  if (!importRes.ok) { console.error("FAIL:", JSON.stringify(importData).slice(0, 500)); throw new Error("Step 3 failed"); }
  voucherId = importData.values[0].id;
  const voucherVersion = importData.values[0].version;
  console.log(`  voucherId=${voucherId}, version=${voucherVersion}, number=${importData.values[0].number}, status=${importRes.status}`);

  // Step 4: PUT postings with sendToLedger=false
  console.log("=== Step 4: PUT /ledger/voucher — set postings ===");
  const postingsRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
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
          invoiceNumber: INVOICE_NUMBER,
          termOfPayment: DUE_DATE,
        },
      ],
    }),
  });
  const postingsData = await postingsRes.json();
  if (!postingsRes.ok) { console.error("FAIL:", JSON.stringify(postingsData).slice(0, 500)); throw new Error("Step 4 failed"); }
  const v2 = postingsData.value.version;
  console.log(`  version=${v2}, number=${postingsData.value.number}, status=${postingsRes.status}`);

  // Step 5: PUT book with sendToLedger=true
  console.log("=== Step 5: PUT /ledger/voucher — book ===");
  const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
    method: "PUT",
    headers: H,
    body: JSON.stringify({
      version: v2,
      voucherType: { name: "Leverandørfaktura" },
    }),
  });
  const bookData = await bookRes.json();
  if (!bookRes.ok) { console.error("FAIL:", JSON.stringify(bookData).slice(0, 500)); throw new Error("Step 5 failed"); }
  console.log(`  number=${bookData.value.number}, status=${bookRes.status}`);

  console.log("\n=== DONE: 5 API calls, 0 errors ===");
  console.log(`  supplierId=${supplierId}`);
  console.log(`  voucherId=${voucherId}`);
  console.log(`  voucherNumber=${bookData.value.number}`);
}

main().catch((e) => { console.error("\nFATAL:", e); process.exit(1); });
