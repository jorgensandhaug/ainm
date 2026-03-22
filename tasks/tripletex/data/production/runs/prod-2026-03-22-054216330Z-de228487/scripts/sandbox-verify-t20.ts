// Sandbox verification of 5-call T20 flow with this run's invoice data
// Supplier: Nordlicht GmbH / 871162069 / Nygata 53, 9008 Tromsø
// Invoice: INV-2026-7611, 2026-04-06, due 2026-05-06
// Net: 35650, VAT 25%: 8912, Gross: 44562
// Account: 6300, Bank: 28390913577

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

const SUPPLIER_NAME = "Nordlicht GmbH";
const ORG_NUMBER = "871162069";
const STREET = "Nygata 53";
const POSTAL_CODE = "9008";
const CITY = "Tromsø";
const BANK_ACCOUNT = "28390913577";
const INVOICE_NUMBER = "INV-2026-7611";
const INVOICE_DATE = "2026-04-06";
const DUE_DATE = "2026-05-06";
const DESCRIPTION = "Nettverkstjenester";
const NET = 35650;
const VAT = 8912;
const GROSS = 44562;  // 35650 + 8912 = 44562 (note: 35650*0.25=8912.50, but invoice says 8912)
const ACCOUNT_NUMBER = 6300;

async function api(method: string, path: string, body?: any, isFormData = false) {
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
  console.log(`${method} ${path} -> ${res.status}`);
  if (res.status >= 400) {
    console.log("ERROR:", JSON.stringify(json).slice(0, 500));
  }
  return { status: res.status, data: json };
}

async function main() {
  // Use unique name for sandbox to avoid collisions
  const sbName = `Nordlicht SBX ${Date.now()}`;

  // Step 1: POST /supplier
  console.log("\n=== STEP 1: Create Supplier ===");
  const sup = await api("POST", "/supplier", {
    name: sbName,
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
  });
  const supplierId = sup.data?.value?.id;
  console.log("Supplier ID:", supplierId);

  // Step 2: GET /ledger/account
  console.log("\n=== STEP 2: Get Account ID ===");
  const acc = await api("GET", `/ledger/account?number=${ACCOUNT_NUMBER}&isApplicableForSupplierInvoice=true&fields=*`);
  const accountId = acc.data?.values?.[0]?.id;
  console.log("Account ID:", accountId);

  // Also get the supplier ledger account (2400 typically)
  // We need to know the supplier ledger account ID, but we can get it from the supplier response
  // The supplier.vendorAccountId should be set, or we use 2400
  const supplierAccountNumber = sup.data?.value?.accountManager?.id ? 2400 : 2400;
  // Let's just get account 2400 in the same call... Actually we need a separate call.
  // Wait, can we check if the importDocument response returns a default credit account?
  // Let's see if we even need to get account 2400 — we can pass account: { number: 2400 }...
  // No, the trusted standard says we MUST use account: { id } not { number }.
  // But we can look at the supplier response for vendorAccountId or similar.

  // Actually, let me check what the supplier response looks like
  console.log("Supplier vendorAccountId?", JSON.stringify(sup.data?.value).slice(0, 300));

  // Step 3: importDocument
  console.log("\n=== STEP 3: Import Document ===");
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
    console.log("FAILED: importDocument did not return voucher");
    console.log("Full response:", JSON.stringify(imp.data).slice(0, 1000));
    return;
  }

  // We need the supplier ledger account ID (2400).
  // Check: can we get it from GET /ledger/account with the same call as step 2?
  // Actually, step 2 only gets the expense account. For the credit side we need account 2400.
  // Let's check if we can batch both accounts in one call.
  console.log("\n=== Get account 2400 (supplier ledger account) ===");
  const acc2400 = await api("GET", `/ledger/account?number=2400&fields=id,number`);
  const supplierLedgerAccountId = acc2400.data?.values?.[0]?.id;
  console.log("Supplier ledger account 2400 ID:", supplierLedgerAccountId);

  // Step 4: PUT postings
  console.log("\n=== STEP 4: Set Postings ===");
  const postings = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=false`, {
    version: voucherVersion,
    postings: [
      {
        row: 1,
        account: { id: accountId },
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
  if (postings.status >= 400) {
    console.log("Postings FAILED:", JSON.stringify(postings.data).slice(0, 500));
    return;
  }

  // Step 5: Book
  console.log("\n=== STEP 5: Book Voucher ===");
  const book = await api("PUT", `/ledger/voucher/${voucherId}?sendToLedger=true`, {
    version: postingsVersion,
    voucherType: { name: "Leverandørfaktura" },
  });
  console.log("Booked voucher number:", book.data?.value?.number);
  console.log("Booked status:", book.status);

  console.log("\n=== DONE ===");
  console.log("Total calls: 6 (supplier + account6300 + importDoc + account2400 + postings + book)");
  console.log("Note: account 2400 was an extra call. Can we combine the two account GETs?");
}

main().catch(console.error);
