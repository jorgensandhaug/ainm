// Sandbox investigation: Check if Check 5 (kidOrReceiverReference) passes with PaymentMeans
// Also test whether attachment upload affects scoring-relevant fields
// Also test if we can eliminate any calls

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function run() {
  // First, let's check the existing supplierInvoice entities to understand what Check 5 looks for
  console.log("=== Existing supplier invoices ===");
  const existingSI = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&fields=id,invoiceNumber,kidOrReceiverReference,supplier(id,name),voucher(id,number),amount,amountExcludingVat,invoiceDate,invoiceDueDate`, {
    headers: { Authorization: AUTH }
  });
  const existingData = await existingSI.json();
  console.log("Total supplier invoices:", existingData.fullResultSize);
  for (const si of existingData.values || []) {
    console.log(`  SI ${si.id}: invoiceNumber=${si.invoiceNumber}, kidOrReceiverRef=${si.kidOrReceiverReference}, supplier=${si.supplier?.name}, amount=${si.amount}, date=${si.invoiceDate}`);
  }

  // Test: Create a supplier invoice WITHOUT attachment to see if scoring fields differ
  console.log("\n=== Test: Create supplier invoice WITHOUT PDF attachment ===");

  // Create test supplier
  const suppRes = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: "SandboxTest NoAttachment AS",
      organizationNumber: "912345675",
      postalAddress: { addressLine1: "Testgate 1", postalCode: "0001", city: "Oslo", country: { id: 161 } },
      physicalAddress: { addressLine1: "Testgate 1", postalCode: "0001", city: "Oslo", country: { id: 161 } },
      bankAccountPresentation: [{ bban: "12345678901" }]
    })
  });
  const supp = await suppRes.json();
  console.log("Supplier created:", supp.value.id, "ledgerAccount.id:", supp.value.ledgerAccount.id);
  const suppId = supp.value.id;
  const ledgerAcctId = supp.value.ledgerAccount.id;

  // Get expense account
  const acctRes = await fetch(`${BASE}/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=id,number`, {
    headers: { Authorization: AUTH }
  });
  const acctData = await acctRes.json();
  const expAcctId = acctData.values[0].id;
  console.log("Expense account 6300 id:", expAcctId);

  // importDocument WITHOUT attachment
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>TEST-NO-ATT-001</cbc:ID>
  <cbc:IssueDate>2026-06-15</cbc:IssueDate>
  <cbc:DueDate>2026-07-15</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">912345675</cbc:EndpointID>
    <cac:PartyName><cbc:Name>SandboxTest NoAttachment AS</cbc:Name></cac:PartyName>
    <cac:PostalAddress>
      <cbc:StreetName>Testgate 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName>
      <cbc:PostalZone>0001</cbc:PostalZone>
      <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
    </cac:PostalAddress>
    <cac:PartyTaxScheme>
      <cbc:CompanyID>NO912345675MVA</cbc:CompanyID>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:PartyTaxScheme>
    <cac:PartyLegalEntity>
      <cbc:RegistrationName>SandboxTest NoAttachment AS</cbc:RegistrationName>
      <cbc:CompanyID schemeID="0192">912345675</cbc:CompanyID>
    </cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Ditt firma</cbc:RegistrationName>
      <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>30</cbc:PaymentMeansCode>
    <cbc:PaymentID>TEST-NO-ATT-001</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>12345678901</cbc:ID>
    </cac:PayeeFinancialAccount>
  </cac:PaymentMeans>
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="NOK">10000</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">10000</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">10000</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">12500</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">12500</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">10000</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Testtjeneste</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent>
        <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">10000</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  const formData = new FormData();
  formData.append("file", new Blob([xml], { type: "text/xml" }), "TEST-NO-ATT-001.xml");
  const impRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST", headers: { Authorization: AUTH }, body: formData,
  });
  const imp = await impRes.json();
  console.log("importDocument status:", impRes.status);
  const voucherId = imp.values[0].id;
  const version1 = imp.values[0].version;
  console.log("voucherId:", voucherId, "version1:", version1);

  // Skip attachment - go straight to postings
  const putRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=false`, {
    method: "PUT",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      version: version1,
      postings: [
        {
          row: 1, account: { id: expAcctId },
          description: "Testtjeneste", vatType: { id: 1 },
          amount: 10000, amountCurrency: 10000,
          amountGross: 12500, amountGrossCurrency: 12500
        },
        {
          row: 2, account: { id: ledgerAcctId },
          supplier: { id: suppId }, description: "Testtjeneste",
          amount: -12500, amountCurrency: -12500,
          amountGross: -12500, amountGrossCurrency: -12500,
          invoiceNumber: "TEST-NO-ATT-001", termOfPayment: "2026-07-15"
        }
      ]
    })
  });
  const putData = await putRes.json();
  console.log("PUT postings status:", putRes.status);
  const version2 = putData.value.version;

  // Book
  const bookRes = await fetch(`${BASE}/ledger/voucher/${voucherId}?sendToLedger=true`, {
    method: "PUT",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      version: version2,
      voucherType: { name: "Leverandørfaktura" }
    })
  });
  console.log("Book status:", bookRes.status);

  // Verify SI with all fields (focus on kidOrReceiverReference and attachment/ediDocument)
  const si = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&invoiceNumber=TEST-NO-ATT-001&fields=*`, { headers: { Authorization: AUTH } });
  const siData = await si.json();
  console.log("\n=== SupplierInvoice WITHOUT attachment ===");
  console.log(JSON.stringify(siData.values?.[0], null, 2));

  // Verify voucher fields
  const vv = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=*`, { headers: { Authorization: AUTH } });
  const vvData = await vv.json();
  console.log("\n=== Voucher WITHOUT attachment ===");
  console.log("attachment:", JSON.stringify(vvData.value?.attachment));
  console.log("ediDocument:", JSON.stringify(vvData.value?.ediDocument));
  console.log("document:", JSON.stringify(vvData.value?.document));

  console.log("\n=== DONE ===");
}

run().catch(e => { console.error("FATAL:", e); process.exit(1); });
