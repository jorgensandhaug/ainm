// Investigate: does importDocument return postings with account IDs that we could reuse?
// And: can we do a single PUT with postings + sendToLedger=true?
const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);

async function api(method: string, path: string, body?: any, isFormData = false) {
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
  return { status: res.status, data: JSON.parse(text), ok: res.ok };
}

async function main() {
  const ts = Date.now();
  const orgNumber = "831519975"; // Valid mod11
  const supplierName = `Sandbox Test ${ts}`;
  const invoiceNumber = `INV-SBX-${ts}`;
  const description = "servicios de oficina";
  const gross = 50050;
  const net = 40040;
  const vat = 10010;

  // Step 1: Create supplier
  const supplierRes = await api("POST", "/supplier", {
    name: supplierName,
    organizationNumber: orgNumber,
  });
  const supplierId = supplierRes.data.value.id;
  const supplierLedgerAccountId = supplierRes.data.value.ledgerAccount.id;
  console.log("Supplier:", supplierId, "LedgerAccount:", supplierLedgerAccountId);

  // Step 2: Import document - inspect FULL response
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invoiceNumber}</cbc:ID>
  <cbc:IssueDate>2026-03-22</cbc:IssueDate>
  <cbc:DueDate>2026-04-21</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">${orgNumber}</cbc:EndpointID>
      <cac:PartyName><cbc:Name>${supplierName}</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Ukjent</cbc:StreetName>
        <cbc:CityName>Ukjent</cbc:CityName>
        <cbc:PostalZone>0000</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>NO${orgNumber}MVA</cbc:CompanyID>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:PartyTaxScheme>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${supplierName}</cbc:RegistrationName>
        <cbc:CompanyID schemeID="0192">${orgNumber}</cbc:CompanyID>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cbc:EndpointID schemeID="0192">123456785</cbc:EndpointID>
      <cac:PartyName><cbc:Name>My Company</cbc:Name></cac:PartyName>
      <cac:PostalAddress>
        <cbc:StreetName>Storgata 1</cbc:StreetName>
        <cbc:CityName>Oslo</cbc:CityName>
        <cbc:PostalZone>0001</cbc:PostalZone>
        <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>My Company</cbc:RegistrationName>
      </cac:PartyLegalEntity>
    </cac:Party>
  </cac:AccountingCustomerParty>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">${vat}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">${net}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">${vat}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">${net}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">${gross}</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">${gross}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine>
    <cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">${net}</cbc:LineExtensionAmount>
    <cac:Item>
      <cbc:Name>${description}</cbc:Name>
      <cac:ClassifiedTaxCategory>
        <cbc:ID>S</cbc:ID>
        <cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
      </cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price>
      <cbc:PriceAmount currencyID="NOK">${net}</cbc:PriceAmount>
    </cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  const blob = new Blob([xml], { type: "application/xml" });
  formData.append("file", blob, `${invoiceNumber}.xml`);

  const importRes = await api("POST", "/ledger/voucher/importDocument", formData, true);
  const voucher = importRes.data.values[0];
  console.log("\n=== FULL IMPORT RESPONSE ===");
  console.log(JSON.stringify(voucher, null, 2));

  // Check if postings have account IDs
  if (voucher.postings) {
    console.log("\n=== IMPORT POSTINGS ===");
    for (const p of voucher.postings) {
      console.log(`  row=${p.row} account.id=${p.account?.id} account.number=${p.account?.number} amount=${p.amount} amountGross=${p.amountGross}`);
    }
  }

  // Now try: single PUT with postings + sendToLedger=true
  // Get account ID first (need for the postings)
  const accountRes = await api("GET", "/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=id,number");
  const expenseAccountId = accountRes.data.values[0].id;
  console.log("\nExpense Account ID:", expenseAccountId);

  console.log("\n=== TEST: Single PUT with postings + sendToLedger=true ===");
  const singlePut = await api("PUT", `/ledger/voucher/${voucher.id}?sendToLedger=true`, {
    version: voucher.version,
    postings: [
      {
        row: 1,
        account: { id: expenseAccountId },
        description: description,
        vatType: { id: 1 },
        amount: net,
        amountCurrency: net,
        amountGross: gross,
        amountGrossCurrency: gross,
      },
      {
        row: 2,
        account: { id: supplierLedgerAccountId },
        supplier: { id: supplierId },
        description: description,
        amount: -gross,
        amountCurrency: -gross,
        amountGross: -gross,
        amountGrossCurrency: -gross,
        invoiceNumber: invoiceNumber,
        termOfPayment: "2026-04-21",
      },
    ],
  });

  if (singlePut.ok) {
    console.log("SINGLE PUT SUCCEEDED! Version:", singlePut.data.value?.version, "Number:", singlePut.data.value?.number);
    console.log("Postings:", JSON.stringify(singlePut.data.value?.postings?.map((p: any) => ({
      row: p.row,
      account: p.account?.number,
      amount: p.amount,
      amountGross: p.amountGross,
      vatType: p.vatType?.id,
    })), null, 2));
  } else {
    console.log("SINGLE PUT FAILED (as expected):", JSON.stringify(singlePut.data));

    // Fall back to two-step
    console.log("\n=== Falling back to two-step booking ===");
    const step4 = await api("PUT", `/ledger/voucher/${voucher.id}?sendToLedger=false`, {
      version: voucher.version,
      postings: [
        {
          row: 1,
          account: { id: expenseAccountId },
          description: description,
          vatType: { id: 1 },
          amount: net,
          amountCurrency: net,
          amountGross: gross,
          amountGrossCurrency: gross,
        },
        {
          row: 2,
          account: { id: supplierLedgerAccountId },
          supplier: { id: supplierId },
          description: description,
          amount: -gross,
          amountCurrency: -gross,
          amountGross: -gross,
          amountGrossCurrency: -gross,
          invoiceNumber: invoiceNumber,
          termOfPayment: "2026-04-21",
        },
      ],
    });
    console.log("Step 4 version:", step4.data.value?.version);

    const step5 = await api("PUT", `/ledger/voucher/${voucher.id}?sendToLedger=true`, {
      version: step4.data.value?.version,
    });
    console.log("Step 5 version:", step5.data.value?.version, "number:", step5.data.value?.number);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
