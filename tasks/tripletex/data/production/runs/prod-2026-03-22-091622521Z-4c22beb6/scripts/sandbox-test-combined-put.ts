// Test: Can we combine postings + sendToLedger=true in a single PUT? (would save 1 call)
// Also test: Can we use account: { number } instead of account: { id }? (would save 1 call)

const BASE = "https://kkpqfuj-amager.tripletex.dev/v2";
const TOKEN = "eyJ0b2tlbklkIjoyMTQ3NjI4NDYxLCJ0b2tlbiI6IjU2NDRjNDljLWU0YzYtNGU2OC05MWU5LWU0MzBhMWRiYTMzYSJ9";
const AUTH = "Basic " + btoa("0:" + TOKEN);
const H = { Authorization: AUTH, "Content-Type": "application/json" };

// Valid Norwegian org number that passes mod11
const ORG = "979784783";

async function run() {
  const ts = Date.now();

  // Step 1: Create a test supplier
  const supRes = await fetch(`${BASE}/supplier`, {
    method: "POST", headers: H,
    body: JSON.stringify({
      name: "SbxTestSup" + ts,
      postalAddress: { addressLine1: "Test 1", postalCode: "0001", city: "Oslo", country: { id: 161 } },
      physicalAddress: { addressLine1: "Test 1", postalCode: "0001", city: "Oslo", country: { id: 161 } },
    })
  });
  const sup = await supRes.json();
  if (supRes.status >= 400) { console.log("Supplier FAIL:", JSON.stringify(sup)); return; }
  const supplierId = sup.value.id;
  const acct2400Id = sup.value.ledgerAccount.id;
  console.log("Supplier OK:", supplierId, "acct2400:", acct2400Id);

  // Step 2: Get expense account 6300 ID
  const acctRes = await fetch(`${BASE}/ledger/account?number=6300&isApplicableForSupplierInvoice=true&fields=id,number`, {
    headers: { Authorization: AUTH }
  });
  const acct = await acctRes.json();
  const expenseAcctId = acct.values[0].id;
  console.log("Account 6300 id:", expenseAcctId);

  const makeXml = (id: string) => `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:CustomizationID>urn:cen.eu:en16931:2017#compliant#urn:fdc:peppol.eu:2017:poacc:billing:3.0</cbc:CustomizationID>
  <cbc:ProfileID>urn:fdc:peppol.eu:2017:poacc:billing:01:1.0</cbc:ProfileID>
  <cbc:ID>${id}</cbc:ID>
  <cbc:IssueDate>2026-04-01</cbc:IssueDate>
  <cbc:DueDate>2026-05-01</cbc:DueDate>
  <cbc:InvoiceTypeCode>380</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>NOK</cbc:DocumentCurrencyCode>
  <cac:AccountingSupplierParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${ORG}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Test Supplier</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cbc:StreetName>Test</cbc:StreetName><cbc:CityName>Oslo</cbc:CityName><cbc:PostalZone>0001</cbc:PostalZone><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyTaxScheme><cbc:CompanyID>NO${ORG}MVA</cbc:CompanyID><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:PartyTaxScheme>
    <cac:PartyLegalEntity><cbc:RegistrationName>Test Supplier</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG}</cbc:CompanyID></cac:PartyLegalEntity>
  </cac:Party></cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty><cac:Party>
    <cbc:EndpointID schemeID="0192">${ORG}</cbc:EndpointID>
    <cac:PartyName><cbc:Name>Ditt firma</cbc:Name></cac:PartyName>
    <cac:PostalAddress><cac:Country><cbc:IdentificationCode>NO</cbc:IdentificationCode></cac:Country></cac:PostalAddress>
    <cac:PartyLegalEntity><cbc:RegistrationName>Ditt firma</cbc:RegistrationName><cbc:CompanyID schemeID="0192">${ORG}</cbc:CompanyID></cac:PartyLegalEntity>
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
    <cac:Item><cbc:Name>Test item</cbc:Name>
      <cac:ClassifiedTaxCategory><cbc:ID>S</cbc:ID><cbc:Percent>25</cbc:Percent><cac:TaxScheme><cbc:ID>VAT</cbc:ID></cac:TaxScheme></cac:ClassifiedTaxCategory>
    </cac:Item>
    <cac:Price><cbc:PriceAmount currencyID="NOK">10000</cbc:PriceAmount></cac:Price>
  </cac:InvoiceLine>
</Invoice>`;

  // Import for Test A
  const invA = "TESTA-" + ts;
  const fdA = new FormData();
  fdA.append("file", new Blob([makeXml(invA)], { type: "text/xml" }), `${invA}.xml`);
  const impResA = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST", headers: { Authorization: AUTH }, body: fdA,
  });
  const impA = await impResA.json();
  if (impResA.status >= 400) { console.log("importA FAIL:", JSON.stringify(impA).substring(0, 500)); return; }
  const vIdA = impA.values[0].id;
  const vVerA = impA.values[0].version;
  console.log("importDocument A OK: voucherId=", vIdA, "version=", vVerA);

  // TEST A: Combined postings + sendToLedger=true
  console.log("\n=== TEST A: Combined postings + sendToLedger=true ===");
  const testARes = await fetch(`${BASE}/ledger/voucher/${vIdA}?sendToLedger=true`, {
    method: "PUT", headers: H,
    body: JSON.stringify({
      version: vVerA,
      voucherType: { name: "Leverandørfaktura" },
      postings: [
        {
          row: 1, account: { id: expenseAcctId },
          description: "Test item", vatType: { id: 1 },
          amount: 10000, amountCurrency: 10000,
          amountGross: 12500, amountGrossCurrency: 12500
        },
        {
          row: 2, account: { id: acct2400Id },
          supplier: { id: supplierId }, description: "Test item",
          amount: -12500, amountCurrency: -12500,
          amountGross: -12500, amountGrossCurrency: -12500,
          invoiceNumber: invA, termOfPayment: "2026-05-01"
        }
      ]
    })
  });
  const testA = await testARes.json();
  console.log("Test A status:", testARes.status);
  if (testARes.status >= 400) {
    console.log("Test A FAILED:", JSON.stringify(testA).substring(0, 800));
  } else {
    console.log("Test A SUCCEEDED! number:", testA.value?.number, "numberAsString:", testA.value?.numberAsString);
  }

  // Import for Test B
  const invB = "TESTB-" + ts;
  const fdB = new FormData();
  fdB.append("file", new Blob([makeXml(invB)], { type: "text/xml" }), `${invB}.xml`);
  const impResB = await fetch(`${BASE}/ledger/voucher/importDocument`, {
    method: "POST", headers: { Authorization: AUTH }, body: fdB,
  });
  const impB = await impResB.json();
  if (impResB.status >= 400) { console.log("importB FAIL:", JSON.stringify(impB).substring(0, 500)); return; }
  const vIdB = impB.values[0].id;
  const vVerB = impB.values[0].version;

  // TEST B: account: { number: 6300 }
  console.log("\n=== TEST B: account: { number: 6300 } ===");
  const testBRes = await fetch(`${BASE}/ledger/voucher/${vIdB}?sendToLedger=false`, {
    method: "PUT", headers: H,
    body: JSON.stringify({
      version: vVerB,
      postings: [
        {
          row: 1, account: { number: 6300 },
          description: "Test item", vatType: { id: 1 },
          amount: 10000, amountCurrency: 10000,
          amountGross: 12500, amountGrossCurrency: 12500
        },
        {
          row: 2, account: { id: acct2400Id },
          supplier: { id: supplierId }, description: "Test item",
          amount: -12500, amountCurrency: -12500,
          amountGross: -12500, amountGrossCurrency: -12500,
          invoiceNumber: invB, termOfPayment: "2026-05-01"
        }
      ]
    })
  });
  const testB = await testBRes.json();
  console.log("Test B status:", testBRes.status);
  if (testBRes.status >= 400) {
    console.log("Test B FAILED:", JSON.stringify(testB).substring(0, 800));
  } else {
    console.log("Test B SUCCEEDED! account:{number} works");
    // Check what account id was resolved
    const row1 = testB.value?.postings?.find((p: any) => p.row === 1);
    console.log("Row 1 account:", row1?.account);
  }
}

run().catch(e => { console.error(e); process.exit(1); });
