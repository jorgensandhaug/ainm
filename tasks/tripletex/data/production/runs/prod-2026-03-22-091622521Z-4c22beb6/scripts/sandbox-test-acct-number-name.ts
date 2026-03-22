// Test: Can we use account: { number: 6300, name: "Kontortjenester" } to skip GET?

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

const ORG = "979784783";

async function run() {
  const ts = Date.now();

  // Reuse existing supplier from sandbox
  const supRes = await fetch(`${BASE}/supplier`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      name: "SbxAcNmNm" + ts,
      postalAddress: { addressLine1: "Test 1", postalCode: "0001", city: "Oslo", country: { id: 161 } },
      physicalAddress: { addressLine1: "Test 1", postalCode: "0001", city: "Oslo", country: { id: 161 } },
    })
  });
  const sup = await supRes.json();
  const supplierId = sup.value.id;
  const acct2400Id = sup.value.ledgerAccount.id;

  // First, get account 6300 to see its actual name
  const acctRes = await fetch(`${BASE}/ledger/account?number=6300&fields=id,number,name`, {
    headers: { Authorization: AUTH }
  });
  const acct = await acctRes.json();
  console.log("Account 6300:", JSON.stringify(acct.values[0]));
  const realName = acct.values[0].name;
  const realId = acct.values[0].id;

  const makeXml = (id: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${id}</cbc:ID><cbc:IssueDate>2026-04-01</cbc:IssueDate><cbc:DueDate>2026-05-01</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode><cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${ORG}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>TestSup</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>T</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${ORG}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>TestSup</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${ORG}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Firma</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Firma</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingCustomerParty>
  <cac:TaxTotal><cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount>
    <cac:TaxSubtotal><cbc:TaxableAmount currencyID="NOK">10000</cbc:TaxableAmount><cbc:TaxAmount currencyID="NOK">2500</cbc:TaxAmount>
      <cac:TaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:TaxCategory>
    </cac:TaxSubtotal></cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="NOK">10000</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="NOK">10000</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="NOK">12500</cbc:TaxInclusiveAmount>
    <cbc:PayableAmount currencyID="NOK">12500</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>
  <cac:InvoiceLine><cbc:ID>1</cbc:ID>
    <cbc:InvoicedQuantity unitCode="EA">1</cbc:InvoicedQuantity>
    <cbc:LineExtensionAmount currencyID="NOK">10000</cbc:LineExtensionAmount>
    <cac:Item><cbc:Name>Test</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">10000</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  // Test C: account: { number: 6300, name: "<actual name>" }
  console.log("\n=== TEST C: account: { number, name } ===");
  const invC = "TESTC-" + ts;
  const fdC = new FormData();
  fdC.append("file", new Blob([makeXml(invC)], { type: "text/xml" }), `${invC}.xml`);
  const impResC = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST", headers: { Authorization: AUTH }, body: fdC,
  });
  const impC = await impResC.json();
  const vIdC = impC.values[0].id;
  const vVerC = impC.values[0].version;

  const testCRes = await fetch(`${BASE}/ledger/voucher/${vIdC}?sendToLedger=false`, {
    method: "PUT", headers: H,
    body: JSON.stringify({
      version: vVerC,
      postings: [
        {
          row: 1, account: { number: 6300, name: realName },
          description: "Test item", vatType: { id: 1 },
          amount: 10000, amountCurrency: 10000,
          amountGross: 12500, amountGrossCurrency: 12500
        },
        {
          row: 2, account: { id: acct2400Id },
          supplier: { id: supplierId }, description: "Test item",
          amount: -12500, amountCurrency: -12500,
          amountGross: -12500, amountGrossCurrency: -12500,
          invoiceNumber: invC, termOfPayment: "2026-05-01"
        }
      ]
    })
  });
  const testC = await testCRes.json();
  console.log("Test C status:", testCRes.status);
  if (testCRes.status >= 400) {
    console.log("Test C FAILED:", JSON.stringify(testC).substring(0, 800));
  } else {
    console.log("Test C SUCCEEDED!");
    const row1 = testC.value?.postings?.find((p: any) => p.row === 1);
    console.log("Row 1 account id:", row1?.account?.id, "expected:", realId, "match:", row1?.account?.id === realId);

    // If it worked, try to book it
    const version2 = testC.value.version;
    const bookRes = await fetch(`${BASE}/ledger/voucher/${vIdC}?sendToLedger=true`, {
      method: "PUT", headers: H,
      body: JSON.stringify({ version: version2, voucherType: { name: "Leverandørfaktura" } })
    });
    const book = await bookRes.json();
    console.log("Book status:", bookRes.status, "number:", book.value?.number);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
