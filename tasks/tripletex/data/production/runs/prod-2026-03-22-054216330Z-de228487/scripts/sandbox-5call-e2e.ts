// TRUE 5-call E2E T20 flow — combines both account lookups into single GET
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

// Invoice data from PDF
const SUPPLIER_NAME = "Nordlicht GmbH";
const ORG_NUMBER = "871162069";
const STREET = "Nygata 53";
const POSTAL_CODE = "9008";
const CITY = "Tromsø";
const BANK_ACCOUNT = "28390913577";
const INVOICE_NUMBER = "INV-2026-7611-5call";
const INVOICE_DATE = "2026-04-06";
const DUE_DATE = "2026-05-06";
const DESCRIPTION = "Nettverkstjenester";
const NET = 35650;
const VAT = 8912;
const GROSS = 44562;
const ACCOUNT_NUMBER = 6300;

let callCount = 0;
async function api(method: string, path: string, body?: any, isFormData = false) {
  callCount++;
  const url = `${BASE}${path}`;
  const headers: any = { Authorization: AUTH };
  if (body && !isFormData) headers["Content-Type"] = "application/json";
  const res = await fetch(url, {
    method,
    headers,
    body: isFormData ? body : body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = text; }
  console.log(`[Call ${callCount}] ${method} ${path} -> ${res.status}`);
  if (res.status >= 400) console.log("ERROR:", JSON.stringify(json).slice(0, 500));
  return { status: res.status, data: json };
}

async function main() {
  const sbName = `Nordlicht 5call ${Date.now()}`;

  // Call 1: POST /supplier
  console.log("\n=== Call 1: Create Supplier ===");
  const sup = await api("POST", "/supplier", {
    name: sbName,
    organizationNumber: ORG_NUMBER,
    postalAddress: { addressLine1: STREET, postalCode: POSTAL_CODE, city: CITY, country: { id: 161 } },
    physicalAddress: { addressLine1: STREET, postalCode: POSTAL_CODE, city: CITY, country: { id: 161 } },
    bankAccountPresentation: [{ bban: BANK_ACCOUNT }],
  });
  const supplierId = sup.data?.value?.id;
  console.log("Supplier ID:", supplierId);

  // Call 2: GET both accounts (expense + 2400) in single call using comma-separated numbers
  console.log("\n=== Call 2: Get Both Account IDs ===");
  const acc = await api("GET", `/ledger/account?number=${ACCOUNT_NUMBER}%2C2400&isApplicableForSupplierInvoice=true&fields=id,number`);
  let expenseAccountId: number | undefined;
  let supplierLedgerAccountId: number | undefined;
  for (const v of acc.data?.values || []) {
    if (v.number === ACCOUNT_NUMBER) expenseAccountId = v.id;
    if (v.number === 2400) supplierLedgerAccountId = v.id;
  }
  console.log(`Expense account ${ACCOUNT_NUMBER} ID:`, expenseAccountId);
  console.log("Supplier ledger account 2400 ID:", supplierLedgerAccountId);

  // Call 3: importDocument
  console.log("\n=== Call 3: Import Document ===");
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
    <cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${NET}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${VAT}</cbc:TaxAmount>
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
  const imp = await api("POST", "/ledger/voucher/importDocument", formData, true);
  const voucherId = imp.data?.values?.[0]?.id;
  const voucherVersion = imp.data?.values?.[0]?.version;
  console.log("Voucher ID:", voucherId, "Version:", voucherVersion);

  if (!voucherId) {
    console.log("FAILED: no voucher returned");
    return;
  }

  // Call 4: PUT postings
  console.log("\n=== Call 4: Set Postings ===");
  const postings = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
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
  });
  const postingsVersion = postings.data?.value?.version;
  console.log("Postings version:", postingsVersion);

  // Call 5: Book
  console.log("\n=== Call 5: Book Voucher ===");
  const book = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: postingsVersion,
    voucherType: { name: "Leverandørfaktura" },
  });
  console.log("Booked voucher number:", book.data?.value?.number);

  console.log(`\n=== RESULT: ${callCount} API calls, all ${book.status === 200 ? "SUCCESS" : "FAILED"} ===`);
}

main().catch(console.error);
