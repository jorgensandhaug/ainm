// Sandbox: Test attachment-less flow to see if all scoring-relevant fields are identical
// Also test: can we skip the GET /ledger/account by using account:{id} from a known value?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa(`0:${TOKEN}`);

async function run() {
  // Test 1: Full flow WITHOUT attachment - are scoring fields identical?
  const ts = Date.now();
  console.log("=== Test: Full flow WITHOUT PDF attachment ===");

  const suppRes = await fetch(`${BASE}/supplier`, {
    method: "POST",
    headers: { Authorization: AUTH, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `NoAttach-${ts}`,
      organizationNumber: "999999999",
      postalAddress: { addressLine1: "Testgate 1", postalCode: "0001", city: "Oslo", country: { id: 161 } },
      physicalAddress: { addressLine1: "Testgate 1", postalCode: "0001", city: "Oslo", country: { id: 161 } },
      bankAccountPresentation: [{ bban: "53239317029" }]
    })
  });
  const supp = await suppRes.json();
  console.log("Supplier status:", suppRes.status);
  if (!supp.value) { console.log("Supplier error:", JSON.stringify(supp)); return; }
  const suppId = supp.value.id;
  const ledgerAcctId = supp.value.ledgerAccount.id;
  console.log("suppId:", suppId, "ledgerAcctId:", ledgerAcctId);

  // GET expense account
  const acctRes = await fetch(`${BASE}/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=id,number`, {
    headers: { Authorization: AUTH }
  });
  const acctData = await acctRes.json();
  const expAcctId = acctData.values[0].id;
  console.log("expAcctId:", expAcctId);

  // importDocument with PaymentMeans
  const invNum = `NOATT-${ts}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${invNum}</cbc:ID>
  <cbc:IssueDate>2026-06-20</cbc:IssueDate>
  <cbc:DueDate>2026-07-20</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">999999999</cbc:EndpointID>
    <cac:PartyName><cbc:Name>NoAttach-${ts}</cbc:Name></cac:PartyName>
    <cac:PostalAddress>
      <cbc:StreetName>Testgate 1</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName>
      <cbc:PostalZone>0001</cbc:PostalZone>
      <cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country>
    </cac:PostalAddress>
    <cac:PartyTaxScheme>
      <cbc:CompanyID>NO999999999MVA</cbc:CompanyID>
      <cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme>
    </cac:PartyTaxScheme>
    <cac:PartyLegalEntity>
      <cbc:RegistrationName>NoAttach-${ts}</cbc:RegistrationName>
      <cbc:CompanyID schemeID="0192">999999999</cbc:CompanyID>
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
    <cbc:PaymentID>${invNum}</cbc:PaymentID>
    <cac:PayeeFinancialAccount>
      <cbc:ID>53239317029</cbc:ID>
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
  formData.append("file", new Blob([xml], { type: "text/xml" }), `${invNum}.xml`);
  const impRes = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST", headers: { Authorization: AUTH }, body: formData,
  });
  const imp = await impRes.json();
  console.log("importDocument status:", impRes.status);
  if (!imp.values?.[0]) { console.log("Import error:", JSON.stringify(imp)); return; }
  const voucherId = imp.values[0].id;
  const version1 = imp.values[0].version;
  console.log("voucherId:", voucherId, "version1:", version1);

  // NO attachment upload - skip it

  // Set postings
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
          invoiceNumber: invNum, termOfPayment: "2026-07-20"
        }
      ]
    })
  });
  const putData = await putRes.json();
  console.log("PUT postings status:", putRes.status);
  if (!putData.value) { console.log("PUT error:", JSON.stringify(putData)); return; }
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

  // Verify SI
  const si = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&invoiceNumber=${invNum}&fields=id,invoiceNumber,kidOrReceiverReference,amount,amountExcludingVat,invoiceDate,invoiceDueDate,supplier(id,name),voucher(id,number),orderLines(id,description)`, { headers: { Authorization: AUTH } });
  const siData = await si.json();
  console.log("\nSupplierInvoice (NO attachment):");
  console.log(JSON.stringify(siData.values?.[0], null, 2));

  // Verify voucher attachment field
  const vv = await fetch(`${BASE}/ledger/voucher/${voucherId}?fields=id,number,attachment,ediDocument,document`, { headers: { Authorization: AUTH } });
  const vvData = await vv.json();
  console.log("\nVoucher attachment/document fields (NO PDF upload):");
  console.log("attachment:", JSON.stringify(vvData.value?.attachment));
  console.log("ediDocument:", JSON.stringify(vvData.value?.ediDocument));
  console.log("document:", JSON.stringify(vvData.value?.document));

  // Test 2: Check if the attachment from importDocument is already set
  // The importDocument sets the XML as ediDocument AND the attachment
  console.log("\n=== Key observation ===");
  console.log("Does importDocument auto-populate the attachment field from XML?");
  console.log("If yes, we can skip the PDF upload step entirely.");

  // Compare with a run that HAS a PDF attachment
  // Find existing entries with attachment to compare
  const existingWithAttachment = await fetch(`${BASE}/supplierInvoice?invoiceDateFrom=2025-01-01&invoiceDateTo=2027-12-31&invoiceNumber=INV-2026-FULL&fields=id,invoiceNumber,kidOrReceiverReference,voucher(id,number)`, { headers: { Authorization: AUTH } });
  const existingData = await existingWithAttachment.json();
  if (existingData.values?.[0]) {
    const existingVoucherId = existingData.values[0].voucher.id;
    const ev = await fetch(`${BASE}/ledger/voucher/${existingVoucherId}?fields=id,attachment,ediDocument,document`, { headers: { Authorization: AUTH } });
    const evData = await ev.json();
    console.log("\nVoucher WITH attachment (INV-2026-FULL):");
    console.log("attachment:", JSON.stringify(evData.value?.attachment));
    console.log("ediDocument:", JSON.stringify(evData.value?.ediDocument));
  }

  console.log("\n=== DONE ===");
}

run().catch(e => { console.error("FATAL:", e); process.exit(1); });
