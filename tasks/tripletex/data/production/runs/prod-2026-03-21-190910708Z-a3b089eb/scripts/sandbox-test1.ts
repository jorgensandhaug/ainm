// Sandbox test: Can we skip GET /ledger/account by passing account number + name directly?
// Also test: Does description casing affect stored state?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const TS = Date.now();
const SUPPLIER_NAME = `Sandbox Reflect ${TS} AS`;
const ORG_NR = "877462137";
const INVOICE_NR = `INV-SBX-${TS}`;
const GROSS = 61600;
const NET = 49280;
const VAT_AMOUNT = 12320;
const DESCRIPTION = "kontortjenester"; // lowercase like prompt
const DATE = "2026-03-21";

async function api(method: string, path: string, body?: any, isFormData?: boolean) {
  const url = `${BASE}${path}`;
  const headers: Record<string, string> = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  console.log(`${method} ${path} → ${res.status}`);
  if (!res.ok) {
    console.error(text.slice(0, 500));
  }
  return { status: res.status, ok: res.ok, data: res.ok ? JSON.parse(text) : text };
}

// Step 1: Create supplier
const supplierRes = await api("POST", "/supplier", {
  name: SUPPLIER_NAME,
  organizationNumber: ORG_NR,
});
if (!supplierRes.ok) { console.log("Supplier creation failed, stopping"); process.exit(1); }
const supplierId = supplierRes.data.value.id;
const supplierLedgerAccountId = supplierRes.data.value.ledgerAccount.id;
console.log(`Supplier id=${supplierId}, ledgerAccount=${supplierLedgerAccountId}`);

// Step 2: Get the account info for reference
const accountRes = await api("GET", `/ledger/account?number=6340&isApplicableForSupplierInvoice=true&fields=*`);
const expenseAccountId = accountRes.data.values[0].id;
const expenseAccountName = accountRes.data.values[0].name;
console.log(`Expense account id=${expenseAccountId}, name="${expenseAccountName}"`);

// Step 3: Import EHF XML
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
      <cac:PostalAddress>
        <cbc:StreetName>Postboks 1</cbc:StreetName>
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
        <cbc:CompanyID>${ORG_NR}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
      <cac:PostalAddress>
        <cbc:StreetName>Testveien 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>Test Buyer AS</cbc:RegistrationName>
        <cbc:CompanyID>999999999</cbc:CompanyID>
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
formData.append("file", new Blob([xml], { type: "application/xml" }), "invoice.xml");

const importRes = await api("POST", "/ledger/voucher/importDocument", formData, true);
if (!importRes.ok) { console.log("Import failed, stopping"); process.exit(1); }
const voucherId = importRes.data.values[0].id;
let version = importRes.data.values[0].version;
console.log(`Voucher id=${voucherId}, version=${version}`);

// TEST: Try PUT with account: { id, number } but WITHOUT the GET - using hard-coded account number/name
// First, let's try with just account id (which we got from GET):
console.log("\n--- Test: PUT with account id from GET (standard path) ---");
const postingsRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
  version,
  postings: [
    {
      row: 1,
      date: DATE,
      description: DESCRIPTION,
      account: { id: expenseAccountId },
      vatType: { id: 1 },
      amount: NET,
      amountCurrency: NET,
      amountGross: GROSS,
      amountGrossCurrency: GROSS,
    },
    {
      row: 2,
      date: DATE,
      description: DESCRIPTION,
      account: { id: supplierLedgerAccountId },
      supplier: { id: supplierId },
      amount: -GROSS,
      amountCurrency: -GROSS,
      amountGross: -GROSS,
      amountGrossCurrency: -GROSS,
      invoiceNumber: INVOICE_NR,
      termOfPayment: DATE,
    },
  ],
});

if (postingsRes.ok) {
  version = postingsRes.data.value.version;
  console.log(`Postings set OK, version=${version}`);

  // Check description casing in response
  const postings = postingsRes.data.value.postings;
  for (const p of postings) {
    console.log(`  row=${p.row} desc="${p.description}" account=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id}`);
  }

  // Step 5: Book
  const bookRes = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, { version });
  if (bookRes.ok) {
    console.log(`Booked! number=${bookRes.data.value.number}`);
  }
}

// Now test: can we use account: { number: 6340, name: "..." } directly without GET?
// Create a second voucher to test this
console.log("\n--- Test 2: Import another voucher and try account: { number, name } ---");
const INVOICE_NR2 = `INV-SBX-${TS}-2`;
const xml2 = xml.replace(INVOICE_NR, INVOICE_NR2);
const formData2 = new FormData();
formData2.append("file", new Blob([xml2], { type: "application/xml" }), "invoice2.xml");

const importRes2 = await api("POST", "/ledger/voucher/importDocument", formData2, true);
if (importRes2.ok) {
  const voucherId2 = importRes2.data.values[0].id;
  let version2 = importRes2.data.values[0].version;
  console.log(`Voucher2 id=${voucherId2}, version=${version2}`);

  // Try with account: { number: 6340, name: expenseAccountName }
  const test2Res = await api("PUT", `/ledger/voucher/${voucherId2}?sendToLedger=false`, {
    version: version2,
    postings: [
      {
        row: 1,
        date: DATE,
        description: DESCRIPTION,
        account: { number: 6340, name: expenseAccountName },
        vatType: { id: 1 },
        amount: NET,
        amountCurrency: NET,
        amountGross: GROSS,
        amountGrossCurrency: GROSS,
      },
      {
        row: 2,
        date: DATE,
        description: DESCRIPTION,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        amount: -GROSS,
        amountCurrency: -GROSS,
        amountGross: -GROSS,
        amountGrossCurrency: -GROSS,
        invoiceNumber: INVOICE_NR2,
        termOfPayment: DATE,
      },
    ],
  });

  if (test2Res.ok) {
    console.log("Test 2 PASSED: account: { number, name } works WITHOUT GET!");
    version2 = test2Res.data.value.version;

    // Check if we can book it
    const bookRes2 = await api("PUT", `/ledger/voucher/${voucherId2}?sendToLedger=true`, { version: version2 });
    if (bookRes2.ok) {
      console.log(`Voucher2 booked! number=${bookRes2.data.value.number}`);
      // Check postings
      const postings2 = bookRes2.data.value.postings;
      if (postings2) {
        for (const p of postings2) {
          console.log(`  row=${p.row} account=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross} vatType=${p.vatType?.id}`);
        }
      }
    }
  } else {
    console.log("Test 2 FAILED: account: { number, name } doesn't work without id");
  }
}

console.log("\nDone.");
